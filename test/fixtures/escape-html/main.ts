import './style.css'

const payload = '</script><!--danger-->'

console.log(payload)
document.querySelector<HTMLDivElement>('#app')!.textContent = payload
