import type { BunRequest, Server } from "bun"
import { type DataType, type KCPHandle } from "../kcp"

// kisdb HTTP (REST API) Server
export function createHttpRoutes<T = any>(dbKCP: KCPHandle, apiPath: string = '/kisdb'): Record<string, Response | ((req: BunRequest, srv: Server) => Response | Promise<Response>)> {
  if (!apiPath.endsWith('/'))
    apiPath += '/'

  function handleRequest(key: string, req: BunRequest): Response | Promise<Response> {
    let tmp: unknown
    switch (req.method) {
      case 'GET':
        if (req.headers.get('accept') === 'text/event-stream') {
          const stream = new TransformStream();
          const writer = stream.writable.getWriter();

          console.log('subbed to', key)

          const sub = (key: string, data?: DataType) => {
            console.log('subber')
            writer.write(`data: ${JSON.stringify(data === undefined ? [key] : [key, data])}\n\n`);
          }

          dbKCP.subber(key, sub, 'now+future')

          req.signal.addEventListener("abort", () => {
            dbKCP.subber(key, sub, 'never')
            writer.close();
          });

          return new Response(stream.readable, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              "Connection": "keep-alive",
            }
          })
        }
        else {
          tmp = dbKCP.getter(key)
          if (tmp === undefined)
            return new Response('', { status: 204 })
          else
            return Response.json(tmp)
        }
      case 'POST':
        tmp = new Response('', { status: 201 })
        return req.json().then(value => dbKCP.setter(key, value as DataType)?.then(() => tmp as Response) ?? tmp as Response)
      case 'DELETE':
        tmp = new Response('', { status: 200 })
        return dbKCP.setter(key)?.then(() => tmp as Response) ?? tmp as Response
      default:
        return new Response('', { status: 405 })
    }
  }

  return {
    [apiPath](req: BunRequest, srv: Server) {
      if (req.headers.get('accept') === 'text/event-stream')
        srv.timeout(req, 0)

      return handleRequest('', req)
    },
    [`${apiPath}:key`](req: BunRequest<':key'>, srv: Server) {
      if (req.headers.get('accept') === 'text/event-stream')
        srv.timeout(req, 0)

      return handleRequest(req.params.key, req)
    }
  }
}