import { defineConfig } from 'vite-plus'

export default defineConfig({
  pack: {
    entry: ['src/index.ts'],
    attw: {
      ignoreRules: ['cjs-resolves-to-esm'],
    },
    dts: true,
    fixedExtension: false,
    publint: true,
  },
  test: {
    globals: true,
    include: ['test/**/*.test.ts'],
  },
  lint: {
    ignorePatterns: ['dist/**'],
    plugins: ['typescript', 'import', 'unicorn'],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'import/no-duplicates': 'error',
      'typescript/consistent-type-imports': 'error',
      'unicorn/prefer-node-protocol': 'error',
    },
    overrides: [
      {
        files: ['test/fixtures/**/*.ts'],
        rules: {
          'no-console': 'off',
        },
      },
    ],
  },
  fmt: {
    singleQuote: true,
    semi: false,
  },
  staged: {
    '*.{ts,md}': 'vp check --fix',
  },
})
