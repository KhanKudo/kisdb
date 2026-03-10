// function derefObject<T extends (Record<any, any> | any[])>(obj: T): T {
//   return Array.isArray(obj) ? <T>Array.from(obj) : Object.assign({}, obj)
// }

export type ProxyType<T = void, K extends Record<string, any> = Record<string, any>> = (() => Promise<T>) & K

export const proxyRefs = new Map<string, ProxyType>()

export function toKcpProxy(path: string, getter: (key: string) => Promise<any>, setter: (key: string, value?: any | null) => Promise<void>): ProxyType {
  if (proxyRefs.has(path))
    return proxyRefs.get(path)!

  const func = function () {
    console.log(`func called at path "${path}"!`)
    return getter(path)
  }

  const toPath = (key: string) => path + '.' + key

  const proxy: ProxyType = new Proxy(func, {
    get(_, key) {
      if (typeof key !== 'string')
        return

      console.log(`get(${toPath(key)})`)

      return toKcpProxy(toPath(key), getter, setter)
    },
    set(_, key, value): boolean {
      if (typeof key !== 'string')
        return false

      console.log(`set(${toPath(key)}) =`, value)

      setter(toPath(key), value)
      return true
    },
    deleteProperty(_, key): boolean {
      if (typeof key !== 'string')
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
//       this.obs.set(<T>toKcpProxy(this.sendKCP.bind(this), derefObject(value), '', this))
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
//         this.obs.set(<T>toKcpProxy(this.sendKCP.bind(this), derefObject(value), '', this))
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
//       <T>((typeof init === 'object' && init !== null) ? toKcpProxy(this.sendKCP.bind(this), derefObject(init), '', this) : init),
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