import { Database } from 'bun:sqlite'
import { type DataType, isBadKey, type KCPHandle, BiMap, type SubType, type CallerType, type ResultType, type ListenerType, SubService } from '../kcp'

const dbs = new Map<string, Database>()
const dbSubs = new Map<string, Set<KCPHandle>>()

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
      subbers.trigger(key)
      kpidefs.delete(key)
    }
    else if (typeof value === 'function') {
      deleteExactKey.run(key)
      subbers.trigger(key)
      kpidefs.set(key, value)
    }
    else if (kpidefs.has(key)) {
      return kpidefs.get(key)!(value)
    }
    else {
      updateExactKey.run(key, JSON.stringify(value))
      subbers.trigger(key, value)
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

  const subbers = new SubService(getter)

  function setter(key: string, value?: DataType): ResultType {
    if (isBadKey(key))
      throw new Error(`Invalid setter key: "${key}"`)

    if (kpidefs.has(key)) {
      return kpidefs.get(key)!(value)
    }

    db.transaction(() => {
      const relatedSubbers = subbers.getSubbed(key, false)

      let relatedKeys: null | Set<string> = null
      if (relatedSubbers.size > 0) {
        relatedKeys = new Set(likeKeyOnly.all(`${key}.%`).map(({ key }) => key)).intersection(relatedSubbers)
      }

      deleteLikeKey.run(key + '.%')
      if (typeof value === 'object' && value !== null) {
        if (Array.isArray(value))
          updateExactKey.run(key, Specials.ARRAY)
        else
          updateExactKey.run(key, Specials.OBJECT)

        setObj(key, value as any)
        subbers.trigger(key, value)
      }
      else {
        setVal(key, value)
      }

      let k = key
      while (true) {
        k = k.slice(0, Math.max(0, k.lastIndexOf('.')))

        updateExactKeyIfNotContainer.run(k, Specials.OBJECT)
        subbers.triggerHeavy(k, () => {
          const value = exactKey.get(k)?.value
          if (value === Specials.ARRAY)
            return getObj(k, true)
          else if (value === Specials.OBJECT)
            return getObj(k)
          else
            return value
        })

        if (!k)
          break
      }

      if (relatedKeys) {
        for (const deletedKey of relatedKeys.difference(new Set(likeKeyOnly.all(`${key}.%`).map(({ key }) => key)))) {
          subbers.trigger(deletedKey)
        }
      }
    })()
  }

  if (!dbs.has(dbname))
    dbs.set(dbname, db)

  const handle = { path: '', getter, setter, subber: subbers.getSubber() }

  if (!dbSubs.has(dbname))
    dbSubs.set(dbname, new Set())
  dbSubs.get(dbname)!.add(handle)
  return handle
}

export function destroyKCPHandle(handle: KCPHandle) {
  const entry = dbSubs.entries().find(([k, ref]) => ref.has(handle))
  if (!entry)
    throw new Error('Handle already destroyed!')

  const [dbname, subbed] = entry

  if (subbed.size > 1) {
    subbed.delete(handle)
    console.log(`Called unloadDB ${dbname}, removed provided handle but DB is still subscribed`)
  }
  else {
    dbSubs.delete(dbname)
    dbs.get(dbname)?.close()
    dbs.delete(dbname)
    console.log(`DB ${dbname} unloaded`)
  }
}