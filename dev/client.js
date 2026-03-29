// import { Observable, element } from "dynamics"
import { createVanillaViewer } from "../viewer/vanilla"
import { createHttpClient } from "../client/http"

// var __forceLoader = element()
// __forceLoader = __forceLoader

const ctx = { token: sessionStorage.getItem('token') ?? '' }
const client = createHttpClient(undefined, ctx)
window.client = client
window.DB = createVanillaViewer(client)

async function login(username, password) {
  const token = await client.setter('login', { username, password })
  if (typeof token !== 'string') {
    console.warn(token)
    throw new Error(token)
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

function speedtest(cycles = 100) {
  return new Promise(resolve => {
    const db = window.DB.speedtest
    const myFunc = c => {
      if (c === 0) {
        window.start = performance.now()
      }
      if (c < cycles)
        return db(c + 1)

      db.$off = myFunc
      const end = performance.now()
      console.info(`Total elapsed ${end - start}ms over ${cycles} iterations with average of ${Math.round((end - start) / cycles * 100) / 100}ms`)
      resolve(end - start)
      delete window.DB.speedtest
    }
    db.$on = myFunc
    db(0)
  })
}

window.speedtest = speedtest