import { createVanillaViewer, refUpdater, type ProxyType } from "../viewer/vanilla"
import { createHttpClient } from "../client/http"
import type { MyDbType } from "./dev"
import { createWebSocketClient } from "../client/websocket"

if (!sessionStorage.getItem('token'))
  //@ts-ignore
  sessionStorage.setItem('token', window.prompt('Please enter a token:'))

const ctx = { token: sessionStorage.getItem('token') ?? 'xyz' }
const client = createHttpClient(undefined, ctx)
window.client = client
const wsClient = createWebSocketClient(undefined, ctx)
//@ts-ignore
window.wsClient = wsClient
const DB1 = createVanillaViewer<MyDbType & { speedtest: number }>(client)
//@ts-ignore
window.DB1 = DB1
const DB2 = createVanillaViewer<MyDbType & { speedtest: number }>(wsClient)
//@ts-ignore
window.DB2 = DB2

async function login(username: string, password: string) {
  const token = await client.setter('login', { username, password })
  if (typeof token !== 'string') {
    console.warn(token)
    throw new Error(token?.toString())
  }

  sessionStorage.setItem('token', token)
  ctx.token = token
}
window.login = login

async function logout() {
  await client.setter('logout', ctx.token)
  ctx.token = ''
}
window.logout = logout

// setInterval(async () => {
//   DB.count = await DB.count + 1
// }, 1000)

function speedtest(dbx: ProxyType, cycles = 100, progress: (cycle: number, avg: number, cur: number, min: number, max: number) => void) {
  let startMs = 0, min = 1e6, avg = 0, max = 0, cur = 0, lastMs = 0, curMs = 0
  return new Promise(resolve => {
    const val = dbx['speedtest-' + Math.round(Math.random() * 1000)]
    const myFunc = (c: number) => {
      if (c < cycles) {
        val(c + 1)
        curMs = performance.now()
        cur = curMs - lastMs
        lastMs = curMs
        if (cur < min)
          min = cur
        if (cur > max)
          max = cur

        progress((c + 1), Math.round((curMs - startMs) / (c + 1) * 100) / 100, cur, min, max)
        return
      }

      val.$off = myFunc
      const end = performance.now()
      console.info(`Total elapsed ${end - startMs}ms over ${cycles} iterations with average of ${Math.round((end - startMs) / cycles * 100) / 100}ms`)
      resolve(end - startMs)
      val(undefined)
    }
    val.$on = myFunc
    startMs = performance.now()
    lastMs = startMs
    val(0)
  })
}
//@ts-ignore
window.speedtest = speedtest

function createSpeedtest(dbx: ProxyType, name = 'Unspecified Client', cycles = 1000) {
  //@ts-ignore
  const elem = document.createElement('div')
  elem.innerHTML = `
    <span>${name}: </span>
    <button>Run Speedtest</button>
    <span>??.??ms (??.??/??.??)</span>
    `

  elem.querySelector('button').onclick = () => {
    speedtest(dbx, cycles, (c, avg, cur, min, max) => {
      elem.lastElementChild.innerText = `${cur}ms (${min}/${avg}/${max}) [${c} of ${cycles}]`
    })
  }
  //@ts-ignore
  document.body.appendChild(elem)
}
//@ts-ignore
window.createSpeedtest = createSpeedtest

//@ts-ignore
window.stop1 = refUpdater((a, b, c) => {
  console.log('REF UPDATER 1:', a, b, c)
}, DB1.arr, DB1.count, DB1.test)
//@ts-ignore
window.stop2 = refUpdater((a, b, c) => {
  console.log('REF UPDATER 2:', a, b, c)
}, DB2.arr, DB2.count, DB2.test)


createSpeedtest(DB1, 'HTTP')
createSpeedtest(DB2, 'WebSocket')