import { type DataType, type KCPHandle } from "../core/kcp"
import { SubMux } from "../core/subs"
import type { WsJsonType } from "../server/websocket"

// KisDB WebSocket Client
export function createWebSocketClient<T>(apiPath: string = '/kisdb-ws', ctx: { token: string } = { token: '' }, connection?: (state: boolean) => void): KCPHandle<T> {
  if (apiPath.endsWith('/') && apiPath.length > 1)
    apiPath = apiPath.slice(0, -1)

  let ws: WebSocket

  let lastToken: string = ''

  let heartbeat: number | null = null

  const pinger = () => {
    if (heartbeat !== null)
      clearTimeout(heartbeat)

    heartbeat = setTimeout(() => {
      ws.send('ping')
      heartbeat = null
      pinger()
    }, 30000) as any
  }
  pinger()

  const queue: string[] = []

  const sendData = (...data: WsJsonType | [string]): boolean => {
    if (ws.readyState != WebSocket.OPEN) {
      if (data.length !== 1 && data[0] !== 0)
        queue.push(JSON.stringify(data))
      return false
    }

    pinger()
    if (ctx.token !== lastToken) {
      lastToken = ctx.token
      ws.send(JSON.stringify([0, '$token', lastToken] as WsJsonType))
    }

    if (data.length === 1)
      ws.send(data[0])
    else
      ws.send(JSON.stringify(data))

    return true
  }

  const getData = (...kv: [string] | [string, DataType | undefined]): Promise<DataType | undefined> => {
    const id = (Date.now() * 1e6 + Math.round(Math.random() * 1e6)) * (kv.length > 1 ? -1 : 1)

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject('TIMED OUT')
      }, 60000)
      pendingIds.set(id, [(data) => {
        clearTimeout(timeout)
        resolve(data)
      }, (err) => {
        clearTimeout(timeout)
        reject(err)
      }])
      if ('1' in kv && kv[1] === undefined)
        sendData(id, kv[0])
      else
        sendData(id, ...kv)
    })
  }

  const reconnect = () => {
    ws = new WebSocket(apiPath)
    lastToken = ''

    ws.addEventListener('open', () => {
      let data: string | undefined = undefined
      while (data = queue.shift()) {
        if (sendData(data) === false) {
          queue.unshift(data)
          console.warn('Socket closed again, before previous queue could be cleared. Remaining packets in queue:', queue.length)
          return
        }
      }
      submux.reconnect()
      connection?.(true)
    })
    ws.addEventListener('message', ({ data }) => {
      if (data === 'pong')
        return

      const [key, value, err] = JSON.parse(data?.toString())
      if (typeof key === 'number') {
        const callback = pendingIds.get(key)
        if (!callback)
          return

        pendingIds.delete(key)
        if (err !== undefined)
          callback[1](err)
        else
          callback[0](value)
      }
      else {
        submux.listener(value, key)
      }
    })
    ws.addEventListener('error', () => {
      connection?.(false)
      setTimeout(reconnect, 5000)
    })
    ws.addEventListener('close', () => {
      connection?.(false)
      setTimeout(reconnect, 5000)
    })
  }

  reconnect()

  const pendingIds: Map<number, [(data: DataType | undefined) => void, (error: any) => void]> = new Map()

    ; (window as any)?.addEventListener?.('beforeunload', () => {
      ws?.close()
    })

  const submux = new SubMux(async (key, listener, type) => {
    if (key === null) {
      ws.close()
      return
    }

    sendData(0, key, type)
  })

  const handle: KCPHandle = {
    getter(key) {
      return getData(key)
    },
    setter(key, value) {
      if (typeof value === 'function')
        throw new Error('Client cannot use a function as a setter value')

      return getData(key, value)
    },
    subber: submux.getSubber(),
  }

  return handle
}