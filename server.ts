import { Database } from 'bun:sqlite'
import { proxyRefs, type ProxyType, toKcpProxy } from './kcp'

const dbs = new Map<string, ProxyType>()
const subs = new Map<string, Set<(command: string) => void>>()

export type DataType = string | number | boolean | null | { [key: string]: DataType } | DataType[]

export function loadDB<T = any>(dbname: string, kcpSender: (command: string) => void) {
  if (!subs.has(dbname))
    subs.set(dbname, new Set())
  subs.get(dbname)!.add(kcpSender)

  const db = new Database(`${dbname}.db`, { create: true, readwrite: true, strict: true })
  db.run(`CREATE TABLE IF NOT EXISTS _kvstore (
    key TEXT PRIMARY KEY,
    value TEXT
    );`)

  const updateExactKey = db.query<void, [string, string | null]>('INSERT INTO _kvstore (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
  const deleteExactKey = db.query<void, string>('DELETE FROM _kvstore WHERE key = ?')
  const exactKey = db.query<{ value: string | null }, string>('SELECT value FROM _kvstore WHERE key = ?')
  const likeKey = db.query<{ key: string, value: string | null }, string>('SELECT * FROM _kvstore WHERE key LIKE ?')
  const deleteLikeKey = db.query<void, string>('DELETE FROM _kvstore WHERE key LIKE ?')

  function getObj(key: string): Record<string, any> | void {
    const obj: any = {}

    const rows = likeKey.all(`${key}.%`).map(row => {
      row.key = row.key.slice(key.length + 1)
      return row
    })

    if (!rows.length)
      return

    let tmp = obj
    for (const { key: k, value } of rows) {
      tmp = obj
      const parts = k.split('.')
      if (parts.length > 1) {
        for (let i = 0; i < parts.length - 1; i++) {
          tmp[parts[i] as string] ??= {}
          tmp = tmp[parts[i] as string]
        }
      }

      tmp[parts.at(-1) as string] = JSON.parse(value ?? 'null')
    }

    return obj
  }

  function setObj(key: string, obj: Record<string, any>): void {
    for (const k in obj) {
      if (typeof obj[k] === 'object' && obj[k] !== null) {
        setObj(key + '.' + k, obj[k])
      }
      else {
        updateExactKey.run(key + '.' + k, JSON.stringify(obj[k]))
      }
    }
  }

  function getter(key: string): DataType | void {
    const res = exactKey.get(key)
    if (res === null)
      return
    else if (res.value === null)
      return getObj(key)
    else
      return JSON.parse(res.value)
  }

  function setter(key: string, value?: any): void {
    db.transaction(() => {
      key.split('.').reduce((p, k) => {
        updateExactKey.run(p, null)
        return p + '.' + k
      })
      deleteLikeKey.run(key + '.%')
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        updateExactKey.run(key, null)
        setObj(key, value)
      }
      else if (typeof value === 'undefined') {
        deleteExactKey.run(key)
      } else {
        updateExactKey.run(key, JSON.stringify(value))
      }
    })()
  }

  if (!dbs.has(dbname)) {
    // dbs.set(dbname,
    //   new KcpLink<T>(
    //     (com) => {
    //       console.log(`server[${dbname}] > sendKCP > "${com}"`)
    //       if (!com.startsWith('.')) {
    //         uncompacted.add(dbname)
    //         fs.appendFileSync(dbfile, `\n${com}`)
    //       }
    //       subs.get(dbname)?.forEach(send => send(com))
    //     },
    //     JSON.parse(json),
    //     (com) => {
    //       console.log(`server[${dbname}] > receiveKCP > "${com}"`)
    //       if (!com.startsWith('.')) {
    //         uncompacted.add(dbname)
    //         fs.appendFileSync(dbfile, `\n${com}`)
    //       }
    //     },
    //     dbname
    //   )
    // )
    // dbs.set(dbname, db)
  }

  return toKcpProxy('', getter, setter)
}

// export function unloadDB(dbname: string, kcpSender: (command: string) => void) {
//   const subbed = subs.get(dbname)
//   if (subbed && subbed.size > 1) {
//     subbed.delete(kcpSender)
//     console.log(`Socket closed, DB ${dbname} still subscribed`)
//   }
//   else {
//     if (uncompacted.has(dbname)) {
//       if (dbACT.get(dbname) === 'whenUnloaded' || dbACT.get(dbname) === 'whenLoadedOrUnloaded') {
//         saveDB(dbname)
//         console.log(`Socket closed, DB ${dbname} compacted`)
//       }
//     }
//     else {
//       console.log(`Socket closed, DB ${dbname} was already compacted`)
//     }
//     subs.delete(dbname)
//     dbs.delete(dbname)
//     dbACT.delete(dbname)
//   }
// }

// // can be used to manually compacten the DB, otherwise done automatically according to the set AutoCompactionType
// export function saveDB(dbname: string) {
//   if (uncompacted.has(dbname)) {
//     //TODO will require metadata
//     fs.writeFileSync(`${dbname}.kisdb.json`, JSON.stringify(dbs.get(dbname)))
//     uncompacted.delete(dbname)
//   }
// }

// export const routesHandler: Record<string, (req: Bun.BunRequest, server: Bun.Server) => void> = {
//   '/kisdb.js'(req, server) {
//     return new Response(Bun.file(import.meta.dir + '/browser.js'))
//   },
//   '/kisdb.js/:dbname'(req, server) {
//     return new Response(
//       fs.readFileSync(import.meta.dir + '/browser.js').toString().replace('var __forceLoader = element();\n__forceLoader = KcpWebSocketClient();', `
// var DB;
// var KCL = new KcpWebSocketClient('/kisdb/${encodeURIComponent((req.params as any).dbname)}');
// KCL.obs.on(root => {DB = root})
//       `), { headers: { "Content-Type": 'text/javascript' } })
//   },
//   '/kisdb'(req, server) {
//     server.upgrade(req)
//   },
//   '/kisdb/:dbname'(req, server) {
//     server.upgrade(req, { data: req.params })
//   }
// }

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

if (import.meta.main) {
  console.log('Started!')
  const dbRef = () => { }
  const db = loadDB('default', dbRef)

  // db.hi = { a: 1, b: 2, c: 3 }
  db.hey = 'Hello, World!'
  // db.ho = [4, 5, 6]
  db.hey.hop = 5
  console.log(db.hi())
  db.hi.a = db.hi.a() + 1
  console.log(db.hey())
  console.log(db.hey.hop())
  console.log(db['hey.hop']())
  console.log(db())
  // db.set('hi', { a: 1, b: 2, c: 3 })
  // db.set('hey', 'Hello!')
  // db.set('ho', [4, 5, 6])
  // console.log(db.get('hi'))
  // console.log(db.get('hey'))
  // console.log(db.get('ho'))

  console.log(proxyRefs)
}