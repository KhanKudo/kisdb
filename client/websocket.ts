import { toKcpProxy, type ProxyType } from "../kcp"

// kisdb WebSocket Client
export function createWebSocketClient<T = any>(webSocketPath: string = '/'): ProxyType {
  const ws = new WebSocket(webSocketPath)

  ws.onmessage = ({ data: msg }) => {
    if (msg === 'PING')
      return

    console.log(`client > receiveKCP > "${msg}"`)
    super.receiveKCP(msg)
  }

  if ('window' in global) {
    (global.window as any).addEventListener('beforeunload', () => {
      return ws.close(undefined, 'Browser window was closed!')
    })
  }

  return toKcpProxy(
    '',
    async (key) => {

    },
    async (key, value) => {

    })
}