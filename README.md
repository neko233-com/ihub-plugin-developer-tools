# iHub Developer Tools

`ihub-plugin-developer-tools` 是一个独立的 TypeScript/Vite 官方插件。它在用户明确选择的父文件夹中创建完整的 iHub 插件起始项目，包含前端、可选 Rust worker、跨平台构建脚本与开发说明。

## 创建流程与安全边界

1. 用户点击“选择文件夹”，由 iHub 原生选择器返回一个短期、不透明的目录授权。
2. 用户输入合法的插件 ID（3–63 个字符、小写 kebab-case）。
3. 用户点击“创建插件项目”；插件只提交 `{ grantId, pluginId }` 给宿主。
4. 宿主解析授权所属插件与目录，再调用既有的安全模板创建器。

公开 bridge API 为：

```ts
context.filesystem.selectDirectory()
context.developer.createProject({ grantId, pluginId })
```

`developer.createProject` 从不接受前端提供的父目录路径。目录授权绑定到发起插件、会过期，并在插件生命周期结束时撤销；另一插件无法复用它。模板创建器会先原子保留新的子目录，若同名文件或目录已经存在则失败，绝不覆盖。

唯一请求的权限是：

```json
{
  "filesystem": {
    "read": ["user-selected"],
    "write": ["user-selected"]
  }
}
```

浏览器预览不会伪造目录授权、创建文件或读取目录。该插件不请求剪贴板、shell、进程、通知、网络或原生二进制权限。

## 开发与构建

```powershell
pnpm install
pnpm run check
pnpm run build
pnpm run dev
```

在独立克隆仓库的根目录运行上述命令；主仓中的检出目录也一样可直接运行。

`dist/` 是 iHub 从 Git 导入时加载的前端产物。iHub 不会在导入、安装或启动此插件时执行 npm/pnpm 脚本；插件将自己的轻量 bridge 客户端随源码提供，因此单独克隆后也可构建。
