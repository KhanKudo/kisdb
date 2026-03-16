export type DataType = string | number | boolean | null | { [key: string]: DataType } | DataType[]

export type SubType = 'future' | 'now+future' | 'next' | 'now+next' | 'never'

export type ReturnType<T> = T | Promise<T>

export interface KCPHandle {
  getter(key: string): ReturnType<DataType | void>
  setter(key: string, value?: DataType): ReturnType<void>
  subber(key: string, listener: KCPHandle['setter'], type: SubType): ReturnType<void>
  path?: string
}

export function isBadKey(key: string): boolean {
  return /[$%]|(?:\.(?:then|finally|catch|toString|toJSON)(?:\.|$))/.test(key)
}