(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),e.crossOrigin===`use-credentials`?t.credentials=`include`:e.crossOrigin===`anonymous`?t.credentials=`omit`:t.credentials=`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var e=`ihub-plugin-bridge/v1`,t=`ihub-host-bridge/v1`,n=3e4;function r(e,t){return`ihub://plugin/${e}/${t}`}function i(e){return e}function a(e){return!!e&&typeof e==`object`}function o(e){return e instanceof Error?e.message:String(e)}function s(){let r=window.parent,i=new Map,o=new Map,s=0;return window.addEventListener(`message`,e=>{if(e.source!==r||!a(e.data))return;let n=e.data;if(n.channel!==t)return;if(n.type===`event`&&typeof n.name==`string`){Promise.all([...o.get(n.name)??[]].map(e=>e(n.payload)));return}if(n.type!==`response`||typeof n.id!=`string`)return;let s=i.get(n.id);s&&(i.delete(n.id),window.clearTimeout(s.timeout),n.ok===!0?s.resolve(n.result):s.reject(Error(typeof n.error==`string`?n.error:`iHub host call failed.`)))}),{call(t){return new Promise((a,o)=>{let c=`developer-tools-${Date.now().toString(36)}-${(s++).toString(36)}`,l=window.setTimeout(()=>{i.delete(c),o(Error(`iHub host call timed out.`))},n);i.set(c,{resolve:e=>a(e),reject:o,timeout:l}),r.postMessage({channel:e,type:`call`,id:c,request:t},`*`)})},async listen(e,t){let n=o.get(e)??new Set,r=t;return n.add(r),o.set(e,n),()=>{n.delete(r),n.size===0&&o.delete(e)}}}}function c(){return typeof window<`u`&&!!(window.__IHUB_PLUGIN_API__||window.parent!==window)}function l(){if(typeof window>`u`)throw Error(`iHub plugins need a browser WebView.`);return window.__IHUB_PLUGIN_API__??s()}function u(){let e=new Map;return{async call(e){if(e.method===`filesystem.selectDirectory`||e.method===`developer.createProject`)throw Error(`项目创建需要在 iHub 桌面端使用系统文件夹授权。`)},async listen(t,n){let r=e.get(t)??new Set,i=n;return r.add(i),e.set(t,r),()=>{r.delete(i),r.size===0&&e.delete(t)}},async emit(t,n){await Promise.all([...e.get(t)??[]].map(e=>e(n)))}}}var d=class{pluginId;bridge;onError;commandHandlers=new Map;unlisten=[];commandsReady=!1;disposed=!1;context;constructor(e,t,n){this.pluginId=e,this.bridge=t,this.onError=n,this.context={pluginId:e,commands:{register:(e,t)=>this.registerCommand(e,t)},filesystem:{selectDirectory:()=>this.call(`filesystem.selectDirectory`)},developer:{createProject:e=>this.call(`developer.createProject`,e)},logger:{debug:(e,t)=>this.log(`debug`,e,t),info:(e,t)=>this.log(`info`,e,t),warn:(e,t)=>this.log(`warn`,e,t),error:(e,t)=>this.log(`error`,e,t)}}}async activate(e){await e(this.context),await this.call(`lifecycle.ready`)}async dispose(){this.disposed||(this.disposed=!0,this.commandHandlers.clear(),await Promise.all(this.unlisten.splice(0).map(e=>Promise.resolve(e()))),await this.bridge.call({pluginId:this.pluginId,method:`lifecycle.dispose`}).catch(this.onError))}async registerCommand(e,t){if(this.assertActive(),this.commandHandlers.has(e.id))throw Error(`Duplicate command: ${e.id}`);await this.ensureCommandListener(),this.commandHandlers.set(e.id,t),await this.call(`commands.register`,{definition:i(e)});let n=!1;return{dispose:async()=>{n||(n=!0,this.commandHandlers.delete(e.id),await this.call(`commands.unregister`,{commandId:e.id}))}}}async ensureCommandListener(){this.commandsReady||=(this.unlisten.push(await this.bridge.listen(r(this.pluginId,`command`),e=>this.handleCommand(e))),!0)}async handleCommand(e){let t=this.commandHandlers.get(e.commandId);if(!t){await this.respond(e.requestId,!1,null,`Unknown command: ${e.commandId}`);return}try{await this.respond(e.requestId,!0,await t(e)??{})}catch(t){this.onError(t),await this.respond(e.requestId,!1,null,o(t))}}async respond(e,t,n,r){await this.call(`commands.complete`,{requestId:e,ok:t,result:i(n),error:r??null})}log(e,t,n){this.call(`log`,{level:e,message:t,details:n??null}).catch(this.onError)}call(e,t){return this.assertActive(),this.bridge.call({pluginId:this.pluginId,method:e,params:t})}assertActive(){if(this.disposed)throw Error(`Plugin runtime for ${this.pluginId} has already been disposed.`)}};async function f(e,t,n={}){let r=n.onError??(t=>console.error(`[${e}]`,t)),i=new d(e,n.bridge??l(),r);try{return await i.activate(t),i}catch(e){throw await i.dispose(),e}}var p=`ihub-plugin-developer-tools`,m=!c(),h=m?u():void 0,g={context:null,grantId:null,directory:null,created:null,operation:null},_=document.querySelector(`#app`);if(!_)throw Error(`The Developer Tools plugin root is missing.`);var v=_;_.innerHTML=`
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
`;function y(e){let t=document.getElementById(e);if(!t)throw Error(`Missing Developer Tools element: #${e}`);return t}var b=y(`project-form`),x=y(`select-directory`),S=y(`directory-surface`),C=y(`selected-directory`),w=y(`plugin-id`),T=y(`id-validation`),E=y(`create-project`),D=y(`created-project`),O=y(`created-path`),k=y(`next-steps`),A=y(`status`);function j(e,t=`ready`){A.textContent=e,A.dataset.tone=t}function M(e){return e instanceof Error&&e.message.trim()?e.message.trim():`iHub 无法完成该操作。请检查目录授权后重试。`}function N(e){let t=e.trim();return t?t.length<3||t.length>63?`插件 ID 需要为 3 到 63 个字符。`:/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(t)?null:`请使用以小写字母开头的 kebab-case ID；不能包含路径、空格或下划线。`:`输入一个新插件的 ID。`}function P(){return w.value.trim()}function F(e){g.operation=e,R()}function I(){let e=N(w.value),t=!!w.value.trim();return w.setAttribute(`aria-invalid`,String(t&&!!e)),w.dataset.valid=String(t&&!e),T.textContent=e??`ID 格式正确；宿主仍会在创建前进行同样的校验。`,T.dataset.tone=e&&t?`error`:`ready`,e}function L(){let e=g.created;if(D.hidden=!e,!e){O.textContent=``,k.replaceChildren();return}O.textContent=e.projectPath,k.replaceChildren();for(let t of e.nextSteps){let e=document.createElement(`li`);e.textContent=t,k.append(e)}}function R(){let e=g.operation!==null,t=I();C.value=g.directory??``,S.dataset.selected=String(!!g.directory),x.disabled=e||m||!g.context,E.disabled=e||m||!g.context||!g.grantId||!!t,w.disabled=e||m,x.textContent=g.operation===`select`?`正在选择…`:`选择文件夹`,E.textContent=g.operation===`create`?`正在创建…`:`创建插件项目`,v.setAttribute(`aria-busy`,String(e)),L()}async function z(){if(!g.context||m){j(`项目创建需要在 iHub 桌面端运行；浏览器预览不会伪造目录授权。`,`error`);return}F(`select`),j(`正在等待系统文件夹选择器…`,`working`);try{let e=await g.context.filesystem.selectDirectory();if(e.cancelled){j(`已取消选择；没有读取或写入文件。`,`ready`);return}g.grantId=e.grantId,g.directory=e.directory,g.created=null,j(`父文件夹已授权。输入合法的插件 ID 后即可创建。`,`success`)}catch(e){j(`无法选择文件夹：${M(e)}`,`error`)}finally{F(null)}}async function B(){let e=P(),t=N(e);if(t){R(),w.focus(),j(t,`error`);return}if(!g.context||!g.grantId||!g.directory){j(`请先通过系统选择器授权一个父文件夹。`,`error`),x.focus();return}if(m){j(`浏览器预览不会创建项目或伪造目录授权。`,`error`);return}F(`create`),j(`iHub 正在保留新的子目录并写入独立模板…`,`working`);try{let t=await g.context.developer.createProject({grantId:g.grantId,pluginId:e});g.created=t,j(`已在授权目录中创建 ${t.pluginId}。`,`success`)}catch(e){j(`无法创建项目：${M(e)}`,`error`)}finally{F(null)}}x.addEventListener(`click`,()=>void z()),w.addEventListener(`input`,R),b.addEventListener(`submit`,e=>{e.preventDefault(),B()});var V=null;async function H(e){g.context=e,await e.commands.register({id:`create-plugin-project`,title:`Create plugin project`,subtitle:`Choose a parent folder, name the plugin, and create a safe starter`,keywords:[`plugin`,`template`,`typescript`,`vite`,`developer`,`create`]},async()=>(x.focus(),j(`已从 iHub 命令面板打开。先选择父文件夹，页面不会接受手动路径。`,`success`),{message:`Developer Tools is ready.`,close:!1})),e.logger.info(`Developer Tools plugin activated`,{browserPreview:m})}f(p,H,{bridge:h,onError(e){j(`插件桥接错误：${M(e)}`,`error`),console.error(e)}}).then(e=>{V=e,j(m?`浏览器预览不会选择目录或创建文件。请在 iHub 桌面端打开此插件。`:`选择一个父文件夹，然后定义新的插件 ID。`),R()}).catch(e=>{j(`插件无法启动：${M(e)}`,`error`),R()}),window.addEventListener(`pagehide`,()=>{V?.dispose(),V=null,g.context=null}),R();