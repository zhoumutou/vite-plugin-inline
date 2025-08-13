# @zhoumutou/vite-plugin-inline

[![npm version](https://img.shields.io/npm/v/@zhoumutou/vite-plugin-inline.svg)](https://www.npmjs.com/package/@zhoumutou/vite-plugin-inline)
[![weekly downloads](https://img.shields.io/npm/dw/@zhoumutou/vite-plugin-inline)](https://www.npmjs.com/package/@zhoumutou/vite-plugin-inline)
[![license](https://img.shields.io/npm/l/@zhoumutou/vite-plugin-inline)](https://github.com/zhoumutou/vite-plugin-inline/blob/main/LICENSE)
[![install size](https://packagephobia.com/badge?p=@zhoumutou/vite-plugin-inline)](https://packagephobia.com/result?p=@zhoumutou/vite-plugin-inline)

一个将 CSS 与 JavaScript 资源内联到 HTML 的 Vite 插件，生成完全自包含的单个 HTML 文件，无需外部依赖。

[English](/README.md) | 中文

## 特性

- 将所有 CSS `<link>` 内联为 HTML 中的 `<style>`
- 将入口 JS 及其依赖分块合并为单个 `<script type="module">`
- 通过按拓扑顺序的命名空间 IIFE 保证跨 chunk 的导入顺序
- 可选：使用 oxc-minify 对最终内联 JS 做二次压缩/消除死代码
- 可选：移除块级注释以减小体积
- 从产物中移除原始 JS/CSS 资源文件
- 关闭 modulePreload，输出更干净的单文件

## 安装

```bash
# npm
npm install @zhoumutou/vite-plugin-inline -D

# yarn
yarn add @zhoumutou/vite-plugin-inline -D

# pnpm
pnpm add @zhoumutou/vite-plugin-inline -D
```

## 使用

```ts
import inline from '@zhoumutou/vite-plugin-inline'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    inline(),
  ],
})
```

## 选项

```ts
interface Options {
  /**
   * 移除内联 CSS 和 JS 中的块级注释。
   * 可减小体积，但调试会变得困难。
   * @default true
   */
  removeComments?: boolean
  /**
   * 使用 oxc-minify 对最终内联 JS 进行二次压缩。
   * 注意：这不是打包阶段的 tree-shaking 替代方案。
   * @default false
   */
  minify?: boolean | MinifyOptions
  /**
   * 是否用 <![CDATA[ ... ]]> 包裹内联 JS 代码，以兼容 XML/XHTML。
   * @default false
   */
  cdataJs?: boolean
}
```

## 工作原理

- 将 `<link href="*.css">` 替换为包含文件内容的 `<style>`。
- 查找主入口 `<script src="*.js">`，读取其代码及依赖的 chunk。
- 构建依赖图并进行拓扑排序；将每个 chunk 包装为返回其导出的命名空间 IIFE。
- 在 chunk 与入口中把 `import { x as y } from 'chunk.js'` 重写为 `const { x: y } = __ns;`。
- 按顺序拼接所有 IIFE 与改写后的入口，生成一个 `<script type="module">`。
- 可选：对最终脚本字符串执行 oxc-minify。
- 从最终输出中移除已被内联的 JS/CSS 资源。

## 示例

输入 HTML：

```html
<link rel="stylesheet" href="style.css">
<script type="module" src="main.js"></script>
```

输出 HTML：

```html
<style>/* inlined CSS content */</style>
<script type="module">/* topo-sorted IIFEs + transformed entry (optionally minified) */</script>
```

## 注意事项与限制

- 该实现无法完整模拟复杂循环依赖中的 ESM 实时绑定；简单回边会被容忍处理。
- 动态 import 不会被本插件内联进最终脚本。

## 相似插件 / 灵感来源

- [vite-plugin-singlefile](https://github.com/richardtallent/vite-plugin-singlefile)

感谢以上项目带来的启发。

## 许可证

MIT
