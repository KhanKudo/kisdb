import { Database } from 'bun:sqlite'
import { type DataType, isBadKey, type KCPHandle } from '../kcp'

const dbs = new Map<string, Database>()
const subs = new Map<string, Set<KCPHandle>>()

export const enum Specials {
  OBJECT = 'OBJ',
  ARRAY = 'ARR',
  UNDEFINED = 'UDF',
}

const Containers = [
  Specials.OBJECT,
  Specials.ARRAY,
]

export function createSQLiteHandle<T = any>(dbname: string = 'default'): KCPHandle {
  const db = dbs.get(dbname) ?? new Database(`${dbname}.db`, { create: true, readwrite: true, strict: true })
  db.run(`CREATE TABLE IF NOT EXISTS _kvstore (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
    );`)

  const updateExactKey = db.query<void, [string, string | Specials]>('INSERT INTO _kvstore (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
  const updateExactKeyIfNotContainer = db.query<void, [string, Specials]>(`INSERT INTO _kvstore (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE _kvstore.value NOT IN ('${Containers.join('\',\'')}')`)
  const deleteExactKey = db.query<void, string>('DELETE FROM _kvstore WHERE key = ?')
  const exactKey = db.query<{ value: string | Specials }, string>('SELECT value FROM _kvstore WHERE key = ?')
  const likeKey = db.query<{ key: string, value: string | Specials }, string>('SELECT * FROM _kvstore WHERE key LIKE ?')
  const deleteLikeKey = db.query<void, string>('DELETE FROM _kvstore WHERE key LIKE ?')

  function getObj(key: string, asArray: true): DataType[] | void
  function getObj(key: string, asArray?: false): Record<string, DataType> | void
  function getObj(key: string, asArray: boolean = false): DataType[] | Record<string, DataType> | void {
    const mkObj = () => asArray ? [] : {}
    const obj: any = mkObj()

    const rows = likeKey.all(`${key}.%`)
    for (const row of rows) {
      row.key = row.key.slice(key.length + 1)
    }

    if (!rows.length)
      return

    let tmp = obj
    for (const { key: k, value } of rows) {
      tmp = obj
      const parts = k.split('.')
      if (parts.length > 1) {
        for (let i = 0; i < parts.length - 1; i++) {
          tmp[parts[i] as string] ??= mkObj()
          tmp = tmp[parts[i] as string]
        }
      }

      const lk: string = parts.at(-1)!

      switch (value) {
        case Specials.OBJECT:
          tmp[lk] ??= {}
          break
        case Specials.ARRAY:
          if (!(lk in tmp)) {
            tmp[lk] = []
          }
          else {
            const arr: any[] = []
            for (const i in tmp[lk]) {
              arr[parseInt(i)] = tmp[lk][i]
            }
            tmp[lk] = arr
          }
          break
        default:
          tmp[lk] = JSON.parse(value)
          break
      }
    }

    return obj
  }

  function setObj(key: string, obj: Record<string, DataType>): void {
    for (const k in obj) {
      if (typeof obj[k] === 'object' && obj[k] !== null) {
        setObj(key + '.' + k, obj[k] as any)
      }
      else {
        updateExactKey.run(key + '.' + k, JSON.stringify(obj[k]))
      }
    }
  }

  function getter(key: string): DataType | void {
    if (isBadKey(key))
      throw new Error(`Invalid getter key: "${key}"`)

    const res = exactKey.get(key)
    if (res === null)
      return

    switch (res.value) {
      case Specials.OBJECT:
        return getObj(key)
      case Specials.ARRAY:
        return getObj(key, true)
      default:
        return JSON.parse(res.value)
    }
  }

  function setter(key: string, value?: DataType): void {
    if (isBadKey(key))
      throw new Error(`Invalid setter key: "${key}"`)

    db.transaction(() => {
      key.split('.').reduce((p, k) => {
        updateExactKeyIfNotContainer.run(p, Specials.OBJECT)
        return p + '.' + k
      })
      deleteLikeKey.run(key + '.%')
      if (typeof value === 'object' && value !== null) {
        if (Array.isArray(value))
          updateExactKey.run(key, Specials.ARRAY)
        else
          updateExactKey.run(key, Specials.OBJECT)

        setObj(key, value as any)
      }
      else if (value === undefined) {
        deleteExactKey.run(key)
      }
      else {
        updateExactKey.run(key, JSON.stringify(value))
      }
    })()
  }

  if (!dbs.has(dbname))
    dbs.set(dbname, db)

  const handle = { path: '', getter, setter }

  if (!subs.has(dbname))
    subs.set(dbname, new Set())
  subs.get(dbname)!.add(handle)
  return handle
}

export function destroyKCPHandle(handle: KCPHandle) {
  const subbed = subs.values().find(ref => ref.has(handle))
  if (!subbed)
    throw new Error('Handle already destroyed!')

  const dbname = subs.entries().find(([k, v]) => v === subbed)![0]

  if (subbed.size > 1) {
    subbed.delete(handle)
    console.log(`Called unloadDB ${dbname}, removed provided handle but DB is still subscribed`)
  }
  else {
    subs.delete(dbname)
    dbs.get(dbname)?.close()
    dbs.delete(dbname)
    console.log(`DB ${dbname} unloaded`)
  }
}

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