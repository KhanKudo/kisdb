import fs from 'fs'
import { KcpLink, Operators } from './kcp'

const dbs = new Map<string, KcpLink>()
const subs = new Map<string, Set<(command: string) => void>>()
const uncompacted = new Set<string>()
const dbACT = new Map<string, AutoCompactionType>()

export type AutoCompactionType = 'manual' | 'whenUnloaded' | 'whenLoaded' | 'whenLoadedOrUnloaded'

// The autoCompactionType is only respected upon first load of DB, to change it unload all instances and load the DB again
export function loadDB<T = any>(dbname: string, kcpSender: (command: string) => void, autoCompactionType: AutoCompactionType = 'whenUnloaded'): KcpLink<T> {
  if (!subs.has(dbname))
    subs.set(dbname, new Set())
  subs.get(dbname)!.add(kcpSender)

  if (!dbs.has(dbname)) {
    const dbfile = `${dbname}.kisdb.json`
    if (!fs.existsSync(dbfile))
      fs.writeFileSync(dbfile, '{}')
    const file = fs.readFileSync(dbfile, { 'encoding': 'utf-8' })
    const indexNL = file.indexOf('\n')
    let commands: string[] | null = null
    let json: string
    if (indexNL !== -1) {
      json = file.slice(0, indexNL)
      commands = file.slice(indexNL + 1).split('\n')
    }
    else
      json = file

    dbs.set(dbname,
      new KcpLink<T>(
        (com) => {
          if (!com.startsWith('.')) {
            uncompacted.add(dbname)
            fs.appendFileSync(dbfile, `\n${com}`)
          }
          subs.get(dbname)?.forEach(send => send(com))
        },
        JSON.parse(json),
        (com) => {
          if (!com.startsWith('.')) {
            uncompacted.add(dbname)
            fs.appendFileSync(dbfile, `\n${com}`)
          }
        },
        dbname
      )
    )
    if (commands) {
      console.log(`loading appended kcp commands[${commands.length}] from DB "${dbname}"...`)
      const link = dbs.get(dbname)!
      for (const com of commands)
        link.receiveKCP('.' + com)

      console.log(`all ${commands.length} commands from DB "${dbname}" were loaded!`)

      uncompacted.add(dbname)
    }

    dbACT.set(dbname, autoCompactionType)
    if (autoCompactionType === 'whenLoaded' || autoCompactionType === 'whenLoadedOrUnloaded') {
      if (commands)
        saveDB(dbname)
    }
  }

  return dbs.get(dbname)!
}

export function unloadDB(dbname: string, kcpSender: (command: string) => void) {
  const subbed = subs.get(dbname)
  if (subbed && subbed.size > 1) {
    subbed.delete(kcpSender)
    console.log(`Socket closed, DB ${dbname} still subscribed`)
  }
  else {
    if (uncompacted.has(dbname)) {
      if (dbACT.get(dbname) === 'whenUnloaded' || dbACT.get(dbname) === 'whenLoadedOrUnloaded') {
        saveDB(dbname)
        console.log(`Socket closed, DB ${dbname} compacted`)
      }
    }
    else {
      console.log(`Socket closed, DB ${dbname} was already compacted`)
    }
    subs.delete(dbname)
    dbs.delete(dbname)
    dbACT.delete(dbname)
  }
}

// can be used to manually compacten the DB, otherwise done automatically according to the set AutoCompactionType
export function saveDB(dbname: string) {
  if (uncompacted.has(dbname)) {
    //TODO will require metadata
    fs.writeFileSync(`${dbname}.kisdb.json`, JSON.stringify(dbs.get(dbname)))
    uncompacted.delete(dbname)
  }
}

export const routesHandler: Record<string, (req: Bun.BunRequest, server: Bun.Server) => void> = {
  '/kisdb'(req, server) {
    server.upgrade(req)
  },
  '/kisdb/:dbname'(req, server) {
    server.upgrade(req, { data: req.params })
  }
}

export const webSocketHandler: Bun.WebSocketHandler<KcpLink> = {
  open(ws: Bun.ServerWebSocket<KcpLink | undefined>): void {
    let dbname = 'default'
    if (ws.data !== null && typeof ws.data === 'object' && 'dbname' in ws.data && typeof ws.data.dbname === 'string') {
      dbname = ws.data.dbname
    }

    ws.send = ws.send.bind(ws)

    ws.data = loadDB(dbname, ws.send) //TODO: potential problem if .bind(ws) is not used, but if used, must account for unloadDB parameter

    ws.send(',' + Operators.OVERWRITE + ',' + JSON.stringify(ws.data))
    //TODO: just temporary, doesn't work for defined FNZs deeper than root
    const dfs = ws.data.root.__definedFnz
    console.log('dfs:', dfs)
    if (dfs.length)
      ws.send('.,' + Operators.FUNCTIONIZE + ',' + dfs.length + ',' + dfs.join(','))

    console.log(`Socket opened with DB ${dbname}`)
  },
  message(ws: Bun.ServerWebSocket<KcpLink>, message: string | Buffer): void | Promise<void> {
    if (typeof message !== 'string')
      return console.warn('Received a Buffer message which is not supported!')

    subs.get(ws.data.dbname)?.forEach(sub => {
      if (sub === ws.send)
        return
      sub(message)
    })
    ws.data.receiveKCP(message)
  },
  close(ws: Bun.ServerWebSocket<KcpLink>, code: number, reason: string): void | Promise<void> {
    unloadDB(ws.data.dbname, ws.send)
  }
}