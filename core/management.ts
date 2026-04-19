import type { DataType, KCPHandle } from "./kcp";

export async function ensureData({ getter, setter }: Omit<KCPHandle, 'subber'>, key: string, value: DataType | undefined, overwriteExisting: boolean = true, removeExtras: boolean = false, __internal?: DataType | undefined): Promise<void> {
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
      await ensureData({ getter, setter }, key + '.' + k, (value as any)[k], overwriteExisting, removeExtras, (state as any)[k])
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