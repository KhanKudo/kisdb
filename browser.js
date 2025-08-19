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
  handleCreate(value) {
    setTimeout(() => this.onAdd.emit(value));
    console.log("create");
    return value;
  }
  handleDelete(value) {
    setTimeout(() => this.onRemove.emit(value));
    console.log("delete");
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
    for (const value of values)
      this.data.push(this.handleCreate(value));
  }
  unshift(...values) {
    for (const value of values)
      this.data.unshift(this.handleCreate(value));
  }
  pop() {
    if (!this.data.length)
      return null;
    return this.handleDelete(this.data.pop());
  }
  shift() {
    if (!this.data.length)
      return null;
    return this.handleDelete(this.data.shift());
  }
  insert(value, index) {
    index = this.forceIndex(index, true);
    if (index === this.data.length)
      this.push(this.handleCreate(value));
    else if (index === 0)
      this.unshift(this.handleCreate(value));
    else
      this.data.splice(index, 0, this.handleCreate(value));
  }
  set(index, newValue) {
    index = this.forceIndex(index);
    this.handleDelete(this.data[index]);
    this.data[index] = this.handleCreate(newValue);
  }
  replace(oldValue, newValue) {
    const index = this.indexOf(oldValue);
    if (index === -1)
      throw new Error(`Could not replace oldValue "${oldValue}" in collection with newValue "${newValue}", as the old value couldn't be found`);
    this.handleDelete(this.data[index]);
    this.data[index] = this.handleCreate(newValue);
  }
  remove(index) {
    const i = this.cleanIndex(index);
    if (i === null)
      return null;
    const value = this.data.splice(i, 1)?.[0];
    this.handleDelete(value);
    return value;
  }
  delete(value) {
    const index = this.indexOf(value);
    if (index === -1)
      return null;
    this.data.splice(index, 1);
    this.handleDelete(value);
    return value;
  }
  clear() {
    while (this.pop() !== null) {}
  }
}
// deepProxy.js
function toDeepProxy(object, { allowFreeze, key, parent, setListener, getListener, setter, getter }) {
  const options = {
    allowFreeze,
    key,
    parent,
    setListener,
    getListener,
    setter,
    getter
  };
  function getPath(deepProxy, key2) {
    let path = [];
    if (key2 !== undefined)
      path.push(key2);
    if (deepProxy.__key !== undefined)
      path.unshift(deepProxy.__key);
    let parent2 = deepProxy;
    while (parent2.__parent !== undefined) {
      parent2 = parent2.__parent;
      if (parent2.__key !== undefined)
        path.unshift(parent2.__key);
    }
    return path;
  }
  function getTopParent(deepProxy) {
    let parent2 = deepProxy;
    while (parent2.__parent !== undefined) {
      parent2 = parent2.__parent;
    }
    return parent2;
  }
  const deepProxyHandler = {
    get(target, key2, receiver) {
      if (key2 === "__parent" || key2 === "__key" || allowFreeze && (key2 === "__isFrozen" || key2 === "__frozenTarget" || key2 === "freeze" || key2 === "revert" || key2 === "commit" || key2 === "silentCommit")) {
        return this[key2];
      } else if (key2 === "__target") {
        return target;
      } else if (key2 === "__proxyHandler") {
        return deepProxyHandler;
      } else if (key2 === "__allowFreeze") {
        return allowFreeze;
      }
      let path = getPath(this, key2);
      let parent2 = getTopParent(this);
      if (this.__isFrozen) {
        if (typeof getter === "function") {
          return getter([{
            target,
            key: key2,
            path,
            topParent: parent2
          }]);
        } else {
          return target[key2];
        }
      } else if (typeof getter === "function") {
        if (allowFreeze)
          return getter([{
            target,
            key: key2,
            path,
            topParent: parent2
          }]);
        else
          return getter(target, key2, path, parent2);
      } else {
        if (typeof getListener === "function") {
          if (allowFreeze)
            getListener([{
              target,
              key: key2,
              path,
              topParent: parent2
            }]);
          else
            getListener(target, key2, path, parent2);
        }
        return target[key2];
      }
    },
    set(target, key2, value, receiver) {
      if (key2 === "__parent" || key2 === "__key") {
        this[key2] = value;
        return true;
      } else if (key2 === "__allowFreeze") {
        throw new Error("__allowFreeze may only be set at initial function call (options.allowFreeze parameter)");
      } else if (key2 === "__proxyHandler" || key2 === "__target" || allowFreeze && (key2 === "__isFrozen" || key2 === "__frozenTarget" || key2 === "freeze" || key2 === "revert" || key2 === "commit" || key2 === "silentCommit")) {
        throw new Error(`${key2} is a read-only property`);
      }
      let path = getPath(proxy, key2);
      let parent2 = getTopParent(proxy);
      if (this.__isFrozen) {
        if (value !== null && typeof value === "object" && Array.isArray(object)) {
          while (value.__target !== undefined) {
            value = value.__target;
          }
          let proxy2 = toDeepProxy(value, Object.assign({}, options, {
            key: key2,
            parent: receiver
          }));
          target[key2].freeze();
          if (typeof setter === "function") {
            setter([{
              target,
              key: key2,
              value: proxy2,
              path,
              topParent: parent2
            }]);
          } else {
            this.__frozenTarget[key2] = target[key2];
            target[key2] = proxy2;
          }
        } else {
          this.__frozenTarget[key2] = target[key2];
          target[key2] = value;
        }
      } else if (value !== null && typeof value === "object") {
        while (value.__target !== undefined) {
          value = value.__target;
        }
        let proxy2 = toDeepProxy(value, Object.assign({}, options, {
          key: key2,
          parent: receiver
        }));
        if (typeof setter === "function") {
          if (allowFreeze)
            return setter([{
              target,
              key: key2,
              value: proxy2,
              path,
              topParent: parent2
            }]);
          else
            return setter(target, key2, proxy2, path, parent2);
        } else {
          target[key2] = proxy2;
          if (typeof setListener === "function") {
            if (allowFreeze)
              return setListener([{
                target,
                key: key2,
                value: proxy2,
                path,
                topParent: parent2
              }]);
            else
              return setListener(target, key2, proxy2, path, parent2);
          }
        }
      } else {
        if (typeof setter === "function") {
          if (allowFreeze)
            return setter([{
              target,
              key: key2,
              value,
              path,
              topParent: parent2
            }]);
          else
            return setter(target, key2, value, path, parent2);
        } else {
          if (value === undefined) {
            delete target[key2];
          } else {
            target[key2] = value;
          }
          if (typeof setListener === "function") {
            if (allowFreeze)
              return setListener([{
                target,
                key: key2,
                value,
                path,
                topParent: parent2
              }]);
            else
              return setListener(target, key2, value, path, parent2);
          }
        }
      }
      return true;
    },
    __parent: parent,
    __key: key,
    __target: null,
    __proxyHandler: null,
    __isFrozen: false,
    __frozenTarget: undefined,
    __allowFreeze: null,
    freeze: () => {
      if (allowFreeze) {
        if (!deepProxyHandler.__isFrozen) {
          deepProxyHandler.__isFrozen = true;
          deepProxyHandler.__frozenTarget = {};
        } else {
          throw new Error("cannot freeze a deep proxy that is already frozen");
        }
      } else {
        throw new Error("cannot freeze the deep proxy, freezing is not allowed");
      }
    },
    revert: () => {
      if (deepProxyHandler.__isFrozen) {
        for (let entry of Object.entries(deepProxyHandler.__frozenTarget)) {
          if (entry[1] === undefined)
            delete object[entry[0]];
          else
            object[entry[0]] = entry[1];
        }
        deepProxyHandler.__frozenTarget = undefined;
        deepProxyHandler.__isFrozen = false;
      } else {
        throw new Error("cannot revert a deep proxy that is not frozen");
      }
    },
    commit: () => {
      if (deepProxyHandler.__isFrozen) {
        deepProxyHandler.silentCommit(true);
        if (typeof setListener === "function") {
          let path = getPath(proxy);
          let parent2 = getTopParent(proxy);
          let changes = [];
          for (let key2 of Object.keys(deepProxyHandler.__frozenTarget)) {
            changes.push({
              target: proxy.__target,
              key: key2,
              value: proxy.__target[key2],
              path: [...path, key2],
              topParent: parent2
            });
          }
          setListener(changes);
        }
        deepProxyHandler.__frozenTarget = undefined;
      } else {
        throw new Error("cannot commit a deep proxy that is not frozen");
      }
    },
    silentCommit: (keepFrozenTarget = false) => {
      if (deepProxyHandler.__isFrozen) {
        for (let key2 of Object.keys(deepProxyHandler.__frozenTarget)) {
          let child = object[key2];
          if (child !== null && typeof child === "object" && child.__allowFreeze && child.__isFrozen && typeof child.silentCommit === "function")
            child.silentCommit();
          if (child === undefined)
            delete object[key2];
        }
        if (!keepFrozenTarget)
          deepProxyHandler.__frozenTarget = undefined;
        deepProxyHandler.__isFrozen = false;
      } else {
        throw new Error("cannot silent commit a deep proxy that is not frozen");
      }
    }
  };
  let proxy;
  if (typeof object !== "object" || object === null)
    return proxy = new Proxy({}, deepProxyHandler);
  proxy = new Proxy(object, deepProxyHandler);
  for (let entry of Object.entries(object)) {
    let key2 = entry[0];
    let val = entry[1];
    if (typeof val === "object" && val !== null) {
      object[key2] = toDeepProxy(val, Object.assign({}, options, {
        key: key2,
        parent: proxy
      }));
    } else if (val === undefined) {
      delete object[key2];
    }
  }
  return proxy;
}
try {
  exports_deepProxy.toDeepProxy = toDeepProxy;
} catch (error) {}

// client.js
var serverStorage;
if (typeof window !== "undefined") {
  console.log("connecting websocket...");
  const ws = new WebSocket("/kisdb");
  ws.addEventListener("error", console.error);
  ws.addEventListener("open", console.log);
  let firstMsg = true;
  ws.addEventListener("message", ({ data: msg }) => {
    if (firstMsg) {
      serverStorage = new List(msg);
      serverStorage.onAdd.on((val) => ws.send(JSON.stringify(["insert", serverStorage.indexOf(val), val])));
      serverStorage.onRemove.on((val) => ws.send(JSON.stringify(["remove", serverStorage.indexOf(val), ""])));
      firstMsg = false;
      console.log("Connected!");
      return;
    }
    console.log("msg:", msg);
  });
}
