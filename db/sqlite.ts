import { Database } from 'bun:sqlite'
import { type DataType, isBadKey, type KCPHandle, BiMap, type SubType, type CallerType, type ResultType } from '../kcp'

const dbs = new Map<string, Database>()
const subs = new Map<string, Set<KCPHandle>>()

export const enum Specials {
  OBJECT = 'OBJ',
  ARRAY = 'ARR',
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
  const likeKeyOnly = db.query<{ key: string, value: string | Specials }, string>('SELECT key FROM _kvstore WHERE key LIKE ?')
  const deleteLikeKey = db.query<void, string>('DELETE FROM _kvstore WHERE key LIKE ?')

  const kpidefs: Map<string, CallerType> = new Map()

  function getObj(key: string, asArray: true): DataType[] | undefined
  function getObj(key: string, asArray?: false): Record<string, DataType> | undefined
  function getObj(key: string, asArray: boolean = false): DataType[] | Record<string, DataType> | undefined {
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

  function setVal(key: string, value?: Exclude<DataType, object> | CallerType): ResultType {
    if (value === undefined) {
      deleteExactKey.run(key)
      callSubbers(key)
      kpidefs.delete(key)
    }
    else if (typeof value === 'function') {
      deleteExactKey.run(key)
      callSubbers(key)
      kpidefs.set(key, value)
    }
    else if (kpidefs.has(key)) {
      return kpidefs.get(key)!(value)
    }
    else {
      updateExactKey.run(key, JSON.stringify(value))
      callSubbers(key, value)
    }
  }

  function setObj(key: string, obj: Record<string, DataType>): ResultType {
    if (kpidefs.has(key)) {
      return kpidefs.get(key)!(obj)
    }

    for (const k in obj) {
      if (typeof obj[k] === 'object' && obj[k] !== null) {
        setObj(key + '.' + k, obj[k] as any)
      }
      else {
        setVal(key + '.' + k, obj[k])
      }
    }
  }

  function getter(key: string): ResultType {
    if (isBadKey(key))
      throw new Error(`Invalid getter key: "${key}"`)

    if (kpidefs.has(key)) {
      return kpidefs.get(key)!()
    }

    const res = exactKey.get(key)
    if (res === null)
      return undefined

    switch (res.value) {
      case Specials.OBJECT:
        return getObj(key)
      case Specials.ARRAY:
        return getObj(key, true)
      default:
        return JSON.parse(res.value)
    }
  }

  function setter(key: string, value?: DataType): ResultType {
    if (isBadKey(key))
      throw new Error(`Invalid setter key: "${key}"`)

    if (kpidefs.has(key)) {
      return kpidefs.get(key)!(value)
    }

    db.transaction(() => {
      key.split('.').reduce((p, k) => {
        updateExactKeyIfNotContainer.run(p, Specials.OBJECT)
        callSubbersConditional(p, () => {
          const value = exactKey.get(p)?.value
          if (value === Specials.ARRAY)
            return getObj(p, true)
          else if (value === Specials.OBJECT)
            return getObj(p)
          else
            return value
        })
        return p + '.' + k
      })

      const relatedSubbers = new Set(subbers.keys().filter(k => !k.startsWith(key + '.')))
      if (subbers.hasKey(key))
        relatedSubbers.add(key)

      let relatedKeys: null | Set<string> = null
      if (relatedSubbers.size > 0) {
        relatedKeys = new Set(likeKeyOnly.all(`${key}.%`).filter(({ key }) => relatedSubbers.has(key)).map(({ key }) => key))
      }

      deleteLikeKey.run(key + '.%')
      if (typeof value === 'object' && value !== null) {
        if (Array.isArray(value))
          updateExactKey.run(key, Specials.ARRAY)
        else
          updateExactKey.run(key, Specials.OBJECT)

        setObj(key, value as any)
        callSubbers(key, value)
      }
      else {
        setVal(key, value)
      }

      if (relatedKeys) {
        for (const { key: deletedKey } of likeKeyOnly.all(`${key}.%`).filter(({ key }) => !relatedKeys.has(key))) {
          callSubbers(deletedKey)
        }
      }
    })()
  }

  function callSubbers(key: string, value?: DataType): void {
    const list = subbers.getValues(key)
    if (!list)
      return

    setImmediate(() => {
      for (const sub of list)
        sub(key, value)
    })
  }

  function callSubbersConditional(key: string, valueGetter: () => DataType | undefined): void {
    const list = subbers.getValues(key)
    if (!list)
      return

    setImmediate(() => {
      const value = valueGetter()
      for (const sub of list)
        sub(key, value)
    })
  }

  const subbers: BiMap<string, KCPHandle['setter']> = new BiMap()

  async function subber(key: string | null, listener: KCPHandle['setter'], type: SubType) {
    if (key === null) {
      if (type !== 'never')
        throw new Error('Invalid usage, type must be never when key is null')

      subbers.deleteValue(listener)
      return
    }

    if (isBadKey(key))
      throw new Error(`Invalid subber key: "${key}"`)

    switch (type) {
      //@ts-ignore
      case 'now+next':
        listener(key, (await getter(key))!)
      case 'next': {
        const once: KCPHandle['setter'] = (k, v) => {
          // subber(k, once, 'never')
          subbers.delete(k, once)
          listener(k, v)
        }
        subbers.add(key, once)
        break
      }
      //@ts-ignore
      case 'now+future':
        listener(key, (await getter(key))!)
      case 'future':
        subbers.add(key, listener)
        break
      case 'never':
        subbers.delete(key, listener)
        break
      default:
        throw new Error(`Unknown subscription type! (${type})`)
    }
  }

  if (!dbs.has(dbname))
    dbs.set(dbname, db)

  const handle = { path: '', getter, setter, subber }

  if (!subs.has(dbname))
    subs.set(dbname, new Set())
  subs.get(dbname)!.add(handle)
  return handle
}

export function destroyKCPHandle(handle: KCPHandle) {
  const entry = subs.entries().find(([k, ref]) => ref.has(handle))
  if (!entry)
    throw new Error('Handle already destroyed!')

  const [dbname, subbed] = entry

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