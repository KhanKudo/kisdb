import { describe, test, expect, beforeEach } from 'bun:test'
import { KcpLink } from '../kcp'

describe('functions', () => {
  let kcl: KcpLink
  let db: any
  let KCL: KcpLink
  let DB: any
  const kcps: string[] = []
  const KCPS: string[] = []
  beforeEach(() => {
    KCL = new KcpLink((com) => { KCPS.push(com); kcl.receiveKCP(com) }, {})
    DB = KCL.root
    kcl = new KcpLink((com) => { kcps.push(com); KCL.receiveKCP(com) }, {})
    db = kcl.root
    KCPS.splice(0)
    kcps.splice(0)
  })

  describe('basic', () => {
    test('define', () => {
      DB.x = () => { }
      expect(KCPS).toHaveLength(1)
      expect(KCPS[0]).toBe('.,13,1,x')
      expect(kcps).toHaveLength(0)
    })

    test('call & return', async () => {
      let x = 0;
      DB.x = () => x++
      let res = await db.x()
      expect(x).toBe(1)
      expect(res).toBe(0)
      expect(KCPS).toHaveLength(2)
      expect(kcps).toHaveLength(1)
      expect(KCPS[0]).toBe('.,13,1,x')
      expect(kcps[0]).toBe('.,14,x,0,[]')
      expect(KCPS[1]).toBe('.,15,0,0')
    })

    test('call with default', async () => {
      let x = 1;
      DB.x = (y = 2) => x += y
      let res = await db.x()
      expect(x).toBe(3)
      expect(res).toBe(3)
      expect(KCPS).toHaveLength(2)
      expect(kcps).toHaveLength(1)
      expect(KCPS[0]).toBe('.,13,1,x')
      expect(kcps[0]).toBe('.,14,x,0,[]')
      expect(KCPS[1]).toBe('.,15,0,3')
    })

    test('call with argument', async () => {
      let x = 1;
      DB.x = (y: number) => x += y
      let res = await db.x(5)
      expect(x).toBe(6)
      expect(res).toBe(6)
      expect(KCPS).toHaveLength(2)
      expect(kcps).toHaveLength(1)
      expect(KCPS[0]).toBe('.,13,1,x')
      expect(kcps[0]).toBe('.,14,x,0,[5]')
      expect(KCPS[1]).toBe('.,15,0,6')
    })

    test('multi call sequential', async () => {
      let x = 0;
      DB.x = () => x++
      const res = []
      res.push(await db.x())
      res.push(await db.x())
      res.push(await db.x())
      expect(x).toBe(3)
      expect(res).toStrictEqual([0, 1, 2])
      expect(KCPS).toHaveLength(4)
      expect(kcps).toHaveLength(3)
      expect(KCPS[0]).toBe('.,13,1,x')
      expect(kcps[0]).toBe('.,14,x,0,[]')
      expect(KCPS[1]).toBe('.,15,0,0')
      expect(kcps[1]).toBe('.,14,x,0,[]')
      expect(KCPS[2]).toBe('.,15,0,1')
      expect(kcps[2]).toBe('.,14,x,0,[]')
      expect(KCPS[3]).toBe('.,15,0,2')
    })

    test('multi call parallel', async () => {
      let x = 0;
      DB.x = () => x += 2
      const proms = []
      proms.push(db.x())
      proms.push(db.x())
      proms.push(db.x())
      const res: any[] = await Promise.all(proms)
      expect(x).toBe(6)
      expect(res).toStrictEqual([2, 4, 6])
      expect(KCPS).toHaveLength(4)
      expect(kcps).toHaveLength(3)
      expect(KCPS[0]).toBe('.,13,1,x')
      expect(kcps[0]).toBe('.,14,x,0,[]')
      expect(kcps[1]).toBe('.,14,x,1,[]')
      expect(kcps[2]).toBe('.,14,x,2,[]')
      expect(KCPS[1]).toBe('.,15,0,2')
      expect(KCPS[2]).toBe('.,15,1,4')
      expect(KCPS[3]).toBe('.,15,2,6')
    })
  })

  describe.todo('arrays')
})