# @zhoumutou/vite-plugin-inline

[![npm version](https://img.shields.io/npm/v/@zhoumutou/vite-plugin-inline.svg)](https://www.npmjs.com/package/@zhoumutou/vite-plugin-inline)
[![weekly downloads](https://img.shields.io/npm/dw/@zhoumutou/vite-plugin-inline)](https://www.npmjs.com/package/@zhoumutou/vite-plugin-inline)
[![license](https://img.shields.io/npm/l/@zhoumutou/vite-plugin-inline)](https://github.com/zhoumutou/vite-plugin-inline/blob/main/LICENSE)
[![unpacked size](https://img.shields.io/npm/unpacked-size/%40zhoumutou%2Fvite-plugin-inline)](https://www.npmjs.com/package/@zhoumutou/vite-plugin-inline)

一个将构建产物中的 CSS 与 JavaScript 资源内联到 HTML 的 Vite 插件，输出单个、可独立部署的 HTML 文件。

[English](./README.md) | 中文

## 特性

- 将所有 `<link rel="stylesheet">` 内联为 `<style>` 放入 HTML
- 将入口 JS 以内联方式注入为单个 `<script type="module">`
  - 若入口仍存在静态 import，会在内存中重打包以移除这些静态 import
  - 可选：通过 `inlineDynamicImports` 将动态 import 也一并合并进内联脚本
- 从最终产物中删除已内联的 JS/CSS 文件及其 sourcemap
- 清理指向已内联 chunk 的 `<link rel="modulepreload">`
- 保留 CSP 相关属性（script/style 保留 `nonce`、`id`；style 保留 `media`）
- 内联内容会转义 `</script>` 与 `</style>`，避免提前闭合
- 在 Vite 中禁用 modulePreload，生成更“干净”的单文件

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
    inline({
      // 可选配置
      // removeComments: true,          // 移除内联 CSS 的块级注释
      // cdataJs: false,                // 为内联 JS 包裹 <![CDATA[ ... ]]>
      // inlineDynamicImports: false,   // 合并动态导入到内联脚本
    }),
  ],
})
```

## 选项

```ts
interface Options {
  /**
   * 是否移除内联 CSS 的块级注释（/* ... *／）。
   * JS 不做直接注释处理；当发生重打包时，最小化过程可能会移除注释。
   * @default true
   */
  removeComments?: boolean
  /**
   * 是否使用 <![CDATA[ ... ]]> 包裹内联 JS，以兼容 XML/XHTML。
   * @default false
   */
  cdataJs?: boolean
  /**
   * 是否在内存重打包时，将动态导入也合并进最终的内联脚本。
   * 为 true 时，不会再额外产出 JS chunk。
   * @default false
   */
  inlineDynamicImports?: boolean
}
```

## 工作原理

- 扫描输出的 HTML：
  - 将 `<link rel="stylesheet" href="*.css">` 替换为 `<style>...</style>`
  - 查找属于本次 bundle 的主 `<script src="*.mjs|*.js">`（优先 `type="module"`）
- 生成内联 JS：
  - 若入口无静态 import，直接复用已产出的 chunk 代码
  - 若存在静态 import，则在内存中重打包以移除它们
  - 当 `inlineDynamicImports` 为 `true` 时，同时合并动态 import
  - 若重打包失败，会回退到原始 chunk，保证构建不中断
- 用内联内容替换原标签，然后：
  - 从 bundle 中删除已内联的 JS/CSS 及其 `.map`
  - 移除指向已内联 chunk 的 `<link rel="modulepreload">`

## 示例

输入 HTML：

```html
<link rel="stylesheet" href="style.css">
<script type="module" src="main.js"></script>
```

输出 HTML：

```html
<style>/* inlined CSS content */</style>
<script type="module">/* inlined (optionally rebundled) JS content */</script>
```

## 注意与限制

- 基于文件名匹配：
  - 通过文件“基本名”（如 `index-abc123.js`）匹配资源；若不同目录下存在相同基本名，可能产生歧义。
- 动态导入：
  - 当 `inlineDynamicImports=false`（默认）时，动态 chunk 仍为外部文件；插件不会删除它们。
- 非 CSS/JS 资源：
  - 图片、字体、JSON 等不会被内联。
- HTML 解析：
  - 基于正则替换；复杂模版场景可能需要自行调整。
- 安全/CSP：
  - 保留 `nonce`/`id`/`media` 等属性；内联内容转义避免提前结束标签。

## 类似插件 / 灵感

- [vite-plugin-singlefile](https://github.com/richardtallent/vite-plugin-singlefile)

感谢以上项目的启发。

## 许可

MIT
