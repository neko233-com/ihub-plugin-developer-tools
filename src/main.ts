import {
  bootstrapPlugin,
  createDevelopmentBridge,
  hasIHubHost,
  type Disposable,
  type PluginContext,
  type PluginProjectCreated,
} from "./ihub-sdk";
import "./style.css";

const PLUGIN_ID = "ihub-plugin-developer-tools";
const isBrowserPreview = !hasIHubHost();
const previewBridge = isBrowserPreview ? createDevelopmentBridge() : undefined;

type StatusTone = "ready" | "working" | "success" | "error";
type ActiveOperation = "select" | "create" | null;

interface DeveloperState {
  context: PluginContext | null;
  grantId: string | null;
  directory: string | null;
  created: PluginProjectCreated | null;
  operation: ActiveOperation;
}

const state: DeveloperState = {
  context: null,
  grantId: null,
  directory: null,
  created: null,
  operation: null,
};

const app = document.querySelector<HTMLElement>("#app");
if (!app) {
  throw new Error("The Developer Tools plugin root is missing.");
}
const pluginRoot: HTMLElement = app;

app.innerHTML = `
  <main class="developer-tools" aria-labelledby="developer-tools-title">
    <header class="topbar">
      <div class="brand-lockup">
        <span class="brand-mark" aria-hidden="true">⌘</span>
        <div>
          <p class="eyebrow">IHUB OFFICIAL PLUGIN</p>
          <h1 id="developer-tools-title">开发者工具</h1>
        </div>
      </div>
      <p class="host-note"><span aria-hidden="true">◆</span> 本机目录授权</p>
    </header>

    <section class="intro" aria-label="创建项目说明">
      <div>
        <p class="step-label">NEW PLUGIN PROJECT</p>
        <h2>从一个授权的父目录开始</h2>
      </div>
      <p>iHub 只接收一次性目录授权和插件 ID。页面不会提交或接受手动输入的任意文件系统路径。</p>
    </section>

    <section class="creation-workspace" aria-label="创建插件项目">
      <form id="project-form" class="project-form" novalidate>
        <div class="field-section folder-section">
          <div class="section-heading">
            <div>
              <p class="section-kicker">01 · PARENT FOLDER</p>
              <h2>选择父文件夹</h2>
            </div>
            <button id="select-directory" class="quiet-action" type="button">选择文件夹</button>
          </div>
          <div id="directory-surface" class="directory-surface" data-selected="false">
            <span class="directory-glyph" aria-hidden="true">⌁</span>
            <input id="selected-directory" aria-label="已授权的父文件夹" autocomplete="off" placeholder="尚未选择文件夹" readonly spellcheck="false" />
          </div>
          <p class="field-hint">系统选择器会签发短期、不透明的目录授权。项目只能创建在这个文件夹下。</p>
        </div>

        <div class="field-section id-section">
          <div class="section-heading">
            <div>
              <p class="section-kicker">02 · PLUGIN ID</p>
              <h2>命名新插件</h2>
            </div>
            <span class="id-rule">3–63 · kebab-case</span>
          </div>
          <label class="id-field" for="plugin-id">
            <span class="sr-only">插件 ID</span>
            <input id="plugin-id" autocomplete="off" autocapitalize="off" placeholder="例如 ihub-plugin-my-tool" spellcheck="false" />
          </label>
          <p id="id-validation" class="field-hint" aria-live="polite">使用小写字母、数字和单个连字符；必须以字母开头。</p>
        </div>

        <div class="create-row">
          <button id="create-project" class="primary-action" type="submit">创建插件项目</button>
          <p>宿主会先保留一个全新的子目录；如果同名路径存在，不会覆盖任何文件。</p>
        </div>
      </form>

      <aside class="template-facts" aria-labelledby="template-facts-title">
        <div>
          <p class="section-kicker">STARTER CONTENTS</p>
          <h2 id="template-facts-title">生成的项目</h2>
        </div>
        <ul>
          <li><span>01</span><p>独立 TypeScript + Vite 前端</p></li>
          <li><span>02</span><p>已配置的插件清单入口</p></li>
          <li><span>03</span><p>可选 Rust JSONL-RPC worker 模板</p></li>
          <li><span>04</span><p>Windows 与 macOS 构建脚本</p></li>
        </ul>
        <p class="facts-footnote">创建后保留在你选择的位置；iHub 不会自动链接、安装或执行它。</p>
      </aside>
    </section>

    <section id="created-project" class="created-project" aria-labelledby="created-project-title" hidden>
      <div class="created-heading">
        <div>
          <p class="section-kicker">CREATED</p>
          <h2 id="created-project-title">项目已就绪</h2>
        </div>
        <span class="created-mark" aria-hidden="true">✓</span>
      </div>
      <p id="created-path" class="created-path"></p>
      <ol id="next-steps" class="next-steps"></ol>
    </section>

    <footer class="statusline" aria-live="polite">
      <span class="status-dot" aria-hidden="true"></span>
      <p id="status" data-tone="ready"></p>
    </footer>
  </main>
`;

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing Developer Tools element: #${id}`);
  }
  return element as T;
}

const projectForm = requiredElement<HTMLFormElement>("project-form");
const selectDirectoryButton = requiredElement<HTMLButtonElement>("select-directory");
const directorySurface = requiredElement<HTMLElement>("directory-surface");
const selectedDirectory = requiredElement<HTMLInputElement>("selected-directory");
const pluginIdInput = requiredElement<HTMLInputElement>("plugin-id");
const idValidation = requiredElement<HTMLElement>("id-validation");
const createProjectButton = requiredElement<HTMLButtonElement>("create-project");
const createdProject = requiredElement<HTMLElement>("created-project");
const createdPath = requiredElement<HTMLElement>("created-path");
const nextSteps = requiredElement<HTMLOListElement>("next-steps");
const status = requiredElement<HTMLElement>("status");

function setStatus(message: string, tone: StatusTone = "ready"): void {
  status.textContent = message;
  status.dataset.tone = tone;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message.trim()
    : "iHub 无法完成该操作。请检查目录授权后重试。";
}

function pluginIdError(value: string): string | null {
  const id = value.trim();
  if (!id) {
    return "输入一个新插件的 ID。";
  }
  if (id.length < 3 || id.length > 63) {
    return "插件 ID 需要为 3 到 63 个字符。";
  }
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id)) {
    return "请使用以小写字母开头的 kebab-case ID；不能包含路径、空格或下划线。";
  }
  return null;
}

function currentPluginId(): string {
  return pluginIdInput.value.trim();
}

function setOperation(operation: ActiveOperation): void {
  state.operation = operation;
  render();
}

function renderValidation(): string | null {
  const error = pluginIdError(pluginIdInput.value);
  const hasValue = Boolean(pluginIdInput.value.trim());
  pluginIdInput.setAttribute("aria-invalid", String(hasValue && Boolean(error)));
  pluginIdInput.dataset.valid = String(hasValue && !error);
  idValidation.textContent = error ?? "ID 格式正确；宿主仍会在创建前进行同样的校验。";
  idValidation.dataset.tone = error && hasValue ? "error" : "ready";
  return error;
}

function renderCreatedProject(): void {
  const created = state.created;
  createdProject.hidden = !created;
  if (!created) {
    createdPath.textContent = "";
    nextSteps.replaceChildren();
    return;
  }
  createdPath.textContent = created.projectPath;
  nextSteps.replaceChildren();
  for (const step of created.nextSteps) {
    const item = document.createElement("li");
    item.textContent = step;
    nextSteps.append(item);
  }
}

function render(): void {
  const busy = state.operation !== null;
  const idError = renderValidation();
  selectedDirectory.value = state.directory ?? "";
  directorySurface.dataset.selected = String(Boolean(state.directory));
  selectDirectoryButton.disabled = busy || isBrowserPreview || !state.context;
  createProjectButton.disabled = busy || isBrowserPreview || !state.context || !state.grantId || Boolean(idError);
  pluginIdInput.disabled = busy || isBrowserPreview;
  selectDirectoryButton.textContent = state.operation === "select" ? "正在选择…" : "选择文件夹";
  createProjectButton.textContent = state.operation === "create" ? "正在创建…" : "创建插件项目";
  pluginRoot.setAttribute("aria-busy", String(busy));
  renderCreatedProject();
}

async function chooseDirectory(): Promise<void> {
  if (!state.context || isBrowserPreview) {
    setStatus("项目创建需要在 iHub 桌面端运行；浏览器预览不会伪造目录授权。", "error");
    return;
  }
  setOperation("select");
  setStatus("正在等待系统文件夹选择器…", "working");
  try {
    const selection = await state.context.filesystem.selectDirectory();
    if (selection.cancelled) {
      setStatus("已取消选择；没有读取或写入文件。", "ready");
      return;
    }
    state.grantId = selection.grantId;
    state.directory = selection.directory;
    state.created = null;
    setStatus("父文件夹已授权。输入合法的插件 ID 后即可创建。", "success");
  } catch (error) {
    setStatus(`无法选择文件夹：${errorMessage(error)}`, "error");
  } finally {
    setOperation(null);
  }
}

async function createProject(): Promise<void> {
  const pluginId = currentPluginId();
  const invalid = pluginIdError(pluginId);
  if (invalid) {
    render();
    pluginIdInput.focus();
    setStatus(invalid, "error");
    return;
  }
  if (!state.context || !state.grantId || !state.directory) {
    setStatus("请先通过系统选择器授权一个父文件夹。", "error");
    selectDirectoryButton.focus();
    return;
  }
  if (isBrowserPreview) {
    setStatus("浏览器预览不会创建项目或伪造目录授权。", "error");
    return;
  }

  setOperation("create");
  setStatus("iHub 正在保留新的子目录并写入独立模板…", "working");
  try {
    const created = await state.context.developer.createProject({
      grantId: state.grantId,
      pluginId,
    });
    state.created = created;
    setStatus(`已在授权目录中创建 ${created.pluginId}。`, "success");
  } catch (error) {
    setStatus(`无法创建项目：${errorMessage(error)}`, "error");
  } finally {
    setOperation(null);
  }
}

selectDirectoryButton.addEventListener("click", () => void chooseDirectory());
pluginIdInput.addEventListener("input", render);
projectForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void createProject();
});

let runtime: Disposable | null = null;

async function activate(context: PluginContext): Promise<void> {
  state.context = context;
  await context.commands.register(
    {
      id: "create-plugin-project",
      title: "Create plugin project",
      subtitle: "Choose a parent folder, name the plugin, and create a safe starter",
      keywords: ["plugin", "template", "typescript", "vite", "developer", "create"],
    },
    async () => {
      selectDirectoryButton.focus();
      setStatus("已从 iHub 命令面板打开。先选择父文件夹，页面不会接受手动路径。", "success");
      return { message: "Developer Tools is ready.", close: false };
    },
  );
  context.logger.info("Developer Tools plugin activated", { browserPreview: isBrowserPreview });
}

void bootstrapPlugin(PLUGIN_ID, activate, {
  bridge: previewBridge,
  onError(error) {
    setStatus(`插件桥接错误：${errorMessage(error)}`, "error");
    console.error(error);
  },
}).then((value) => {
  runtime = value;
  setStatus(isBrowserPreview
    ? "浏览器预览不会选择目录或创建文件。请在 iHub 桌面端打开此插件。"
    : "选择一个父文件夹，然后定义新的插件 ID。",
  );
  render();
}).catch((error) => {
  setStatus(`插件无法启动：${errorMessage(error)}`, "error");
  render();
});

window.addEventListener("pagehide", () => {
  void runtime?.dispose();
  runtime = null;
  state.context = null;
});

render();
