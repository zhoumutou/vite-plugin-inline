document.querySelector<HTMLDivElement>('#app')!.textContent = 'dynamic external'

void import('./lazy').then(({ lazy }) => {
  document.querySelector<HTMLDivElement>('#app')!.dataset.lazy = lazy
})
