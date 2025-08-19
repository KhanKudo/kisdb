import { List } from "dynamics"
import { toDeepProxy } from "./deepProxy"

/** @type {List} */
var serverStorage

if (typeof window !== 'undefined') {
  console.log('connecting websocket...')
  const ws = new WebSocket('/kisdb')
  ws.addEventListener('error', console.error)
  ws.addEventListener('open', console.log)
  let firstMsg = true
  ws.addEventListener('message', ({ data: msg }) => {
    if (firstMsg) {
      // serverStorage = toDeepProxy(JSON.parse(msg.data), {
      //   setListener(target, key, value, path, parent) {
      //     ws.send(JSON.stringify([key, value]))
      //   }
      // })
      serverStorage = new List(msg)
      serverStorage.onAdd.on(val => ws.send(JSON.stringify(['insert', serverStorage.indexOf(val), val])))
      serverStorage.onRemove.on(val => ws.send(JSON.stringify(['remove', serverStorage.indexOf(val), ''])))
      firstMsg = false
      console.log('Connected!')
      return
    }

    console.log('msg:', msg)
  })
}