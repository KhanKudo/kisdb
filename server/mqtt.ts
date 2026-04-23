import type { ConnectionListener, DataType, KCPRawContext, KCPRawHandle, ListenerType } from "../core/kcp"
import * as mqtt from 'mqtt'
import { BiMap } from "../helpers/bimap"

// KisDB MQTT Server
export function createMqttProvider<T = any>({ getter, setter, subber }: KCPRawHandle<T>, broker: string = 'mqtts://broker.emqx.io:8883', baseTopic: string = 'kisdb/', connections?: ConnectionListener): void {
  console.warn('MQTT Support is in very early stages and only usable for basic concept-testing!')

  if (baseTopic && !baseTopic.endsWith('/'))
    baseTopic += '/'

  const client = mqtt.connect(broker, { rejectUnauthorized: false })
  const mqttPublisher: ListenerType = (value, key) => {
    client.publish(baseTopic + key.replaceAll('.', '/'), value === undefined ? '' : JSON.stringify(value))
  }

  client.on('connect', () => {
    console.log('mqtt > connected')
    client.subscribe(baseTopic + '$get/#')
    client.subscribe(baseTopic + '$set/#')
    client.subscribe(baseTopic + '$sub/#')
    client.subscribe(baseTopic + '$off/#')
    client.subscribe(baseTopic + '$token/#')
  })

  client.on('error', err => {
    console.error('mqtt > error:', err)
  })

  const subbed = new BiMap<string, number>()
  const connCtx = new Map<number, KCPRawContext>()

  client.on('message', async (topic, payload) => {
    try {
      const msg = payload.toString()

      topic = topic.slice(baseTopic.length)
      const reqType = topic.slice(0, topic.indexOf('/'))
      topic = topic.slice(reqType.length + 1)
      const strConn = topic.includes('/') ? topic.slice(0, topic.indexOf('/')) : topic
      const conn = parseInt(strConn)
      topic = topic.slice(strConn.length + 1)
      let reqId = 0
      if (topic.includes('/') && reqType !== '$sub') {
        const strReqId = topic.slice(0, topic.indexOf('/'))
        reqId = parseInt(strReqId)
        topic = topic.slice(strReqId.length + 1)
      }

      let ctx = connCtx.get(conn)
      if (!ctx) {
        ctx = {
          connection: conn,
          token: ''
        }
        connCtx.set(conn, ctx)
        connections?.(true, conn)
      }

      const key = topic.replaceAll('/', '.')

      try {
        //TODO: should implement getUniqueConnId() and server-generated conn-ids instead of relying on clients
        switch (reqType) {
          case '$token':
            ctx.token = msg
            break
          case '$off':
            const emptyKeys = subbed.deleteValue(conn)
            for (const k of emptyKeys)
              await subber(ctx, k, mqttPublisher, 'never')

            connections?.(false, conn)
            connCtx.delete(conn)
            break
          case '$sub':
            if (msg === 'now+future' || msg === 'future') {
              if (subbed.add(key, conn))
                await subber(ctx, key, mqttPublisher, msg)
            }
            else if (msg === 'never') {
              if (subbed.delete(key, conn))
                await subber(ctx, key, mqttPublisher, 'never')
            }
            break
          case '$get': {
            const res = await getter(ctx, key)
            client.publish(baseTopic + 's$c/' + conn + '/' + reqId, res === undefined ? '' : JSON.stringify(res))
            break
          }
          case '$set': {
            const value = msg === '' ? undefined : JSON.parse(msg) as DataType
            try {
              const res = await setter(ctx, key, value)
              client.publish(baseTopic + 's$c/' + conn + '/' + reqId, res === undefined ? '' : JSON.stringify(res))
            } catch (err) {
              const str = JSON.stringify(err)
              client.publish(baseTopic + 's$c/' + conn + '/' + reqId, '$' + ((err === undefined || str === 'undefined') ? '' : str))
            }
            break
          }
          default:
            console.warn(`mqtt > Unknown request type: "${reqType}"`)
            break
        }
      } catch (err) {
        const str = JSON.stringify(err)
        client.publish(baseTopic + 's$c/' + conn + '/' + reqId, '$' + ((err === undefined || str === 'undefined') ? '' : str))
      }
    } catch (err) {
      console.error('mqtt > error:', err)
    }
  })
}