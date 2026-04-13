import { createSQLiteHandle, destroyKCPHandle } from "../db/sqlite"
import { bindContext, type KCPTrustedContext } from "../kcp"
import { createHttpRoutes } from "../server/http"
import { createVanillaViewer } from "../viewer/vanilla"

const handle = createSQLiteHandle()

const server = Bun.serve({
  routes: createHttpRoutes(handle),
  hostname: '0.0.0.0',
  port: 3001,
  fetch(req, server) {
    return new Response(Bun.file('./' + (URL.parse(req.url)?.pathname?.slice(1) || 'index.html')))
    // return new Response('OK')
  }
})

console.log('Ready! ( http://localhost:3001 )')

export type MyDbType = {
  arr: number[],
  count?: number,
  test: any,
  x: { y: { z: {} } },
  apple(ctx: KCPTrustedContext, arg: string): 'banana',
}

const DB = createVanillaViewer<MyDbType>(bindContext({ connection: 0, token: Bun.env.SERVER_TOKEN ?? '' }, handle))

DB.count.$on = console.log

DB.apple = async (ctx, arg) => {
  console.log('ctx:', ctx, 'called with arg:', arg)
  return 'banana'
}

// DB.skype = (msg: string, x: any) => {
//   console.log('\t>\tSkype Message:\t', msg, x)
//   DB.msg = msg
// }

// DB.saveDB = () => {
//   saveDB(dbname)
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
  destroyKCPHandle(handle)
})