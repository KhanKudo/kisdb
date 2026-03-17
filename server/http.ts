import type { BunRequest, Server } from "bun"
import type { DataType, KCPHandle, SubType } from "../kcp"

// kisdb HTTP (REST API) Server
export function createHttpRoutes<T = any>({ getter, setter, subber }: KCPHandle, apiPath: string = '/kisdb'): Record<string, Response | ((req: BunRequest, server: Server) => Response | Promise<Response>)> {
  if (!apiPath.endsWith('/'))
    apiPath += '/'

  const muxSenders: Map<string, (key: string, value?: DataType) => void> = new Map()

  function handleRequest(req: BunRequest, server: Server): Response | Promise<Response> {
    const url = new URL(req.url)
    const key = url.searchParams.get('key') ?? url.pathname.slice(apiPath.length).replaceAll('/', '.')

    let response: Response
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

          try {
            subber(key, sender, subType)
            return new Response('', { status: 200 })
          } catch (err) {
            return new Response(`Failed to subscribe (${key}|${sender}|${subType}) with error: ${err}`, { status: 400 })
          }
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

          try {
            subber(key, sub, subType)
          } catch (err) {
            return new Response(`Failed to subscribe (${key}|${sub}|${subType}) with error: ${err}`, { status: 400 })
          }

          return new Response(stream.readable, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              "Connection": "keep-alive",
            }
          })
        }
        else {
          try {
            const res = getter(key)
            if (res === undefined)
              return new Response('')
            else
              return Response.json(res)
          } catch (err) {
            return new Response(`Failed to get (${key}) with error: ${err}`, { status: 400 })
          }
        }
      }
      case 'POST':
        response = new Response('', { status: 201 })
        try {
          return req.json().then(value => {
            const res = setter(key, value as DataType)
            if (res instanceof Promise)
              return res.then(() => response)
            else
              return response
          })
        } catch (err) {
          return new Response(`Failed to set (${key}) with error: ${err}`, { status: 400 })
        }
      case 'DELETE':
        response = new Response('', { status: 200 })

        try {
          const res = setter(key)
          if (res instanceof Promise)
            return res.then(() => response)
          else
            return response
        } catch (err) {
          return new Response(`Failed to delete (${key}) with error: ${err}`, { status: 400 })
        }
      default:
        return new Response('', { status: 405 })
    }
  }

  return {
    [apiPath.slice(0, -1)]: handleRequest,
    [apiPath + '*']: handleRequest,
  }
}