import fs from 'fs'
import { KcpLink, Operators } from './kcp'

const dbs = new Map<string, KcpLink>()
const subs = new Map<string, Set<(command: string) => void>>()
const unsaved = new Set<string>()

function revertDB(db: string) {
  if (!dbs.has(db))
    return loadDB(db)

  const file = JSON.parse(fs.readFileSync(`${db}.kisdb.json`, { 'encoding': 'utf-8' }))

  const memory = dbs.get(db)!

  throw new Error('Reverting is not yet supported!')
  // memory.clear()
  // memory.push(...file)

  return memory

  // for (const key of Object.keys(memory)) {
  //   delete memory[key]
  // }

  // return Object.assign(memory, file)
}

function loadDB(db: string) {
  if (!dbs.has(db)) {
    const file = fs.readFileSync(`${db}.kisdb.json`, { 'encoding': 'utf-8' })
    const indexNL = file.indexOf('\n')
    let commands: string[] | null = null
    debugger
    let json: string
    if (indexNL !== -1) {
      json = file.slice(0, indexNL)
      commands = file.slice(indexNL + 1).split('\n')
    }
    else
      json = file

    dbs.set(db,
      new KcpLink(
        (...parts) => {
          const com = parts.join(',')
          subs.get(db)?.forEach(send => send(com))
        },
        JSON.parse(json)
      )
    )
    if (commands) {
      console.log(`loading appended kcp commands[${commands.length}] from DB "${db}"...`)
      const link = dbs.get(db)!
      for (const com of commands)
        link.receiveKCP(com)

      console.log(`all ${commands.length} commands from DB "${db}" were loaded!`)

      unsaved.add(db)
    }
  }

  return dbs.get(db)!
}

function saveDB(db: string) {
  //TODO will require metadata
  fs.writeFileSync(`${db}.kisdb.json`, JSON.stringify(dbs.get(db)))
  unsaved.delete(db)
}

const defaultFile = 'default.kisdb.json'
if (!fs.existsSync(defaultFile)) {
  fs.writeFileSync(defaultFile, '{}')
}

type WSData = {
  dbname: string,
  read: KcpLink,
  receive: (command: string) => void,
  send: (command: string) => void,
}

export const routesHandler: Record<string, (req: Bun.BunRequest, server: Bun.Server) => void> = {
  '/kisdb'(req, server) {
    server.upgrade(req)
  },
  '/kisdb/:dbname'(req, server) {
    server.upgrade(req, { data: req.params })
  }
}

export const webSocketHandler: Bun.WebSocketHandler<WSData> = {
  open(ws: Bun.ServerWebSocket<WSData>): void {
    let dbname = 'default'
    if (ws.data !== null && typeof ws.data === 'object' && 'db' in ws.data && typeof ws.data.db === 'string') {
      dbname = ws.data.db
    }

    const dbfile = `${dbname}.kisdb.json`

    function write(func: (db: KcpLink) => any) {
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
      receive(command: string) {
        data.receiveKCP(command)
        unsaved.add(dbname)
        fs.appendFileSync(dbfile, `\n${command}`)
      },
      send(command: string) {
        ws.send(',' + command)
        unsaved.add(dbname)
        fs.appendFileSync(dbfile, `\n${',' + command}`)
      }
    }

    if (!subs.has(dbname))
      subs.set(dbname, new Set())

    subs.get(dbname)!.add(ws.data.send)

    ws.send(',' + Operators.OVERWRITE + ',' + JSON.stringify(data))
    console.log(`Socket opened with DB ${dbname}`)
  },
  message(ws: Bun.ServerWebSocket<WSData>, message: string | Buffer): void | Promise<void> {
    if (typeof message !== 'string')
      return console.warn('Received a Buffer message which is not supported!')

    ws.data.receive(message)
  },
  close(ws: Bun.ServerWebSocket<WSData>, code: number, reason: string): void | Promise<void> {
    const subbed = subs.get(ws.data.dbname)
    if (subbed && subbed.size > 1) {
      subbed.delete(ws.data.send)
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