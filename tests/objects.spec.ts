import { describe, test, expect, beforeEach } from 'bun:test'
import { KcpLink } from '../kcp'

describe('objects', () => {
  let KCL: KcpLink
  let DB: any
  const kcps: string[] = []
  beforeEach(() => {
    KCL = new KcpLink((com) => kcps.push(com), {})
    DB = KCL.root
    kcps.splice(0)
  })

  test.todo('return value of setters (and methods / special properties)')

  test('overwriting root', () => {
    const obj = { a: 'b' }
    KCL.root = obj
    expect(KCL.root === obj).toBeFalse()
    expect(KCL.root).toEqual(obj)
    expect(Object.keys(KCL.root)).toHaveLength(1)
    expect(kcps).toHaveLength(1)
    expect(kcps[0]).toBe(',0,{"a":"b"}')
  })

  test('property DB.c', () => {
    const obj = { a: 'b' }
    DB.c = obj

    expect(DB.c === obj).toBeFalse()
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

    expect(DB.c.a).toBe(objA.a)
    expect(DB.c).toContainKey('d')
    expect(DB.c.d === objB).toBeFalse()
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

    expect(DB.c === obj).toBeFalse()
    expect(DB.c).toEqual(obj)
    expect(DB.c).toContainKey('d')
    expect(DB.c.d === d).toBeFalse()
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

    expect(DB.c === obj).toBeFalse()
    expect(DB.c).toEqual(obj)

    DB.c.d.d.d.d.d.d.d.d.d.d.X = 'Y'

    expect(DB.c).toContainKey('d')
    expect(DB.c.d === d).toBeFalse()
    expect(DB.c.d.d === d).toBeFalse()
    expect(DB.c.d.d.d === d).toBeFalse()
    expect(DB.c.d.a).toBe('b')
    expect(DB.c.d.d.a).toBe('b')
    expect(DB.c.d.d.d.a).toBe('b')
    expect(DB.c.depth).toBe(0)
    expect(DB.c.d.depth).toBe(1)
    expect(DB.c.d.d.depth).toBe(2)
    expect(DB.c.X).toBeUndefined()
    expect(DB.c.d.d.d.d.d.d.d.d.d.X).toBeUndefined()
    expect(DB.c.d.d.d.d.d.d.d.d.d.d.d).toBeUndefined()
    expect(DB.c.d.d.d.d.d.d.d.d.d.d.X).toBe('Y')

    expect(kcps).toHaveLength(2)
    expect(kcps[0]).toBe(`,1,c,${jsonObj}`)
    expect(kcps[1]).toBe('c.d.d.d.d.d.d.d.d.d.d,1,X,"Y"')
  })

  test.todo('dynamic creation of nested object', () => {
    DB.c.d.e.f = 5

    expect(DB.c.d.e.f).toBe(5)
    expect(DB.c.d.e.x).toBeUndefined()
    expect(DB.c.d.e.f.x).toBeUndefined()
    expect(DB.c.d.e.f.toFixed).toBeFunction()

    expect(kcps).toHaveLength(1)
    expect(kcps[0]).toBe('c.d.e,1,f,5')
  })

  test('proxied object as value', () => {
    const obj = { a: 'b' }
    DB.c = obj
    DB.d = DB.c

    expect(DB.c === obj).toBeFalse()
    expect(DB.c).toEqual(obj)
    expect(DB.d === DB.c).toBeFalse()
    expect(DB.d).toEqual(DB.c)

    DB.c.f = 'e'
    DB.d.e = 'f'

    expect(DB.c.f).toBe('e')
    expect(DB.d.e).toBe('f')
    expect(DB.c.e).toBeUndefined()
    expect(DB.d.f).toBeUndefined()

    expect(kcps).toHaveLength(4)
    expect(kcps[0]).toBe(',1,c,{"a":"b"}')
    expect(kcps[1]).toBe(',1,d,{"a":"b"}')
    expect(kcps[2]).toBe('c,1,f,"e"')
    expect(kcps[3]).toBe('d,1,e,"f"')
  })

  test('delete operator', () => {
    const obj = { a: 'b', e: 'f' }
    DB.c = obj

    delete DB.c.e

    expect(DB.c.a).toBe('b')
    expect(DB.c.e).toBeUndefined()

    expect(kcps).toHaveLength(2)
    expect(kcps[0]).toBe(',1,c,{"a":"b","e":"f"}')
    expect(kcps[1]).toBe('c,2,e')
  })

  test('delete nonexisting', () => {
    delete DB.x

    expect(DB.x).toBeUndefined()

    expect(kcps).toHaveLength(0)
  })

  test('undefined on nonexisting', () => {
    DB.c = undefined

    expect(DB.c).toBeUndefined()

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

  test.todo('nested string key read', () => {
    expect(DB['a.b.c']).toBeUndefined()
    DB.a.b.c = 5
    expect(DB['a.b.c']).toBe(5)
    expect(kcps).toHaveLength(1)
    expect(kcps[0]).toBe('a.b,1,c,5')
  })

  test.todo('nested string key write', () => {
    DB['a.b.c'] = 5
    expect(DB.a.b.c).toBe(5)
    const obj = { a: 'b' }
    DB['x.y.z'] = obj
    expect(DB.x.y.z === obj).toBeFalse()
    expect(DB.x.y.z).toEqual(obj)

    expect(kcps).toHaveLength(2)
    expect(kcps[0]).toBe('a.b,1,c,5')
    expect(kcps[1]).toBe('x.y,1,z,{"a":"b"}')
  })

  test('empty object as value', () => {
    DB.c = {}

    expect(DB.c).toBeUndefined()
    expect(kcps).toHaveLength(0)
  })

  test('empty array as value', () => {
    DB.c = []

    expect(Array.isArray(DB.c)).toBeTrue()
    expect(DB.c).toHaveLength(0)
    expect(kcps).toHaveLength(1)
    expect(kcps[0]).toBe(',1,c,[]')
  })

  test('object with empty array as value', () => {
    DB.c = {
      d: []
    }

    expect(Array.isArray(DB.c.d)).toBeTrue()
    expect(DB.c.d).toHaveLength(0)
    expect(kcps).toHaveLength(1)
    expect(kcps[0]).toBe(',1,c,{"d":[]}')
  })

  test('number as key', () => {
    expect(DB[0]).toBeUndefined()
    expect(kcps).toHaveLength(0)
  })

  test.todo('key sanitization', () => {
    // this is just an example, the are many more cases
    expect(() => DB['.']).toThrow()
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

    test('undefined', () => {
      DB.c = undefined

      expect(DB.c).toBeUndefined()

      expect(kcps).toHaveLength(0)
    })

    test('object', () => {
      const obj: any = { a: 1 }
      DB.c = obj

      expect(DB.c === obj).toBeFalse()
      expect(DB.c).toEqual(obj)
      obj.a = 'never'
      expect(DB.c).not.toEqual(obj)

      expect(kcps).toHaveLength(1)
      expect(kcps[0]).toBe(',1,c,{"a":1}')
    })

    test('nested object', () => {
      const obj: any = { a: 1, b: { x: 'y' } }
      DB.c = obj

      expect(DB.c === obj).toBeFalse()
      expect(DB.c.b === obj.b).toBeFalse()
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

      expect(DB.c === arr).toBeFalse()
      expect(DB.c).toEqual(arr)
      arr.pop()
      expect(DB.c).not.toEqual(arr)

      expect(kcps).toHaveLength(1)
      expect(kcps[0]).toBe(',1,c,[1,"b"]')
    })

    test('nested array', () => {
      const arr: any[] = [1, 'b', [2, 'a']]
      DB.c = arr

      expect(DB.c === arr).toBeFalse()
      expect(DB.c[2] === arr[2]).toBeFalse()
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

      expect(DB.c).toBeUndefined()

      expect(kcps).toHaveLength(0)
    })

    test.todo('symbol', () => {
      const sym = Symbol()
      DB.c = sym

      expect(DB.c).toBeUndefined()

      expect(kcps).toHaveLength(0)
    })

    test.todo('function', () => {
      // not the actual fnz functionality
      // just the acceptance of `set` with value of type 'function'
    })
  })
})