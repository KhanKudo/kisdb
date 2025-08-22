export const enum Operators {
  SET,
  DELETE,
  PUSH,
  POP,
  SHIFT,
  UNSHIFT,
  INSERT,
  REMOVE
}

export class KcpLink {
  protected dyns: Map<string, KcpList> = new Map()

  received(command: string) {
    const eiLoc = command.indexOf(',')
    this.dyns.get(command.slice(0, eiLoc))?.receiveKCP(command.slice(eiLoc + 1))
  }

  send(...commandParts: (string | { toString(): string })[]) {
    return this.sender(commandParts.join(','))
  }

  constructor(private sender: (command: string) => void) {
  }
}

export class KcpWebSocketClient extends KcpLink {
  private ws: WebSocket

  constructor(webSocketPath: string = '/kisdb', loaded?: (root: KcpList) => void) {
    super((com) => this.ws.send(com))
    this.ws = new WebSocket(webSocketPath)
    this.ws.onmessage = ({ data: msg }) => {
      this.dyns.set('', new KcpList(this.send.bind(this, ''), msg))
      this.ws.onmessage = ({ data: msg }) => { super.received(msg) }
      loaded?.(this.dyns.get('')!)
    }
  }

  close() {
    return this.ws.close()
  }
}

import { List } from 'dynamics'

export class KcpList<T = unknown> extends List<T> {
  constructor(private sendKCP: (...commandParts: (string | { toString(): string })[]) => void, json?: string) {
    super(json)
  }

  receiveKCP(command: string): void {
    const i1 = command.indexOf(',')
    const i2 = command.indexOf(',', i1 + 1)
    const op = parseInt(i1 === -1 ? command : command.slice(0, i1))

    //@ts-ignore
    console.log(`receiveKCP > com:"${command}" i1:${i1}, i2:${i2}, op:${Operators[op]}`)

    switch (op) {
      case Operators.SET:
        super.set(parseInt(command.slice(i1 + 1, i2)), JSON.parse(command.slice(i2 + 1)))
        break
      case Operators.PUSH:
        super.push(JSON.parse(command.slice(i1 + 1)))
        break
      case Operators.POP:
        super.pop()
        break
      case Operators.UNSHIFT:
        super.unshift(JSON.parse(command.slice(i1 + 1)))
        break
      case Operators.SHIFT:
        super.shift()
        break
      case Operators.INSERT:
        super.insert(parseInt(command.slice(i1 + 1, i2)), JSON.parse(command.slice(i2 + 1)))
        break
      case Operators.REMOVE:
        super.remove(parseInt(command.slice(i1 + 1)))
        break
    }
  }

  override push(...values: T[]): void {
    super.push(...values)
    for (const value of values)
      this.sendKCP(Operators.PUSH, JSON.stringify(value))
  }

  override unshift(...values: T[]): void {
    super.unshift(...values)
    for (const value of values)
      this.sendKCP(Operators.UNSHIFT, JSON.stringify(value))
  }

  override pop(): T | undefined {
    const temp = super.pop()

    if (temp !== undefined)
      this.sendKCP(Operators.POP)

    return temp
  }

  override shift(): T | undefined {
    const temp = super.shift()

    if (temp !== undefined)
      this.sendKCP(Operators.SHIFT)

    return temp
  }

  override insert(index: number, value: T): void {
    super.insert(index, value)
    this.sendKCP(Operators.INSERT, index, JSON.stringify(value))
  }

  override set(index: number, value: T): void {
    super.set(index, value)
    this.sendKCP(Operators.SET, index, JSON.stringify(value))
  }

  override replace(oldValue: T, newValue: T): void {
    super.replace.call(this, oldValue, newValue)
  }

  override remove(index: number): T | undefined {
    const temp = super.remove(index)

    if (temp !== undefined)
      this.sendKCP(Operators.REMOVE, index)

    return temp
  }

  override delete(value: T): T | undefined {
    return super.delete.call(this, value)
  }

  override clear(): void {
    super.clear.call(this)
  }
}