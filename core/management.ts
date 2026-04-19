import type { DataType, KCPHandle, StripFuncs } from "./kcp";

export async function ensureData<T extends Record<any, any>, K extends keyof T>({ getter, setter, subber }: KCPHandle<T>, _key: K, _value: StripFuncs<T[K]>, overwriteExisting: boolean = true, removeExtras: boolean = false, __internal?: DataType | undefined): Promise<void> {
  const key = _key as string
  const value = _value as DataType | undefined

  const state = __internal ?? await getter(key)
  if (value !== null && typeof value === 'object') {
    if (state === null || typeof state !== 'object') {
      await setter(key, value)
      return
    }

    if (removeExtras) {
      for (const k in state) {
        if (!(k in value) || (value as any)[k] === undefined) {
          await setter(key + '.' + k)
        }
      }
    }

    for (const k in value) {
      await ensureData({ getter, setter, subber }, key + '.' + k, (value as any)[k], overwriteExisting, removeExtras, (state as any)[k])
    }
  }
  else if (value !== state && (overwriteExisting || state === undefined)) {
    await setter(key, value)
  }
}

export async function getToken({ setter }: Omit<KCPHandle, 'getter' | 'subber'>, username: string, password: string, existingToken?: string): Promise<string> {
  if (existingToken) {
    const id = await setter('identify', existingToken) as number
    if (id > 0)
      return existingToken
  }

  return await setter('login', { username, password }) as string
}