import type { KCPRawHandle, KCPRawContext, KCPHandle } from "../core/kcp"

// KisDB Direct Client
export function createDirectClient<T>({ getter, setter, subber }: KCPRawHandle<T>, ctx: KCPRawContext): KCPHandle<T> {
  return {
    getter(key) {
      return getter(ctx, key)
    },
    setter(key, value) {
      return setter(ctx, key, value)
    },
    subber(key, listener, type) {
      return subber(ctx, key, listener, type)
    },
  }
}