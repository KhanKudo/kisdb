import { List, Observable, element } from "dynamics"
import { KcpWebSocketClient } from "./kcp"

/** @type {List} */
var serverStorage

if (typeof window !== 'undefined') {
  var wsc = new KcpWebSocketClient('/kisdb')
  wsc.obs.on(root => {
    serverStorage = root
    window.x.replaceWith(element('span', {
      innerText: root.name = new Observable()
    }))
  })
}