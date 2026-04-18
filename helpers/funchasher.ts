export class FuncHasher {
  private map: WeakMap<Function, string> = new WeakMap()
  private counter: number = 0

  hash(func: Function): string {
    let value = this.map.get(func)
    if (value)
      return value

    value = (++this.counter).toString(36)
    this.map.set(func, value)
    return value
  }
}