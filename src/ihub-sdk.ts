/*
 * Minimal standalone iHub frontend bridge for this official plugin. It is
 * deliberately bundled with the project so Git import does not depend on the
 * root workspace or expose a Tauri API to the iframe.
 */

export type JsonPrimitive = string | number | boolean | null;
export type Json = JsonPrimitive | Json[] | { [key: string]: Json };

export interface Disposable {
  dispose(): void | Promise<void>;
}

export interface CommandDefinition {
  id: string;
  title: string;
  subtitle?: string;
  keywords?: string[];
}

interface CommandInvocation {
  requestId: string;
  commandId: string;
  input?: Json;
  context?: Record<string, Json>;
}

interface CommandResult {
  message?: string;
  data?: Json;
  close?: boolean;
}

export type FilesystemDirectorySelection =
  | { cancelled: true }
  | { cancelled: false; grantId: string; directory: string };

export interface PluginProjectCreated {
  projectPath: string;
  pluginId: string;
  nextSteps: string[];
}

interface HostRequest {
  pluginId: string;
  method: string;
  params?: Json;
}

type Unlisten = () => void | Promise<void>;
type BridgeListener<T> = (payload: T) => void | Promise<void>;
type CommandHandler = (request: CommandInvocation) => CommandResult | void | Promise<CommandResult | void>;

interface HostBridge {
  call<T = unknown>(request: HostRequest): Promise<T>;
  listen<T = unknown>(name: string, listener: BridgeListener<T>): Promise<Unlisten>;
}

declare global {
  interface Window {
    __IHUB_PLUGIN_API__?: HostBridge;
  }
}

export interface PluginContext {
  readonly pluginId: string;
  readonly commands: {
    register(definition: CommandDefinition, handler: CommandHandler): Promise<Disposable>;
  };
  readonly filesystem: {
    selectDirectory(): Promise<FilesystemDirectorySelection>;
  };
  readonly developer: {
    /** The host resolves `grantId`; this method never accepts a parent path. */
    createProject(options: { grantId: string; pluginId: string }): Promise<PluginProjectCreated>;
  };
  readonly logger: {
    debug(message: string, details?: Json): void;
    info(message: string, details?: Json): void;
    warn(message: string, details?: Json): void;
    error(message: string, details?: Json): void;
  };
}

export interface DevelopmentBridge extends HostBridge {
  emit<T = unknown>(name: string, payload: T): Promise<void>;
}

interface BootstrapOptions {
  bridge?: HostBridge;
  onError?: (error: unknown) => void;
}

const REQUEST_CHANNEL = "ihub-plugin-bridge/v1";
const RESPONSE_CHANNEL = "ihub-host-bridge/v1";
const CALL_TIMEOUT_MS = 30_000;

function eventName(pluginId: string, kind: string): string {
  return `ihub://plugin/${pluginId}/${kind}`;
}

function asJson(value: unknown): Json {
  return value as Json;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createFrameBridge(): HostBridge {
  const hostWindow = window.parent;
  const pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void; timeout: number }>();
  const listeners = new Map<string, Set<BridgeListener<unknown>>>();
  let sequence = 0;

  window.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (event.source !== hostWindow || !isRecord(event.data)) {
      return;
    }
    const message = event.data;
    if (message.channel !== RESPONSE_CHANNEL) {
      return;
    }
    if (message.type === "event" && typeof message.name === "string") {
      void Promise.all([...(listeners.get(message.name) ?? [])].map((listener) => listener(message.payload)));
      return;
    }
    if (message.type !== "response" || typeof message.id !== "string") {
      return;
    }
    const call = pending.get(message.id);
    if (!call) {
      return;
    }
    pending.delete(message.id);
    window.clearTimeout(call.timeout);
    if (message.ok === true) {
      call.resolve(message.result);
    } else {
      call.reject(new Error(typeof message.error === "string" ? message.error : "iHub host call failed."));
    }
  });

  return {
    call<T>(request: HostRequest): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const id = `developer-tools-${Date.now().toString(36)}-${(sequence++).toString(36)}`;
        const timeout = window.setTimeout(() => {
          pending.delete(id);
          reject(new Error("iHub host call timed out."));
        }, CALL_TIMEOUT_MS);
        pending.set(id, { resolve: (value) => resolve(value as T), reject, timeout });
        hostWindow.postMessage({ channel: REQUEST_CHANNEL, type: "call", id, request }, "*");
      });
    },
    async listen<T>(name: string, listener: BridgeListener<T>): Promise<Unlisten> {
      const callbacks = listeners.get(name) ?? new Set<BridgeListener<unknown>>();
      const wrapped = listener as BridgeListener<unknown>;
      callbacks.add(wrapped);
      listeners.set(name, callbacks);
      return () => {
        callbacks.delete(wrapped);
        if (callbacks.size === 0) {
          listeners.delete(name);
        }
      };
    },
  };
}

export function hasIHubHost(): boolean {
  return typeof window !== "undefined" && Boolean(window.__IHUB_PLUGIN_API__ || window.parent !== window);
}

function hostBridge(): HostBridge {
  if (typeof window === "undefined") {
    throw new Error("iHub plugins need a browser WebView.");
  }
  return window.__IHUB_PLUGIN_API__ ?? createFrameBridge();
}

/** Browser previews never fabricate directory grants or write project files. */
export function createDevelopmentBridge(): DevelopmentBridge {
  const listeners = new Map<string, Set<BridgeListener<unknown>>>();
  return {
    async call<T>(request: HostRequest): Promise<T> {
      if (request.method === "filesystem.selectDirectory" || request.method === "developer.createProject") {
        throw new Error("项目创建需要在 iHub 桌面端使用系统文件夹授权。");
      }
      return undefined as T;
    },
    async listen<T>(name: string, listener: BridgeListener<T>): Promise<Unlisten> {
      const callbacks = listeners.get(name) ?? new Set<BridgeListener<unknown>>();
      const wrapped = listener as BridgeListener<unknown>;
      callbacks.add(wrapped);
      listeners.set(name, callbacks);
      return () => {
        callbacks.delete(wrapped);
        if (callbacks.size === 0) {
          listeners.delete(name);
        }
      };
    },
    async emit<T>(name: string, payload: T): Promise<void> {
      await Promise.all([...(listeners.get(name) ?? [])].map((listener) => listener(payload)));
    },
  };
}

class Runtime implements Disposable {
  private readonly commandHandlers = new Map<string, CommandHandler>();
  private readonly unlisten: Unlisten[] = [];
  private commandsReady = false;
  private disposed = false;
  readonly context: PluginContext;

  constructor(
    private readonly pluginId: string,
    private readonly bridge: HostBridge,
    private readonly onError: (error: unknown) => void,
  ) {
    this.context = {
      pluginId,
      commands: { register: (definition, handler) => this.registerCommand(definition, handler) },
      filesystem: {
        selectDirectory: () => this.call<FilesystemDirectorySelection>("filesystem.selectDirectory"),
      },
      developer: {
        createProject: (options) => this.call<PluginProjectCreated>("developer.createProject", options),
      },
      logger: {
        debug: (message, details) => this.log("debug", message, details),
        info: (message, details) => this.log("info", message, details),
        warn: (message, details) => this.log("warn", message, details),
        error: (message, details) => this.log("error", message, details),
      },
    };
  }

  async activate(activate: (context: PluginContext) => void | Promise<void>): Promise<void> {
    await activate(this.context);
    await this.call("lifecycle.ready");
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.commandHandlers.clear();
    await Promise.all(this.unlisten.splice(0).map((dispose) => Promise.resolve(dispose())));
    await this.bridge.call({ pluginId: this.pluginId, method: "lifecycle.dispose" }).catch(this.onError);
  }

  private async registerCommand(definition: CommandDefinition, handler: CommandHandler): Promise<Disposable> {
    this.assertActive();
    if (this.commandHandlers.has(definition.id)) {
      throw new Error(`Duplicate command: ${definition.id}`);
    }
    await this.ensureCommandListener();
    this.commandHandlers.set(definition.id, handler);
    await this.call("commands.register", { definition: asJson(definition) });
    let used = false;
    return {
      dispose: async () => {
        if (used) {
          return;
        }
        used = true;
        this.commandHandlers.delete(definition.id);
        await this.call("commands.unregister", { commandId: definition.id });
      },
    };
  }

  private async ensureCommandListener(): Promise<void> {
    if (this.commandsReady) {
      return;
    }
    this.unlisten.push(await this.bridge.listen<CommandInvocation>(
      eventName(this.pluginId, "command"),
      (request) => this.handleCommand(request),
    ));
    this.commandsReady = true;
  }

  private async handleCommand(request: CommandInvocation): Promise<void> {
    const handler = this.commandHandlers.get(request.commandId);
    if (!handler) {
      await this.respond(request.requestId, false, null, `Unknown command: ${request.commandId}`);
      return;
    }
    try {
      await this.respond(request.requestId, true, (await handler(request)) ?? {});
    } catch (error) {
      this.onError(error);
      await this.respond(request.requestId, false, null, errorText(error));
    }
  }

  private async respond(requestId: string, ok: boolean, result: unknown, error?: string): Promise<void> {
    await this.call("commands.complete", { requestId, ok, result: asJson(result), error: error ?? null });
  }

  private log(level: "debug" | "info" | "warn" | "error", message: string, details?: Json): void {
    void this.call("log", { level, message, details: details ?? null }).catch(this.onError);
  }

  private call<T = unknown>(method: string, params?: Json): Promise<T> {
    this.assertActive();
    return this.bridge.call<T>({ pluginId: this.pluginId, method, params });
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error(`Plugin runtime for ${this.pluginId} has already been disposed.`);
    }
  }
}

export async function bootstrapPlugin(
  pluginId: string,
  activate: (context: PluginContext) => void | Promise<void>,
  options: BootstrapOptions = {},
): Promise<Disposable> {
  const onError = options.onError ?? ((error: unknown) => console.error(`[${pluginId}]`, error));
  const runtime = new Runtime(pluginId, options.bridge ?? hostBridge(), onError);
  try {
    await runtime.activate(activate);
    return runtime;
  } catch (error) {
    await runtime.dispose();
    throw error;
  }
}
