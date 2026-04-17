import { createSQLiteHandle, destroySQLiteHandle } from "../db/sqlite"
import { type KCPTrustedContext } from "../kcp"
import { createHttpRoutes } from "../server/http"
import { createWebSocketConfig } from "../server/websocket"
import { createDirectClient } from "../client/direct"
import { createVanillaViewer } from "../viewer/vanilla"

const handle = await createSQLiteHandle()

const httpRoutes = createHttpRoutes(handle)
const wsconf = createWebSocketConfig(handle)

const server = Bun.serve({
  routes: {
    ...httpRoutes,
    ...wsconf.routes,
  },
  hostname: '0.0.0.0',
  websocket: wsconf.websocket,
  fetch(req, server) {
    return new Response(Bun.file('./' + (URL.parse(req.url)?.pathname?.slice(1) || 'index.html')))
    // return new Response('OK')
  }
})

console.log('Ready! ( http://localhost:3000 )')

export type MyDbType = {
  arr: number[],
  count?: number,
  test: any,
  x: { y: { z: {} } },
  apple(ctx: KCPTrustedContext, arg: string): 'banana',
}

const direct = createDirectClient(handle, { connection: 0, token: Bun.env.SERVER_TOKEN ?? '' })
const DB = createVanillaViewer<MyDbType>(direct)

DB.apple = async (ctx, arg) => {
  console.log('ctx:', ctx, 'called with arg:', arg)
  return 'banana'
}

// DB.skype = (msg: string, x: any) => {
//   console.log('\t>\tSkype Message:\t', msg, x)
//   DB.msg = msg
// }

// setInterval(() => {
//   if ('yogurth' in DB && typeof DB.yogurth === 'function') {
//     DB.yogurth('orange')
//   }
// }, 3000)

// setInterval(async () => {
//   if (typeof DB.count() === 'number') {
//     DB.count = (await DB.count) + 1
//     // console.log('count:', DB.count())
//   }
//   else {
//     // console.log('invalid count')
//   }
// }, 1000)

process.on('exit', () => {
  server.stop(true)
  destroySQLiteHandle(handle)
})