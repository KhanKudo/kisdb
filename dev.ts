import { webSocketHandler as wsh, routesHandler as rh } from "./server"

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

process.on('exit', () => {
  server.stop(true)
})