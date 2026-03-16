import { type DataType, type KCPHandle } from "../kcp"

// kisdb HTTP (REST API) Client
export function createHttpClient<T = any>(apiPath: string = '/kisdb'): KCPHandle {
  if (!apiPath.endsWith('/'))
    apiPath += '/'

  const toPath = (key: string) => apiPath + encodeURIComponent(key)

  return {
    path: '',
    async getter(key) {
      const res = await fetch(toPath(key), { method: 'GET' })
      if (res.status === 200)
        return res.json() as Promise<DataType>
      else if (res.status === 204)
        return undefined

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
      const evt = new (EventSource as any)(toPath(key))
      evt.onmessage = (event: any) => {
        console.log("SSE Received:", event.data);
        listener(...(JSON.parse(event.data) as [string, any]))
      };

      evt.onerror = (err: any) => {
        console.error("SSE error:", err);
        evt.close();
      };
    },
  }
}