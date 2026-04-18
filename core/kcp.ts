export type DataType = string | number | boolean | null | { [key: string]: DataType } | DataType[]
export type ResultType = Promise<DataType | undefined | void>
export type CallerType = (ctx: KCPTrustedContext, arg?: DataType) => ResultType

export type SubType = 'future' | 'now+future' | 'next' | 'now+next' | 'never'

export type ListenerType = (value: DataType | undefined, key: string) => void

export interface KCPHandle {
  getter(key: string): ResultType
  setter(key: string, value?: DataType): ResultType
  subber(key: string | null, listener: ListenerType, type: SubType): Promise<void>
}
export interface KCPRawHandle extends KCPCtxHandle<KCPRawContext> { }
export interface KCPTrustedHandle extends KCPCtxHandle<KCPTrustedContext> { }

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