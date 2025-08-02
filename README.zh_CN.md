# @zhoumutou/vite-plugin-inline

[![npm version](https://img.shields.io/npm/v/@zhoumutou/vite-plugin-inline.svg)](https://www.npmjs.com/package/@zhoumutou/vite-plugin-inline)
[![weekly downloads](https://img.shields.io/npm/dw/@zhoumutou/vite-plugin-inline)](https://www.npmjs.com/package/@zhoumutou/vite-plugin-inline)
[![license](https://img.shields.io/npm/l/@zhoumutou/vite-plugin-inline)](https://github.com/zhoumutou/vite-plugin-inline/blob/main/LICENSE)
[![install size](https://packagephobia.com/badge?p=@zhoumutou/vite-plugin-inline)](https://packagephobia.com/result?p=@zhoumutou/vite-plugin-inline)

一个 Vite 插件，将 CSS 和 JavaScript 资源内联到 HTML 文件中，生成单一、无外部依赖的 HTML 文件。

[English](/README.md) | 中文

## 特性

- 将所有 `<link>` 标签引用的 CSS 以 `<style>` 形式内联
- 将主 JavaScript 文件及其所有依赖以 `<script type="module">` 形式内联
- 可选移除注释以减小体积
- 构建输出中移除原始外部 JS/CSS 文件

## 安装

```bash
# npm
npm install @zhoumutou/vite-plugin-inline -D

# yarn
yarn add @zhoumutou/vite-plugin-inline -D

# pnpm
pnpm add @zhoumutou/vite-plugin-inline -D
```

## 用法

在 Vite 或 Rolldown 配置中添加插件：

```typescript
import inline from '@zhoumutou/vite-plugin-inline'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    inline(),
  ],
})
```

## 选项

插件接受以下选项：

```typescript
interface Options {
  /** 是否移除 JS/CSS 文件中的注释 (默认: true) */
  removeComments?: boolean
}
```

## 工作原理

- 将 HTML 中所有 `<link>` 标签引用的 CSS 以 `<style>` 标签内联
- 将主 JS 文件及其所有依赖合并为一个 `<script type="module">` 标签内联
- 可选移除内联资源中的注释
- 构建产物中移除原始 JS/CSS 文件

## 示例

假设你的 HTML 包含：

```html
<link rel="stylesheet" href="style.css">
<script type="module" src="main.js"></script>
```

构建后，启用本插件，HTML 会变为：

```html
<style>/* 内联 CSS 内容 */</style>
<script type="module">/* 内联 JS 内容 */</script>
```

## Similar Plugins / Inspiration

本插件受到以下优秀项目的启发和参考：

- [vite-plugin-singlefile](https://github.com/richardtallent/vite-plugin-singlefile) - 这个 Vite 构建插件允许你将所有 JavaScript 和 CSS 资源直接内联到最终的 dist/index.html 文件中。

感谢所有这些项目提供的宝贵参考和灵感。
