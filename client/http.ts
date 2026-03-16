import { BiMap, type DataType, type KCPHandle } from "../kcp"

// kisdb HTTP (REST API) Client
export function createHttpClient<T = any>(apiPath: string = '/kisdb'): KCPHandle {
  if (!apiPath.endsWith('/'))
    apiPath += '/'

  const toPath = (key: string) => apiPath + key.replaceAll('.', '/')

  let evtSrc: EventSource | null = null
  let muxId: string | null = null

  const subbers: BiMap<string, (key: string, data?: DataType) => void> = new BiMap()

  return {
    path: '',
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
      if (res.ok)
        return

      throw new Error(`Got code ${res.status} from "${toPath(key)}" with error: ` + (await res.text() || res.statusText))
    },
    async subber(key, listener, type) {
      if (key === null) {
        if (type !== 'never')
          throw new Error('type must be never, when key is null')

        for (const k of subbers.getKeys(listener) ?? []) {
          subbers.delete(k, listener)

          if (subbers.getValues(k)?.size)
            continue

          fetch(apiPath + `?key=${encodeURIComponent(k)}&multiplex=${muxId}&type=never`, { method: 'GET' })
        }
        return
      }

      if (type === 'never')
        subbers.delete(key, listener)
      else
        subbers.add(key, listener)

      if (evtSrc === null) {
        evtSrc = new (EventSource as any)(apiPath + `?getmux&key=${encodeURIComponent(key)}&type=${encodeURIComponent(type)}`)
        evtSrc!.onmessage = (event: any) => {
          if (!muxId) {
            muxId = event.data
            return
          }
          console.log("SSE Received:", event.data)
          subbers.callValues(key, ...(JSON.parse(event.data) as [string, any]))
        }

        evtSrc!.onerror = (err: any) => {
          console.error("SSE error:", err)
          evtSrc?.close()
          evtSrc = null
          muxId = null
        }
      }
      else if (muxId) {
        const res = await fetch(apiPath + `?key=${encodeURIComponent(key)}&multiplex=${muxId}&type=${encodeURIComponent(type)}`, { method: 'GET' })
        if (res.status === 200)
          return

        throw new Error(`Got code ${res.status} from "${toPath(key)}" with error: ` + (await res.text() || res.statusText))
      }
      else {
        throw new Error('evtSrc is present, but no muxId exists. Don\'t know what to do with that.')
      }
    },
  }
}