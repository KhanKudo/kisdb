import { BiMap, SubMux, type DataType, type KCPHandle, type SubType } from "../kcp"

// kisdb HTTP (REST API) Client
export function createHttpClient<T = any>(apiPath: string = '/kisdb'): KCPHandle {
  if (!apiPath.endsWith('/'))
    apiPath += '/'

  const toPath = (key: string) => apiPath + key.replaceAll('.', '/')

  let evtSrc: EventSource | null = null
  let muxId: string | null = null

  const pendingMuxId: Map<string, SubType> = new Map()

  const submux = new SubMux(async (key, listener, type) => {
    if (key === null) {
      evtSrc?.close()
      evtSrc = null
      muxId = null
      return
    }

    if (muxId) {
      const res = await fetch(apiPath + `?key=${encodeURIComponent(key)}&multiplex=${muxId}&type=${encodeURIComponent(type)}`, { method: 'GET' })
      if (res.status === 200)
        return

      throw new Error(`Got code ${res.status} from "${toPath(key)}" with error: ` + (await res.text() || res.statusText))
    }
    else if (evtSrc) {
      pendingMuxId.set(key, type)
      return
    }
    else {
      evtSrc = new (EventSource as any)(apiPath + `?getmux&key=${encodeURIComponent(key)}&type=${encodeURIComponent(type)}`)
      evtSrc!.onmessage = (event: any) => {
        if (!muxId) {
          muxId = event.data
          for (const [key, type] of pendingMuxId.entries()) {
            fetch(apiPath + `?key=${encodeURIComponent(key)}&multiplex=${muxId}&type=${encodeURIComponent(type)}`, { method: 'GET' })
          }
          pendingMuxId.clear()
          return
        }
        console.log("SSE Received:", event.data)
        const [k, v] = JSON.parse(event.data) as [string, any]
        listener(v, k)
      }

      evtSrc!.onerror = (err: any) => {
        console.error("SSE error:", err)
        evtSrc?.close()
        evtSrc = null
        muxId = null
        pendingMuxId.clear()
        setTimeout(() => submux.reconnect(), 5000)
      }
    }
  })

  const handle: KCPHandle = {
    async getter(key) {
      const res = await fetch(toPath(key), { method: 'GET' })
      if (res.status === 200) {
        if (res.headers.get('content-length') === '0')
          return undefined
        else
          return res.json() as Promise<DataType>
      }

      throw new Error(`Got code ${res.status} from "${toPath(key)}" with error: ` + (await res.text() || res.statusText))
    },
    async setter(key, value) {
      const config: RequestInit = {
        method: 'POST',
        body: JSON.stringify(value)
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