document.querySelector<HTMLDivElement>('#app')!.textContent = 'nested dynamic external'

void import('./lazy').then(({ lazy }) => {
  document.querySelector<HTMLDivElement>('#app')!.dataset.lazy = lazy
})
