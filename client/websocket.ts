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

// export const webSocketHandler: Bun.WebSocketHandler<KcpLink> = {
//   open(ws: Bun.ServerWebSocket<KcpLink | undefined>): void {
//     let dbname = 'default'
//     if (ws.data !== null && typeof ws.data === 'object' && 'dbname' in ws.data && typeof ws.data.dbname === 'string') {
//       dbname = ws.data.dbname
//     }

//     ws.send = ws.send.bind(ws)

//     ws.data = loadDB(dbname, ws.send) //TODO: potential problem if .bind(ws) is not used, but if used, must account for unloadDB parameter

//       ; (<any>ws.data).pinger = setInterval(() => ws.send('PING'), 29000)

//     ws.send(',' + Operators.OVERWRITE + ',' + JSON.stringify(ws.data))
//     //TODO: just temporary, doesn't work for defined FNZs deeper than root
//     const dfs = ws.data.root.__definedFnz
//     console.log('dfs:', dfs)
//     if (dfs.length)
//       ws.send('.,' + Operators.FUNCTIONIZE + ',' + dfs.length + ',' + dfs.join(','))

//     console.log(`Socket opened with DB ${dbname}`)
//   },
//   message(ws: Bun.ServerWebSocket<KcpLink>, message: string | Buffer): void | Promise<void> {
//     if (typeof message !== 'string')
//       return console.warn('Received a Buffer message which is not supported!')

//     subs.get(ws.data.dbname)?.forEach(sub => {
//       if (sub === ws.send)
//         return
//       sub(message)
//     })
//     ws.data.receiveKCP(message)
//   },
//   close(ws: Bun.ServerWebSocket<KcpLink>, code: number, reason: string): void | Promise<void> {
//     clearInterval((<any>ws.data).pinger)
//     unloadDB(ws.data.dbname, ws.send)
//   }
// }