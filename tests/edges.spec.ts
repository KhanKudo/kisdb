import { describe, test, expect, beforeEach } from 'bun:test'
import { KcpLink } from '../kcp'

describe.todo('edge cases', () => {
  let KCL: KcpLink
  const kcps: string[] = []
  beforeEach(() => {
    KCL = new KcpLink((com) => kcps.push(com), {})
    kcps.splice(0)
  })

  test('copy - modify', () => {
    KCL.root = {
      a: { x: 1 },
      b: { y: 2 },
      c: { z: 3 }
    }
    const DB = KCL.root
    kcps.splice(0)

    const some = DB.c
    some.z = 5

    expect(DB.c).toStrictEqual({ z: 5 })
    expect(some).toStrictEqual({ z: 5 })

    expect(kcps).toHaveLength(1)
    expect(kcps[0]).toBe('c,1,z,5')
  })

  test('copy - overwrite - modify', () => {
    KCL.root = {
      a: { x: 1 },
      b: { y: 2 },
      c: { z: 3 }
    }
    const DB = KCL.root
    kcps.splice(0)

    const some = DB.c
    DB.c = { e: 4 }
    some.z = 5

    expect(kcps).toHaveLength(0)
    expect(DB.c).toStrictEqual({ e: 4 })
    expect(some).toStrictEqual({ z: 5 })
  })

  test('copy - overwrite - modify nested', () => {
    KCL.root = {
      a: { x: 1 },
      b: { y: 2 },
      c: {
        d: { z: 3 }
      }
    }
    const DB = KCL.root
    kcps.splice(0)

    const some = DB.c
    DB.c = { e: 4 }
    some.d.z = 5

    expect(kcps).toHaveLength(0)
    expect(DB.c).not.toContainKey('d')
    expect(DB.c).toStrictEqual({ e: 4 })
    expect(some).toStrictEqual({ d: { z: 5 } })
  })
})