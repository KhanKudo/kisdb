import { Observable } from "dynamics"

// NOTE: a '.' at the start means that the message doesn't contain any data for the DB, so it won't be stored in the file! (used for e.g. api-calling functions)
export const enum Operators { // IMPORTANT: Always APPEND new operators, never insert them before or inbetween, otherwise uncompacted DBs will get corrupted
  OVERWRITE,  // loc /OP/ value(json)
  SET,        // loc /OP/ key(index must be >=0), value(json)
  DELETE,     // loc /OP/ key(index must be >=0)
  PUSH,       // loc /OP/ values(json array)
  UNSHIFT,    // loc /OP/ values(json array)
  POP,        // loc /OP/
  SHIFT,      // loc /OP/
  SPLICE,     // loc /OP/ startIndex(can be negative), removeCount(>=0), insertValues(json array)
  REVERSE,    // loc /OP/
  REORDER,    // loc /OP/ order(json number array, at each position is that item's new index)
  RESIZE,     // loc /OP/ length(>=0)
  FILL,       // loc /OP/ start(>=0), end(>=0), value(json)
  COPY_WITHIN,// loc /OP/ target(>=0), start(>=0), end(>=0)
  FUNCTIONIZE,//.loc /OP/ count(>0), ...keys(comma separated, can contain dots(.) or be an empty string, can also end with a dot serving as a shallow wildcard)
  CALL_FUNC,  //.loc /OP/ key, id(unique across parallel calls from same proxy-object, can be reused upon resolution >=0), args(json array)
  RETURN_FUNC,//.loc /OP/ id(unique across parallel calls from same proxy-object, can be reused upon resolution >=0), value(json)
  // INSERT,     // loc /OP/ index(>=0), values(json array)
  // REMOVE,     // loc /OP/ index(>=0), count(>=0)
  // REPLACE,    // loc /OP/ startIndex, values(json array)
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

function toKcpProxy(sendKCP: KcpLink['sendKCP'], data: Record<any, any> | any[] = {}, upperLoc: string | ((item: any) => string), parent: { __loc: string } | KcpLink) {
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
    else if (parent.__loc === '')
      return (typeof upperLoc === 'function' ? upperLoc(proxy) : upperLoc)
    else
      return parent.__loc + '.' + (typeof upperLoc === 'function' ? upperLoc(proxy) : upperLoc)
  }

  let noKCP: boolean = false

  function receivedKCP(command: string) {
    const i1 = command.indexOf(',')
    const i2 = command.indexOf(',', i1 + 1)
    const op = parseInt(i1 === -1 ? command : command.slice(0, i1))
    const getKey = () => command.slice(i1 + 1, i2 === -1 ? undefined : i2)

    noKCP = true

    switch (op) {
      case Operators.OVERWRITE:
        const value = JSON.parse(command.slice(i1 + 1))
        if (
          Array.isArray(data) === Array.isArray(value) &&
          typeof data === 'object' && data !== null &&
          typeof value === 'object' && value !== null
        ) {
          if (fullyFunctionized)
            fullyFunctionized = false
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
            typeof upperLoc === 'function' ? upperLoc(proxy) : upperLoc,
            (typeof value === 'object' && value !== null) ?
              toKcpProxy(sendKCP, value, upperLoc, parent) :
              value
          )
        }
        break
      case Operators.SET:
        Reflect.set(proxy, getKey(), JSON.parse(command.slice(i2 + 1)))
        break
      case Operators.DELETE:
        Reflect.deleteProperty(proxy, getKey())
        break
      case Operators.PUSH:
        proxy.push(...JSON.parse(command.slice(i1 + 1)))
        break
      case Operators.UNSHIFT:
        proxy.unshift(...JSON.parse(command.slice(i1 + 1)))
        break
      case Operators.POP:
        proxy.pop()
        break
      case Operators.SHIFT:
        proxy.shift()
        break
      case Operators.SPLICE:
        proxy.splice(parseInt(command.slice(i1 + 1, i2)), parseInt(command.slice(i2 + 1)), ...JSON.parse(command.slice(command.indexOf(',', i2 + 1) + 1)))
        break
      case Operators.REVERSE:
        proxy.reverse()
        break
      case Operators.REORDER: {
        const orig = Array.from(data as any[]);
        const order = JSON.parse(command.slice(i1 + 1)) as number[]
        order.forEach((newIndex, oldIndex) => (data as any[])[newIndex] = orig[oldIndex])
        if (listeners.size)
          for (let i = 0; i < order.length; i++)
            if (i !== order[i])
              handleListener(i.toString(), (data as any[])[order[i]!])
        break
      }
      case Operators.RESIZE:
        proxy.length = parseInt(command.slice(i1 + 1))
        break
      case Operators.FILL:
        proxy.fill(JSON.parse(command.slice(command.indexOf(',', i2 + 1) + 1)), parseInt(command.slice(i1 + 1, i2)), parseInt(command.slice(i2 + 1)))
        break
      case Operators.COPY_WITHIN:
        proxy.copyWithin(parseInt(command.slice(i1 + 1, i2)), parseInt(command.slice(i2 + 1)), parseInt(command.slice(command.indexOf(',', i2 + 1) + 1)))
        break
      case Operators.FUNCTIONIZE: {
        const count = parseInt(getKey())
        const keys = command.slice(i2 + 1).split(',')
        if (count !== keys.length)
          throw new Error(`Functionize Operator provided keyCount didn\'t match actual received key quantity: ${count} != ${keys.length}`)

        for (const key of keys) {
          if (key.includes('.')) {
            const [p, k1] = popPath(key);
            (<typeof proxy>navigateProxy(p)).__functionize = k1
          }
          else
            proxy.__functionize = key
        }
        break
      }
      case Operators.CALL_FUNC: {
        const i3 = command.indexOf(',', i2 + 1)
        const key = getKey()
        const id = parseInt(command.slice(i2 + 1, i3))
        const args = JSON.parse(command.slice(i3 + 1)) ?? []

        const func = fnzDefs.get(key)
        if (!func) {
          console.error(`Received KCP CALL_FUNC for "${key}" but no fnzDef exists for it!`)
          return // keep id alive on requestor side and just don't respond.
        }

        setTimeout(async () => {
          try {
            const res = await func(...args)
            sendKCP('.' + getLoc(), Operators.RETURN_FUNC, id, JSON.stringify(res))
          }
          catch (err) {
            console.error(`Received KCP CALL_FUNC "${key}" failed during execution with error: ${err}`)
            return // keep id alive on requestor side and just don't respond.
          }
        })

        break
      }
      case Operators.RETURN_FUNC: {
        const id = parseInt(getKey())

        const result = (command.length > i2 + 1) ? JSON.parse(command.slice(i2 + 1)) : undefined
        if (fnzIdMappings.has(id)) {
          const func = fnzIdMappings.get(id)
          fnzIdMappings.delete(id)
          func!(result)
        }
        else
          console.error('OP RETURN_FUNC\'s caller couldn\'t be found!', getLoc(), id, result)

        break
      }
      default:
        throw new Error(`RECEIVED INVALID OPERATOR: "${op}"`)
    }

    noKCP = false
  }

  const fnzIdMappings: Map<number, (result: unknown) => void> = new Map()
  const functionized: Set<string> = new Set()
  const fnzDefs: Map<string, (...args: any[]) => unknown | Promise<unknown>> = new Map()
  let fullyFunctionized: boolean = false

  const listeners = new Map<string, (value: any) => void | null>()

  function handleListener(key: string, value: any) {
    if (!listeners.has(key))
      return

    const res = listeners.get(key)?.(value)
    if (res === null)
      listeners.delete(key)
  }

  const isArray = Array.isArray(data)

  const arrayUpperLocFunc = (item: any) => {
    const index = data.indexOf(item)
    if (index === -1)
      throw new Error(`Item couldn't be located in parent array [${getLoc()}]! item: ${JSON.stringify(item)}`)

    return index.toString()
  }

  const proxy = <(Record<any, any> | any[]) & { __loc: string, __definedFnz: string[], __functionize: string, __receiveKCP: (command: string) => void, __kcp: string, __DANGER_RAW_DATA: (Record<any, any> | any[]), toString: () => string }>new Proxy<Record<any, any> | any[]>(data, {
    get(_, key) {
      if (key === '__loc') {
        //TODO: optimize by only fetching parent loc if it's an array, otherwise hard-set loc
        return getLoc()
      }
      else if (key === '__DANGER_RAW_DATA') {
        return data // !!! DANGER !!! STRICTLY FOR INTERNAL USE ONLY !!!
      }
      else if (key === '__receiveKCP') {
        return receivedKCP
      }
      else if (key === '__definedFnz') {
        return [
          ...fnzDefs.keys(),
          ...Object.entries(data)
            .map(([k, v]) =>
              (typeof v === 'object' && v !== null) ?
                (v.__definedFnz as string[]).map(x => k + '.' + x) :
                []
            )
            .flat()
        ]
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
      else if (key.includes(',') || key === '')
        throw new Error(`Key is not allowed to be empty or contain a comma ","! (${key})`)
      else if (key.includes('.')) {
        return navigateProxy(key)
      }
      else if (fullyFunctionized || (functionized.size && functionized.has(key))) {
        return function (...args: any[]) {
          if (!fullyFunctionized && !functionized.has(key))
            throw new Error('This property was overwritten and this function is no longer valid!')

          return new Promise((resolve, reject) => {
            const id = fnzIdMappings.size ? Math.max(...fnzIdMappings.keys()) + 1 : 0
            fnzIdMappings.set(id, resolve)
            sendKCP('.' + getLoc(), Operators.CALL_FUNC, key, id, JSON.stringify(args))
          })
        }
      }
      else if (isArray) {
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
            if (noKCP) noKCP = false; else sendKCP(getLoc(), Operators.PUSH, JSON.stringify(items))
            if (listeners.size) {
              const imax = data.length + items.length
              for (let i = data.length; i < imax; i++)
                handleListener(i.toString(), data[i])
            }
            return temp
          }
        }
        else if (key === 'unshift') {
          return (...items: any[]): number => {
            if (items.length === 0)
              return data.length

            const temp = data.unshift(...prepForArray(items))
            if (noKCP) noKCP = false; else sendKCP(getLoc(), Operators.UNSHIFT, JSON.stringify(items))
            if (listeners.size)
              for (let i = data.length - 1; i >= 0; i--)
                handleListener(i.toString(), data[i])
            return temp
          }
        }
        else if (key === 'pop') {
          return (): any => {
            if (data.length === 0)
              return

            const temp = data.pop()
            if (noKCP) noKCP = false; else sendKCP(getLoc(), Operators.POP)
            if (listeners.size)
              handleListener(data.length.toString(), undefined)
            return temp
          }
        }
        else if (key === 'shift') {
          return (): any => {
            if (data.length === 0)
              return

            const temp = data.shift()
            if (noKCP) noKCP = false; else sendKCP(getLoc(), Operators.SHIFT)
            if (listeners.size)
              for (let i = 0; i <= data.length; i++)
                handleListener(i.toString(), data[i])
            return temp
          }
        }
        else if (key === 'reverse') {
          return (): typeof proxy => {
            if (data.length < 2)
              return proxy

            data.reverse()
            if (noKCP) noKCP = false; else sendKCP(getLoc(), Operators.REVERSE)
            if (listeners.size) {
              if (data.length % 2 === 0)
                for (let i = 0; i < data.length; i++)
                  handleListener(i.toString(), data[i])
              else {
                const pivot = Math.ceil(data.length / 2)
                for (let i = 0; i < data.length; i++)
                  if (i !== pivot)
                    handleListener(i.toString(), data[i])
              }
            }
            return proxy
          }
        }
        else if (key === 'splice') {
          return (startIndex: number, removeCount: number = 0, ...insertItems: any[]) => {
            if (!Number.isSafeInteger(startIndex))
              throw new Error('Provided startIndex is not an integer: ' + startIndex.toString())

            if (!Number.isSafeInteger(removeCount))
              throw new Error('Provided removeCount is not an integer: ' + removeCount.toString())

            startIndex = Math.min(data.length, Math.max(0, startIndex < 0 ? data.length + startIndex : startIndex))
            removeCount = Math.max(0, Math.min(removeCount, data.length - startIndex))

            const insertCount = insertItems.length

            if (removeCount === 0 && insertCount === 0)
              return []

            const temp = data.splice(startIndex, removeCount, ...prepForArray(insertItems))
            if (noKCP) noKCP = false; else sendKCP(getLoc(), Operators.SPLICE, startIndex, removeCount, JSON.stringify(insertItems))
            if (listeners.size) {
              const imax = insertCount === removeCount ?
                startIndex + removeCount :
                insertCount > removeCount ?
                  data.length :
                  data.length + removeCount - insertCount
              for (let i = startIndex; i < imax; i++)
                handleListener(i.toString(), data[i])
            }
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
            if (changed) {
              if (noKCP) noKCP = false; else sendKCP(getLoc(), Operators.REORDER, JSON.stringify(order))

              if (listeners.size)
                for (let i = 0; i < order.length; i++)
                  if (i !== order[i])
                    handleListener(i.toString(), data[order[i]!])
            }
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

            if (typeof value === 'object' && value !== null) {
              for (let i = si; i < ei; i++) {
                data[i] = toKcpProxy(sendKCP, Array.isArray(value) ? Array.from(value) : Object.assign({}, value), arrayUpperLocFunc, proxy)
              }
            }
            else {
              data.fill(value, si, ei)
            }

            if (noKCP) noKCP = false; else sendKCP(getLoc(), Operators.FILL, si, ei, JSON.stringify(value))

            if (listeners.size)
              for (let i = si; i < ei; i++)
                handleListener(i.toString(), data[i])
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

            for (let i = si; i < ei; i++) {
              data[ti - si + i] = toKcpProxy(sendKCP, (typeof data[i] === 'object' && data[i] !== null) ?
                (Array.isArray(data[i]) ? Array.from(data[i].__DANGER_RAW_DATA) : Object.assign(data[i].__DANGER_RAW_DATA)) :
                data[i], arrayUpperLocFunc, proxy)
            }

            if (noKCP) noKCP = false; else sendKCP(getLoc(), Operators.COPY_WITHIN, ti, si, ei)

            if (listeners.size) {
              const imax = ti + ei - si
              for (let i = ti; i < imax; i++)
                handleListener(i.toString(), data[i])
            }
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
      console.log('set', key, value)
      if (key === '__kcp') {
        receivedKCP(value)
      }
      else if (key === '__loc' || key === '__definedFnz' || key === '__receiveKCP' || key === 'toString' || key === 'toJSON' || key === '__DANGER_RAW_DATA') {
        return false
      }
      else if (typeof key === 'symbol') {
        Reflect.set(data, key, value)
      }
      else if (key.includes(',') || (key === '' && typeof value !== 'function'))
        throw new Error(`Key is not allowed to be empty or contain a comma ","! (${key})`)
      else if (typeof value === 'function') {
        setProp(key, value)
        if (noKCP) noKCP = false; else sendKCP('.' + getLoc(), Operators.FUNCTIONIZE, 1, key)
        return true
      }
      else if (fullyFunctionized)
        return false
      else if (key.includes('.')) {
        const [p1, k] = popPath(key)
        const targetProxy = navigateProxy(p1)
        if (targetProxy === null || typeof targetProxy !== 'object')
          return false

        Reflect.set(targetProxy, k, value) // forwards to local target proxy
      }
      else if (key === '__functionize') {
        if (value === '') {
          fullyFunctionized = true
          functionized.clear()
          if (isArray)
            data.length = 0
          else
            for (const k in data)
              Reflect.deleteProperty(data, k)

          if (listeners.size)
            for (const k in data)
              handleListener(k, undefined)
        }
        else if (isArray)
          throw new Error(`Arrays can only be fully functionized, per-property functionization is not supported!(${getLoc()} -> ${value})`)
        else {
          functionized.add(value)

          if (value in data) {
            Reflect.deleteProperty(data, value)
            if (listeners.size)
              handleListener(value, undefined)
          }
        }
      }
      else if (isArray) {
        if (key === 'length') {
          if (typeof value !== 'number' || value < 0 || !Number.isSafeInteger(value))
            throw new Error(`Invalid value passed for array.length, accepted is a positive integer, given was ${typeof value} "${value}"`)
          if (setProp(key, value)) {
            if (noKCP) noKCP = false; else sendKCP(getLoc(), Operators.RESIZE, value)
            if (listeners.size)
              handleListener(key, value)
          }
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
            else if (setProp(index.toString(), value)) {
              if (noKCP) noKCP = false; else sendKCP(getLoc(), Operators.SET, index.toString(), JSON.stringify(value))
              if (listeners.size)
                handleListener(index.toString(), value)
            }
          }
          else if (index < data.length) {
            Reflect.deleteProperty(data, index)
            if (noKCP) noKCP = false; else sendKCP(getLoc(), Operators.DELETE, index.toString())
            if (listeners.size)
              handleListener(index.toString(), undefined)
          }
        }
        else
          return false
      }
      else {
        if (value !== undefined) {
          // no KCP for empty-objects, as they are the default behavior
          if (functionized.size && functionized.has(key))
            functionized.delete(key)

          if (
            setProp(
              key,
              (typeof value === 'object' && value !== null) ? (Array.isArray(value) ? Array.from(value) : Object.assign(value)) : value
            )
          ) {
            if (noKCP) noKCP = false; else sendKCP(getLoc(), Operators.SET, key, JSON.stringify(value))
            if (listeners.size)
              handleListener(key, value)
          }
        }
        else if (!functionized.size || !functionized.has(key))
          return false
        else {
          Reflect.deleteProperty(data, key)
          if (noKCP) noKCP = false; else sendKCP(getLoc(), Operators.DELETE, key)
          handleListener(key, undefined)
        }
      }
      return true
    },
    deleteProperty(_, key): boolean {
      if (typeof key === 'symbol') {
        return Reflect.deleteProperty(data, key)
      }
      else if (key.includes(',') || key === '')
        throw new Error(`Key is not allowed to be empty or contain a comma ","! (${key})`)
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
            if (noKCP) noKCP = false; else sendKCP(getLoc(), Operators.DELETE, index)
            handleListener(index.toString(), undefined)
            return true
          }
        }
        else
          return false
      }
      else if (key in data) {
        Reflect.deleteProperty(data, key)
        if (noKCP) noKCP = false; else sendKCP(getLoc(), Operators.DELETE, key)
        handleListener(key, undefined)
        return true
      }
      else if (functionized.has(key)) {
        functionized.delete(key)
        if (noKCP) noKCP = false; else sendKCP('.' + getLoc(), Operators.DELETE, key)
        return true
      }
      else if (fnzDefs.has(key)) {
        fnzDefs.delete(key)
        if (noKCP) noKCP = false; else sendKCP('.' + getLoc(), Operators.DELETE, key)
        return true
      }
      else {
        return false
      }
    },
    has(_, key) {
      return key in data || (typeof key === 'string' && functionized.has(key))
    }
  })

  function setProp(key: string, value: any): boolean {
    if (key.includes(',') || (key === '' && typeof value !== 'function'))
      throw new Error(`Key is not allowed to be empty or contain a comma ","! (${key})`)
    else if (key.includes('.')) {
      const [p1, k] = popPath(key)
      const targetProxy = navigateProxy(p1)
      if (typeof targetProxy === 'object' && targetProxy !== null)
        return Reflect.set(targetProxy, k, value) // forwards to target's local proxy
      return false
    }
    else if (value instanceof Observable) {
      listeners.set(key, value.set.bind(value)) // set listener function, do not emit value change event
      value.set(Reflect.get(data, key))
      return false
    }
    else if (typeof value === 'function') {
      console.log(`fnz defined at "${key}"`)

      if (key === '')
        fnzDefs.clear()
      else
        Reflect.deleteProperty(data, key)

      fnzDefs.set(key, value)
      return true
    }
    else if (typeof value === 'object' && value !== null) {
      if ((Reflect.get(data, key) !== value) && (isArray || Array.isArray(value) || Object.keys(value).length)) {
        Reflect.set(data, key, toKcpProxy(sendKCP, value, isArray ? arrayUpperLocFunc : key, proxy))
        return true
      }
      else
        return false
    }
    else if (Reflect.get(data, key) !== value) {
      Reflect.set(data, key, value)
      return true
    }
    else {
      return false
    }
  }

  // handles toKcpProxy and key and parent properties for items to be added to an array
  function prepForArray(items: any[]): any[] {
    for (const i in items) {
      if (items[i] !== null && typeof items[i] === 'object')
        items[i] = toKcpProxy(sendKCP, items[i], arrayUpperLocFunc, proxy)
    }

    return items
  }

  if ('' in data) {
    if (typeof data[''] !== 'function')
      throw new Error(`Object key may not be an empty string! (${getLoc()}[''])`)

    if (Object.keys(data).length !== 1)
      throw new Error(`Object wildcard function specified but other keys are present too which is not allowed! (${Object.keys(data).join(',')})`)

    setProp('', data[''])
    if (noKCP) noKCP = false; else sendKCP('.' + getLoc(), Operators.FUNCTIONIZE, 1, '')
  }
  else {
    const toFnz: string[] = []

    for (const k in data) { // assumes data is object and not array
      const v = Reflect.get(data, k)
      if (typeof v === 'object' && v !== null) {
        if (Array.isArray(v)) {
          Reflect.set(data, k, toKcpProxy(sendKCP, Array.from(v), getLoc() + '.' + k, proxy))
        }
        else {
          Reflect.set(data, k, toKcpProxy(sendKCP, Object.assign({}, v), getLoc() + '.' + k, proxy))
        }
      }
      else if (typeof v === 'function') {
        setProp(k, v)
        toFnz.push(k)
      }
      else if (v instanceof Observable)
        setProp(k, v)
    }

    if (toFnz.length)
      if (noKCP) noKCP = false; else sendKCP('.' + getLoc(), Operators.FUNCTIONIZE, toFnz.length, toFnz.join(','))
  }

  return proxy
}

export class KcpLink<T = any> {
  readonly obs: Observable<T>

  get root() {
    return this.obs.value
  }

  set root(value: T) {
    const com = `${Operators.OVERWRITE},${JSON.stringify(value)}`
    const root = this.root

    if (typeof root === 'object' && root !== null)
      (<any>root).__kcp = com
    else if (typeof value === 'object' && value !== null)
      this.obs.set(<T>toKcpProxy(this.sendKCP.bind(this), value, '', this))
    else if (value !== undefined)
      this.obs.set(value)
    else
      throw new Error('Root object may not be set to undefined, use null instead.')

    this.sendKCP('', com)
  }

  receiveKCP(command: string) {
    this.kcpReceiverListener?.(command)

    const eiLoc = command.indexOf(',')
    const loc = command.slice(command.startsWith('.') ? 1 : 0, eiLoc).split('.')
    if (loc[0] === '')
      loc.splice(0, 1)
    let temp = this.root

    //@ts-ignore
    // console.log(`receivedKCP > loc:"${loc}", command:"${command}", op:"${Operators[parseInt(command.slice(eiLoc + 1, command.indexOf(',', eiLoc + 1)))]}"`)

    if (typeof temp === 'object' && temp !== null) {
      for (const part of loc)
        temp = (<any>temp)[part];

      (<any>temp).__kcp = command.slice(eiLoc + 1)
    }
    else if (command.startsWith(`,${Operators.OVERWRITE},`)) {
      const value = JSON.parse(command.slice(command.indexOf(',', eiLoc + 1) + 1))

      if (typeof value === 'object' && value !== null)
        this.obs.set(<T>toKcpProxy(this.sendKCP.bind(this), value, '', this))
      else
        this.obs.set(value)
    }
    else
      throw new Error('Couldn\'t process received KCP as root is not an object, thus the only allowed command is a root-level overwrite, but instead received the above ^^^')
  }

  sendKCP(...commandParts: (string | { toString(): string })[]) {
    return this.sender(commandParts.join(','))
  }

  constructor(private sender: (command: string) => void, init?: T, private kcpReceiverListener?: (command: string) => void, public readonly dbname: string = 'default') {
    this.obs = new Observable<T>(
      <T>((typeof init === 'object' && init !== null) ? toKcpProxy(this.sendKCP.bind(this), init, '', this) : init),
      false,
      init !== undefined
    )
  }

  toJSON(): T {
    return this.root
  }

  toString(): string {
    return JSON.stringify(this.root)
  }
}

export class KcpWebSocketClient<T = any> extends KcpLink<T> {
  private ws: WebSocket

  constructor(webSocketPath: string = '/kisdb') {
    if (webSocketPath.startsWith('/kisdb/'))
      super((com) => {
        console.log(`client > sendKCP > "${com}"`)
        this.ws.send(com)
      }, undefined, undefined, webSocketPath.slice(webSocketPath.indexOf('/', 1) + 1))
    else
      super((com) => {
        console.log(`client > sendKCP > "${com}"`)
        this.ws.send(com)
      })
    this.ws = new WebSocket(webSocketPath)
    this.ws.onmessage = ({ data: msg }) => {
      console.log(`client > receiveKCP > "${msg}"`)
      super.receiveKCP(msg)
    }
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