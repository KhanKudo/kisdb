import type { BunRequest } from "bun"
import { type DataType, type KCPHandle } from "../kcp"

// kisdb HTTP (REST API) Server
export function createHttpRoutes<T = any>(dbKCP: KCPHandle, apiPath: string = '/kisdb'): Record<string, Response | ((req: BunRequest) => Response | Promise<Response>)> {
  if (!apiPath.endsWith('/'))
    apiPath += '/'

  function handleRequest(key: string, req: BunRequest): Response | Promise<Response> {
    let tmp: unknown
    switch (req.method) {
      case 'GET':
        tmp = dbKCP.getter(key)
        if (tmp === undefined)
          return new Response('', { status: 204 })
        else
          return Response.json(tmp)
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
    [apiPath](req: BunRequest) {
      return handleRequest('', req)
    },
    [`${apiPath}:key`](req: BunRequest<':key'>) {
      return handleRequest(req.params.key, req)
    }
  }
}