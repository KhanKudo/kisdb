export type DataType = string | number | boolean | null | { [key: string]: DataType } | DataType[]
export type ResultType = Promise<DataType | undefined | void>
export type CallerType = (ctx: KCPTrustedContext, arg?: DataType) => ResultType

export type ConnectionListener = (isActive: boolean, connection: number) => void

export type SubType = 'future' | 'now+future' | 'next' | 'now+next' | 'never'

export type ListenerType = (value: DataType | undefined, key: string) => void

export type EnsureFuncsCtx<T> =
  T extends (ctx: infer C, arg: infer A) => infer R
  ? (
    C extends KCPTrustedContext
    ? (
      A extends DataType | undefined
      ? (ctx: KCPTrustedContext, arg: A) => (R extends DataType | undefined | void ? R : never)
      : (ctx: KCPTrustedContext) => (R extends DataType | undefined | void ? R : never)
    )
    : (
      C extends DataType | undefined
      ? (ctx: KCPTrustedContext, arg: C) => (R extends DataType | undefined | void ? R : never)
      : (ctx: KCPTrustedContext) => (R extends DataType | undefined | void ? R : never)
    )
  )
  : T extends readonly (infer U)[]
  ? EnsureFuncsCtx<U>[]
  : T extends object
  ? {
    [K in keyof T]: EnsureFuncsCtx<T[K]>
  }
  : T;

export type StripFuncsCtx<T> =
  T extends (...args: any[]) => infer R
  ? (
    T extends (ctx: KCPTrustedContext, ...args: infer A) => any
    ? (...args: A) => R
    : T
  )
  : T extends readonly (infer U)[]
  ? StripFuncsCtx<U>[]
  : T extends object
  ? {
    [K in keyof T]: StripFuncsCtx<T[K]>
  }
  : T;

export type StripFuncs<T> =
  T extends (...args: any[]) => any
  ? never
  : T extends readonly (infer U)[]
  ? StripFuncs<U>[]
  : T extends object
  ? {
    // Key remapping: If the property is a function, map its key to 'never' (removes it).
    // Otherwise, keep the key 'K'.
    [K in keyof T as NonNullable<T[K]> extends (...args: any[]) => any ? never : K]: StripFuncs<T[K]>
  }
  : T;

export interface KCPHandle<T = any> {
  getter(key: string): ResultType
  setter(key: string, value?: DataType): ResultType
  subber(key: string | null, listener: ListenerType, type: SubType): Promise<void>
}
export interface KCPRawHandle<T = any> extends KCPCtxHandle<KCPRawContext> { }
export interface KCPTrustedHandle<T = any> extends KCPCtxHandle<KCPTrustedContext> { }

export interface KCPCtxHandle<T extends Record<string, any> = {}> {
  getter(ctx: T, key: string): ResultType
  setter(ctx: T, key: string, value?: DataType | CallerType): ResultType
  subber(ctx: T, key: string | null, listener: ListenerType, type: SubType): Promise<void>
}

export interface KCPRawContext {
  token: string
  connection: number
}

export interface KCPTrustedContext {
  identity: number
  connection: number
}

export function isBadKey(key: string): boolean {
  return /[$%]|(?:\.(?:then|finally|catch|toString|toJSON)(?:\.|$))/.test(key)
}

let connId = 1

export function getUniqueConnId(): number {
  return connId++
}

// TODO: handle potential security bug with subbers and function-values.
// Subber should be subbed to raw-db entry at the given key, never receive other's calling arguments or responses