import type { KCPRawHandle, KCPRawContext, KCPHandle, EnsureFuncsCtx } from "../core/kcp"

// KisDB Direct Client
export function createDirectClient<T>({ getter, setter, subber }: KCPRawHandle<T>, ctx: KCPRawContext): KCPHandle<EnsureFuncsCtx<T>> {
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