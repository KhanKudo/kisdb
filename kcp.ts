export type DataType = string | number | boolean | null | { [key: string]: DataType } | DataType[]

export type SubType = 'future' | 'now+future' | 'next' | 'now+next' | 'never'

export type ReturnType<T> = T | Promise<T>

export interface KCPHandle {
  getter(key: string): ReturnType<DataType | void>
  setter(key: string, value?: DataType): ReturnType<void>
  subber(key: string | null, listener: KCPHandle['setter'], type: SubType): ReturnType<void>
  path?: string
}

export function isBadKey(key: string): boolean {
  return /[$%]|(?:\.(?:then|finally|catch|toString|toJSON)(?:\.|$))/.test(key)
}

export class BiMap<K = string, V = (...args: any[]) => any> {
  private kv: Map<K, Set<V>> = new Map()
  private vk: Map<V, Set<K>> = new Map()

  keys(): MapIterator<K> {
    return this.kv.keys()
  }

  values(): MapIterator<V> {
    return this.vk.keys()
  }

  hasKey(key: K): boolean {
    return this.kv.has(key)
  }
  hasValue(value: V): boolean {
    return this.vk.has(value)
  }

  getValues(key: K): Set<V> | undefined {
    return this.kv.get(key)
  }
  getKeys(value: V): Set<K> | undefined {
    return this.vk.get(value)
  }

  add(key: K, value: V): void {
    let vs = this.kv.get(key)
    if (!vs) {
      vs = new Set()
      this.kv.set(key, vs)
    }
    vs.add(value)

    let ks = this.vk.get(value)
    if (!ks) {
      ks = new Set()
      this.vk.set(value, ks)
    }
    ks.add(key)
  }

  delete(key: K, value: V): void {
    const vs = this.kv.get(key)
    if (vs?.delete(value) && vs.size === 0)
      this.kv.delete(key)

    const ks = this.vk.get(value)
    if (ks?.delete(key) && ks.size === 0)
      this.vk.delete(value)
  }

  deleteKey(key: K): void {
    const vs = this.kv.get(key)
    if (!vs)
      return

    this.kv.delete(key)
    let ks
    for (const v of vs) {
      ks = this.vk.get(v)
      if (ks?.delete(key) && ks.size === 0)
        this.vk.delete(v)
    }
  }

  deleteValue(value: V): void {
    const ks = this.vk.get(value)
    if (!ks)
      return

    this.vk.delete(value)
    let vs
    for (const k of ks) {
      vs = this.kv.get(k)
      if (vs?.delete(value) && vs.size === 0)
        this.kv.delete(k)
    }
  }

  //@ts-ignore
  callKeys(value: V, ...args: Parameters<K>): void {
    for (const k of this.vk.get(value) ?? []) {
      (k as any)(...args)
    }
  }
  //@ts-ignore
  callValues(key: K, ...args: Parameters<V>): void {
    for (const v of this.kv.get(key) ?? []) {
      (v as any)(...args)
    }
  }
}