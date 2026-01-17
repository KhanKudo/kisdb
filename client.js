import { Observable, element } from "dynamics"
import { KcpWebSocketClient } from "./kcp"

var __forceLoader = element()

/** @type {any} */
var DB

if (typeof window !== 'undefined') {
  var KCL = new KcpWebSocketClient('/kisdb')
  KCL.obs.on(root => {
    DB = root
  })
}