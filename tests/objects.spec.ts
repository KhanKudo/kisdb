import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { KcpLink } from '../kcp'

describe('objects', () => {
  let KCL: KcpLink
  let DB: any
  let kcps: string[] = []
  beforeEach(() => {
    KCL = new KcpLink((com) => kcps.push(com), {})
    DB = KCL.root
    kcps.splice(0)
  })

  test('overwriting root', () => {
    const obj = { a: 'b' }
    KCL.root = obj
    expect(KCL.root).not.toStrictEqual(obj)
    expect(KCL.root).toEqual(obj)
    expect(Object.keys(KCL.root)).toHaveLength(1)
    expect(kcps).toHaveLength(1)
    expect(kcps[0]).toBe(',0,{"a":"b"}')
  })

  test('property DB.c', () => {
    const obj = { a: 'b' }
    DB.c = obj

    expect(DB.c).not.toStrictEqual(obj)
    expect(DB.c).toEqual(obj)
    expect(Object.keys(DB.c)).toHaveLength(1)

    expect(kcps).toHaveLength(1)
    expect(kcps[0]).toBe(',1,c,{"a":"b"}')
  })

  test('property within newly set object DB.c.d', () => {
    const objA = { a: 'b' }
    const objB = { e: 'f' }
    DB.c = objA
    DB.c.d = objB

    expect(DB.c).toEqual(objA)
    expect(DB.c).toContainKey('d')
    expect(DB.c.d).not.toStrictEqual(objB)
    expect(DB.c.d).toEqual(objB)
    expect(objA).not.toContainKey('e')

    expect(kcps).toHaveLength(2)
    expect(kcps[0]).toBe(',1,c,{"a":"b"}')
    expect(kcps[1]).toBe('c,1,d,{"e":"f"}')
  })

  test('nested object as value', () => {
    const d = { a: 'b' }
    const obj = { d: d, e: 'f' }

    DB.c = obj

    expect(DB.c).not.toStrictEqual(obj)
    expect(DB.c).toEqual(obj)
    expect(DB.c).toContainKey('d')
    expect(DB.c.d).not.toStrictEqual(d)
    expect(DB.c.d).toEqual(d)

    expect(kcps).toHaveLength(1)
    expect(kcps[0]).toBe(',1,c,{"d":{"a":"b"},"e":"f"}')
  })

  test.todo('object with 10 nestings as value', () => {
    const d = { a: 'b' }
    const obj = { e: 'f' }
    let temp: any = obj
    for (let i = 0; i < 10; i++) {
      temp.depth = i
      temp.d = { ...d }
      temp = temp.d
    }

    const jsonObj = JSON.stringify(obj)

    DB.c = obj
    DB.c.d.d.d.d.d.d.d.d.d.d.X = 'Y'

    expect(DB.c).not.toStrictEqual(obj)
    expect(DB.c).toEqual(obj)
    expect(DB.c).toContainKey('d')
    expect(DB.c.d).not.toStrictEqual(d)
    expect(DB.c.d).toEqual(d)
    expect(DB.c.d.d).not.toStrictEqual(d)
    expect(DB.c.d.d).toEqual(d)
    expect(DB.c.depth).toBe(0)
    expect(DB.c.d.depth).toBe(1)
    expect(DB.c.d.d.depth).toBe(2)
    expect(DB.c.d.d.d.d.d.d.d.d.d.X).toBeEmptyObject()
    expect(DB.c.d.d.d.d.d.d.d.d.d.d.d).toBeEmptyObject()
    expect(DB.c.d.d.d.d.d.d.d.d.d.d.X).toBe('Y')

    expect(kcps).toHaveLength(2)
    expect(kcps[0]).toBe(`,1,c,${jsonObj}`)
    expect(kcps[1]).toBe('c.d.d.d.d.d.d.d.d.d,1,X,"Y"')
  })

  test('dynamic creation of nested object', () => {
    DB.c.d.e.f = 5

    expect(DB.c.d.e.f).toBe(5)
    expect(DB.c.d.e.x).toBeEmptyObject()
    expect(DB.c.d.e.f.x).toBeUndefined()
    expect(DB.c.d.e.f.toFixed).toBeFunction()

    expect(kcps).toHaveLength(1)
    expect(kcps[0]).toBe('c.d.e,1,f,5')
  })

  test.todo('proxied object as value', () => {
    const obj = { a: 'b' }
    DB.c = obj
    DB.d = DB.c

    expect(DB.c).not.toStrictEqual(obj)
    expect(DB.c).toEqual(obj)
    expect(DB.d).not.toStrictEqual(DB.c)
    expect(DB.d).toEqual(DB.c)

    DB.c.f = 'e'
    DB.d.e = 'f'

    expect(DB.c.f).toBe('e')
    expect(DB.d.e).toBe('f')
    expect(DB.c.e).toBeEmptyObject()
    expect(DB.d.f).toBeEmptyObject()

    expect(kcps).toHaveLength(4)
    expect(kcps[0]).toBe(',1,c,{"a":"b"}')
    expect(kcps[1]).toBe(',1,d,{"a":"b"}')
    expect(kcps[2]).toBe('c,1,f,"e"')
    expect(kcps[3]).toBe('c,1,e,"f"')
  })

  test('delete operator', () => {
    const obj = { a: 'b', e: 'f' }
    DB.c = obj

    delete DB.c.e

    expect(DB.c.a).toBe('b')
    expect(DB.c.e).toBeEmptyObject()

    expect(kcps).toHaveLength(2)
    expect(kcps[0]).toBe(',1,c,{"a":"b","e":"f"}')
    expect(kcps[1]).toBe('c,2,e')
  })

  test.todo('delete nonexisting', () => {
    delete DB.x

    expect(DB.x).toBeEmptyObject()

    expect(kcps).toHaveLength(0)
  })

  test.todo('undefined on nonexisting', () => {
    DB.c = undefined

    expect(DB.c).toBeEmptyObject()

    expect(kcps).toHaveLength(0)
  })

  test('unchanged primitive value', () => {
    DB.c = 5
    DB.c = 5

    expect(DB.c).toBe(5)

    expect(kcps).toHaveLength(1)
    expect(kcps[0]).toBe(',1,c,5')
  })

  test('unchanged object value', () => {
    const obj = { a: 'b' }
    DB.c = obj
    DB.c = obj

    expect(DB.c).toEqual(obj)

    expect(kcps).toHaveLength(2)
    expect(kcps[0]).toBe(',1,c,{"a":"b"}')
    expect(kcps[1]).toBe(',1,c,{"a":"b"}')
  })

  test('nested string key read', () => {
    expect(DB['a.b.c']).toBeEmptyObject()
    DB.a.b.c = 5
    expect(DB['a.b.c']).toBe(5)
    expect(kcps).toHaveLength(1)
    expect(kcps[0]).toBe('a.b,1,c,5')
  })

  test('nested string key write', () => {
    DB['a.b.c'] = 5
    expect(DB.a.b.c).toBe(5)
    const obj = { a: 'b' }
    DB['x.y.z'] = obj
    expect(DB.x.y.z).not.toStrictEqual(obj)
    expect(DB.x.y.z).toEqual(obj)

    expect(kcps).toHaveLength(2)
    expect(kcps[0]).toBe('a.b,1,c,5')
    expect(kcps[1]).toBe('x.y,1,z,{"a":"b"}')
  })

  test('empty object as value', () => {
    DB.c = {}

    expect(DB.c).toBeEmptyObject()
    expect(kcps).toHaveLength(0)
  })

  test.todo('empty array as value', () => {
    DB.c = []

    console.log(DB.c, JSON.stringify(DB))

    expect(DB.c).toBeArrayOfSize(0)
    expect(kcps).toHaveLength(1)
    expect(kcps[0]).toBe(',1,c,[]')
  })

  test('number as key', () => {
    expect(DB[0]).toBeEmptyObject()
    expect(kcps).toHaveLength(0)
  })

  test.todo('key sanitization', () => {
    // this is just an example, the are many more cases
    expect(DB['.']).toThrow()
    expect(() => DB.c = { '.': 5 }).toThrow()
  })

  describe('value type compatibility', () => {
    test('bool', () => {
      DB.c = false
      expect(DB.c).toStrictEqual(false)
      DB.c = true
      expect(DB.c).toStrictEqual(true)

      expect(kcps).toHaveLength(2)
      expect(kcps[0]).toBe(',1,c,false')
      expect(kcps[1]).toBe(',1,c,true')
    })

    test('number', () => {
      DB.c = 5
      expect(DB.c).toStrictEqual(5)
      DB.c = -5
      expect(DB.c).toStrictEqual(-5)
      DB.c = 0
      expect(DB.c).toStrictEqual(0)

      expect(kcps).toHaveLength(3)
      expect(kcps[0]).toBe(',1,c,5')
      expect(kcps[1]).toBe(',1,c,-5')
      expect(kcps[2]).toBe(',1,c,0')
    })

    test('string', () => {
      DB.c = ''
      expect(DB.c).toStrictEqual('')
      DB.c = '5'
      expect(DB.c).toStrictEqual('5')
      DB.c = 'null'
      expect(DB.c).toStrictEqual('null')
      const str = '\\n_u-l\tl\n,\0${[!%#'
      DB.c = str
      expect(DB.c).toStrictEqual(str)

      expect(kcps).toHaveLength(4)
      expect(kcps[0]).toBe(',1,c,""')
      expect(kcps[1]).toBe(',1,c,"5"')
      expect(kcps[2]).toBe(',1,c,"null"')
      expect(kcps[3]).toBe(`,1,c,${JSON.stringify(str)}`)
    })

    test('null', () => {
      DB.c = null

      expect(DB.c).toBeNull()

      expect(kcps).toHaveLength(1)
      expect(kcps[0]).toBe(',1,c,null')
    })

    test.todo('undefined', () => {
      DB.c = undefined

      expect(DB.c).toBeEmptyObject()

      expect(kcps).toHaveLength(0)
    })

    test.todo('object', () => {
      const obj: any = { a: 1 }
      DB.c = obj

      expect(DB.c).not.toStrictEqual(obj)
      expect(DB.c).toEqual(obj)
      obj.a = 'never'
      expect(DB.c).not.toEqual(obj)

      expect(kcps).toHaveLength(1)
      expect(kcps[0]).toBe(',1,c,{"a":1}')
    })

    test.todo('nested object', () => {
      const obj: any = { a: 1, b: { x: 'y' } }
      DB.c = obj

      expect(DB.c).not.toStrictEqual(obj)
      expect(DB.c.b).not.toStrictEqual(obj.b)
      expect(DB.c).toEqual(obj)
      expect(DB.c.b).toEqual(obj.b)
      obj.a = 'never'
      obj.b.x = 'NEVER'
      expect(DB.c).not.toEqual(obj)
      expect(DB.c.b).not.toEqual(obj.b)

      expect(kcps).toHaveLength(1)
      expect(kcps[0]).toBe(',1,c,{"a":1,"b":{"x":"y"}}')
    })

    test('array', () => {
      const arr: any[] = [1, 'b']
      DB.c = arr

      expect(DB.c).not.toStrictEqual(arr)
      expect(DB.c).toEqual(arr)
      arr.pop()
      expect(DB.c).not.toEqual(arr)

      expect(kcps).toHaveLength(1)
      expect(kcps[0]).toBe(',1,c,[1,"b"]')
    })

    test('nested array', () => {
      const arr: any[] = [1, 'b', [2, 'a']]
      DB.c = arr

      expect(DB.c).not.toStrictEqual(arr)
      expect(DB.c[2]).not.toStrictEqual(arr[2])
      expect(DB.c).toEqual(arr)
      expect(DB.c[2]).toEqual(arr[2])
      arr[2].pop()
      expect(DB.c).not.toEqual(arr)
      expect(DB.c[2]).not.toEqual(arr[2])

      expect(kcps).toHaveLength(1)
      expect(kcps[0]).toBe(',1,c,[1,"b",[2,"a"]]')
    })

    test.todo('Date', () => {
      const date = new Date()
      DB.c = date

      expect(DB.c).not.toStrictEqual(date)
      expect(DB.c).toBe(JSON.stringify(date))

      expect(kcps).toHaveLength(1)
      expect(kcps[0]).toBe(',1,c,' + JSON.stringify(date))
    })

    test.todo('constructor (Number)', () => {
      DB.c = Number

      expect(DB.c).toBeEmptyObject()

      expect(kcps).toHaveLength(0)
    })

    test.todo('symbol', () => {
      const sym = Symbol()
      DB.c = sym

      expect(DB.c).toBeEmptyObject()

      expect(kcps).toHaveLength(0)
    })

    test.todo('function', () => {
      // not the actual fnz functionality
      // just the acceptance of `set` with value of type 'function'
    })
  })
})