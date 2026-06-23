import { message } from './message'

document.querySelector<HTMLDivElement>('#app')!.textContent = message

void import('./lazy').then(({ lazy }) => {
  document.querySelector<HTMLDivElement>('#app')!.dataset.lazy = lazy
})
