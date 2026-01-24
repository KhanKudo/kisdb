import { describe, test, expect, beforeEach, beforeAll, afterAll, afterEach } from 'bun:test'
import { KcpWebSocketClient } from '../kcp'
import { webSocketHandler as wsh, routesHandler as rh, loadDB, unloadDB, saveDB } from "../server"

describe('server', () => {
  let KCL: KcpWebSocketClient
  let DB: any
  let dbRef = () => { }
  let server: Bun.Server
  const FILE = Bun.file('test.kisdb.json')
  async function LINES(file: Bun.BunFile = FILE): Promise<string[]> {
    return file.text().then(txt => txt.split('\n'))
  }

  beforeAll(() => {
    FILE.unlink().catch(() => { })
    server = Bun.serve({ routes: rh, port: 3031, websocket: wsh })
  })
  afterAll(async () => {
    await server.stop(true)
  })

  beforeEach(async () => {
    loadDB('test', dbRef, 'manual')
    KCL = new KcpWebSocketClient('ws://localhost:3031/kisdb/test')
    DB = await KCL.obs.once()
  })
  afterEach(async () => {
    KCL.close()
    unloadDB('test', dbRef)
    await FILE.unlink()
  })

  describe('basics', () => {
    test('client bundle', async () => {
      expect((await fetch('http://localhost:3031/kisdb.js')).text())
        .resolves.toStartWith('// ../dynamics/src/Listenable.ts\n')
    })
  })

  describe('storage', () => {
    test('root overwrite', async () => {
      KCL.root = { x: 5 }
      await Bun.sleep(1)
      expect(LINES()).resolves.toStrictEqual([
        '{}',
        ',0,{"x":5}',
      ])
    })

    describe('root property', () => {
      test('single set', async () => {
        DB.x = 5
        await Bun.sleep(1)
        expect(LINES()).resolves.toStrictEqual([
          '{}',
          ',1,x,5',
        ])
      })

      test('multi-set sequential', async () => {
        DB.x = 1
        await Bun.sleep(1)
        DB.x = 2
        await Bun.sleep(1)
        DB.x = 'y'
        await Bun.sleep(1)
        DB.x = 4
        await Bun.sleep(1)
        DB.x = 5
        await Bun.sleep(1)
        expect(LINES()).resolves.toStrictEqual([
          '{}',
          ',1,x,1',
          ',1,x,2',
          ',1,x,"y"',
          ',1,x,4',
          ',1,x,5',
        ])
      })

      test('multi-set parallel', async () => {
        DB.x = 1
        DB.x = 2
        DB.x = 'y'
        DB.x = 4
        DB.x = 5
        await Bun.sleep(1)
        expect(LINES()).resolves.toStrictEqual([
          '{}',
          ',1,x,1',
          ',1,x,2',
          ',1,x,"y"',
          ',1,x,4',
          ',1,x,5',
        ])
      })

      test('set object', async () => {
        DB.x = { a: 1, b: 'z' }
        await Bun.sleep(1)
        expect(LINES()).resolves.toStrictEqual([
          '{}',
          ',1,x,{"a":1,"b":"z"}',
        ])
      })

      test('set array', async () => {
        DB.x = ['a', 1]
        await Bun.sleep(1)
        expect(LINES()).resolves.toStrictEqual([
          '{}',
          ',1,x,["a",1]',
        ])
      })
    })

    describe('array', () => {
      beforeEach(() => {
        KCL.root = []
        DB = KCL.root
      })

      test('set within array', async () => {
        DB[0] = 1
        DB[1] = 2
        await Bun.sleep(1)
        expect(LINES()).resolves.toStrictEqual([
          '{}',
          ',0,[]',
          ',1,0,1',
          ',1,1,2',
        ])
      })

      test('push & pop', async () => {
        DB.push(1, 2, 3)
        DB.pop()
        await Bun.sleep(1)
        expect(LINES()).resolves.toStrictEqual([
          '{}',
          ',0,[]',
          ',3,[1,2,3]',
          ',5'
        ])
      })

      test('unshift & shift', async () => {
        DB.unshift(1, 2, 3)
        DB.shift()
        await Bun.sleep(1)
        expect(LINES()).resolves.toStrictEqual([
          '{}',
          ',0,[]',
          ',4,[1,2,3]',
          ',6'
        ])
      })

      test('push & splice', async () => {
        DB.push(1, 2, 3)
        DB.splice(1, 2, 4, 5, 6)
        await Bun.sleep(1)
        expect(LINES()).resolves.toStrictEqual([
          '{}',
          ',0,[]',
          ',3,[1,2,3]',
          ',7,1,2,[4,5,6]',
        ])
      })

      test('push & reverse', async () => {
        DB.push(1, 2, 3)
        DB.reverse()
        await Bun.sleep(1)
        expect(LINES()).resolves.toStrictEqual([
          '{}',
          ',0,[]',
          ',3,[1,2,3]',
          ',8',
        ])
      })

      test('push & sort', async () => {
        DB.push(1, 2, 3)
        //@ts-ignore
        DB.sort((a, b) => b - a)
        await Bun.sleep(1)
        expect(LINES()).resolves.toStrictEqual([
          '{}',
          ',0,[]',
          ',3,[1,2,3]',
          ',9,[2,1,0]',
        ])
      })

      test('resize', async () => {
        DB.length = 5
        await Bun.sleep(1)
        expect(LINES()).resolves.toStrictEqual([
          '{}',
          ',0,[]',
          ',10,5',
        ])
      })

      test('resize & fill', async () => {
        DB.length = 5
        DB.fill(9)
        await Bun.sleep(1)
        expect(LINES()).resolves.toStrictEqual([
          '{}',
          ',0,[]',
          ',10,5',
          ',11,0,5,9',
        ])
      })

      test.todo('push & copyWithin', async () => {
        DB.push(1, 2, 3, 4, 5)
        DB.copyWithin(2, 0, 3)
        await Bun.sleep(1)
        expect(LINES()).resolves.toStrictEqual([
          '{}',
          ',0,[]',
          ',3,[1,2,3,4,5]',
          ',12,2,0,3',
        ])
      })
    })
  })
})