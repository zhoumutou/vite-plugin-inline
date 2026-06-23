document.querySelector<HTMLDivElement>('#app')!.textContent = 'dynamic inline'

void import('./lazy').then(({ lazy }) => {
  document.querySelector<HTMLDivElement>('#app')!.dataset.lazy = lazy
})
