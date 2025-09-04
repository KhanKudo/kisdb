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

function popPath(loc: string): [string, string] {
  if (!loc.includes('.'))
    return ['', loc]

  const index = loc.lastIndexOf('.')

  return [
    loc.slice(0, index),
    loc.slice(index + 1)
  ]
}

function toKcpProxy(sendKCP: KcpLink['sendKCP'], data: Record<any, any> = {}, upperLoc = '', parent: null | { __loc: string } = null) {
  //TODO: expand with 'empty-proxies' so that data can easily be added, even when it's nested and doesn't exist yet
  function navigateData(source: Record<any, any>, location: string) {
    let temp = source
    const parts = location.split('.')
    let index = -1
    for (const part of parts) {
      index++
      if (typeof temp === 'object' && temp !== null) {
        temp = Reflect.get(temp, part)

        //TODO: add array support (List/Set/...)
        // if (/^[0-9]+$/.test(part)) {
        //   if (Array.isArray(temp)) {
        //     if (Reflect.has(temp, part))
        //       temp = Reflect.get(temp, part)
        //     else
        //       Reflect.set(temp, part, toKcpProxy(sendKCP, /^[0-9]+$/.test(parts[index + 1] ?? '') ? [] : {}))
        //   }
        //   else {
        //     return undefined
        //   }
        // }
      }
      else
        return undefined
    }

    return temp
  }

  const getLoc = () => parent ? (parent.__loc + '.' + upperLoc) : upperLoc

  function receivedKCP(command: string) {
    const i1 = command.indexOf(',')
    const i2 = command.indexOf(',', i1 + 1)
    const op = parseInt(i1 === -1 ? command : command.slice(0, i1))
    const getKey = () => command.slice(i1 + 1, i2 === -1 ? undefined : i2)

    //@ts-ignore
    console.log(`receivedKCP > com:"${command}" i1:${i1}, i2:${i2}, op:${Operators[op]}`)

    switch (op) {
      case Operators.OVERWRITE:
        //TODO: doesn't account for object-to-array overwrites and reverse
        const value = JSON.parse(command.slice(i1 + 1))
        for (const k in data)
          if (!(k in value))
            Reflect.deleteProperty(data, k)

        for (const k in value)
          setProp(k, value[k])
        break
      case Operators.SET:
        setProp(getKey(), JSON.parse(command.slice(i2 + 1)))
        break
      case Operators.DELETE:
        Reflect.deleteProperty(data, getKey())
        break
    }
  }

  const proxy = <Record<any, any> & { __loc: string, __receiveKCP: (command: string) => void, __kcp: string, toString: () => string }>new Proxy<Record<any, any>>(data, {
    get(_, key) {
      if (key === '__loc') {
        //TODO: optimize by only fetching parent loc, if it's an array, otherwise hard-set loc
        return getLoc()
      }
      // else if (key === '__raw') {
      //   return data
      // }
      else if (key === '__receiveKCP') {
        return receivedKCP
      }
      else if (key === 'toString') {
        return () => JSON.stringify(data)
      }
      else if (key === 'toJSON') {
        return () => data
      }
      else if (typeof key === 'string' && key.includes('.')) {
        return navigateData(data, key)
      }
      else if (typeof key === 'symbol') {
        return Reflect.get(data, key)
      }
      else {
        if (Reflect.has(data, key)) {
          return Reflect.get(data, key)
        }
        else {
          // Reflect.set(temp, part, toKcpProxy(sendKCP, /^[0-9]+$/.test(parts[index + 1] ?? '') ? [] : {}, part, temp as any))
          Reflect.set(data, key, toKcpProxy(sendKCP, {}, key, proxy))
          return data[key]
        }
      }
    },
    set(_, key, value): boolean {
      if (key === '__kcp') {
        receivedKCP(value)
      }
      else if (key === '__loc' || key === '__receiveKCP' || key === 'toString' || key === 'toJSON') {// || key === '__raw') {
        return false
      }
      else if (typeof key === 'symbol') {
        Reflect.set(data, key, value)
      }
      else if (key.includes('.')) {
        const [p1, k] = popPath(key)
        const targetProxy = navigateData(data, p1)
        if (targetProxy === null || typeof targetProxy !== 'object')
          return false

        Reflect.set(targetProxy, k, value) // forwards to local target proxy
      }
      else {
        if (value !== undefined) {
          setProp(key, value)
          sendKCP(getLoc(), Operators.SET, key, JSON.stringify(value))
        }
        else {
          Reflect.deleteProperty(data, key)
          sendKCP(getLoc(), Operators.DELETE, key)
        }
      }
      return true
    },
    deleteProperty(_, key): boolean {
      if (typeof key === 'symbol') {
        return Reflect.deleteProperty(data, key)
      }
      else if (key.includes('.')) {
        const [p1, k] = popPath(key)

        const proxy = navigateData(data, p1)
        if (proxy === null || typeof proxy !== 'object')
          return false

        return Reflect.deleteProperty(proxy, k)
      }
      else if (key in data) {
        Reflect.deleteProperty(data, key)
        sendKCP(getLoc(), Operators.DELETE, key)
        return true
      }
      else {
        return false
      }
    }
  })

  function setProp(key: string, value: any) {
    if (key.includes('.')) {
      const [p1, k] = popPath(key)
      const targetProxy = navigateData(data, p1)
      if (typeof targetProxy === 'object' && targetProxy !== null)
        return Reflect.set(targetProxy, k, value) // forwards to target's local proxy
      return false
    }
    else if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        console.warn('Arrays are not yet supported!', getLoc() + '.' + key, data)
        return false
      }
      else {
        data[key] = toKcpProxy(sendKCP, value, key, proxy)
        return true
      }
    }
    else if (data[key] !== value)
      data[key] = value
  }

  for (const k in data)
    setProp(k, data[k])

  return proxy
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