import type { BunRequest, Server } from "bun"
import type { DataType, KCPRawHandle, ListenerType, SubType } from "../core/kcp"
import { NOACCESS } from "../core/auth"

// kisdb HTTP (REST API) Server
export function createHttpRoutes<T = any>({ getter, setter, subber }: KCPRawHandle<T>, apiPath: string = '/kisdb'): Record<string, Response | ((req: BunRequest, server: Server) => Response | Promise<Response>)> {
  if (!apiPath.endsWith('/'))
    apiPath += '/'

  const muxSenders: Map<string, ListenerType> = new Map()

  async function handleRequest(req: BunRequest, server: Server): Promise<Response> {
    const url = new URL(req.url)
    const key = url.searchParams.get('key') ?? url.pathname.slice(apiPath.length).replaceAll('/', '.')

    const token = req.headers.get('Authorization')?.slice(7) ?? url.searchParams.get('token') ?? '' // "Bearer XYZ"

    let response: Response
    switch (req.method) {
      case 'GET': {
        const isStream = req.headers.get('accept') === 'text/event-stream'
        if (isStream)
          server.timeout(req, 0)

        const subType: SubType = (url.searchParams.get('type') as SubType) ?? 'now+future'

        const multiplex = url.searchParams.get('multiplex')
        let connection = multiplex ? parseInt(multiplex, 16) : 0

        if (multiplex) {
          const sender = muxSenders.get(multiplex)
          if (!sender)
            return new Response(`MultiplexID not found! (${multiplex})`, { status: 400 })

          try {
            await subber({ token, connection }, key, sender, subType)
            return new Response('', { status: 200 })
          } catch (err) {
            return new Response(`Failed to subscribe (${key}|${sender}|${subType}) with error: ${err?.toString()}`, { status: err === NOACCESS ? 403 : 400 })
          }
        }

        if (isStream) {
          const startMultiplex = url.searchParams.has('getmux')

          const stream = new TransformStream();
          const writer = stream.writable.getWriter();

          console.log('subbed to', key)

          const sub = (data: DataType | undefined, key: string) => {
            writer.write(`data: ${JSON.stringify(data === undefined ? [key] : [key, data])}\n\n`);
          }

          if (startMultiplex) {
            const muxId = Bun.randomUUIDv7('hex').replaceAll('-', '')
            writer.write(`data: ${muxId}\n\n`)

            muxSenders.set(muxId, sub)

            connection = parseInt(muxId, 16)

            req.signal.addEventListener("abort", () => {
              subber({ token, connection }, null, sub, 'never')
              muxSenders.delete(muxId)
              writer.close();
            })
          }
          else {
            req.signal.addEventListener("abort", () => {
              subber({ token, connection }, key, sub, 'never')
              writer.close();
            })
          }

          try {
            await subber({ token, connection }, key, sub, subType)
          } catch (err) {
            return new Response(`Failed to subscribe (${key}|${sub}|${subType}) with error: ${err?.toString()}`, { status: err === NOACCESS ? 403 : 400 })
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
            const res = await getter({ token, connection }, key)
            if (res === undefined)
              return new Response('')
            else
              return Response.json(res)
          } catch (err) {
            return new Response(`Failed to get (${key}) with error: ${err?.toString()}`, { status: (err === NOACCESS) ? 403 : 400 })
          }
        }
      }
      case 'POST':
        response = new Response('', { status: 201 })
        try {
          const value = await req.json() as DataType
          const res = await setter({ token, connection: 0 }, key, value)
          if (res === undefined)
            return response
          else
            return Response.json(res)
        } catch (err) {
          return new Response(`Failed to set (${key}) with error: ${err?.toString()}`, { status: (err === NOACCESS) ? 403 : 400 })
        }
      case 'DELETE':
        response = new Response('', { status: 200 })

        try {
          const res = await setter({ token, connection: 0 }, key)
          if (res instanceof Promise)
            return res.then(() => response)
          else
            return response
        } catch (err) {
          return new Response(`Failed to delete (${key}) with error: ${err?.toString()}`, { status: (err === NOACCESS) ? 403 : 400 })
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