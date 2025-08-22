// ../dynamics/src/Listenable.ts
class Listenable {
  onSubscribeCallback;
  _listeners = new Set;
  constructor(onSubscribeCallback = null) {
    this.onSubscribeCallback = onSubscribeCallback;
  }
  map(mapper, onSubscribeCallback = null) {
    const mapped = new Listenable(onSubscribeCallback);
    this.on((...args) => mapped.emit(...mapper(args)));
    return mapped;
  }
  emit(...args) {
    this._listeners.forEach((func) => func(...args));
  }
  subscribe(listener) {
    this._listeners.add(listener);
    if (this.onSubscribeCallback !== null)
      this.onSubscribeCallback(listener);
    return listener;
  }
  unsubscribe(listener) {
    this._listeners.delete(listener);
    return listener;
  }
  on(listener) {
    return this.subscribe(listener);
  }
  off(listener) {
    return this.unsubscribe(listener);
  }
  addListener(listener) {
    return this.subscribe(listener);
  }
  removeListener(listener) {
    return this.unsubscribe(listener);
  }
}

// ../dynamics/src/Collection.ts
class Collection {
  add;
  remove;
  src;
  data = [];
  onAdd = new Listenable;
  onRemove = new Listenable;
  constructor(add, remove = async () => { }, src = null) {
    this.add = add;
    this.remove = remove;
    this.src = src;
    if (this.src instanceof Collection) {
      this.src.onAdd.addListener(([k, v]) => this.push(v));
      this.src.onRemove.addListener(async ([k, v]) => this.delete(v));
    }
  }
  async handleCreate(value) {
    const res = [value, await this.add(value)];
    setTimeout(() => this.onAdd.emit(res));
    return res;
  }
  async handleDelete(val) {
    await this.remove(...val);
    setTimeout(() => this.onRemove.emit(val));
  }
  get length() {
    return this.data.length;
  }
  toString() {
    return this.data.map(([k, v]) => v).join("");
  }
  indexOf(value) {
    return this.data.findIndex(([v]) => v === value);
  }
  get(indexOrKey) {
    let index;
    if (typeof indexOrKey === "number") {
      if (indexOrKey >= 0) {
        if (indexOrKey > this.data.length)
          return null;
        else
          index = indexOrKey;
      } else {
        if (indexOrKey < -this.data.length)
          return null;
        else
          index = this.data.length + indexOrKey;
      }
    } else {
      index = this.indexOf(indexOrKey);
      if (index === -1)
        return null;
    }
    return this.data.splice(index, 1)?.[0]?.[1] ?? null;
  }
  forEach(func) {
    let i = 0;
    for (const [k, v] of this.data) {
      func(v, k, i);
      i++;
    }
  }
  async forEachAsync(func) {
    let i = 0;
    for (const [k, v] of this.data) {
      await func(v, k, i);
      i++;
    }
  }
  filter(func) {
    return this.data.filter(([k, v], i) => func(v, k, i)).map(([k, v]) => v);
  }
  async filterAsync(func) {
    const res = [];
    let i = 0;
    for (const [k, v] of this.data) {
      if (await func(v, k, i))
        res.push(v);
      i++;
    }
    return res;
  }
  map(func) {
    return this.data.map(([k, v], i) => func(v, k, i));
  }
  async mapAsync(func) {
    const res = [];
    let i = 0;
    for (const [k, v] of this.data) {
      res.push(await func(v, k, i));
      i++;
    }
    return res;
  }
  async push(...values) {
    for (const value of values)
      this.data.push(await this.handleCreate(value));
  }
  async unshift(...values) {
    for (const value of values)
      this.data.unshift(await this.handleCreate(value));
  }
  async pop() {
    const temp = this.data.pop();
    if (!temp)
      return null;
    await this.handleDelete(temp);
    return temp[0];
  }
  async shift() {
    const temp = this.data.shift();
    if (!temp)
      return null;
    await this.handleDelete(temp);
    return temp[0];
  }
  async insert(value, indexOrKey, after = false) {
    let index;
    if (typeof indexOrKey === "number") {
      if (indexOrKey >= 0) {
        if (indexOrKey > this.data.length)
          throw new Error(`Could not insert value "${value}", provided index "${indexOrKey}" larger than array length ${this.data.length}`);
        else if (indexOrKey === this.data.length)
          return this.push(value);
        else if (indexOrKey === 0)
          return this.unshift(value);
        else
          index = indexOrKey;
      } else {
        if (indexOrKey < -this.data.length - 1)
          throw new Error(`Could not insert value "${value}", provided index "${indexOrKey}" 'larger' (numerically) than negative array length minus one ${-this.data.length - 1}`);
        else if (indexOrKey === -this.data.length - 1)
          return this.unshift(value);
        else if (indexOrKey === -1)
          return this.push(value);
        else {
          after = true;
          index = this.data.length + indexOrKey;
        }
      }
    } else {
      index = this.indexOf(indexOrKey);
      if (index === -1)
        throw new Error(`Could not insert value "${value}" into collection ${after ? "after" : "before"} key "${indexOrKey}", as the key couldn't be found`);
    }
    this.data.splice(index + Number(after), 0, await this.handleCreate(value));
  }
  async set(index, newValue) {
    if (index >= this.data.length) {
      throw new Error(`Could not replace newValue "${newValue}", provided index "${index}" larger than array length ${this.data.length}`);
    } else if (index < 0) {
      if (index < -this.data.length)
        throw new Error(`Could not replace newValue "${newValue}", provided index "${index}" 'larger' (numerically) than negative array length ${-this.data.length}`);
      else
        index = this.data.length + index;
    }
    await this.handleDelete(this.data[index]);
    this.data[index] = await this.handleCreate(newValue);
  }
  async replace(indexOrKey, newValue) {
    let index;
    if (typeof indexOrKey === "number") {
      if (indexOrKey >= 0) {
        if (indexOrKey > this.data.length)
          throw new Error(`Could not replace newValue "${newValue}", provided index "${indexOrKey}" larger than array length ${this.data.length}`);
        else
          index = indexOrKey;
      } else {
        if (indexOrKey < -this.data.length)
          throw new Error(`Could not replace newValue "${newValue}", provided index "${indexOrKey}" 'larger' (numerically) than negative array length ${-this.data.length}`);
        else
          index = this.data.length + indexOrKey;
      }
    } else {
      index = this.indexOf(indexOrKey);
      if (index === -1)
        throw new Error(`Could not replace newValue "${newValue}" in collection with key "${indexOrKey}", as the key couldn't be found`);
    }
    await this.handleDelete(this.data[index]);
    this.data[index] = await this.handleCreate(newValue);
  }
  async delete(indexOrKey) {
    let index;
    if (typeof indexOrKey === "number") {
      if (indexOrKey >= 0) {
        if (indexOrKey > this.data.length)
          throw new Error(`Could not delete value at index "${indexOrKey}" larger than array length ${this.data.length}`);
        else
          index = indexOrKey;
      } else {
        if (indexOrKey < -this.data.length)
          throw new Error(`Could not delete value at index "${indexOrKey}" 'larger' (numerically) than negative array length ${-this.data.length}`);
        else
          index = this.data.length + indexOrKey;
      }
    } else {
      index = this.indexOf(indexOrKey);
      if (index === -1)
        throw new Error(`Could not delete value "${indexOrKey}" in collection, as the value couldn't be found`);
    }
    const res = this.data.splice(index, 1)?.[0];
    if (res)
      await this.handleDelete(res);
    return res?.[0] ?? null;
  }
  async clear() {
    while (await this.pop() !== null) { }
  }
}
// ../dynamics/src/ObservableSet.ts
class ObservableSet extends Listenable {
  _value = new Set;
  constructor(callOnSubscribe = true) {
    super(callOnSubscribe ? (listener) => listener(this, Array.from(this._value.values()), []) : null);
  }
  *[Symbol.iterator]() {
    for (const element of this._value) {
      yield element;
    }
  }
  get [Symbol.toStringTag]() {
    return "ObservableSet";
  }
  add(...values) {
    values.forEach((val) => this._value.add(val));
    this.emit(this, values, []);
    return this;
  }
  clear() {
    const values = Array.from(this._value.values());
    this._value.clear();
    this.emit(this, [], values);
  }
  delete(...values) {
    const wasDeleted = !values.map((val) => this._value.delete(val)).includes(false);
    this.emit(this, [], values);
    return wasDeleted;
  }
  entries() {
    return this._value.entries();
  }
  forEach(callbackfn, thisArg) {
    this._value.forEach(callbackfn, thisArg);
  }
  has(value) {
    return this._value.has(value);
  }
  keys() {
    return this._value.keys();
  }
  get size() {
    return this._value.size;
  }
  values() {
    return this._value.values();
  }
  difference(other) {
    return this._value.difference(other);
  }
  intersection(other) {
    return this._value.intersection(other);
  }
  isDisjointFrom(other) {
    return this._value.isDisjointFrom(other);
  }
  isSubsetOf(other) {
    return this._value.isSubsetOf(other);
  }
  isSupersetOf(other) {
    return this._value.isSupersetOf(other);
  }
  symmetricDifference(other) {
    return this._value.symmetricDifference(other);
  }
  union(other) {
    return this._value.union(other);
  }
  toString() {
    return Array.from(this._value.values()).toString();
  }
  toJSON() {
    return Array.from(this._value.values());
  }
  fromJSON(json) {
    if (typeof json === "string")
      json = JSON.parse(json);
    const deleted = Array.from(this._value.values());
    this._value.clear();
    for (const value of json) {
      this._value.add(value);
    }
    this.emit(this, json, deleted);
    return this;
  }
}
// ../dynamics/src/List.ts
class List {
  data = [];
  onAdd = new Listenable;
  onRemove = new Listenable;
  src = null;
  constructor(srcOrJson) {
    if (srcOrJson instanceof List) {
      srcOrJson.onAdd.addListener((v) => this.push(v));
      srcOrJson.onRemove.addListener((v) => this.delete(v));
      this.src = srcOrJson;
    } else if (typeof srcOrJson === "string") {
      this.data.push(...JSON.parse(srcOrJson));
    }
  }
  _handleChange(index, value, insert = false) {
    if (value !== undefined) {
      if (!insert) { } else if (index === 0) { } else if (index === this.data.length) { } else { }
    } else if (index === 0) { } else if (index === this.data.length) { } else { }
    if (this._ignoreCallback) {
      this._ignoreCallback = false;
      console.log("update:", index, value, insert);
    } else {
      this.changeCallback?.(index, value, insert);
      console.log("change:", index, value, insert);
    }
    return value;
  }
  cleanIndex(rawIndex, allowOnEnds = false) {
    const compLen = this.data.length + (allowOnEnds ? 1 : 0);
    if (rawIndex >= compLen || rawIndex < -compLen)
      return null;
    if (rawIndex < 0) {
      return Math.max(0, this.data.length + rawIndex);
    }
    return rawIndex;
  }
  forceIndex(rawIndex, allowOnEnds = false) {
    const index = this.cleanIndex(rawIndex, allowOnEnds);
    if (index === null)
      throw new Error(`Provided index "${rawIndex}" is ${allowOnEnds ? "too far " : ""}outside of array bounds [${this.data.length}]`);
    return index;
  }
  [Symbol.iterator] = this.data[Symbol.iterator];
  get [Symbol.toStringTag]() {
    return "List";
  }
  get length() {
    return this.data.length;
  }
  toString() {
    return this.data.join(",");
  }
  toJSON() {
    return Array.from(this.data.values());
  }
  fromJSON(json) {
    if (typeof json === "string")
      json = JSON.parse(json);
    this.clear();
    this.push(...json);
    return this;
  }
  join(separator = ",") {
    return this.data.join(separator);
  }
  indexOf(value) {
    return this.data.findIndex((v) => v === value);
  }
  at(index) {
    const i = this.cleanIndex(index);
    if (i === null)
      return;
    return this.data[i];
  }
  forEach(func) {
    let i = 0;
    for (const v of this.data) {
      func(v, i);
      i++;
    }
  }
  async forEachAsync(func) {
    let i = 0;
    for (const v of this.data) {
      await func(v, i);
      i++;
    }
  }
  filter(func) {
    return this.data.filter((v, i) => func(v, i));
  }
  async filterAsync(func) {
    const res = [];
    let i = 0;
    for (const v of this.data) {
      if (await func(v, i))
        res.push(v);
      i++;
    }
    return res;
  }
  map(func) {
    return this.data.map((v, i) => func(v, i));
  }
  async mapAsync(func) {
    const res = [];
    let i = 0;
    for (const v of this.data) {
      res.push(await func(v, i));
      i++;
    }
    return res;
  }
  push(...values) {
    for (const value of values) {
      this.data.push(value);
      setTimeout(() => this.onAdd.emit(value));
    }
  }
  unshift(...values) {
    for (const value of values) {
      this.data.unshift(value);
      setTimeout(() => this.onAdd.emit(value));
    }
  }
  pop() {
    const temp = this.data.pop();
    if (temp !== undefined)
      setTimeout(() => this.onRemove.emit(temp));
    return temp;
  }
  shift() {
    const temp = this.data.shift();
    if (temp !== undefined)
      setTimeout(() => this.onRemove.emit(temp));
    return temp;
  }
  insert(index, value) {
    this.data.splice(this.forceIndex(index, true), 0, value);
    setTimeout(() => this.onAdd.emit(value));
  }
  set(index, value) {
    index = this.forceIndex(index);
    const temp = this.data[index];
    setTimeout(() => this.onRemove.emit(temp));
    this.data[index] = value;
    setTimeout(() => this.onAdd.emit(value));
  }
  replace(oldValue, newValue) {
    const index = this.indexOf(oldValue);
    if (index === -1)
      throw new Error(`Could not replace oldValue "${oldValue}" in collection with newValue "${newValue}", as the old value couldn't be found`);
    this.set(index, newValue);
  }
  remove(index) {
    const i = this.cleanIndex(index);
    if (i === null)
      return;
    const temp = this.data.splice(index, 1)[0];
    setTimeout(() => this.onRemove.emit(temp));
    return temp;
  }
  delete(value) {
    const index = this.indexOf(value);
    if (index === -1)
      return;
    return this.remove(index);
  }
  clear() {
    while (this.pop() !== undefined) { }
  }
}
// kcp.ts
var Operators;
((Operators2) => {
  Operators2[Operators2["SET"] = 0] = "SET";
  Operators2[Operators2["DELETE"] = 1] = "DELETE";
  Operators2[Operators2["PUSH"] = 2] = "PUSH";
  Operators2[Operators2["POP"] = 3] = "POP";
  Operators2[Operators2["SHIFT"] = 4] = "SHIFT";
  Operators2[Operators2["UNSHIFT"] = 5] = "UNSHIFT";
  Operators2[Operators2["INSERT"] = 6] = "INSERT";
  Operators2[Operators2["REMOVE"] = 7] = "REMOVE";
})(Operators ||= {});

class KcpLink {
  sender;
  dyns = new Map;
  received(command) {
    const eiLoc = command.indexOf(",");
    this.dyns.get(command.slice(0, eiLoc))?.receiveKCP(command.slice(eiLoc + 1));
  }
  send(...commandParts) {
    return this.sender(commandParts.join(","));
  }
  constructor(sender) {
    this.sender = sender;
  }
}

class KcpWebSocketClient extends KcpLink {
  ws;
  constructor(webSocketPath = "/kisdb", loaded) {
    super((com) => this.ws.send(com));
    this.ws = new WebSocket(webSocketPath);
    this.ws.onmessage = ({ data: msg }) => {
      this.dyns.set("", new KcpList(this.send.bind(this, ""), msg));
      this.ws.onmessage = ({ data: msg2 }) => {
        super.received(msg2);
      };
      loaded?.(this.dyns.get(""));
    };
  }
  close() {
    return this.ws.close();
  }
}

class KcpList extends List {
  sendKCP;
  constructor(sendKCP, json) {
    super(json);
    this.sendKCP = sendKCP;
  }
  receiveKCP(command) {
    const i1 = command.indexOf(",");
    const i2 = command.indexOf(",", i1 + 1);
    const op = parseInt(i1 === -1 ? command : command.slice(0, i1));
    //@ts-ignore
    console.log(`receiveKCP > com:"${command}" i1:${i1}, i2:${i2}, op:${Operators[op]}`);
    switch (op) {
      case 0 /* SET */:
        super.set(parseInt(command.slice(i1 + 1, i2)), JSON.parse(command.slice(i2 + 1)));
        break;
      case 2 /* PUSH */:
        super.push(JSON.parse(command.slice(i1 + 1)));
        break;
      case 3 /* POP */:
        super.pop();
        break;
      case 5 /* UNSHIFT */:
        super.unshift(JSON.parse(command.slice(i1 + 1)));
        break;
      case 4 /* SHIFT */:
        super.shift();
        break;
      case 6 /* INSERT */:
        super.insert(parseInt(command.slice(i1 + 1, i2)), JSON.parse(command.slice(i2 + 1)));
        break;
      case 7 /* REMOVE */:
        super.remove(parseInt(command.slice(i1 + 1)));
        break;
    }
  }
  push(...values) {
    super.push(...values);
    for (const value of values)
      this.sendKCP(2 /* PUSH */, JSON.stringify(value));
  }
  unshift(...values) {
    super.unshift(...values);
    for (const value of values)
      this.sendKCP(5 /* UNSHIFT */, JSON.stringify(value));
  }
  pop() {
    const temp = super.pop();
    if (temp !== undefined)
      this.sendKCP(3 /* POP */);
    return temp;
  }
  shift() {
    const temp = super.shift();
    if (temp !== undefined)
      this.sendKCP(4 /* SHIFT */);
    return temp;
  }
  insert(index, value) {
    super.insert(index, value);
    this.sendKCP(6 /* INSERT */, index, JSON.stringify(value));
  }
  set(index, value) {
    super.set(index, value);
    this.sendKCP(0 /* SET */, index, JSON.stringify(value));
  }
  replace(oldValue, newValue) {
    super.replace.call(this, oldValue, newValue);
  }
  remove(index) {
    const temp = super.remove(index);
    if (temp !== undefined)
      this.sendKCP(7 /* REMOVE */, index);
    return temp;
  }
  delete(value) {
    return super.delete.call(this, value);
  }
  clear() {
    super.clear.call(this);
  }
}

// client.js
var serverStorage;
if (typeof window !== "undefined") {
  new KcpWebSocketClient("/kisdb", (root) => serverStorage = root);
}
