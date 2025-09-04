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
  constructor(add, remove = async () => {}, src = null) {
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
    while (await this.pop() !== null) {}
  }
}
// ../dynamics/src/Observable.ts
class Observable extends Listenable {
  defaultForceUpdate;
  _value;
  _preChangeFunc = null;
  constructor(initialValue, defaultForceUpdate = false, callOnSubscribe = true) {
    super(callOnSubscribe ? (listener) => listener(this._value, this._value) : null);
    this.defaultForceUpdate = defaultForceUpdate;
    this._value = initialValue;
  }
  get value() {
    return this._value;
  }
  set value(newValue) {
    this.set(newValue);
  }
  get() {
    return this._value;
  }
  trigger() {
    this.emit(this._value, this._value);
    return this;
  }
  set(newValue, forceUpdate = this.defaultForceUpdate) {
    if (this._preChangeFunc !== null)
      newValue = this._preChangeFunc(newValue, this._value);
    if (!forceUpdate && this._value === newValue)
      return;
    const oldValue = this._value;
    this._value = newValue;
    this.emit(this._value, oldValue);
  }
  setPreChangeFunc(preChangeFunc) {
    this._preChangeFunc = preChangeFunc;
    return this;
  }
  toString() {
    return this._value?.toString() || JSON.stringify(this._value);
  }
  toJSON() {
    return this._value;
  }
  fromJSON(json) {
    if (typeof json === "string")
      json = JSON.parse(json);
    this.set(json);
    return this;
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
      if (!insert) {} else if (index === 0) {} else if (index === this.data.length) {} else {}
    } else if (index === 0) {} else if (index === this.data.length) {} else {}
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
    while (this.pop() !== undefined) {}
  }
}
// kcp.ts
var Operators;
((Operators2) => {
  Operators2[Operators2["OVERWRITE"] = 0] = "OVERWRITE";
  Operators2[Operators2["SET"] = 1] = "SET";
  Operators2[Operators2["DELETE"] = 2] = "DELETE";
  Operators2[Operators2["PUSH"] = 3] = "PUSH";
  Operators2[Operators2["POP"] = 4] = "POP";
  Operators2[Operators2["SHIFT"] = 5] = "SHIFT";
  Operators2[Operators2["UNSHIFT"] = 6] = "UNSHIFT";
  Operators2[Operators2["INSERT"] = 7] = "INSERT";
  Operators2[Operators2["REMOVE"] = 8] = "REMOVE";
})(Operators ||= {});
function popPath(loc) {
  if (!loc.includes("."))
    return ["", loc];
  const index = loc.lastIndexOf(".");
  return [
    loc.slice(0, index),
    loc.slice(index + 1)
  ];
}
function toKcpProxy(sendKCP, data = {}, upperLoc = "", parent = null) {
  function navigateData(source, location) {
    let temp = source;
    const parts = location.split(".");
    let index = -1;
    for (const part of parts) {
      index++;
      if (typeof temp === "object" && temp !== null) {
        temp = Reflect.get(temp, part);
      } else
        return;
    }
    return temp;
  }
  const getLoc = () => parent ? parent.__loc + "." + upperLoc : upperLoc;
  function receivedKCP(command) {
    const i1 = command.indexOf(",");
    const i2 = command.indexOf(",", i1 + 1);
    const op = parseInt(i1 === -1 ? command : command.slice(0, i1));
    const getKey = () => command.slice(i1 + 1, i2 === -1 ? undefined : i2);
    console.log(`receivedKCP > com:"${command}" i1:${i1}, i2:${i2}, op:${Operators[op]}`);
    switch (op) {
      case 0 /* OVERWRITE */:
        const value = JSON.parse(command.slice(i1 + 1));
        for (const k in data)
          if (!(k in value))
            Reflect.deleteProperty(data, k);
        for (const k in value)
          setProp(k, value[k]);
        break;
      case 1 /* SET */:
        setProp(getKey(), JSON.parse(command.slice(i2 + 1)));
        break;
      case 2 /* DELETE */:
        Reflect.deleteProperty(data, getKey());
        break;
    }
  }
  const proxy = new Proxy(data, {
    get(_, key) {
      if (key === "__loc") {
        return getLoc();
      } else if (key === "__receiveKCP") {
        return receivedKCP;
      } else if (key === "toString") {
        return () => JSON.stringify(data);
      } else if (key === "toJSON") {
        return () => data;
      } else if (typeof key === "string" && key.includes(".")) {
        return navigateData(data, key);
      } else if (typeof key === "symbol") {
        return Reflect.get(data, key);
      } else {
        if (Reflect.has(data, key)) {
          return Reflect.get(data, key);
        } else {
          Reflect.set(data, key, toKcpProxy(sendKCP, {}, key, proxy));
          return data[key];
        }
      }
    },
    set(_, key, value) {
      if (key === "__kcp") {
        receivedKCP(value);
      } else if (key === "__loc" || key === "__receiveKCP" || key === "toString" || key === "toJSON") {
        return false;
      } else if (typeof key === "symbol") {
        Reflect.set(data, key, value);
      } else if (key.includes(".")) {
        const [p1, k] = popPath(key);
        const targetProxy = navigateData(data, p1);
        if (targetProxy === null || typeof targetProxy !== "object")
          return false;
        Reflect.set(targetProxy, k, value);
      } else {
        if (value !== undefined) {
          setProp(key, value);
          sendKCP(getLoc(), 1 /* SET */, key, JSON.stringify(value));
        } else {
          Reflect.deleteProperty(data, key);
          sendKCP(getLoc(), 2 /* DELETE */, key);
        }
      }
      return true;
    },
    deleteProperty(_, key) {
      if (typeof key === "symbol") {
        return Reflect.deleteProperty(data, key);
      } else if (key.includes(".")) {
        const [p1, k] = popPath(key);
        const proxy2 = navigateData(data, p1);
        if (proxy2 === null || typeof proxy2 !== "object")
          return false;
        return Reflect.deleteProperty(proxy2, k);
      } else if (key in data) {
        Reflect.deleteProperty(data, key);
        sendKCP(getLoc(), 2 /* DELETE */, key);
        return true;
      } else {
        return false;
      }
    }
  });
  function setProp(key, value) {
    if (key.includes(".")) {
      const [p1, k] = popPath(key);
      const targetProxy = navigateData(data, p1);
      if (typeof targetProxy === "object" && targetProxy !== null)
        return Reflect.set(targetProxy, k, value);
      return false;
    } else if (typeof value === "object" && value !== null) {
      if (Array.isArray(value)) {
        console.warn("Arrays are not yet supported!", getLoc() + "." + key, data);
        return false;
      } else {
        data[key] = toKcpProxy(sendKCP, value, key, proxy);
        return true;
      }
    } else if (data[key] !== value)
      data[key] = value;
  }
  for (const k in data)
    setProp(k, data[k]);
  return proxy;
}

class KcpLink {
  sender;
  obs;
  get root() {
    return this.obs.value;
  }
  set root(value) {}
  receiveKCP(command) {
    const eiLoc = command.indexOf(",");
    const loc = command.slice(0, eiLoc).split(".").slice(1);
    let temp = this.root;
    for (const part of loc)
      temp = temp[part];
    temp.__kcp = command.slice(eiLoc + 1);
    if (command.startsWith("," + 0 /* OVERWRITE */ + ","))
      this.obs.trigger();
  }
  sendKCP(...commandParts) {
    return this.sender(commandParts.join(","));
  }
  constructor(sender, init) {
    this.sender = sender;
    this.obs = new Observable(toKcpProxy(this.sendKCP.bind(this), init), false, init !== undefined);
  }
  toJSON() {
    this.root;
  }
  toString() {
    return JSON.stringify(this.root);
  }
}

class KcpWebSocketClient extends KcpLink {
  ws;
  constructor(webSocketPath = "/kisdb") {
    super((com) => this.ws.send(com));
    this.ws = new WebSocket(webSocketPath);
    this.ws.onmessage = ({ data: msg }) => {
      super.receiveKCP(msg);
    };
  }
  close() {
    return this.ws.close();
  }
}

// client.js
var serverStorage;
if (typeof window !== "undefined") {
  new KcpWebSocketClient("/kisdb").obs.on((root) => serverStorage = root);
}
