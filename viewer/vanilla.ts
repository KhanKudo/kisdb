import { isBadKey, type KCPHandle } from "../kcp"

export type ProxyType<T = void, K extends any[] | Record<string, any> = Record<string, any>> = (() => Promise<T>) & K

export const proxyRefs = new Map<string, ProxyType>()

export function createVanillaViewer({ getter, setter, subber }: KCPHandle, path: string = ''): ProxyType {
  if (proxyRefs.has(path))
    return proxyRefs.get(path)!

  const func = function (...args: any[]) {
    console.log(`func called at path "${path}" with:`, ...args, ';')
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
          console.log(`get(${toPath(key)})`)
          return createVanillaViewer({ getter, setter, subber }, toPath(key))
      }
    },
    set(_, key, value): boolean {
      switch (key) {
        case '$on':
          subber(path, value, 'future')
          break
        case '$onnow':
          subber(path, value, 'now+future')
          break
        case '$once':
          subber(path, value, 'next')
          break
      }

      if (typeof key !== 'string' || isBadKey(key))
        return false

      console.log(`set(${toPath(key)}) =`, value)

      setter(toPath(key), value)
      return true
    },
    deleteProperty(_, key): boolean {
      if (typeof key !== 'string' || isBadKey(key))
        return false

      console.log(`delete(${toPath(key)})`)

      setter(toPath(key))
      return true
    }
  })

  proxyRefs.set(path, proxy)

  return proxy
}

// export class KcpLink<T = any> {
//   readonly obs: Observable<T>

//   get root() {
//     return this.obs.value
//   }

//   set root(value: T) {
//     const com = `${Operators.OVERWRITE},${JSON.stringify(value)}`
//     const root = this.root

//     if (typeof root === 'object' && root !== null)
//       (<any>root).__kcp = com
//     else if (typeof value === 'object' && value !== null)
//       this.obs.set(<T>createVanillaClient(this.sendKCP.bind(this), derefObject(value), '', this))
//     else if (value !== undefined)
//       this.obs.set(value)
//     else
//       throw new Error('Root object may not be set to undefined, use null instead.')

//     this.sendKCP('', com)
//   }

//   receiveKCP(command: string) {
//     this.kcpReceiverListener?.(command)

//     const eiLoc = command.indexOf(',')
//     const loc = command.slice(command.startsWith('.') ? 1 : 0, eiLoc).split('.')
//     if (loc[0] === '')
//       loc.splice(0, 1)
//     let temp = this.root

//     //@ts-ignore
//     // console.log(`receivedKCP > loc:"${loc}", command:"${command}", op:"${Operators[parseInt(command.slice(eiLoc + 1, command.indexOf(',', eiLoc + 1)))]}"`)

//     if (typeof temp === 'object' && temp !== null) {
//       for (const part of loc)
//         temp = (<any>temp)[part];

//       (<any>temp).__kcp = command.slice(eiLoc + 1)
//     }
//     else if (command.startsWith(`,${Operators.OVERWRITE},`)) {
//       const value = JSON.parse(command.slice(command.indexOf(',', eiLoc + 1) + 1))

//       if (typeof value === 'object' && value !== null)
//         this.obs.set(<T>createVanillaClient(this.sendKCP.bind(this), derefObject(value), '', this))
//       else
//         this.obs.set(value)
//     }
//     else
//       throw new Error('Couldn\'t process received KCP as root is not an object, thus the only allowed command is a root-level overwrite, but instead received the above ^^^')
//   }

//   sendKCP(...commandParts: (string | { toString(): string })[]) {
//     return this.sender(commandParts.join(','))
//   }

//   constructor(private sender: (command: string) => void, init?: T, private kcpReceiverListener?: (command: string) => void, public readonly dbname: string = 'default') {
//     this.obs = new Observable<T>(
//       <T>((typeof init === 'object' && init !== null) ? createVanillaClient(this.sendKCP.bind(this), derefObject(init), '', this) : init),
//       false,
//       init !== undefined
//     )
//   }

//   toJSON(): T {
//     return this.root
//   }

//   toString(): string {
//     return JSON.stringify(this.root)
//   }
// }

// export class KcpWebSocketClient<T = any> extends KcpLink<T> {
//   private ws: WebSocket

//   constructor(webSocketPath: string = '/kisdb') {
//     if (webSocketPath.startsWith('/kisdb/'))
//       super((com) => {
//         console.log(`client > sendKCP > "${com}"`)
//         this.ws.send(com)
//       }, undefined, undefined, webSocketPath.slice(webSocketPath.indexOf('/', 1) + 1))
//     else
//       super((com) => {
//         console.log(`client > sendKCP > "${com}"`)
//         this.ws.send(com)
//       })
//     this.ws = new WebSocket(webSocketPath)
//     this.ws.onmessage = ({ data: msg }) => {
//       if (msg === 'PING')
//         return

//       console.log(`client > receiveKCP > "${msg}"`)
//       super.receiveKCP(msg)
//     }
//   }

//   close() {
//     return this.ws.close()
//   }
// }