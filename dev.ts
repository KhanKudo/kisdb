import { webSocketHandler as wsh, routesHandler as rh, loadDB, unloadDB, saveDB } from "./server"

const server = Bun.serve({
  routes: rh,
  hostname: '0.0.0.0',
  port: 3001,
  websocket: wsh,
  fetch(req, server) {
    return new Response(Bun.file('./' + (URL.parse(req.url)?.pathname?.slice(1) || 'index.html')))
    // return new Response('OK')
  }
})

console.log('Ready! ( http://localhost:3001 )')

const dbname = 'default'
const dbFunc = () => { }
const link = loadDB(dbname, dbFunc, 'manual')

const DB = link.root

DB.apple = (...args: any[]) => {
  console.log('called with:', ...args)
  return 'banana'
}

DB.skype = (msg: string) => {
  console.log('\t>\tSkype Message:\t', msg)
  DB.name = msg
}

DB.saveDB = () => {
  saveDB(dbname)
}

setInterval(() => {
  if ('yogurth' in DB && typeof DB.yogurth === 'function') {
    DB.yogurth('orange')
  }
}, 3000)

process.on('exit', () => {
  server.stop(true)
  unloadDB(dbname, dbFunc)
})