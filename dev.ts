import { createSQLiteHandle, destroyKCPHandle } from "./db/sqlite"
import { createHttpRoutes } from "./server/http"
import { createVanillaViewer } from "./viewer/vanilla"

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

const DB = createVanillaViewer(handle)

// DB.apple = (...args: any[]) => {
//   console.log('called with:', ...args)
//   return 'banana'
// }

// DB.skype = (msg: string) => {
//   console.log('\t>\tSkype Message:\t', msg)
//   DB.name = msg
// }

// DB.saveDB = () => {
//   saveDB(dbname)
// }

// setInterval(() => {
//   if ('yogurth' in DB && typeof DB.yogurth === 'function') {
//     DB.yogurth('orange')
//   }
// }, 3000)

setInterval(async () => {
  if (typeof DB.count() === 'number') {
    DB.count = (await DB.count) + 1
    // console.log('count:', DB.count())
  }
  else {
    // console.log('invalid count')
  }
}, 1000)

process.on('exit', () => {
  server.stop(true)
  destroyKCPHandle(handle)
})