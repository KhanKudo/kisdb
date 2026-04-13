import { Database } from 'bun:sqlite'
import { type DataType, isBadKey, type ResultType, SubService, type KCPRawHandle, dbHandle } from '../kcp'

const dbs = new Map<string, Database>()
const dbSubs = new Map<string, Set<KCPRawHandle>>()

export const enum Specials {
  OBJECT = 'OBJ',
  ARRAY = 'ARR',
}

const Containers = [
  Specials.OBJECT,
  Specials.ARRAY,
]

export function createSQLiteHandle<T = any>(dbname: string = 'default'): Promise<KCPRawHandle> {
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

  function setVal(key: string, value?: Exclude<DataType, object>): void {
    if (isBadKey(key))
      throw new Error(`Invalid setter key: "${key}"`)

    if (value === undefined) {
      deleteExactKey.run(key)
      subbers.trigger(key)
    }
    else {
      updateExactKey.run(key, JSON.stringify(value))
      subbers.trigger(key, value)
    }
  }

  function setObj(key: string, obj: Record<string, DataType>, untouchedKeys?: Set<string>): void {
    if (Array.isArray(obj))
      updateExactKey.run(key, Specials.ARRAY)
    else
      updateExactKey.run(key, Specials.OBJECT)

    for (const k in obj) {
      if (typeof obj[k] === 'object' && obj[k] !== null) {
        setObj(key + '.' + k, obj[k] as any, untouchedKeys)
      }
      else {
        untouchedKeys?.delete(key + '.' + k)
        setVal(key + '.' + k, obj[k])
      }
    }
  }

  async function getter(key: string): ResultType {
    //TODO: remove since checked by dbHandle, but find a way to allow db to enforce additional restrictions though existing dbHandle checker
    if (isBadKey(key))
      throw new Error(`Invalid getter key: "${key}"`)

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

  async function setter(key: string, value?: DataType): ResultType {
    //TODO: remove since checked by dbHandle, but find a way to allow db to enforce additional restrictions though existing dbHandle checker
    if (isBadKey(key))
      throw new Error(`Invalid setter key: "${key}"`)

    db.transaction(() => {
      const childSubbed = subbers.getSubbed(key, false)

      let childKeys: undefined | Set<string>
      if (childSubbed.size > 0) {
        childKeys = new Set(likeKeyOnly.all(`${key}.%`).map(({ key }) => key)).intersection(childSubbed)
      }

      deleteLikeKey.run(key + '.%')
      if (typeof value === 'object' && value !== null) {
        setObj(key, value as any, childKeys)
        subbers.trigger(key, value)
      }
      else {
        setVal(key, value)
      }

      let k = key
      while (true) {
        k = k.slice(0, Math.max(0, k.lastIndexOf('.')))

        updateExactKeyIfNotContainer.run(k, Specials.OBJECT)
        subbers.triggerHeavy(k, async () => {
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

      if (childKeys?.size) {
        for (const deletedKey of childKeys) {
          subbers.trigger(deletedKey)
        }
      }
    })()
  }

  if (!dbs.has(dbname))
    dbs.set(dbname, db)

  const handle = dbHandle({ getter, setter, subber: subbers.getSubber() })

  if (!dbSubs.has(dbname))
    dbSubs.set(dbname, new Set())
  dbSubs.get(dbname)!.add(handle)
  return handle
}

export function destroyKCPHandle(handle: KCPRawHandle) {
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