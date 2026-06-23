import './style.css'
import { message } from './message'

console.log(message)
document.querySelector<HTMLDivElement>('#app')!.textContent = message
