import { describe, test, expect, beforeEach } from 'bun:test'
import { KcpLink } from '../kcp'

describe('arrays', () => {
  let KCL: KcpLink
  let DB: any[]
  const kcps: string[] = []
  beforeEach(() => {
    KCL = new KcpLink((com) => kcps.push(com), [])
    DB = KCL.root
    kcps.splice(0)
  })

  describe('set on empty', () => {
    test('[0]', () => {
      DB[0] = 5
      expect(DB).toEqual([5])

      expect(kcps).toHaveLength(1)
      expect(kcps[0]).toBe(',1,0,5')
    })

    test('[1]', () => {
      DB[1] = 5
      console.log(DB, JSON.stringify(DB))
      expect(DB).toEqual([null, 5])

      expect(kcps).toHaveLength(1)
      expect(kcps[0]).toBe(',1,1,5')
    })

    test('[-1]', () => {
      expect(() => {
        DB[-1] = 5
      }).toThrow()

      expect(kcps).toHaveLength(0)
    })

    test('[-99]', () => {
      expect(() => {
        DB[-99] = 5
      }).toThrow()

      expect(kcps).toHaveLength(0)
    })
  })

  describe('get', () => {
    beforeEach(() => {
      KCL = new KcpLink((com) => kcps.push(com), [1, 2, 3])
      DB = KCL.root
      kcps.splice(0)
    })

    test('[0]', () => {
      expect(DB[0]).toBe(1)

      expect(kcps).toHaveLength(0)
    })

    test('[1]', () => {
      expect(DB[1]).toBe(2)

      expect(kcps).toHaveLength(0)
    })

    test('[5]', () => {
      expect(DB[5]).toBeUndefined()

      expect(kcps).toHaveLength(0)
    })

    test('[-1]', () => {
      expect(DB[-1]).toBe(3)

      expect(kcps).toHaveLength(0)
    })

    test('[-2]', () => {
      expect(DB[-2]).toBe(2)

      expect(kcps).toHaveLength(0)
    })

    test('[-99]', () => {
      expect(DB[-99]).toBeUndefined()

      expect(kcps).toHaveLength(0)
    })
  })

  describe('set', () => {
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
      expect(DB).toEqual([1, 2, 3, null, null, 5])

      expect(kcps).toHaveLength(1)
      expect(kcps[0]).toBe(',1,5,5')
    })

    test('[-1]', () => {
      DB[-1] = 5
      expect(DB).toEqual([1, 2, 5])

      expect(kcps).toHaveLength(1)
      expect(kcps[0]).toBe(',1,2,5')
    })

    test('[-2]', () => {
      DB[-2] = 5
      expect(DB).toEqual([1, 5, 3])

      expect(kcps).toHaveLength(1)
      expect(kcps[0]).toBe(',1,1,5')
    })

    test('[-99]', () => {
      expect(() => {
        DB[-99] = 5
      }).toThrow()

      expect(kcps).toHaveLength(0)
    })

    test('[0] = undefined', () => {
      DB[0] = undefined
      expect(DB).toEqual([null, 2, 3])

      expect(kcps).toHaveLength(1)
      expect(kcps[0]).toBe(',1,0,null')
    })

    test('delete [1]', () => {
      delete DB[1]
      expect(DB).toEqual([1, null, 3])

      expect(kcps).toHaveLength(1)
      expect(kcps[0]).toBe(',2,1')
    })
  })

  describe('nested', () => {
    test('modify single nested', () => {
      DB[0] = [1, 2, 3]
      DB[0][1] = 4

      expect(DB).toEqual([[1, 4, 3]])

      expect(kcps).toHaveLength(2)
      expect(kcps[0]).toBe(',1,0,[1,2,3]')
      expect(kcps[1]).toBe('0,1,1,4')
    })

    test('modify double nested', () => {
      DB[0] = [[1, 2, 3]]
      DB[0][0][1] = 4

      expect(DB).toEqual([[[1, 4, 3]]])

      expect(kcps).toHaveLength(2)
      expect(kcps[0]).toBe(',1,0,[[1,2,3]]')
      expect(kcps[1]).toBe('0.0,1,1,4')
    })
  })

  test.todo('more array tests with different scenarios')

  describe('methods', () => {
    beforeEach(() => {
      KCL = new KcpLink((com) => kcps.push(com), [8, 0, 9])
      DB = KCL.root
      kcps.splice(0)
    })

    test('push', () => {
      let res = DB.push()
      expect(DB).toEqual([8, 0, 9])
      expect(res).toBe(3)

      res = DB.push(1, 2, 3)
      expect(DB).toEqual([8, 0, 9, 1, 2, 3])
      expect(res).toBe(6)

      expect(kcps).toHaveLength(1)
      expect(kcps[0]).toBe(',3,[1,2,3]')
    })

    test('unshift', () => {
      let res = DB.unshift()
      expect(DB).toEqual([8, 0, 9])
      expect(res).toBe(3)

      res = DB.unshift(1, 2, 3)
      expect(DB).toEqual([1, 2, 3, 8, 0, 9])
      expect(res).toBe(6)

      expect(kcps).toHaveLength(1)
      expect(kcps[0]).toBe(',4,[1,2,3]')
    })

    test('pop', () => {
      let res = DB.pop()
      expect(DB).toEqual([8, 0])
      expect(res).toBe(9)

      res = DB.pop()
      expect(DB).toEqual([8])
      expect(res).toBe(0)

      res = DB.pop()
      expect(DB).toEqual([])
      expect(res).toBe(8)

      res = DB.pop()
      expect(DB).toEqual([])
      expect(res).toBeUndefined()

      expect(kcps).toHaveLength(3)
      expect(kcps[0]).toBe(',5')
      expect(kcps[1]).toBe(',5')
      expect(kcps[2]).toBe(',5')
    })

    test('shift', () => {
      let res = DB.shift()
      expect(DB).toEqual([0, 9])
      expect(res).toBe(8)

      res = DB.shift()
      expect(DB).toEqual([9])
      expect(res).toBe(0)

      res = DB.shift()
      expect(DB).toEqual([])
      expect(res).toBe(9)

      res = DB.shift()
      expect(DB).toEqual([])
      expect(res).toBeUndefined()

      expect(kcps).toHaveLength(3)
      expect(kcps[0]).toBe(',6')
      expect(kcps[1]).toBe(',6')
      expect(kcps[2]).toBe(',6')
    })

    describe('splice', () => {
      test('no args', () => {
        //@ts-expect-error
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
        expect(kcps[0]).toBe(',7,2,1,[]')
      })

      test('remove from -3', () => {
        let res = DB.splice(-3)
        expect(DB).toEqual([])
        expect(res).toEqual([8, 0, 9])

        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',7,0,3,[]')
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
        expect(kcps[0]).toBe(',7,1,2,[]')
      })

      test('remove two from far negative', () => {
        let res = DB.splice(-99999, 2)
        expect(DB).toEqual([9])
        expect(res).toEqual([8, 0])

        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',7,0,2,[]')
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
        let res = DB.splice(1, 0)
        expect(DB).toEqual([8, 0, 9])
        expect(res).toEqual([])

        expect(kcps).toHaveLength(0)
      })

      test('replace one', () => {
        let res = DB.splice(1, 1, 1)
        expect(DB).toEqual([8, 1, 9])
        expect(res).toEqual([0])

        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',7,1,1,[1]')
      })

      test('replace one, insert one', () => {
        let res = DB.splice(1, 1, 1, 2)
        expect(DB).toEqual([8, 1, 2, 9])
        expect(res).toEqual([0])

        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',7,1,1,[1,2]')
      })

      test('insert two', () => {
        let res = DB.splice(2, 0, 1, 2)
        expect(DB).toEqual([8, 0, 1, 2, 9])
        expect(res).toEqual([])

        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',7,2,0,[1,2]')
      })

      test('replace one, remove one', () => {
        let res = DB.splice(1, 2, 1)
        expect(DB).toEqual([8, 1])
        expect(res).toEqual([0, 9])

        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',7,1,2,[1]')
      })

      test('insert at negative', () => {
        let res = DB.splice(-3, 0, 1, 2)
        expect(DB).toEqual([1, 2, 8, 0, 9])
        expect(res).toEqual([])

        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',7,0,0,[1,2]')
      })

      test('replace two at negative', () => {
        let res = DB.splice(-3, 2, 1, 2)
        expect(DB).toEqual([1, 2, 9])
        expect(res).toEqual([8, 0])

        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',7,0,2,[1,2]')
      })

      test('insert undefined', () => {
        let res = DB.splice(2, 0, 1, undefined, 2)
        expect(DB).toEqual([8, 0, 1, null, 2, 9])
        expect(res).toEqual([])

        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',7,2,0,[1,null,2]')
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
        expect(res === DB).toBeTrue()

        expect(kcps).toHaveLength(0)
      })

      test('single', () => {
        KCL = new KcpLink((com) => kcps.push(com), [1])
        DB = KCL.root
        kcps.splice(0)
        //--------------------
        const res = DB.reverse()
        expect(DB).toEqual([1])
        expect(res === DB).toBeTrue()

        expect(kcps).toHaveLength(0)
      })

      test('double', () => {
        KCL = new KcpLink((com) => kcps.push(com), [1, 2])
        DB = KCL.root
        kcps.splice(0)
        //--------------------
        const res = DB.reverse()
        expect(DB).toEqual([2, 1])
        expect(res === DB).toBeTrue()

        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',8')
      })

      test('odd', () => {
        KCL = new KcpLink((com) => kcps.push(com), [1, 2, 3])
        DB = KCL.root
        kcps.splice(0)
        //--------------------
        const res = DB.reverse()
        expect(DB).toEqual([3, 2, 1])
        expect(res === DB).toBeTrue()

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
        expect(res === DB).toBeTrue()

        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',8')
      })
    })

    describe('sort', () => {
      test('empty', () => {
        KCL = new KcpLink((com) => kcps.push(com), [])
        DB = KCL.root
        kcps.splice(0)
        //---------------
        DB.sort((a, b) => a - b)

        expect(kcps).toHaveLength(0)
      })

      test('no arg ascending', () => {
        KCL = new KcpLink((com) => kcps.push(com), [1, 2, 3, 4, 5])
        DB = KCL.root
        kcps.splice(0)
        //---------------
        DB.sort()
        expect(kcps).toHaveLength(0)
      })

      test('no arg descending', () => {
        KCL = new KcpLink((com) => kcps.push(com), [5, 4, 3, 2, 1])
        DB = KCL.root
        kcps.splice(0)
        //---------------
        DB.sort()
        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',9,[4,3,2,1,0]')
      })

      test('random', () => {
        KCL = new KcpLink((com) => kcps.push(com), [1, 2, 3, 4, 5])
        DB = KCL.root
        kcps.splice(0)
        //---------------
        let count = DB.length * 2
        DB.sort(() => {
          if (count === 0)
            return 0
          count--
          return Math.random() - .5
        })

        if (JSON.stringify(DB) === '[1,2,3,4,5]') {
          expect(kcps).toHaveLength(0)
        }
        else {
          expect(kcps).toHaveLength(1)
          expect(kcps[0]).toBe(`,9,[${DB.indexOf(1)},${DB.indexOf(2)},${DB.indexOf(3)},${DB.indexOf(4)},${DB.indexOf(5)}]`)
        }
      }, { repeats: 4 })

      test('objects', () => {
        KCL = new KcpLink((com) => kcps.push(com), [
          { x: 1 },
          { x: 2 },
          { x: 3 },
          { x: 4 },
          { x: 5 },
        ])
        DB = KCL.root
        kcps.splice(0)
        //---------------
        DB.sort((a, b) => b.x - a.x)
        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(`,9,[4,3,2,1,0]`)
      })
    })

    describe('length (resize)', () => {
      test('zero', () => {
        DB.length = 0
        expect(DB).toHaveLength(0)
        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',10,0')
      })

      test('unchanged', () => {
        expect(DB).toHaveLength(3)
        DB.length = 3
        expect(DB).toHaveLength(3)
        expect(kcps).toHaveLength(0)
      })

      test('shorter', () => {
        DB.length = 2
        expect(DB).toHaveLength(2)
        expect(DB[2]).toBeUndefined()
        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',10,2')
      })

      test('longer', () => {
        DB.length = 4
        expect(DB[3]).toBeNull()
        expect(DB).toHaveLength(4)
        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',10,4')
      })
    })

    describe('fill', () => {
      test('no arg', () => {
        //@ts-expect-error
        DB.fill()
        expect(DB).toEqual([null, null, null])
        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',11,0,3,')
      })

      test('zero', () => {
        DB.fill(0)
        expect(DB).toEqual([0, 0, 0])
        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',11,0,3,0')
      })

      test('empty', () => {
        DB.length = 0
        kcps.length = 0
        //---------------
        DB.fill(5)
        expect(DB).toEqual([])
        expect(kcps).toHaveLength(0)
      })

      // network optimization would hurt all performance much more
      // test.todo('unchanged', () => {
      //   DB.fill(0)
      //   kcps.length = 0
      //   //---------------
      //   DB.fill(0)
      //   expect(DB).toEqual([0, 0, 0])
      //   expect(kcps).toHaveLength(0)
      // })

      test('from 1', () => {
        DB.fill('x', 1)
        expect(DB).toEqual([8, 'x', 'x'])
        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',11,1,3,"x"')
      })

      test('from 0 to 1', () => {
        DB.fill('x', 0, 1)
        expect(DB).toEqual(['x', 0, 9])
        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',11,0,1,"x"')
      })

      test('from 1 to 1', () => {
        DB.fill('x', 1, 1)
        expect(DB).toEqual([8, 0, 9])
        expect(kcps).toHaveLength(0)
      })

      test('from 2 to 1', () => {
        DB.fill('x', 2, 1)
        expect(DB).toEqual([8, 0, 9])
        expect(kcps).toHaveLength(0)
      })

      test('negative', () => {
        DB.fill('x', -2, -1)
        expect(DB).toEqual([8, 'x', 9])
        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',11,1,2,"x"')
      })

      test('invalid negative', () => {
        DB.fill('x', -20, -10)
        expect(DB).toEqual([8, 0, 9])
        expect(kcps).toHaveLength(0)
      })

      test('far negative', () => {
        DB.fill('x', -20, 1)
        expect(DB).toEqual(['x', 0, 9])
        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',11,0,1,"x"')
      })

      test('invalid positive', () => {
        DB.fill('x', 10, 20)
        expect(DB).toEqual([8, 0, 9])
        expect(kcps).toHaveLength(0)
      })

      test('far positive', () => {
        DB.fill('x', 1, 20)
        expect(DB).toEqual([8, 'x', 'x'])
        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',11,1,3,"x"')
      })

      test('far negative and positive', () => {
        DB.fill('x', -20, 20)
        expect(DB).toEqual(['x', 'x', 'x'])
        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',11,0,3,"x"')
      })

      test('object', () => {
        DB.fill({ x: 1 })
        expect(DB).toEqual([{ x: 1 }, { x: 1 }, { x: 1 }])
        expect(DB[0] === DB[1]).toBeFalse()
        expect(DB[1] === DB[2]).toBeFalse()
        expect(DB[2] === DB[0]).toBeFalse()
        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',11,0,3,{"x":1}')
      })

      test('object modify', () => {
        DB.fill({ x: 1 })
        expect(DB).toEqual([{ x: 1 }, { x: 1 }, { x: 1 }])
        DB[0].x = 5
        DB[1].x = 4
        DB[2].x = 3
        expect(DB).toEqual([{ x: 5 }, { x: 4 }, { x: 3 }])
        expect(kcps).toHaveLength(4)
        expect(kcps[0]).toBe(',11,0,3,{"x":1}')
        expect(kcps[1]).toBe('0,1,x,5')
        expect(kcps[2]).toBe('1,1,x,4')
        expect(kcps[3]).toBe('2,1,x,3')
      })
    })

    describe.todo('copyWithin', () => {
      // target:
      // 0
      // 1
      // -1
      // -2
      // -10
      // 10
      // target > start
      //
      // start:
      // 0
      // 1
      // -1
      // -2
      // -10
      // 10
      //
      // end:
      // 0
      // 1
      // -1
      // -2
      // -10
      // 10
      // end < start
      // end = start

      test('no args', () => {
        //@ts-expect-error
        DB.copyWithin()

        expect(DB).toEqual([8, 0, 9])

        expect(kcps).toHaveLength(0)
      })

      // shows really odd behavior, will leave out of tests
      // test('no start', () => {
      //   //@ts-expect-error
      //   DB.copyWithin(0)

      //   expect(DB).toEqual([8, 0, 9])

      //   expect(kcps).toHaveLength(0)
      // })

      test('1 0 2', () => {
        DB.copyWithin(1, 0, 2)

        expect(DB).toEqual([8, 8, 0])

        expect(kcps).toHaveLength(1)
        expect(kcps[0]).toBe(',12,1,0,2')
      })

      test.todo('make more tests for copyWithin, once KCL doesn\'t crash')
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

    test('undefined', () => {
      DB[0] = undefined

      expect(DB[0]).toBeNull()

      expect(kcps).toHaveLength(1)
      expect(kcps[0]).toBe(',1,0,null')
    })

    test('object', () => {
      const obj: any = { a: 1 }
      DB[0] = obj

      expect(DB[0] === obj).toBeFalse()
      expect(DB[0]).toEqual(obj)
      obj.a = 'never'
      expect(DB[0]).not.toEqual(obj)

      expect(kcps).toHaveLength(1)
      expect(kcps[0]).toBe(',1,0,{"a":1}')
    })

    test('nested object', () => {
      const obj: any = { a: 1, b: { x: 'y' } }
      DB[0] = obj

      expect(DB[0] === obj).toBeFalse()
      expect(DB[0].b === obj.b).toBeFalse()
      expect(DB[0]).toEqual(obj)
      expect(DB[0].b).toEqual(obj.b)
      obj.a = 'never'
      obj.b.x = 'NEVER'
      expect(DB[0]).not.toEqual(obj)
      expect(DB[0].b).not.toEqual(obj.b)

      expect(kcps).toHaveLength(1)
      expect(kcps[0]).toBe(',1,0,{"a":1,"b":{"x":"y"}}')
    })

    test('array', () => {
      const arr: any[] = [1, 'b']
      DB[0] = arr

      expect(DB[0] === arr).toBeFalse()
      expect(DB[0]).toEqual(arr)
      arr.pop()
      expect(DB[0]).not.toEqual(arr)

      expect(kcps).toHaveLength(1)
      expect(kcps[0]).toBe(',1,0,[1,"b"]')
    })

    test('nested array', () => {
      const arr: any[] = [1, 'b', [2, 'a']]
      DB[0] = arr

      expect(DB[0] === arr).toBeFalse()
      expect(DB[0][2] === arr[2]).toBeFalse()
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

      expect(DB[0] === date).toBeFalse()
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