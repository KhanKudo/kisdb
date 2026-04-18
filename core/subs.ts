import { BiMap } from "../helpers/bimap"
import type { ListenerType, DataType, KCPHandle, SubType, ResultType } from "./kcp"

// client-side sub-helper
export class SubMux {
  protected subbers: BiMap<string, ListenerType> = new BiMap()
  private cache: Map<string, DataType | undefined> = new Map()

  protected awaitNow: Map<string, Set<ListenerType>> = new Map()
  protected awaitNext: Map<string, Set<ListenerType>> = new Map()

  private mySub: ListenerType

  get listener() {
    return this.mySub
  }

  getSubber(): KCPHandle['subber'] {
    return this.sub.bind(this)
  }

  static MISS = Symbol('cache miss')

  tryCache(key: string): DataType | undefined | Symbol {
    if (!this.cache.has(key))
      return SubMux.MISS

    return this.cache.get(key)
  }

  constructor(private subberFunc: KCPHandle['subber']) {
    this.mySub = (function (this: SubMux, value: DataType | undefined, key: string) {
      this.cache.set(key, value)

      let nowSubs = this.awaitNow.get(key)
      if (nowSubs) {
        this.awaitNow.delete(key)
        for (const sub of nowSubs) {
          try {
            sub(value, key)
          } catch (err) { console.error(err) }
        }
        return
      }

      let nextSubs = this.awaitNext.get(key)
      if (nextSubs) {
        this.awaitNext.delete(key)
        for (const sub of nextSubs) {
          try {
            sub(value, key)
          } catch (err) { console.error(err) }
        }

        if (!this.subbers.hasKey(key)) {
          this.cache.delete(key)
          return
        }
        // no return here
      }

      for (const sub of this.subbers.getValues(key) ?? []) {
        try {
          sub(value, key)
        } catch (err) { console.error(err) }
      }
    }).bind(this)
  }

  // calls provided subberFunc (or existing one) as if it's a new server, to set up all currently active subs again
  reconnect(newSubberFunc?: KCPHandle['subber']): void {
    if (newSubberFunc)
      this.subberFunc = newSubberFunc

    this.cache.clear()

    for (const key of this.subbers.keys())
      this.subberFunc(key, this.mySub, 'now+future') // assume something has changed during disconnect, so request now-event as a kind of missed future-event

    for (const key of this.awaitNext.keys())
      if (!this.subbers.hasKey(key))
        this.subberFunc(key, this.mySub, 'now+next') // assume something has changed during disconnect, this.awaitNow is still unchanged
  }

  async sub(key: string | null, listener: ListenerType, type: SubType): Promise<void> {
    if (key === null) {
      if (type !== 'never')
        throw new Error('type must be never, when key is null')

      this.unsub(listener)
      return
    }

    if (type === 'now+future' || type === 'now+next') {
      if (this.cache.has(key)) {
        try {
          listener(this.cache.get(key), key)
        } catch (err) { console.error(err) }
        type = type.slice(4) as 'next' | 'future'
      }
      else {
        let list = this.awaitNow.get(key)
        if (list)
          type = type.slice(4) as 'next' | 'future'
        else
          this.awaitNow.set(key, list = new Set())
        list.add(listener)
      }
    }

    switch (type) {
      case 'now+future':
      case 'future': {
        const list = this.awaitNext.get(key)
        if (list && list.delete(listener) && list.size === 0)
          this.awaitNext.delete(key)

        if (this.subbers.hasKey(key) && type !== 'now+future') {
          this.subbers.add(key, listener)
        } else {
          this.subbers.add(key, listener)
          this.subberFunc(key, this.mySub, type)
        }
        break
      }
      case 'now+next':
      case 'next': {
        const removedFuture = this.subbers.delete(key, listener)
        let list = this.awaitNext.get(key)
        if (list) {
          list.add(listener)
          if (removedFuture || type === 'now+next')
            this.subberFunc(key, this.mySub, type)
        } else {
          this.awaitNext.set(key, list = new Set())
          list.add(listener)
          if (removedFuture || !this.subbers.hasKey(key) || type === 'now+next')
            this.subberFunc(key, this.mySub, type)
        }
        break
      }
      case 'never': {
        // unregister now-listener, but keep now-list (even if empty) since mySub uses the list's existence as a flag for upcoming now-events
        this.awaitNow.get(key)?.delete(listener)

        const hasFuture = this.subbers.hasKey(key)
        const hasNext = this.awaitNext.get(key)

        if (!hasFuture && !hasNext)
          return

        // ASSUMES: a listener can never be both in future and next list
        const removedFuture = hasFuture && this.subbers.delete(key, listener)
        const removedNext = hasNext && hasNext.delete(listener) && hasNext.size === 0
        if (removedNext)
          this.awaitNext.delete(key)

        if (removedFuture) {
          if (hasNext) {
            this.subberFunc(key, this.mySub, 'next')
          }
          else {
            this.subberFunc(key, this.mySub, 'never')
            this.cache.delete(key)
          }
        }
        else if (removedNext) {
          if (hasFuture) {
            // do nothing
          }
          else {
            this.subberFunc(key, this.mySub, 'never')
            this.cache.delete(key)
          }
        }
        break
      }
    }
  }

  // clears all internal lists and unsubscribes host-listener from all assigned keys
  destroy(): void {
    this.subberFunc(null, this.mySub, 'never')
    this.cache.clear()
    this.awaitNow.clear()
    this.awaitNext.clear()
    this.subbers.clear()
  }

  // register for all future changes
  on(key: string, listener: ListenerType): void {
    this.sub(key, listener, 'future')
  }

  // register for the current state and all future changes
  onNow(key: string, listener: ListenerType): void {
    this.sub(key, listener, 'now+future')
  }

  // register for only the next change
  once(key: string, listener: ListenerType): void {
    this.sub(key, listener, 'next')
  }

  // register for the current state and only the next change
  onceNow(key: string, listener: ListenerType): void {
    this.sub(key, listener, 'now+next')
  }

  // unregister from given key
  off(key: string, listener: ListenerType): void {
    this.sub(key, listener, 'never')
  }

  // unregister listener from all keys
  unsub(listener: ListenerType): void {
    for (const key of this.subbers.getKeys(listener) ?? []) {
      this.sub(key, listener, 'never')
    }
  }
}

// server-side sub-service
export class SubService extends SubMux {
  constructor(private getter: KCPHandle['getter']) {
    super(async (key, listener, type) => {
      if (key === null)
        return

      switch (type) {
        case 'now+future':
        case 'now+next':
          listener(await getter(key) as DataType | undefined, key)
          break
        default:
          break
      }
    })
  }


  // checks all related keys and triggers them as needed
  // parents:
  //  undef: includes parents,self,children
  //  false: includes self,children
  //   true: includes parents
  setValue(key: string, value?: DataType, parents?: boolean) {
    // TODO: make it much more efficient
    if (parents !== false)
      this.getSubbed(key, true).forEach(async k => {
        this.listener(await this.getter(key) as DataType | undefined, k)
      })

    if (parents !== true)
      for (const k of this.getSubbed(key, false)) {
        if (k === key) {
          this.listener(value, k)
        } else {
          let tmp: any = value
          for (const t of k.slice(key.length + 2).split('.')) {
            tmp = tmp?.[t]
          }
          this.listener(tmp, k)
        }
      }
  }

  // same as setValue, only resolves value if listeners exist
  async setHeavyValue(key: string, valueGetter: () => ResultType, parents?: boolean) {
    if (!this.isSubbed(key))
      return

    this.setValue(key, await valueGetter() as DataType | undefined, parents)
  }

  // only strictly triggers specified key listeners (no parents or children)
  trigger(key: string, value?: DataType) {
    this.listener(value, key)
  }

  // only strictly triggers specified key listeners (no parents or children)
  async triggerHeavy(key: string, valueGetter: () => ResultType) {
    if (!this.isSubbed(key, null))
      return

    this.listener(await valueGetter() as DataType | undefined, key)
  }

  // get keys that are have listeners attached
  subbed(): Set<string> {
    return new Set(this.subbers.keys())
      .union(this.awaitNext)
  }

  // check whether the specified key is being listened for (includes parent paths)
  // parents:
  //  undef: includes parents,self,children
  //  false: includes self,children
  //   true: includes parents
  getSubbed(key: string, parents?: boolean): Set<string> {
    const subs = new Set<string>()
    if (parents !== false) {
      let k = key
      let i = 0
      while (i !== -1) {
        i = k.lastIndexOf('.')
        k = k.slice(0, Math.max(0, i))
        if (this.subbers.hasKey(k) || this.awaitNext.has(k))
          subs.add(k)
      }

      if (parents === true)
        return subs
    }

    if (this.subbers.hasKey(key) || this.awaitNext.has(key))
      subs.add(key)

    key += '.'

    for (const k of this.subbers.keys())
      if (k.startsWith(key))
        subs.add(k)

    for (const k of this.awaitNext.keys())
      if (k.startsWith(key))
        subs.add(k)

    return subs
  }

  // check whether the specified key is being listened for (includes parent paths)
  // children:
  //  undef: checks parent,self,children
  //  false: checks parent,self
  //   true: checks children
  //   null: checks self
  isSubbed(key: string, children?: boolean | null): boolean {
    if (children === null)
      return this.subbers.hasKey(key) || this.awaitNext.has(key)

    if (children !== true) {
      let i = 0
      while (true) {
        if (this.subbers.hasKey(key) || this.awaitNext.has(key))
          return true

        if (i === -1)
          break

        i = key.lastIndexOf('.')
        key = key.slice(0, Math.max(0, i))
      }
    }

    if (children === false)
      return false

    key += '.'

    for (const k of this.subbers.keys()) {
      if (k.startsWith(key))
        return true
    }

    for (const k of this.awaitNext.keys()) {
      if (k.startsWith(key))
        return true
    }

    return false
  }
}