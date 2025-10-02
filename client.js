import { Observable, element } from "dynamics"
import { KcpWebSocketClient } from "./kcp"

/** @type {any} */
var DB

var spanObs = new Observable()

window.x.replaceWith(element('span', {
  innerText: spanObs
}))

if (typeof window !== 'undefined') {
  var wsc = new KcpWebSocketClient('/kisdb')
  wsc.obs.on(root => {
    DB = root
    root.name = spanObs
  })
}