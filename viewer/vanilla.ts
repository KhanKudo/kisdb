import { isBadKey, type DataType, type KCPHandle, type KCPRawContext, type KCPTrustedContext } from "../core/kcp"

// TODO: $value was a bad idea ... for the vanilla-viewer. Instead create a vanilla-sync viewer
//       it should be identical to the old, original 'kisdb' nested proxy. Values are all auto-synched
//       thus it is very important to set basePath of the viewer appropratelly to not clone-sync everything.

//TODO: introduce not in SubType but just vanilla-viewer: onchange and onnowchange, no once-variant needed (or not yet planned at least)
//      these exclusively trigger if the new value is actually different from the old one.
//      If it's an object/array, it will be checked for a deepMatch, since the reference is obviously always different
// -- > this might be better done via a 'risingEdge'-like function. Being 'changed(...)' or something alike.
//      that's better because the server cannot realistically track for all client their individual states and needs for updates.

type UnwrapProxy<T> = T extends ProxyType<infer V extends VanillaType> ? V : void

type UnwrapProxyArray<T extends any[]> = {
  [K in keyof T]: UnwrapProxy<T[K]>
}

type VanillaType = string | number | boolean | null | undefined | (() => DataType | void | Promise<DataType | void>) | ((ctx: KCPTrustedContext, arg?: any) => DataType | void | Promise<DataType | void>) | { [key: string]: VanillaType } | VanillaType[]

export type ProxyType<T extends VanillaType = any> =
  IsAny<T> extends true
  ? any
  : [T] extends [(...args: infer A) => infer R]
  ? ProxyFunction<T, A, R>
  : [T] extends [readonly (infer U extends VanillaType)[]]
  ? ProxyArray<U>
  : [T] extends [{ [key: string]: VanillaType }]
  ? ProxyObject<T>
  : ProxyValue<T>

type ProxyFunction<T, A extends any[], R> =
  (...args: A) => (R extends Promise<any> ? R : Promise<R>)

type IsAny<T> = 0 extends (1 & T) ? true : false

type ProxyValue<T> =
  IsAny<T> extends true
  ? any
  : Promise<StripFuncs<T>> &
  ((value: T) => Promise<void>) &
  (() => Promise<StripFuncs<T>>) &
  Record<'$on' | '$once' | '$onnow' | '$oncenow' | '$off', (value: StripFuncs<T>, key: string) => void>

type ProxyObject<T extends { [key: string]: VanillaType }> =
  {
    [K in keyof T]-?: K extends string | number ? ProxyType<T[K]> : never
  } &
  ProxyValue<T>

type ProxyArray<T extends VanillaType> =
  {
    [K: number]: ProxyType<T>
  } &
  ProxyValue<T[]>

type StripFuncs<T> =
  T extends (...args: any[]) => any
  ? never
  : T extends readonly (infer U)[]
  ? StripFuncs<U>[]
  : T extends object
  ? { [K in keyof T]: StripFuncs<T[K]> }
  : T

export const proxyRefs = new Map<string, ProxyType>()

export function createVanillaViewer<T extends VanillaType = any>({ getter, setter, subber }: KCPHandle, path: string = ''): ProxyType<T> {
  if (proxyRefs.has(path))
    return proxyRefs.get(path)!

  const func = function (...args: any[]) {
    // console.log(`func called at path "${path}" with:`, ...args, ';')
    if (args.length === 0)
      return getter(path)
    else if (args.length === 1)
      return setter(path, args[0])
    else
      throw new Error('multiple arguments are not yet supported!')
  }

  const toPath = (key: string) => path + '.' + key

  const proxy = new Proxy(func as ProxyType, {
    get(_, key) {
      if (typeof key !== 'string')
        return

      let tmp: unknown

      switch (key) {
        case 'then':
          try {
            tmp = getter(path)
            if (tmp instanceof Promise)
              return tmp.then.bind(tmp)
            else {
              const res = Promise.resolve(tmp)
              return res.then.bind(res)
            }
          } catch (err) {
            const res = Promise.reject(err)
            return res.then.bind(res)
          }
        case 'catch':
          try {
            tmp = getter(path)
            if (tmp instanceof Promise)
              return tmp.catch.bind(tmp)
            else {
              const res = Promise.resolve(tmp)
              return res.catch.bind(res)
            }
          } catch (err) {
            const res = Promise.reject(err)
            return res.catch.bind(res)
          }
        case 'finally':
          try {
            tmp = getter(path)
            if (tmp instanceof Promise)
              return tmp.finally.bind(tmp)
            else {
              const res = Promise.resolve(tmp)
              return res.finally.bind(res)
            }
          } catch (err) {
            const res = Promise.reject(err)
            return res.finally.bind(res)
          }
        default:
          if (isBadKey(key))
            throw new Error(`Invalid key requested: "${key}"!`)
          // console.log(`get(${toPath(key)})`)
          return createVanillaViewer({ getter, setter, subber }, toPath(key))
      }
    },
    set(_, key, value): boolean {
      switch (key) {
        case '$on':
          subber(path, value, 'future')
          return true
        case '$onnow':
          subber(path, value, 'now+future')
          return true
        case '$once':
          subber(path, value, 'next')
          return true
        case '$oncenow':
          subber(path, value, 'now+next')
          return true
        case '$off':
          subber(path, value, 'never')
          return true
      }

      if (typeof key !== 'string' || isBadKey(key))
        return false

      // console.log(`set(${toPath(key)}) =`, value)

      setter(toPath(key), value)
      return true
    },
    deleteProperty(_, key): boolean {
      if (typeof key !== 'string' || isBadKey(key))
        return false

      // console.log(`delete(${toPath(key)})`)

      setter(toPath(key))
      return true
    }
  })

  proxyRefs.set(path, proxy)

  return proxy
}

// create a listener that will get called if ANY of the provided kisdb-references are updated. Will trigger once on initialization
// returns a function to unsubscribe from all referecnces
export function refUpdater<T extends ProxyType[] = []>(func: (...args: UnwrapProxyArray<T>) => void, ...refs: T): Promise<() => void> {
  const unsub: (() => void)[] = []

  const triggered: Set<number> = new Set()
  let suppressed = true
  const values: UnwrapProxyArray<T> = [] as any

  return new Promise(resolve => {
    for (let i = 0; i < refs.length; i++) {
      const ref = refs[i]!
      const sub = (val: any) => {
        values[i] = val
        if (suppressed) {
          triggered.add(i)
          if (triggered.size === refs.length) {
            suppressed = false
            resolve(() => {
              for (const desub of unsub) {
                desub()
              }
            })
            func(...values)
          }
        }
        else
          func(...values)
      }
      ref.$onnow = sub
      unsub.push(() => ref.$off = sub)
    }
  })
}

const risingFuncs: WeakMap<() => void, () => void> = new WeakMap()
export function risingEdge(listener: () => void): (value?: boolean) => void {
  let func = risingFuncs.get(listener)
  if (!func) {
    let lastValue: boolean | undefined
    func = (value?: boolean) => {
      if (value === true && lastValue === false)
        listener()
      lastValue = value
    }
    risingFuncs.set(listener, func)
  }
  return func
}

const fallingFuncs: WeakMap<() => void, () => void> = new WeakMap()
export function fallingEdge(listener: () => void): (value?: boolean) => void {
  let func = fallingFuncs.get(listener)
  if (!func) {
    let lastValue: boolean | undefined
    func = (value?: boolean) => {
      if (value === false && lastValue === true)
        listener()
      lastValue = value
    }
    fallingFuncs.set(listener, func)
  }
  return func
}