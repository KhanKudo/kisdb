import type { DataType, KCPHandle, StripFuncsCtx } from "../core/kcp"
import mqtt from 'mqtt'
import { SubMux } from "../core/subs"

// KisDB MQTT Client
export function createMqttClient<T>(broker: string = 'wss://broker.emqx.io:8084/mqtt', baseTopic: string = 'kisdb/', ctx: { token: string } = { token: '' }, connection?: (state: boolean) => void): KCPHandle<StripFuncsCtx<T>> {
  console.warn('MQTT Support is in very early stages and only usable for basic concept-testing!')

  if (baseTopic && !baseTopic.endsWith('/'))
    baseTopic += '/'

  const connId = (Date.now() % 1e6) * 1e3 + Math.round(Math.random() * 1e3)

  let lastToken = ''

  const client = mqtt.connect(broker, { will: { topic: baseTopic + '$off/' + connId, payload: '' }, rejectUnauthorized: false, forceNativeWebSocket: false })

  client.on('connect', () => {
    connection?.(true)
    client.subscribe(baseTopic + 's$c/' + connId + '/#')
    // submux.reconnect()
  })

  client.on('close', () => {
    connection?.(false)
  })

  const pendingIds = new Map<number, [(data: DataType | undefined) => void, (error: any) => void]>()

  const checkToken = () => {
    if (ctx.token !== lastToken) {
      lastToken = ctx.token
      client.publish(baseTopic + '$token/' + connId, lastToken)
    }
  }

  const getData = (...kv: [string] | [string, DataType | undefined]): Promise<DataType | undefined> => {
    checkToken()

    const id = (Date.now() % 1e6) * 1e6 + Math.round(Math.random() * 1e6)
    const reqType = kv.length > 1 ? '$set' : '$get'

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject('TIMED OUT')
      }, 60000)
      pendingIds.set(id, [(data) => {
        clearTimeout(timeout)
        resolve(data)
      }, (err) => {
        clearTimeout(timeout)
        reject(err)
      }])

      client.publish(baseTopic + reqType + '/' + connId + '/' + id + '/' + kv[0].replaceAll('.', '/'), kv[1] !== undefined ? JSON.stringify(kv[1]) : '')
    })
  }

  const submux = new SubMux(async (key, func, type) => {
    checkToken()

    if (key === null || type === 'never') {
      if (key === null) {
        if (type !== 'never')
          throw new Error('mqtt > invalid sub-request. key = null, type != never')
        client.publish(baseTopic + '$off/' + connId, '')
      }
      else {
        client.unsubscribe(baseTopic + key.replaceAll('.', '/'))
        client.publish(baseTopic + '$sub/' + connId + '/' + key.replaceAll('.', '/'), 'never')
      }
    }
    else if (type === 'now+future' || type === 'future') {
      client.subscribe(baseTopic + key.replaceAll('.', '/'))
      client.publish(baseTopic + '$sub/' + connId + '/' + key.replaceAll('.', '/'), type)
    }
    else {
      throw new Error(`mqtt > unsupported subscription type: "${type}"`)
    }
  })

  client.on('message', async (topic, payload) => {
    try {
      let msg = payload.toString()

      topic = topic.slice(baseTopic.length)
      const s$c = topic.slice(0, topic.indexOf('/'))
      if (s$c === 's$c') {
        topic = topic.slice(s$c.length + 1)
        const strConn = topic.slice(0, topic.indexOf('/'))
        const conn = parseInt(strConn) // already filtered by client's topic subscription
        topic = topic.slice(strConn.length + 1)
        const reqId = parseInt(topic)

        const isErr = msg[0] === '$'
        if (isErr)
          msg = msg.slice(1)

        const [resolve, reject] = pendingIds.get(reqId) ?? []
        if (!resolve || !reject) {
          console.warn(`received unknown reqId [${reqId}]`)
          return
        }

        const data = msg === '' ? undefined : JSON.parse(msg)
        if (isErr)
          reject(data)
        else
          resolve(data)
      }
      else {
        const key = topic.replaceAll('/', '.')
        const value = msg === '' ? undefined : JSON.parse(msg)
        submux.listener(value, key)
      }
    } catch (err) {
      console.error('mqtt > error:', err)
    }
  })

  return {
    getter(key) {
      return getData(key)
    },
    setter(key, value) {
      return getData(key, value)
    },
    subber: submux.getSubber()
  }
}