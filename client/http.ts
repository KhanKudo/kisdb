import { type DataType, type KCPHandle, type SubType } from "../core/kcp"
import { SubMux } from "../core/subs"

// kisdb HTTP (REST API) Client
export function createHttpClient<T>(apiPath: string = '/kisdb', ctx: { token: string } = { token: '' }, connection?: (state: boolean) => void): KCPHandle<T> {
  if (!apiPath.endsWith('/'))
    apiPath += '/'

  const toPath = (key: string) => apiPath + key.replaceAll('.', '/')

  let evtSrc: EventSource | null = null
  let muxId: string | null = null

  const pendingMuxId: Map<string, SubType> = new Map()

    ; (window as any)?.addEventListener?.('beforeunload', () => {
      evtSrc?.close()
    })

  const submux = new SubMux(async (key, listener, type) => {
    if (key === null) {
      evtSrc?.close()
      evtSrc = null
      muxId = null
      connection?.(false)
      return
    }

    if (muxId) {
      const res = await fetch(apiPath + `?key=${encodeURIComponent(key)}&multiplex=${muxId}&type=${encodeURIComponent(type)}`, { method: 'GET', headers: { 'Authorization': 'Bearer ' + ctx.token } })
      if (res.status === 200)
        return

      throw new Error(`Got code ${res.status} from "${toPath(key)}" with error: ` + (await res.text() || res.statusText))
    }
    else if (evtSrc) {
      pendingMuxId.set(key, type)
      return
    }
    else {
      evtSrc = new (EventSource as any)(apiPath + `?getmux&key=${encodeURIComponent(key)}&type=${encodeURIComponent(type)}&token=${encodeURIComponent(ctx.token)}`)
      evtSrc!.onmessage = (event: any) => {
        if (!muxId) {
          muxId = event.data
          for (const [key, type] of pendingMuxId.entries()) {
            fetch(apiPath + `?key=${encodeURIComponent(key)}&multiplex=${muxId}&type=${encodeURIComponent(type)}`, { method: 'GET', headers: { 'Authorization': 'Bearer ' + ctx.token } })
          }
          pendingMuxId.clear()
          connection?.(true)
          return
        }
        // console.log("SSE Received:", event.data)
        const [k, v] = JSON.parse(event.data) as [string, any]
        listener(v, k)
      }

      evtSrc!.onerror = (err: any) => {
        console.error("SSE error:", err)
        evtSrc?.close()
        evtSrc = null
        muxId = null
        pendingMuxId.clear()
        connection?.(false)
        setTimeout(() => submux.reconnect(), 5000)
      }
    }
  })

  const handle: KCPHandle = {
    async getter(key) {
      const res = await fetch(toPath(key), { method: 'GET', headers: { 'Authorization': 'Bearer ' + ctx.token } })
      if (res.status === 200) {
        if (res.headers.get('content-length') === '0')
          return undefined
        else
          return res.json() as Promise<DataType>
      }

      throw new Error(`Got code ${res.status} from "${toPath(key)}" with error: ` + (await res.text() || res.statusText))
    },
    async setter(key, value) {
      if (typeof value === 'function')
        throw new Error('Client cannot use a function as a setter value')
      const config: RequestInit = {
        method: 'POST',
        body: JSON.stringify(value),
        headers: { 'Authorization': 'Bearer ' + ctx.token }
      }
      if (value === undefined) {
        config.method = 'DELETE'
        delete config.body
      }
      const res = await fetch(toPath(key), config)
      if (res.ok) {
        if (res.headers.get('content-length') === '0')
          return undefined
        else {
          return res.json() as Promise<DataType>
        }
      }

      throw new Error(`Got code ${res.status} from "${toPath(key)}" with error: ` + (await res.text() || res.statusText))
    },
    subber: submux.getSubber(),
  }

  return handle
}