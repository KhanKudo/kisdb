import { describe, test, expect, beforeEach } from 'bun:test'
import { KcpLink } from '../kcp'

describe('arrays', () => {
  let KCL: KcpLink
  let DB: any
  let kcps: string[] = []
  beforeEach(() => {
    KCL = new KcpLink((com) => kcps.push(com), [])
    DB = KCL.root
    kcps.splice(0)
  })

  describe('set [...]', () => {
    test('[0]', () => {
      DB[0] = 5
      expect(DB).toEqual([5])

      expect(kcps).toHaveLength(1)
      expect(kcps[0]).toBe(',1,0,5')
    })

    test('[1]', () => {
      DB[1] = 5
      expect(DB).toEqual([undefined, 5])

      expect(kcps).toHaveLength(1)
      expect(kcps[0]).toBe(',1,1,5')
    })

    test('[-1]', () => {
      DB[-1] = 5
      expect(DB).toEqual([5])

      expect(kcps).toHaveLength(1)
      expect(kcps[0]).toBe(',1,0,5')
    })

    test('[-99]', () => {
      DB[-99] = 5
      expect(DB).toEqual([5])

      expect(kcps).toHaveLength(1)
      expect(kcps[0]).toBe(',1,0,5')
    })
  })

  describe('set [...] with values', () => {
    beforeEach(() => {
      KCL = new KcpLink((com) => kcps.push(com), [1, 2, 3])
      DB = KCL.root
      kcps.splice(0)
    })

    test('[0]', () => {
      DB[0] = 5
      expect(DB).toEqual([5, 2, 3])

      expect(kcps).toHaveLength(1)
      expect(kcps[0]).toBe(',1,0,5')
    })

    test('[1]', () => {
      DB[1] = 5
      expect(DB).toEqual([1, 5, 3])

      expect(kcps).toHaveLength(1)
      expect(kcps[0]).toBe(',1,1,5')
    })

    test('[5]', () => {
      DB[5] = 5
      expect(DB).toEqual([1, 2, 3, undefined, undefined, 5])

      expect(kcps).toHaveLength(1)
      expect(kcps[0]).toBe(',1,5,5')
    })

    test('[-1]', () => {
      DB[-1] = 5
      expect(DB).toEqual([1, 2, 5])

      expect(kcps).toHaveLength(1)
      expect(kcps[0]).toBe(',1,0,5')
    })

    test('[-2]', () => {
      DB[-2] = 5
      expect(DB).toEqual([1, 5, 3])

      expect(kcps).toHaveLength(1)
      expect(kcps[0]).toBe(',1,1,5')
    })

    test.todo('[-99]', () => {
      // not quite sure what the behaviour should be...
      DB[-99] = 5
      // expect(DB).toEqual([1, 5, 3])

      // expect(kcps).toHaveLength(1)
      // expect(kcps[0]).toBe(',1,1,5')
    })
  })

  describe('methods', () => {
    beforeEach(() => {
      KCL = new KcpLink((com) => kcps.push(com), [8, 0, 9])
      DB = KCL.root
      kcps.splice(0)
    })

    test('empty calls', () => {
      DB.push()
      DB.unshift()

      expect(kcps).toHaveLength(0)
    })

    test('push', () => {
      const res = DB.push(1, 2, 3)
      expect(DB).toEqual([8, 0, 9, 1, 2, 3])
      expect(res).toBe(6)

      expect(kcps).toHaveLength(1)
      expect(kcps[0]).toBe(',3,0,[1,2,3]')
    })

    test('unshift', () => {
      const res = DB.unshift(1, 2, 3)
      expect(DB).toEqual([3, 2, 1, 8, 0, 9])
      expect(res).toBe(6)

      expect(kcps).toHaveLength(1)
      expect(kcps[0]).toBe(',4,0,[1,2,3]')
    })

    test('pop', () => {
      const res = DB.pop()
      expect(DB).toEqual([8, 0])
      expect(res).toBe(9)

      expect(kcps).toHaveLength(1)
      expect(kcps[0]).toBe(',5')
    })

    test('shift', () => {
      const res = DB.shift()
      expect(DB).toEqual([0, 9])
      expect(res).toBe(8)

      expect(kcps).toHaveLength(1)
      expect(kcps[0]).toBe(',6')
    })

    describe('splice', () => {
      test('no args', () => {
        let res = DB.splice()
        expect(DB).toEqual([8, 0, 9])
        expect(res).toEqual([])

        expect(kcps).toHaveLength(0)
      })

      test('remove all', () => {
        let res = DB.splice(0)
        expect(DB).toEqual([])
        expect(res).toEqual([8, 0, 9])

        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',7,0,3,[]')
      })

      test('remove from 1', () => {
        let res = DB.splice(1)
        expect(DB).toEqual([8])
        expect(res).toEqual([0, 9])

        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',7,1,2,[]')
      })

      test('remove from last', () => {
        let res = DB.splice(2)
        expect(DB).toEqual([8, 0])
        expect(res).toEqual([9])

        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',7,2,1,[]')
      })

      test('remove after last', () => {
        let res = DB.splice(3)
        expect(DB).toEqual([8, 0, 9])
        expect(res).toEqual([])

        expect(kcps).toHaveLength(0)
      })

      test('remove far after last', () => {
        let res = DB.splice(99999999)
        expect(DB).toEqual([8, 0, 9])
        expect(res).toEqual([])

        expect(kcps).toHaveLength(0)
      })

      test('remove from -1', () => {
        let res = DB.splice(-1)
        expect(DB).toEqual([8, 0])
        expect(res).toEqual([9])

        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',7,-1,1,[]')
      })

      test('remove from -3', () => {
        let res = DB.splice(-3)
        expect(DB).toEqual([])
        expect(res).toEqual([8, 0, 9])

        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',7,-3,3,[]')
      })

      test('remove from far negative', () => {
        let res = DB.splice(-999999)
        expect(DB).toEqual([])
        expect(res).toEqual([8, 0, 9])

        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',7,0,3,[]')
      })

      test('remove single', () => {
        let res = DB.splice(1, 1)
        expect(DB).toEqual([8, 9])
        expect(res).toEqual([0])

        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',7,1,1,[]')
      })

      test('remove two', () => {
        let res = DB.splice(1, 2)
        expect(DB).toEqual([8])
        expect(res).toEqual([0, 9])

        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',7,1,2,[]')
      })

      test('remove two from negative', () => {
        let res = DB.splice(-2, 2)
        expect(DB).toEqual([8])
        expect(res).toEqual([0, 9])

        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',7,-2,2,[]')
      })

      test('remove two from far negative', () => {
        let res = DB.splice(-99999, 2)
        expect(DB).toEqual([9])
        expect(res).toEqual([8, 0])

        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',7,1,2,[]')
      })

      test('remove none', () => {
        let res = DB.splice(1, 0)
        expect(DB).toEqual([8, 0, 9])
        expect(res).toEqual([])

        expect(kcps).toHaveLength(0)
      })

      test('remove negative count', () => {
        let res = DB.splice(1, -2)
        expect(DB).toEqual([8, 0, 9])
        expect(res).toEqual([])

        expect(kcps).toHaveLength(0)
      })

      test('insert none', () => {
        let res = DB.splice(1, 0, [])
        expect(DB).toEqual([8, 0, 9])
        expect(res).toEqual([])

        expect(kcps).toHaveLength(0)
      })

      test('replace one', () => {
        let res = DB.splice(1, 1, [1])
        expect(DB).toEqual([8, 1, 9])
        expect(res).toEqual([1])

        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',7,1,1,[1]')
      })

      test('replace one, insert one', () => {
        let res = DB.splice(1, 1, [1, 2])
        expect(DB).toEqual([8, 1, 2, 9])
        expect(res).toEqual([1])

        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',7,1,1,[1,2]')
      })

      test('insert two', () => {
        let res = DB.splice(2, 0, [1, 2])
        expect(DB).toEqual([8, 0, 1, 2, 9])
        expect(res).toEqual([])

        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',7,2,0,[1,2]')
      })

      test('replace one, remove one', () => {
        let res = DB.splice(2, 2, [1])
        expect(DB).toEqual([8, 1])
        expect(res).toEqual([0, 9])

        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',7,2,2,[1]')
      })

      test('insert at negative', () => {
        let res = DB.splice(-3, 0, [1, 2])
        expect(DB).toEqual([1, 2, 8, 0, 9])
        expect(res).toEqual([])

        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',7,-3,0,[1,2]')
      })

      test('replace two at negative', () => {
        let res = DB.splice(-3, 2, [1, 2])
        expect(DB).toEqual([1, 2, 9])
        expect(res).toEqual([8, 0])

        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',7,-3,2,[1,2]')
      })
    })

    describe('reverse', () => {
      test('empty', () => {
        KCL = new KcpLink((com) => kcps.push(com), [])
        DB = KCL.root
        kcps.splice(0)
        //--------------------
        const res = DB.reverse()
        expect(DB).toEqual([])
        expect(res).toStrictEqual(DB)

        expect(kcps).toHaveLength(0)
      })

      test('single', () => {
        KCL = new KcpLink((com) => kcps.push(com), [1])
        DB = KCL.root
        kcps.splice(0)
        //--------------------
        const res = DB.reverse()
        expect(DB).toEqual([1])
        expect(res).toStrictEqual(DB)

        expect(kcps).toHaveLength(0)
      })

      test('odd', () => {
        KCL = new KcpLink((com) => kcps.push(com), [1, 2, 3])
        DB = KCL.root
        kcps.splice(0)
        //--------------------
        const res = DB.reverse()
        expect(DB).toEqual([3, 2, 1])
        expect(res).toStrictEqual(DB)

        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',8')
      })

      test('even', () => {
        KCL = new KcpLink((com) => kcps.push(com), [1, 2, 3, 4])
        DB = KCL.root
        kcps.splice(0)
        //--------------------
        const res = DB.reverse()
        expect(DB).toEqual([4, 3, 2, 1])
        expect(res).toStrictEqual(DB)

        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',8')
      })
    })
  })

  describe('value type compatibility', () => {
    test('bool', () => {
      DB[0] = false
      expect(DB[0]).toStrictEqual(false)
      DB[0] = true
      expect(DB[0]).toStrictEqual(true)

      expect(kcps).toHaveLength(2)
      expect(kcps[0]).toBe(',1,0,false')
      expect(kcps[1]).toBe(',1,0,true')
    })

    test('number', () => {
      DB[0] = 5
      expect(DB[0]).toStrictEqual(5)
      DB[0] = -5
      expect(DB[0]).toStrictEqual(-5)
      DB[0] = 0
      expect(DB[0]).toStrictEqual(0)

      expect(kcps).toHaveLength(3)
      expect(kcps[0]).toBe(',1,0,5')
      expect(kcps[1]).toBe(',1,0,-5')
      expect(kcps[2]).toBe(',1,0,0')
    })

    test('string', () => {
      DB[0] = ''
      expect(DB[0]).toStrictEqual('')
      DB[0] = '5'
      expect(DB[0]).toStrictEqual('5')
      DB[0] = 'null'
      expect(DB[0]).toStrictEqual('null')
      const str = '\\n_u-l\tl\n,\0${[!%#'
      DB[0] = str
      expect(DB[0]).toStrictEqual(str)

      expect(kcps).toHaveLength(4)
      expect(kcps[0]).toBe(',1,0,""')
      expect(kcps[1]).toBe(',1,0,"5"')
      expect(kcps[2]).toBe(',1,0,"null"')
      expect(kcps[3]).toBe(`,1,0,${JSON.stringify(str)}`)
    })

    test('null', () => {
      DB[0] = null

      expect(DB[0]).toBeNull()

      expect(kcps).toHaveLength(1)
      expect(kcps[0]).toBe(',1,0,null')
    })

    test.todo('undefined', () => {
      DB[0] = undefined

      expect(DB[0]).toBeEmptyObject()

      expect(kcps).toHaveLength(0)
    })

    test.todo('object', () => {
      const obj: any = { a: 1 }
      DB[0] = obj

      expect(DB[0]).not.toStrictEqual(obj)
      expect(DB[0]).toEqual(obj)
      obj.a = 'never'
      expect(DB[0]).not.toEqual(obj)

      expect(kcps).toHaveLength(1)
      expect(kcps[0]).toBe(',1,0,{"a":1}')
    })

    test.todo('nested object', () => {
      const obj: any = { a: 1, b: { x: 'y' } }
      DB[0] = obj

      expect(DB[0]).not.toStrictEqual(obj)
      expect(DB[0].b).not.toStrictEqual(obj.b)
      expect(DB[0]).toEqual(obj)
      expect(DB[0].b).toEqual(obj.b)
      obj.a = 'never'
      obj.b.x = 'NEVER'
      expect(DB[0]).not.toEqual(obj)
      expect(DB[0].b).not.toEqual(obj.b)

      expect(kcps).toHaveLength(1)
      expect(kcps[0]).toBe(',1,0,{"a":1,"b":{"x":"y"}}')
    })

    test.todo('array', () => {
      const arr: any[] = [1, 'b']
      DB[0] = arr

      expect(DB[0]).not.toStrictEqual(arr)
      expect(DB[0]).toEqual(arr)
      arr.pop()
      expect(DB[0]).not.toEqual(arr)

      expect(kcps).toHaveLength(1)
      expect(kcps[0]).toBe(',1,0,[1,"b"]')
    })

    test.todo('nested array', () => {
      const arr: any[] = [1, 'b', [2, 'a']]
      DB[0] = arr

      expect(DB[0]).not.toStrictEqual(arr)
      expect(DB[0][2]).not.toStrictEqual(arr[2])
      expect(DB[0]).toEqual(arr)
      expect(DB[0][2]).toEqual(arr[2])
      arr[2].pop()
      expect(DB[0]).not.toEqual(arr)
      expect(DB[0][2]).not.toEqual(arr[2])

      expect(kcps).toHaveLength(1)
      expect(kcps[0]).toBe(',1,0,[1,"b",[2,"a"]]')
    })

    test.todo('Date', () => {
      const date = new Date()
      DB[0] = date

      expect(DB[0]).not.toStrictEqual(date)
      expect(DB[0]).toBe(JSON.stringify(date))

      expect(kcps).toHaveLength(1)
      expect(kcps[0]).toBe(',1,0,' + JSON.stringify(date))
    })

    test.todo('constructor (Number)', () => {
      DB[0] = Number

      expect(DB[0]).toBeEmptyObject()

      expect(kcps).toHaveLength(0)
    })

    test.todo('symbol', () => {
      const sym = Symbol()
      DB[0] = sym

      expect(DB[0]).toBeEmptyObject()

      expect(kcps).toHaveLength(0)
    })

    test.todo('function', () => {
      // not the actual fnz functionality
      // just the acceptance of `set` with value of type 'function'
    })
  })
})