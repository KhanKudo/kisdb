import { Observable } from "dynamics"

export const enum Operators {
  OVERWRITE,  // loc // value(json)
  SET,        // loc // key(index must be >=0), value(json)
  DELETE,     // loc // key(index must be >=0)
  PUSH,       // loc // index(>=0), values(json array)
  UNSHIFT,    // loc // index(>=0), values(json array)
  POP,        // loc //
  SHIFT,      // loc //
  SPLICE,     // loc // startIndex(can be negative), removeCount(>=0), insertValues(json array)
  REVERSE,    // loc //
  REORDER,    // loc // order(json number array, at each position is that item's new index)
  RESIZE,     // loc // length(>=0)
  FILL,       // loc // start(>=0), end(>=0), value(json)
  COPY_WITHIN,// loc // target(>=0), start(>=0), end(>=0)
  // INSERT,     // loc // index(>=0), values(json array)
  // REMOVE,     // loc // index(>=0), count(>=0)
  // REPLACE,    // loc // startIndex, values(json array)
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

function toKcpProxy(sendKCP: KcpLink['sendKCP'], data: Record<any, any> | any[] = {}, upperLoc: string | (() => string), parent: { __loc: string } | KcpLink) {
  function navigateProxy(location: string) {
    let temp: unknown = proxy
    const parts = location.split('.')
    for (const part of parts) {
      if (typeof temp === 'object' && temp !== null) {
        if (Array.isArray(temp) && !/^-?[0-9]+$/.test(part) && part !== 'length')
          return undefined

        temp = Reflect.get(temp, part)
      }
      else
        return undefined
    }

    return temp
  }

  function getLoc() {
    if (parent instanceof KcpLink)
      return upperLoc
    else
      return parent.__loc + '.' + (typeof upperLoc === 'function' ? upperLoc() : upperLoc)
  }

  function receivedKCP(command: string) {
    const i1 = command.indexOf(',')
    const i2 = command.indexOf(',', i1 + 1)
    const op = parseInt(i1 === -1 ? command : command.slice(0, i1))
    const getKey = () => command.slice(i1 + 1, i2 === -1 ? undefined : i2)

    switch (op) {
      case Operators.OVERWRITE:
        const value = JSON.parse(command.slice(i1 + 1))
        if (
          Array.isArray(data) === Array.isArray(value) &&
          typeof data === 'object' && data !== null &&
          typeof value === 'object' && value !== null
        ) {
          if (Array.isArray(data)) {
            data.splice(0, data.length, ...prepForArray(value))
          }
          else if (typeof value === 'object' && value !== null) {
            for (const k in data)
              if (!(k in value))
                Reflect.deleteProperty(data, k)

            for (const k in value)
              setProp(k, value[k])
          }

          //TODO: this trigger is a temporary solution until proper observability on all paths and objects is implemented. The obs below however is intentional!
          //      it should be removed then, since the base object isn't actually being replaced, only it's content. Unlike below
          if (parent instanceof KcpLink)
            parent.obs.trigger()
        }
        else if (parent instanceof KcpLink) {
          if (typeof value === 'object' && value !== null)
            parent.obs.set(toKcpProxy(sendKCP, value, upperLoc, parent), true)
          else
            parent.obs.set(value, true)
        }
        else {
          Reflect.set(
            Reflect.get(parent, '__DANGER_RAW_DATA'),
            typeof upperLoc === 'function' ? upperLoc() : upperLoc,
            (typeof value === 'object' && value !== null) ?
              toKcpProxy(sendKCP, value, upperLoc, parent) :
              value
          )
        }
        break
      case Operators.SET:
        setProp(getKey(), JSON.parse(command.slice(i2 + 1)))
        break
      case Operators.DELETE:
        Reflect.deleteProperty(data, getKey())
        break
      case Operators.PUSH:
        data.push(...prepForArray(JSON.parse(command.slice(i1 + 1))))
        break
      case Operators.UNSHIFT:
        data.unshift(...prepForArray(JSON.parse(command.slice(i1 + 1))))
        break
      case Operators.POP:
        data.pop()
        break
      case Operators.SHIFT:
        data.shift()
        break
      case Operators.SPLICE:
        data.splice(parseInt(command.slice(i1 + 1, i2)), parseInt(command.slice(i2 + 1)), ...JSON.parse(command.slice(command.indexOf(',', i2 + 1) + 1))) //TODO: add also support for proxies within arrays (!IMPORTANT!)
        break
      case Operators.REVERSE:
        data.reverse()
        break
      case Operators.REORDER: {
        const orig = Array.from(data as any[]);
        (JSON.parse(command.slice(i1 + 1)) as any[]).forEach((newIndex, oldIndex) => (data as any[])[newIndex] = orig[oldIndex])
        break
      }
      case Operators.RESIZE:
        data.length = parseInt(command.slice(i1 + 1))
        break
      case Operators.FILL: //TODO: somehow appropriately call prepForArray(...) and create a unique proxy for each one and a unique object reference behind it as well!
        data.fill(JSON.parse(command.slice(command.indexOf(',', i2 + 1) + 1)), parseInt(command.slice(i1 + 1, i2)), parseInt(command.slice(i2 + 1)))
        break
      case Operators.COPY_WITHIN: //TODO: somehow appropriately call prepForArray(...) and create a unique proxy for each one and a unique object reference behind it as well!
        data.copyWithin(parseInt(command.slice(i1 + 1, i2)), parseInt(command.slice(i2 + 1)), parseInt(command.slice(command.indexOf(',', i2 + 1) + 1)))
        break
    }
  }

  const listeners = new Map<string, (value: any) => void | null>()

  function handleListener(key: string, value: any) {
    if (!listeners.has(key))
      return

    const res = listeners.get(key)?.(value)
    if (res === null)
      listeners.delete(key)
  }

  const isArray = Array.isArray(data)

  const proxy = <(Record<any, any> | any[]) & { __loc: string, __receiveKCP: (command: string) => void, __kcp: string, toString: () => string }>new Proxy<Record<any, any> | any[]>(data, {
    get(_, key) {
      if (key === '__loc') {
        //TODO: optimize by only fetching parent loc, if it's an array, otherwise hard-set loc
        return getLoc()
      }
      else if (key === '__DANGER_RAW_DATA') {
        return data // !!! DANGER !!! STRICTLY FOR INTERNAL USE ONLY !!!
      }
      else if (key === '__receiveKCP') {
        return receivedKCP
      }
      else if (key === 'toString') {
        if (isArray)
          return () => data.toString()
        else
          return () => JSON.stringify(data, (key, value) => (typeof value === 'object' && value !== null && !Object.keys(value).length) ? undefined : value)
      }
      else if (key === 'toJSON') {
        if (isArray)
          return () => Array.from(data)
        else
          return () => Object.fromEntries(Object.entries(data).filter(([k, v]) => !(typeof v === 'object' && v !== null && !Object.keys(v).length)))
      }
      else if (typeof key === 'symbol') {
        return Reflect.get(data, key)
      }
      else if (key.includes('.')) {
        return navigateProxy(key)
      }
      else if (isArray) { //TODO: handle listeners, since op's such as "push" (yes push, if arr was popped and pushed into again) and "unshift" don't use setProp
        if (/^-?[0-9]+$/.test(key)) {
          const index = key.startsWith('-') ?
            data.length + parseInt(key) :
            parseInt(key)

          if (!Number.isSafeInteger(index))
            throw new Error('Provided index is too large: ' + index.toString())

          if (index < 0)
            return undefined
          else
            return data[index]
        }
        else if (key === 'push') {
          return (...items: any[]): number => {
            if (items.length === 0)
              return data.length

            const temp = data.push(...prepForArray(items))
            sendKCP(getLoc(), Operators.PUSH, JSON.stringify(items))
            return temp
          }
        }
        else if (key === 'unshift') {
          return (...items: any[]): number => {
            if (items.length === 0)
              return data.length

            const temp = data.unshift(...prepForArray(items))
            sendKCP(getLoc(), Operators.UNSHIFT, JSON.stringify(items))
            return temp
          }
        }
        else if (key === 'pop') {
          return (): any => {
            if (data.length === 0)
              return

            const temp = data.pop()
            sendKCP(getLoc(), Operators.POP)
            return temp
          }
        }
        else if (key === 'shift') {
          return (): any => {
            if (data.length === 0)
              return

            const temp = data.shift()
            sendKCP(getLoc(), Operators.SHIFT)
            return temp
          }
        }
        else if (key === 'reverse') {
          return (): typeof proxy => {
            if (data.length < 2)
              return proxy

            data.reverse()
            sendKCP(getLoc(), Operators.REVERSE)
            return proxy
          }
        }
        else if (key === 'splice') {
          return (startIndex: number, removeCount: number = 0, ...insertItems: any[]) => {
            if (!Number.isSafeInteger(startIndex))
              throw new Error('Provided startIndex is not an integer: ' + startIndex.toString())

            if (!Number.isSafeInteger(removeCount))
              throw new Error('Provided removeCount is not an integer: ' + removeCount.toString())

            if ((removeCount === 0 || data.length === 0) && insertItems.length === 0)
              return []

            const temp = data.splice(startIndex, removeCount, ...prepForArray(insertItems))
            sendKCP(getLoc(), Operators.SPLICE, startIndex, removeCount, JSON.stringify(insertItems))
            return temp
          }
        }
        else if (key === 'sort') {
          return (compareFn?: (a: any, b: any) => number) => {
            const orig = Array.from(data)
            data.sort(compareFn)
            let changed = false
            const order: number[] = orig.map((item, index) => {
              const i = data.indexOf(item)
              if (!changed && i !== index)
                changed = true
              return i
            })
            if (changed)
              sendKCP(getLoc(), Operators.REORDER, JSON.stringify(order))
            return proxy
          }
        }
        else if (key === 'fill') {
          return (value: any, start: number = 0, end: number = data.length) => {
            if (!Number.isSafeInteger(start))
              throw new Error('Provided start index is not an integer: ' + start.toString())

            if (!Number.isSafeInteger(end))
              throw new Error('Provided end index is not an integer: ' + end.toString())

            const si = Math.max(0, start < 0 ? data.length + start : start)
            const ei = Math.min(data.length, Math.max(0, end < 0 ? data.length + end : end))

            if (si >= ei || si >= data.length)
              return proxy

            //TODO: somehow appropriately call prepForArray(...) and create a unique proxy for each one and a unique object reference behind it as well!
            data.fill(value, si, ei) //TODO: add also support for proxies within arrays and make sure there are no two proxies with same data ref (!IMPORTANT!)
            sendKCP(getLoc(), Operators.FILL, si, ei, JSON.stringify(value))
          }
        }
        else if (key === 'copyWithin') {
          return (target: number, start: number, end: number = data.length) => {
            if (!Number.isSafeInteger(target))
              throw new Error('Provided target index is not an integer: ' + start.toString())

            if (!Number.isSafeInteger(start))
              throw new Error('Provided start index is not an integer: ' + start.toString())

            if (!Number.isSafeInteger(end))
              throw new Error('Provided end index is not an integer: ' + end.toString())

            if (target >= data.length || start >= data.length)
              return proxy

            const ti = Math.max(0, target < 0 ? data.length + target : target)
            const si = Math.max(0, start < 0 ? data.length + start : start)
            const ei = Math.min(data.length, si + (data.length - ti), Math.max(0, end < 0 ? data.length + end : end))

            if (ti === si || si >= ei)
              return proxy

            data.copyWithin(ti, si, ei) //TODO: add also support for proxies within arrays and make sure that each proxy has it's correct 'upperLoc' (!IMPORTANT!)
            sendKCP(getLoc(), Operators.COPY_WITHIN, ti, si, ei)
          }
        }
        else {
          return Reflect.get(data, key)
        }
      }
      else if (Reflect.has(data, key)) {
        return Reflect.get(data, key)
      }
      else {
        // Reflect.set(temp, part, toKcpProxy(sendKCP, /^[0-9]+$/.test(parts[index + 1] ?? '') ? [] : {}, part, temp as any))
        Reflect.set(data, key, toKcpProxy(sendKCP, {}, key, proxy))
        return data[key]
      }
    },
    set(_, key, value): boolean {
      if (key === '__kcp') {
        receivedKCP(value)
      }
      else if (key === '__loc' || key === '__receiveKCP' || key === 'toString' || key === 'toJSON' || key === '__DANGER_RAW_DATA') {
        return false
      }
      else if (typeof key === 'symbol') {
        Reflect.set(data, key, value)
      }
      else if (key.includes('.')) {
        const [p1, k] = popPath(key)
        const targetProxy = navigateProxy(p1)
        if (targetProxy === null || typeof targetProxy !== 'object')
          return false

        Reflect.set(targetProxy, k, value) // forwards to local target proxy
      }
      else if (isArray) {
        if (key === 'length') {
          if (typeof value !== 'number' || value < 0 || !Number.isSafeInteger(value))
            throw new Error(`Invalid value passed for array.length, accepted is a positive integer, given was ${typeof value} "${value}"`)
          if (setProp(key, value))
            sendKCP(getLoc(), Operators.RESIZE, value)
        }
        else if (/^-?[0-9]+$/.test(key)) {
          const index = key.startsWith('-') ?
            data.length + parseInt(key) :
            parseInt(key)

          if (!Number.isSafeInteger(index))
            throw new Error('Provided index is too large: ' + index.toString())

          if (value !== undefined) {
            if (index < 0)
              return false
            else if (setProp(index.toString(), value))
              sendKCP(getLoc(), Operators.SET, index, JSON.stringify(value))
          }
          else if (index < data.length) {
            Reflect.deleteProperty(data, index)
            sendKCP(getLoc(), Operators.DELETE, index.toString())
          }
        }
        else
          return false
      }
      else {
        if (value !== undefined) {
          // no KCP for empty-objects, as they are the default behavior
          if (
            setProp(key, value) &&
            (typeof value !== 'object' || value === null || Object.keys(value).length || Array.isArray(value))
          )
            sendKCP(getLoc(), Operators.SET, key, JSON.stringify(value))
        }
        else {
          Reflect.deleteProperty(data, key)
          handleListener(key, undefined)
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

        const targetProxy = navigateProxy(p1)
        if (targetProxy === null || typeof targetProxy !== 'object')
          return false

        return Reflect.deleteProperty(targetProxy, k)
      }
      else if (isArray) {
        if (/^-?[0-9]+$/.test(key)) {
          const index = key.startsWith('-') ?
            data.length + parseInt(key) :
            parseInt(key)

          if (!Number.isSafeInteger(index))
            throw new Error('Provided index is too large: ' + index.toString())

          if (index < 0)
            return false
          else {
            delete data[index]
            sendKCP(getLoc(), Operators.DELETE, index)
            return true
          }
        }
        else
          return false
      }
      else if (key in data) {
        Reflect.deleteProperty(data, key)
        handleListener(key, undefined)
        sendKCP(getLoc(), Operators.DELETE, key)
        return true
      }
      else {
        return false
      }
    }
  })

  function setProp(key: string, value: any) {
    // console.log('setProp', key, value)
    if (key.includes('.')) {
      const [p1, k] = popPath(key)
      const targetProxy = navigateProxy(p1)
      if (typeof targetProxy === 'object' && targetProxy !== null)
        return Reflect.set(targetProxy, k, value) // forwards to target's local proxy
      return false
    }
    else if (typeof value === 'function' || value instanceof Observable) {
      listeners.set(key, typeof value === 'function' ? value : value.set.bind(value)) // set listener function, do not emit value change event
      if (value instanceof Observable)
        value.set(Reflect.get(data, key))
      return false
    }
    else if (typeof value === 'object' && value !== null) {//&& Reflect.get(data, key) !== value) {
      handleListener(key, value)
      Reflect.set(data, key, toKcpProxy(sendKCP, value, key, proxy)) //TODO: make sure that there are never two proxies with same data ref (always clone objects)
      return true
    }
    else if (Reflect.get(data, key) !== value) {
      handleListener(key, value)
      Reflect.set(data, key, value)
      return true
    }
  }

  // handles toKcpProxy and key and parent properties for items to be added to an array
  function prepForArray(items: any[]): any[] {
    for (const i in items) {
      let item = items[i]
      if (item !== null && typeof item === 'object')
        item = toKcpProxy(sendKCP, item, () => {
          const index = data.indexOf(item)
          if (index === -1)
            throw new Error(`Item couldn't be located in parent array [${getLoc()}]! item: ${JSON.stringify(item)}`)

          return index.toString()
        }, proxy)
    }

    return items
  }

  for (const k in data)
    setProp(k, Reflect.get(data, k))

  return proxy
}

export class KcpLink {
  readonly obs: Observable<any>

  get root() {
    return this.obs.value
  }

  set root(value: any) {
    const com = `${Operators.OVERWRITE},${JSON.stringify(value)}`
    const root = this.root

    if (typeof root === 'object' && root !== null)
      root.__kcp = com
    else if (typeof value === 'object' && value !== null)
      this.obs.set(toKcpProxy(this.sendKCP.bind(this), value, '', this))
    else if (value !== undefined)
      this.obs.set(value)
    else
      throw new Error('Root object may not be set to undefined, use null instead.')

    this.sendKCP('', com)
  }

  receiveKCP(command: string) {
    const eiLoc = command.indexOf(',')
    const loc = command.slice(0, eiLoc).split('.').slice(1)
    let temp = this.root

    //@ts-ignore
    console.log(`receivedKCP > loc:"${loc}", command:"${command}", op:"${Operators[parseInt(command.slice(eiLoc + 1, command.indexOf(',', eiLoc + 1)))]}"`)

    if (typeof temp === 'object' && temp !== null) {
      for (const part of loc)
        temp = temp[part]

      temp.__kcp = command.slice(eiLoc + 1)
    }
    else if (command.startsWith(`,${Operators.OVERWRITE},`)) {
      const value = JSON.parse(command.slice(command.indexOf(',', eiLoc + 1) + 1))

      if (typeof value === 'object' && value !== null)
        this.obs.set(toKcpProxy(this.sendKCP.bind(this), value, '', this))
      else
        this.obs.set(value)
    }
    else
      throw new Error('Couldn\'t process received KCP as root is not an object, thus the only allowed command is a root-level overwrite, but instead received the above ^^^')
  }

  sendKCP(...commandParts: (string | { toString(): string })[]) {
    return this.sender(commandParts.join(','))
  }

  constructor(private sender: (command: string) => void, init?: any) {
    this.obs = new Observable(
      ((typeof init === 'object' && init !== null) ? toKcpProxy(this.sendKCP.bind(this), init, '', this) : init),
      false,
      init !== undefined
    )
  }

  toJSON(): any {
    return this.root
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
  }

  close() {
    return this.ws.close()
  }
}

// import { List, Observable } from 'dynamics'

// export class KcpList<T = unknown> extends List<T> {
//   constructor(private sendKCP: (...commandParts: (string | { toString(): string })[]) => void, json?: string) {
//     super(json)
//   }

//   receiveKCP(command: string): void {
//     const i1 = command.indexOf(',')
//     const i2 = command.indexOf(',', i1 + 1)
//     const op = parseInt(i1 === -1 ? command : command.slice(0, i1))

//     //@ts-ignore
//     console.log(`receiveKCP > com:"${command}" i1:${i1}, i2:${i2}, op:${Operators[op]}`)

//     switch (op) {
//       case Operators.SET:
//         super.set(parseInt(command.slice(i1 + 1, i2)), JSON.parse(command.slice(i2 + 1)))
//         break
//       case Operators.PUSH:
//         super.push(JSON.parse(command.slice(i1 + 1)))
//         break
//       case Operators.POP:
//         super.pop()
//         break
//       case Operators.UNSHIFT:
//         super.unshift(JSON.parse(command.slice(i1 + 1)))
//         break
//       case Operators.SHIFT:
//         super.shift()
//         break
//       case Operators.INSERT:
//         super.insert(parseInt(command.slice(i1 + 1, i2)), JSON.parse(command.slice(i2 + 1)))
//         break
//       case Operators.REMOVE:
//         super.remove(parseInt(command.slice(i1 + 1)))
//         break
//     }
//   }

//   override push(...values: T[]): void {
//     super.push(...values)
//     for (const value of values)
//       this.sendKCP(Operators.PUSH, JSON.stringify(value))
//   }

//   override unshift(...values: T[]): void {
//     super.unshift(...values)
//     for (const value of values)
//       this.sendKCP(Operators.UNSHIFT, JSON.stringify(value))
//   }

//   override pop(): T | undefined {
//     const temp = super.pop()

//     if (temp !== undefined)
//       this.sendKCP(Operators.POP)

//     return temp
//   }

//   override shift(): T | undefined {
//     const temp = super.shift()

//     if (temp !== undefined)
//       this.sendKCP(Operators.SHIFT)

//     return temp
//   }

//   override insert(index: number, value: T): void {
//     super.insert(index, value)
//     this.sendKCP(Operators.INSERT, index, JSON.stringify(value))
//   }

//   override set(index: number, value: T): void {
//     super.set(index, value)
//     this.sendKCP(Operators.SET, index, JSON.stringify(value))
//   }

//   override replace(oldValue: T, newValue: T): void {
//     super.replace.call(this, oldValue, newValue)
//   }

//   override remove(index: number): T | undefined {
//     const temp = super.remove(index)

//     if (temp !== undefined)
//       this.sendKCP(Operators.REMOVE, index)

//     return temp
//   }

//   override delete(value: T): T | undefined {
//     return super.delete.call(this, value)
//   }

//   override clear(): void {
//     super.clear.call(this)
//   }
// }