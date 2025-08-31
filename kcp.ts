export const enum Operators {
  OVERWRITE,
  SET,
  DELETE,
  PUSH,
  POP,
  SHIFT,
  UNSHIFT,
  INSERT,
  REMOVE
}

function toKcpProxy(sendKCP: KcpLink['sendKCP'], data: Record<any, any> = {}, loc = '', parent: null | { __loc: string } = null) {
  const receivedKCP = (command: string) => {
    const i1 = command.indexOf(',')
    const i2 = command.indexOf(',', i1 + 1)
    const op = parseInt(i1 === -1 ? command : command.slice(0, i1))
    const getKey = () => command.slice(i1 + 1, i2)

    //@ts-ignore
    console.log(`receivedKCP > com:"${command}" i1:${i1}, i2:${i2}, op:${Operators[op]}`)

    switch (op) {
      case Operators.OVERWRITE:
        Object.assign(data, JSON.parse(command.slice(i1 + 1)))
        break
      case Operators.SET:
        Reflect.set(data, getKey(), JSON.parse(command.slice(i2 + 1)))
        break
      case Operators.DELETE:
        Reflect.deleteProperty(data, getKey())
        break
    }
  }

  return new Proxy(data, {
    get(_, key) {
      if (key === '__loc') {
        //TODO: optimize by only fetching parent loc, if it's an array, otherwise hard-set loc
        if (parent)
          return parent.__loc + '.' + loc
        else
          return loc
      }
      else if (key === '__receiveKCP') {
        return receivedKCP
      }
      else {
        return Reflect.get(data, key)
      }
    },
    set(_, key, value): boolean {
      if (key === '__kcp') {
        receivedKCP(value)
      }
      else if (key === '__loc' || key === '__receiveKCP') {
        return false
      }
      else {
        if (value !== undefined) {
          Reflect.set(data, key, value)
          sendKCP(loc, Operators.SET, key, JSON.stringify(value))
        }
        else {
          Reflect.deleteProperty(data, key)
          sendKCP(loc, Operators.DELETE, key)
        }
      }
      return true
    },
    deleteProperty(_, key): boolean {
      if (key in data) {
        Reflect.deleteProperty(data, key)
        sendKCP(loc, Operators.DELETE, key)
        return true
      }
      else {
        return false
      }
    }
  })
}

export class KcpLink {
  readonly obs: Observable<any>

  get root() {
    return this.obs.value
  }

  set root(value: any) {
    //TODO: implement sync
    // this.obs.set(value)
  }

  receiveKCP(command: string) {
    const eiLoc = command.indexOf(',')
    const loc = command.slice(0, eiLoc).split('.').slice(1)
    let temp = this.root
    for (const part of loc)
      temp = temp[part]

    temp.__kcp = command.slice(eiLoc + 1)

    //TODO: fix somehow obs to emit only once loaded from remote!
    if (command.startsWith(',' + Operators.OVERWRITE + ','))
      this.obs.trigger()
  }

  sendKCP(...commandParts: (string | { toString(): string })[]) {
    return this.sender(commandParts.join(','))
  }

  constructor(private sender: (command: string) => void, init?: any) {
    this.obs = new Observable(toKcpProxy(this.sendKCP.bind(this), init), false, init !== undefined)
  }

  toJSON(): any {
    this.root
  }

  toString(): string {
    return JSON.stringify(this.root)
  }
}

export class KcpWebSocketClient extends KcpLink {
  private ws: WebSocket

  constructor(webSocketPath: string = '/kisdb') {
    super((com) => this.ws.send(com))
    this.ws = new WebSocket(webSocketPath)
    this.ws.onmessage = ({ data: msg }) => { super.receiveKCP(msg) }

    // this.ws.onmessage = ({ data: msg }) => {
    //   this.dyns.set('', new KcpList(this.sendKCP.bind(this, ''), msg))
    //   this.ws.onmessage = ({ data: msg }) => { super.receiveKCP(msg) }
    //   loaded?.(this.dyns.get('')!)
    // }
  }

  close() {
    return this.ws.close()
  }
}

import { List, Observable } from 'dynamics'

export class KcpList<T = unknown> extends List<T> {
  constructor(private sendKCP: (...commandParts: (string | { toString(): string })[]) => void, json?: string) {
    super(json)
  }

  receiveKCP(command: string): void {
    const i1 = command.indexOf(',')
    const i2 = command.indexOf(',', i1 + 1)
    const op = parseInt(i1 === -1 ? command : command.slice(0, i1))

    //@ts-ignore
    console.log(`receiveKCP > com:"${command}" i1:${i1}, i2:${i2}, op:${Operators[op]}`)

    switch (op) {
      case Operators.SET:
        super.set(parseInt(command.slice(i1 + 1, i2)), JSON.parse(command.slice(i2 + 1)))
        break
      case Operators.PUSH:
        super.push(JSON.parse(command.slice(i1 + 1)))
        break
      case Operators.POP:
        super.pop()
        break
      case Operators.UNSHIFT:
        super.unshift(JSON.parse(command.slice(i1 + 1)))
        break
      case Operators.SHIFT:
        super.shift()
        break
      case Operators.INSERT:
        super.insert(parseInt(command.slice(i1 + 1, i2)), JSON.parse(command.slice(i2 + 1)))
        break
      case Operators.REMOVE:
        super.remove(parseInt(command.slice(i1 + 1)))
        break
    }
  }

  override push(...values: T[]): void {
    super.push(...values)
    for (const value of values)
      this.sendKCP(Operators.PUSH, JSON.stringify(value))
  }

  override unshift(...values: T[]): void {
    super.unshift(...values)
    for (const value of values)
      this.sendKCP(Operators.UNSHIFT, JSON.stringify(value))
  }

  override pop(): T | undefined {
    const temp = super.pop()

    if (temp !== undefined)
      this.sendKCP(Operators.POP)

    return temp
  }

  override shift(): T | undefined {
    const temp = super.shift()

    if (temp !== undefined)
      this.sendKCP(Operators.SHIFT)

    return temp
  }

  override insert(index: number, value: T): void {
    super.insert(index, value)
    this.sendKCP(Operators.INSERT, index, JSON.stringify(value))
  }

  override set(index: number, value: T): void {
    super.set(index, value)
    this.sendKCP(Operators.SET, index, JSON.stringify(value))
  }

  override replace(oldValue: T, newValue: T): void {
    super.replace.call(this, oldValue, newValue)
  }

  override remove(index: number): T | undefined {
    const temp = super.remove(index)

    if (temp !== undefined)
      this.sendKCP(Operators.REMOVE, index)

    return temp
  }

  override delete(value: T): T | undefined {
    return super.delete.call(this, value)
  }

  override clear(): void {
    super.clear.call(this)
  }
}