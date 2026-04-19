import type { BunRequest, Server, WebSocketHandler } from "bun"
import type { DataType, KCPRawContext, KCPRawHandle, ListenerType, SubType } from "../core/kcp"
import { getUniqueConnId } from "../core/kcp"
import { NOACCESS } from "../core/auth"

export type WsJsonType =
  [number, string] | // positive number -> getter
  [number, string, DataType | undefined] | // negative number -> setter
  [0, string, SubType] // zero -> subber

// KisDB WebSocket Server
export function createWebSocketConfig<T = any>({ getter, setter, subber }: KCPRawHandle, apiPath: string = '/kisdb-ws'): {
  routes: Record<string, Response | ((req: BunRequest, server: Server) => Response | Promise<Response>)>,
  websocket: WebSocketHandler<unknown>
} {
  if (apiPath.endsWith('/') && apiPath.length > 1)
    apiPath = apiPath.slice(0, -1)

  return {
    routes: {
      [apiPath](req: BunRequest, server: Server): Response {
        const upgraded = server.upgrade(req);
        if (!upgraded) {
          return new Response("Upgrade failed", { status: 400 });
        }

        return new Response('OK')
      },
    },
    websocket: <WebSocketHandler<{ ctx: KCPRawContext, sub: ListenerType }>>{
      open(ws) {
        ws.data = {
          ctx: {
            connection: getUniqueConnId(),
            token: '',
          },
          sub: (value, key) => {
            if (value === undefined)
              ws.sendText(JSON.stringify([key]))
            else
              ws.sendText(JSON.stringify([key, value]))
          }
        }
      },
      async message(ws, payload) {
        try {
          if (payload === 'ping') {
            ws.sendText('pong')
            return
          }

          const [id, key, value] = JSON.parse(payload.toString()) as WsJsonType
          if (key === '$token') {
            if (value !== undefined && typeof value !== 'string') {
              ws.close(400, '$token must be a string, got: ' + typeof value)
              return
            }
            ws.data.ctx.token = value ?? ''
            return
          }

          if (id === 0) {
            await subber(ws.data.ctx, key, ws.data.sub, value as SubType)
          }
          else if (id > 0) {
            const res = await getter(ws.data.ctx, key)
            if (res === undefined)
              ws.sendText(JSON.stringify([id]))
            else
              ws.sendText(JSON.stringify([id, res]))
          }
          else {
            const res = await setter(ws.data.ctx, key, value)
            if (res === undefined)
              ws.sendText(JSON.stringify([id]))
            else
              ws.sendText(JSON.stringify([id, res]))
          }
        } catch (err) {
          try {
            const id = parseInt(payload.slice(1, 33).toString())
            if (Number.isNaN(id))
              return ws.close(1011)

            if (err === NOACCESS) {
              ws.sendText(JSON.stringify([id, null, 'NOACCESS']))
            }
            else {
              ws.sendText(JSON.stringify([id, null, err]))
            }
          } catch (err) {
            console.error('Server Error:', err)
            ws.close(1011)
          }
        }
      },
      close(ws) {
        if (!ws.data.ctx || !ws.data.sub)
          return

        try {
          subber(ws.data.ctx, null, ws.data.sub, 'never')
        } catch { }
      },
    }
  }
}