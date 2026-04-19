const risingFuncs: WeakMap<() => void, () => void> = new WeakMap()
export function risingEdge(listener: () => void): (value?: boolean) => void {
  let func = risingFuncs.get(listener)
  if (!func) {
    let lastValue: boolean | undefined
    func = (value?: boolean) => {
      if (value === true && lastValue === false)
        listener()
      lastValue = value
    }
    risingFuncs.set(listener, func)
  }
  return func
}

const fallingFuncs: WeakMap<() => void, () => void> = new WeakMap()
export function fallingEdge(listener: () => void): (value?: boolean) => void {
  let func = fallingFuncs.get(listener)
  if (!func) {
    let lastValue: boolean | undefined
    func = (value?: boolean) => {
      if (value === false && lastValue === true)
        listener()
      lastValue = value
    }
    fallingFuncs.set(listener, func)
  }
  return func
}

const changedFuncs: WeakMap<(value: any, lastValue: any) => void, (value: any) => void> = new WeakMap()
export function changed<T extends boolean | number | string | null | undefined>(listener: (value: T, lastValue: T) => void): (value: T) => void {
  let func = changedFuncs.get(listener)
  if (!func) {
    let lastValue: T
    let firstCall = true
    func = (value: T) => {
      if (firstCall) {
        firstCall = false
        lastValue = value
        return
      }
      if (value !== lastValue) {
        listener(value, lastValue)
        lastValue = value
      }
    }
    changedFuncs.set(listener, func)
  }
  return func
}