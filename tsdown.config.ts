import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: 'src/index.ts',
    format: ['cjs', 'esm'],
    dts: false,
    minify: false,
    silent: true,
  },
  {
    entry: 'src/index.ts',
    format: ['esm'],
    dts: {
      emitDtsOnly: true,
    },
    silent: true,
  },
])
