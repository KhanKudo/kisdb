import { List } from "dynamics"
import { KcpWebSocketClient } from "./kcp"

/** @type {List} */
var serverStorage

if (typeof window !== 'undefined') {
  new KcpWebSocketClient('/kisdb', root => serverStorage = root)
}