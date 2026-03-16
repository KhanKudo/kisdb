import type { BunRequest, Server } from "bun"
import type { DataType, KCPHandle, SubType } from "../kcp"

// kisdb HTTP (REST API) Server
export function createHttpRoutes<T = any>({ path, getter, setter, subber }: KCPHandle, apiPath: string = '/kisdb'): Record<string, Response | ((req: BunRequest, server: Server) => Response | Promise<Response>)> {
  if (!apiPath.endsWith('/'))
    apiPath += '/'

  const muxSenders: Map<string, (key: string, value?: DataType) => void> = new Map()

  function handleRequest(req: BunRequest, server: Server): Response | Promise<Response> {
    const url = new URL(req.url)
    const key = url.searchParams.get('key') ?? url.pathname.slice(apiPath.length).replaceAll('/', '.')

    let tmp: unknown
    switch (req.method) {
      case 'GET': {
        const isStream = req.headers.get('accept') === 'text/event-stream'
        if (isStream)
          server.timeout(req, 0)

        const subType: SubType = (url.searchParams.get('type') as SubType) ?? 'now+future'

        const multiplex = url.searchParams.get('multiplex')

        if (multiplex) {
          const sender = muxSenders.get(multiplex)
          if (!sender)
            return new Response(`MultiplexID not found! (${multiplex})`, { status: 400 })

          subber(key, sender, subType)
          return new Response('', { status: 200 })
        }

        if (isStream) {
          const startMultiplex = url.searchParams.has('getmux')

          const stream = new TransformStream();
          const writer = stream.writable.getWriter();

          console.log('subbed to', key)

          const sub = (key: string, data?: DataType) => {
            console.log('subber')
            writer.write(`data: ${JSON.stringify(data === undefined ? [key] : [key, data])}\n\n`);
          }

          if (startMultiplex) {
            const muxId = Bun.randomUUIDv7('base64url')
            writer.write(`data: ${muxId}\n\n`)

            muxSenders.set(muxId, sub)

            req.signal.addEventListener("abort", () => {
              subber(null, sub, 'never')
              muxSenders.delete(muxId)
              writer.close();
            })
          }
          else {
            req.signal.addEventListener("abort", () => {
              subber(key, sub, 'never')
              writer.close();
            })
          }

          subber(key, sub, subType)

          return new Response(stream.readable, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              "Connection": "keep-alive",
            }
          })
        }
        else {
          tmp = getter(key)
          if (tmp === undefined)
            return new Response('')
          else
            return Response.json(tmp)
        }
      }
      case 'POST':
        tmp = new Response('', { status: 201 })
        return req.json().then(value => setter(key, value as DataType)?.then(() => tmp as Response) ?? tmp as Response)
      case 'DELETE':
        tmp = new Response('', { status: 200 })
        return setter(key)?.then(() => tmp as Response) ?? tmp as Response
      default:
        return new Response('', { status: 405 })
    }
  }

  return {
    [apiPath]: handleRequest,
    [apiPath + '*']: handleRequest,
  }
}