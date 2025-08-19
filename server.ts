import fs from 'fs'
import { getDefaultLibFileName } from 'typescript'

const dbs = new Map<string, Array<unknown>>()
const subs = new Map<string, number>()
const unsaved = new Set<string>()

function revertDB(db: string) {
  if (!dbs.has(db))
    return loadDB(db)

  const file = JSON.parse(fs.readFileSync(`${db}.kisdb.json`, { 'encoding': 'utf-8' }))

  const memory = dbs.get(db)!

  memory.length = 0
  memory.push(...file)

  return memory

  // for (const key of Object.keys(memory)) {
  //   delete memory[key]
  // }

  // return Object.assign(memory, file)
}

function loadDB(db: string) {
  if (!dbs.has(db))
    dbs.set(db, JSON.parse(fs.readFileSync(`${db}.kisdb.json`, { 'encoding': 'utf-8' })))

  return dbs.get(db)!
}

function saveDB(db: string) {
  //TODO will require metadata
  fs.writeFileSync(`${db}.kisdb.json`, JSON.stringify(dbs.get(db)))
  unsaved.delete(db)
}

const defaultFile = 'default.kisdb.json'
if (!fs.existsSync(defaultFile)) {
  fs.writeFileSync(defaultFile, '[]')
  // fs.writeFileSync(defaultFile, '{}')
}

type Operator =
  'push' |
  'pop' |
  'shift' |
  'unshift' |
  'insert' |
  'remove'

export default {
  open(ws: Bun.ServerWebSocket<unknown>): void {
    let dbname = 'default'
    if (ws.data !== null && typeof ws.data === 'object' && 'db' in ws.data && typeof ws.data.db === 'string') {
      dbname = ws.data.db
    }

    const dbfile = `${dbname}.kisdb.json`

    function write(func: (db: Array<unknown>) => any) {
      try {
        const res = func(data)
        saveDB(dbname)
        return res
      } catch (err) {
        revertDB(dbname)
        throw err
      }
    }

    const data = loadDB(dbname)
    ws.data = {
      dbname,
      read: data,
      // async write(func: (db: Array<unknown>) => any) {
      //   try {
      //     const res = await func(data)
      //     await saveDB(dbname)
      //     return res
      //   } catch (err) {
      //     await revertDB(dbname)
      //     throw err
      //   }
      // },
      append(command: string) {
        const com = JSON.parse(command)
        if (Array.isArray(com) && com.length === 2) {
          console.log(`Set value [${com[0]}]=${com[1]}`)
          const [index, value] = com
          data[index] = value
          // return write(db => db[com[0]] = com[1])
          //TODO ^^^ with a change-oriented protocol, a custom append-only json .db file format can easily be created for better performance
          // also use existing scripts such as 'Collection' and create some generic baseclass-set for handling bidirectional 'appendable' updates
          // KCP -> Kis(db) Command Protocol
        }
        else if (Array.isArray(com) && com.length === 3) {
          console.log(`Operation ${com[0]} on ${com[1]} with ${com[2]}`)
          const [op, loc, val] = com as [Operator, number, any]
          switch (op) {
            case 'push':
              data.push(val)
              break
            case 'pop':
              data.pop()
              break
            case 'shift':
              data.shift()
              break
            case 'unshift':
              data.unshift(val)
              break
            case 'insert':
              data.splice(loc, 0, val)
              break
            case 'remove':
              data.splice(loc, 1)
              break
          }
        }

        unsaved.add(dbname)
        fs.appendFileSync(dbfile, `\n${command}`)
      }
    }

    subs.set(dbname, (subs.get(dbname) ?? 0) + 1)

    ws.send(JSON.stringify(data))
    console.log(`Socket opened with DB ${dbname}`)
  },
  message(ws: Bun.ServerWebSocket<{ dbname: string, read: Array<unknown>, write: (func: (db: Array<unknown>) => any) => void, append: (command: string) => void }>, message: string | Buffer): void | Promise<void> {
    if (typeof message !== 'string')
      return console.warn('Received a Buffer message which is not supported!')

    ws.data.append(message)
  },
  close(ws: Bun.ServerWebSocket<{ dbname: string }>, code: number, reason: string): void | Promise<void> {
    const subbed = subs.get(ws.data.dbname) ?? 0
    if (subbed > 1) {
      subs.set(ws.data.dbname, subbed - 1)
      console.log(`Socket closed, DB ${ws.data.dbname} still subscribed`)
    }
    else {
      if (unsaved.has(ws.data.dbname)) {
        saveDB(ws.data.dbname)
        console.log(`Socket closed, DB ${ws.data.dbname} saved`)
      }
      else {
        console.log(`Socket closed, DB ${ws.data.dbname} had no unsaved changes`)
      }
      subs.delete(ws.data.dbname)
      dbs.delete(ws.data.dbname)
    }
  }
}