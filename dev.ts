import wsh from "./server"

const server = Bun.serve({
  routes: {
    '/kisdb'(req, server) {
      server.upgrade(req)
    },
    '/kisdb/:db'(req, server) {
      server.upgrade(req, { data: req.params })
    }
  },
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