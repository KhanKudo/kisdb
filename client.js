import { toDeepProxy } from "./deepProxy"

var serverStorage

if (typeof window !== 'undefined') {
  console.log('connecting websocket...')
  const ws = new WebSocket('/kisdb')
  ws.addEventListener('error', console.error)
  ws.addEventListener('open', console.log)
  let firstMsg = true
  ws.addEventListener('message', msg => {
    if (firstMsg) {
      serverStorage = toDeepProxy(JSON.parse(msg.data), {
        setListener(target, key, value, path, parent) {
          ws.send(JSON.stringify([key, value]))
        }
      })
      firstMsg = false
      console.log('Connected!')
      return
    }

    console.log('msg:', msg.data)
  })
}