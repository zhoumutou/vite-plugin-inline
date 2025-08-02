import antfu from '@antfu/eslint-config'

export default antfu(
  {
    typescript: true,
    stylistic: {
      semi: false,
      quotes: 'single',
    },
    formatters: {
      markdown: true,
    },
  },
)
