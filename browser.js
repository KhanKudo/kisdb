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

// ../dynamics/src/CustomElement.ts
function handleClassArg(element, arg) {
  if (typeof arg === "string") {
    element.classList.add(arg);
  } else if (Array.isArray(arg)) {
    element.classList.add(...arg);
  } else if (arg instanceof Observable) {
    arg.subscribe((newValue, oldValue) => {
      element.classList.remove(oldValue);
      element.classList.add(newValue);
    });
  } else if (arg instanceof ObservableSet) {
    arg.subscribe((set, added, removed) => {
      element.classList.remove(...removed);
      element.classList.add(...set.values());
    });
  } else {
    Object.entries(arg).forEach(([key, value]) => {
      value.subscribe((state) => {
        if (state === element.classList.contains(key))
          return;
        if (state)
          element.classList.add(key);
        else
          element.classList.remove(key);
      });
    });
  }
}
function handleStyleArg(element, arg) {
  if (arg instanceof Observable) {
    arg.subscribe((styles) => {
      Object.assign(element.style, styles);
    });
  } else {
    Object.entries(arg).forEach(([key, value]) => {
      if (value instanceof Observable) {
        value.subscribe((val) => {
          element.style[key] = val;
        });
      } else {
        element.style[key] = value;
      }
    });
  }
}
function handleAttributesArg(element, arg) {
  if (typeof arg === "string") {
    element.setAttribute(arg, "");
  } else if (Array.isArray(arg)) {
    arg.forEach((val) => element.setAttribute(val, ""));
  } else if (arg instanceof Observable) {
    if (typeof arg.value === "string") {
      arg.subscribe((newValue, oldValue) => {
        element.removeAttribute(oldValue);
        element.setAttribute(newValue, "");
      });
    } else {
      let lastKeys = [];
      arg.subscribe((value) => {
        const keys = Object.keys(value);
        lastKeys.forEach((key) => {
          if (!keys.includes(key))
            element.removeAttribute(key);
        });
        Object.entries(value).forEach(([key, value2]) => {
          if (element.getAttribute(key) === value2)
            return;
          if (typeof value2 === "boolean") {
            if (value2 === true)
              element.setAttribute(key, "");
            else
              element.removeAttribute(key);
          } else
            element.setAttribute(key, value2);
        });
        lastKeys = keys;
      });
    }
  } else if (arg instanceof ObservableSet) {
    arg.subscribe((set, added, removed) => {
      removed.forEach((val) => element.removeAttribute(val));
      set.forEach((val) => element.setAttribute(val, ""));
    });
  } else {
    Object.entries(arg).forEach(([key, value]) => {
      if (typeof value === "boolean") {
        if (value === true)
          element.setAttribute(key, "");
        else
          element.removeAttribute(key);
      } else if (typeof value === "string") {
        element.setAttribute(key, value);
      } else if (value instanceof Observable) {
        if (typeof value.value === "boolean") {
          value.subscribe((newValue, oldValue) => {
            if (newValue === true)
              element.setAttribute(key, "");
            else
              element.removeAttribute(key);
          });
        } else {
          value.subscribe((newValue, oldValue) => {
            element.setAttribute(key, newValue);
          });
        }
      }
    });
  }
}
function handleValueArg(element, arg) {
  if (typeof arg === "string") {
    element.value = arg;
  } else if (typeof arg === "number") {
    element.valueAsNumber = arg;
  } else if (arg instanceof Observable) {
    if (typeof arg.value === "string") {
      arg.subscribe((newValue, oldValue) => {
        if (element.value !== newValue)
          element.value = newValue;
      });
      element.addEventListener("input", (e) => {
        arg.set(e.target.value);
      });
      element.addEventListener("change", (e) => {
        arg.set(e.target.value);
      });
    } else if (typeof arg.value === "number") {
      arg.subscribe((newValue, oldValue) => {
        if (element.valueAsNumber !== newValue)
          element.valueAsNumber = newValue;
      });
      element.addEventListener("input", (e) => {
        arg.set(e.target.valueAsNumber);
      });
      element.addEventListener("change", (e) => {
        arg.set(e.target.valueAsNumber);
      });
    }
  }
}
function handleTextArg(element, arg) {
  if (typeof arg === "string") {
    element.innerText = arg;
  } else if (arg instanceof Observable) {
    arg.subscribe((newValue, oldValue) => {
      if (element.innerText !== newValue)
        element.innerText = newValue;
    });
  }
}
function element(...args) {
  const tagName = args.find((arg) => typeof arg === "string");
  const element2 = document.createElement(tagName ?? "div");
  for (const arg of args) {
    if (typeof arg === "object") {
      Object.entries(arg).forEach(([key, value]) => {
        if (/id|type/.test(key))
          element2[key] = value;
      });
      if (arg.class !== undefined)
        handleClassArg(element2, arg.class);
      if (arg.style !== undefined)
        handleStyleArg(element2, arg.style);
      if (arg.attributes !== undefined)
        handleAttributesArg(element2, arg.attributes);
      if (arg.value !== undefined)
        handleValueArg(element2, arg.value);
      if (arg.innerText !== undefined)
        handleTextArg(element2, arg.innerText);
    }
  }
  return element2;
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
  Operators2[Operators2["UNSHIFT"] = 4] = "UNSHIFT";
  Operators2[Operators2["POP"] = 5] = "POP";
  Operators2[Operators2["SHIFT"] = 6] = "SHIFT";
  Operators2[Operators2["SPLICE"] = 7] = "SPLICE";
  Operators2[Operators2["REVERSE"] = 8] = "REVERSE";
  Operators2[Operators2["REORDER"] = 9] = "REORDER";
  Operators2[Operators2["RESIZE"] = 10] = "RESIZE";
  Operators2[Operators2["FILL"] = 11] = "FILL";
  Operators2[Operators2["COPY_WITHIN"] = 12] = "COPY_WITHIN";
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
function toKcpProxy(sendKCP, data = {}, upperLoc, parent) {
  function navigateProxy(location) {
    let temp = proxy;
    const parts = location.split(".");
    for (const part of parts) {
      if (typeof temp === "object" && temp !== null) {
        if (Array.isArray(temp) && !/^-?[0-9]+$/.test(part) && part !== "length")
          return;
        temp = Reflect.get(temp, part);
      } else
        return;
    }
    return temp;
  }
  function getLoc() {
    if (parent instanceof KcpLink)
      return upperLoc;
    else
      return parent.__loc + "." + (typeof upperLoc === "function" ? upperLoc(proxy) : upperLoc);
  }
  let noKCP = false;
  function receivedKCP(command) {
    const i1 = command.indexOf(",");
    const i2 = command.indexOf(",", i1 + 1);
    const op = parseInt(i1 === -1 ? command : command.slice(0, i1));
    const getKey = () => command.slice(i1 + 1, i2 === -1 ? undefined : i2);
    noKCP = true;
    switch (op) {
      case 0 /* OVERWRITE */:
        const value = JSON.parse(command.slice(i1 + 1));
        if (Array.isArray(data) === Array.isArray(value) && typeof data === "object" && data !== null && typeof value === "object" && value !== null) {
          if (Array.isArray(data)) {
            data.splice(0, data.length, ...prepForArray(value));
          } else if (typeof value === "object" && value !== null) {
            for (const k in data)
              if (!(k in value))
                Reflect.deleteProperty(data, k);
            for (const k in value)
              setProp(k, value[k]);
          }
          if (parent instanceof KcpLink)
            parent.obs.trigger();
        } else if (parent instanceof KcpLink) {
          if (typeof value === "object" && value !== null)
            parent.obs.set(toKcpProxy(sendKCP, value, upperLoc, parent), true);
          else
            parent.obs.set(value, true);
        } else {
          Reflect.set(Reflect.get(parent, "__DANGER_RAW_DATA"), typeof upperLoc === "function" ? upperLoc(proxy) : upperLoc, typeof value === "object" && value !== null ? toKcpProxy(sendKCP, value, upperLoc, parent) : value);
        }
        break;
      case 1 /* SET */:
        Reflect.set(proxy, getKey(), JSON.parse(command.slice(i2 + 1)));
        break;
      case 2 /* DELETE */:
        Reflect.deleteProperty(proxy, getKey());
        break;
      case 3 /* PUSH */:
        proxy.push(...JSON.parse(command.slice(i1 + 1)));
        break;
      case 4 /* UNSHIFT */:
        proxy.unshift(...JSON.parse(command.slice(i1 + 1)));
        break;
      case 5 /* POP */:
        proxy.pop();
        break;
      case 6 /* SHIFT */:
        proxy.shift();
        break;
      case 7 /* SPLICE */:
        proxy.splice(parseInt(command.slice(i1 + 1, i2)), parseInt(command.slice(i2 + 1)), ...JSON.parse(command.slice(command.indexOf(",", i2 + 1) + 1)));
        break;
      case 8 /* REVERSE */:
        proxy.reverse();
        break;
      case 9 /* REORDER */: {
        const orig = Array.from(data);
        const order = JSON.parse(command.slice(i1 + 1));
        order.forEach((newIndex, oldIndex) => data[newIndex] = orig[oldIndex]);
        if (listeners.size) {
          for (let i = 0;i < order.length; i++)
            if (i !== order[i])
              handleListener(i.toString(), data[order[i]]);
        }
        break;
      }
      case 10 /* RESIZE */:
        proxy.length = parseInt(command.slice(i1 + 1));
        break;
      case 11 /* FILL */:
        proxy.fill(JSON.parse(command.slice(command.indexOf(",", i2 + 1) + 1)), parseInt(command.slice(i1 + 1, i2)), parseInt(command.slice(i2 + 1)));
        break;
      case 12 /* COPY_WITHIN */:
        proxy.copyWithin(parseInt(command.slice(i1 + 1, i2)), parseInt(command.slice(i2 + 1)), parseInt(command.slice(command.indexOf(",", i2 + 1) + 1)));
        break;
    }
    noKCP = false;
  }
  const listeners = new Map;
  function handleListener(key, value) {
    if (!listeners.has(key))
      return;
    const res = listeners.get(key)?.(value);
    if (res === null)
      listeners.delete(key);
  }
  const isArray = Array.isArray(data);
  const arrayUpperLocFunc = (item) => {
    const index = data.indexOf(item);
    if (index === -1)
      throw new Error(`Item couldn't be located in parent array [${getLoc()}]! item: ${JSON.stringify(item)}`);
    return index.toString();
  };
  const proxy = new Proxy(data, {
    get(_, key) {
      if (key === "__loc") {
        return getLoc();
      } else if (key === "__DANGER_RAW_DATA") {
        return data;
      } else if (key === "__receiveKCP") {
        return receivedKCP;
      } else if (key === "toString") {
        if (isArray)
          return () => data.toString();
        else
          return () => JSON.stringify(data, (key2, value) => typeof value === "object" && value !== null && !Object.keys(value).length ? undefined : value);
      } else if (key === "toJSON") {
        if (isArray)
          return () => Array.from(data);
        else
          return () => Object.fromEntries(Object.entries(data).filter(([k, v]) => !(typeof v === "object" && v !== null && !Object.keys(v).length)));
      } else if (typeof key === "symbol") {
        return Reflect.get(data, key);
      } else if (key.includes(".")) {
        return navigateProxy(key);
      } else if (isArray) {
        if (/^-?[0-9]+$/.test(key)) {
          const index = key.startsWith("-") ? data.length + parseInt(key) : parseInt(key);
          if (!Number.isSafeInteger(index))
            throw new Error("Provided index is too large: " + index.toString());
          if (index < 0)
            return;
          else
            return data[index];
        } else if (key === "push") {
          return (...items) => {
            if (items.length === 0)
              return data.length;
            const temp = data.push(...prepForArray(items));
            if (noKCP)
              noKCP = false;
            else
              sendKCP(getLoc(), 3 /* PUSH */, JSON.stringify(items));
            if (listeners.size) {
              const imax = data.length + items.length;
              for (let i = data.length;i < imax; i++)
                handleListener(i.toString(), data[i]);
            }
            return temp;
          };
        } else if (key === "unshift") {
          return (...items) => {
            if (items.length === 0)
              return data.length;
            const temp = data.unshift(...prepForArray(items));
            if (noKCP)
              noKCP = false;
            else
              sendKCP(getLoc(), 4 /* UNSHIFT */, JSON.stringify(items));
            if (listeners.size)
              for (let i = data.length - 1;i >= 0; i--)
                handleListener(i.toString(), data[i]);
            return temp;
          };
        } else if (key === "pop") {
          return () => {
            if (data.length === 0)
              return;
            const temp = data.pop();
            if (noKCP)
              noKCP = false;
            else
              sendKCP(getLoc(), 5 /* POP */);
            if (listeners.size)
              handleListener(data.length.toString(), undefined);
            return temp;
          };
        } else if (key === "shift") {
          return () => {
            if (data.length === 0)
              return;
            const temp = data.shift();
            if (noKCP)
              noKCP = false;
            else
              sendKCP(getLoc(), 6 /* SHIFT */);
            if (listeners.size)
              for (let i = 0;i <= data.length; i++)
                handleListener(i.toString(), data[i]);
            return temp;
          };
        } else if (key === "reverse") {
          return () => {
            if (data.length < 2)
              return proxy;
            data.reverse();
            if (noKCP)
              noKCP = false;
            else
              sendKCP(getLoc(), 8 /* REVERSE */);
            if (listeners.size) {
              if (data.length % 2 === 0)
                for (let i = 0;i < data.length; i++)
                  handleListener(i.toString(), data[i]);
              else {
                const pivot = Math.ceil(data.length / 2);
                for (let i = 0;i < data.length; i++)
                  if (i !== pivot)
                    handleListener(i.toString(), data[i]);
              }
            }
            return proxy;
          };
        } else if (key === "splice") {
          return (startIndex, removeCount = 0, ...insertItems) => {
            if (!Number.isSafeInteger(startIndex))
              throw new Error("Provided startIndex is not an integer: " + startIndex.toString());
            if (!Number.isSafeInteger(removeCount))
              throw new Error("Provided removeCount is not an integer: " + removeCount.toString());
            startIndex = Math.min(data.length, Math.max(0, startIndex < 0 ? data.length + startIndex : startIndex));
            removeCount = Math.max(0, Math.min(removeCount, data.length - startIndex));
            const insertCount = insertItems.length;
            if (removeCount === 0 && insertCount === 0)
              return [];
            const temp = data.splice(startIndex, removeCount, ...prepForArray(insertItems));
            if (noKCP)
              noKCP = false;
            else
              sendKCP(getLoc(), 7 /* SPLICE */, startIndex, removeCount, JSON.stringify(insertItems));
            if (listeners.size) {
              const imax = insertCount === removeCount ? startIndex + removeCount : insertCount > removeCount ? data.length : data.length + removeCount - insertCount;
              for (let i = startIndex;i < imax; i++)
                handleListener(i.toString(), data[i]);
            }
            return temp;
          };
        } else if (key === "sort") {
          return (compareFn) => {
            const orig = Array.from(data);
            data.sort(compareFn);
            let changed = false;
            const order = orig.map((item, index) => {
              const i = data.indexOf(item);
              if (!changed && i !== index)
                changed = true;
              return i;
            });
            if (changed) {
              if (noKCP)
                noKCP = false;
              else
                sendKCP(getLoc(), 9 /* REORDER */, JSON.stringify(order));
              if (listeners.size) {
                for (let i = 0;i < order.length; i++)
                  if (i !== order[i])
                    handleListener(i.toString(), data[order[i]]);
              }
            }
            return proxy;
          };
        } else if (key === "fill") {
          return (value, start = 0, end = data.length) => {
            if (!Number.isSafeInteger(start))
              throw new Error("Provided start index is not an integer: " + start.toString());
            if (!Number.isSafeInteger(end))
              throw new Error("Provided end index is not an integer: " + end.toString());
            const si = Math.max(0, start < 0 ? data.length + start : start);
            const ei = Math.min(data.length, Math.max(0, end < 0 ? data.length + end : end));
            if (si >= ei || si >= data.length)
              return proxy;
            if (typeof value === "object" && value !== null) {
              for (let i = si;i < ei; i++) {
                data[i] = toKcpProxy(sendKCP, Array.isArray(value) ? Array.from(value) : Object.assign({}, value), arrayUpperLocFunc, proxy);
              }
            } else {
              data.fill(value, si, ei);
            }
            if (noKCP)
              noKCP = false;
            else
              sendKCP(getLoc(), 11 /* FILL */, si, ei, JSON.stringify(value));
            if (listeners.size)
              for (let i = si;i < ei; i++)
                handleListener(i.toString(), data[i]);
          };
        } else if (key === "copyWithin") {
          return (target, start, end = data.length) => {
            if (!Number.isSafeInteger(target))
              throw new Error("Provided target index is not an integer: " + start.toString());
            if (!Number.isSafeInteger(start))
              throw new Error("Provided start index is not an integer: " + start.toString());
            if (!Number.isSafeInteger(end))
              throw new Error("Provided end index is not an integer: " + end.toString());
            if (target >= data.length || start >= data.length)
              return proxy;
            const ti = Math.max(0, target < 0 ? data.length + target : target);
            const si = Math.max(0, start < 0 ? data.length + start : start);
            const ei = Math.min(data.length, si + (data.length - ti), Math.max(0, end < 0 ? data.length + end : end));
            if (ti === si || si >= ei)
              return proxy;
            for (let i = si;i < ei; i++) {
              data[ti - si + i] = toKcpProxy(sendKCP, typeof data[i] === "object" && data[i] !== null ? Array.isArray(data[i]) ? Array.from(data[i].__DANGER_RAW_DATA) : Object.assign(data[i].__DANGER_RAW_DATA) : data[i], arrayUpperLocFunc, proxy);
            }
            if (noKCP)
              noKCP = false;
            else
              sendKCP(getLoc(), 12 /* COPY_WITHIN */, ti, si, ei);
            if (listeners.size) {
              const imax = ti + ei - si;
              for (let i = ti;i < imax; i++)
                handleListener(i.toString(), data[i]);
            }
          };
        } else {
          return Reflect.get(data, key);
        }
      } else if (Reflect.has(data, key)) {
        return Reflect.get(data, key);
      } else {
        Reflect.set(data, key, toKcpProxy(sendKCP, {}, key, proxy));
        return data[key];
      }
    },
    set(_, key, value) {
      if (key === "__kcp") {
        receivedKCP(value);
      } else if (key === "__loc" || key === "__receiveKCP" || key === "toString" || key === "toJSON" || key === "__DANGER_RAW_DATA") {
        return false;
      } else if (typeof key === "symbol") {
        Reflect.set(data, key, value);
      } else if (key.includes(".")) {
        const [p1, k] = popPath(key);
        const targetProxy = navigateProxy(p1);
        if (targetProxy === null || typeof targetProxy !== "object")
          return false;
        Reflect.set(targetProxy, k, value);
      } else if (isArray) {
        if (key === "length") {
          if (typeof value !== "number" || value < 0 || !Number.isSafeInteger(value))
            throw new Error(`Invalid value passed for array.length, accepted is a positive integer, given was ${typeof value} "${value}"`);
          if (setProp(key, value)) {
            if (noKCP)
              noKCP = false;
            else
              sendKCP(getLoc(), 10 /* RESIZE */, value);
            if (listeners.size)
              handleListener(key, value);
          }
        } else if (/^-?[0-9]+$/.test(key)) {
          const index = key.startsWith("-") ? data.length + parseInt(key) : parseInt(key);
          if (!Number.isSafeInteger(index))
            throw new Error("Provided index is too large: " + index.toString());
          if (value !== undefined) {
            if (index < 0)
              return false;
            else if (setProp(index.toString(), value)) {
              if (noKCP)
                noKCP = false;
              else
                sendKCP(getLoc(), 1 /* SET */, index.toString(), JSON.stringify(value));
              if (listeners.size)
                handleListener(index.toString(), value);
            }
          } else if (index < data.length) {
            Reflect.deleteProperty(data, index);
            if (noKCP)
              noKCP = false;
            else
              sendKCP(getLoc(), 2 /* DELETE */, index.toString());
            if (listeners.size)
              handleListener(index.toString(), undefined);
          }
        } else
          return false;
      } else {
        if (value !== undefined) {
          if (setProp(key, typeof value === "object" && value !== null ? Array.isArray(value) ? Array.from(value) : Object.assign(value) : value)) {
            if (noKCP)
              noKCP = false;
            else
              sendKCP(getLoc(), 1 /* SET */, key, JSON.stringify(value));
            if (listeners.size)
              handleListener(key, value);
          }
        } else {
          Reflect.deleteProperty(data, key);
          if (noKCP)
            noKCP = false;
          else
            sendKCP(getLoc(), 2 /* DELETE */, key);
          handleListener(key, undefined);
        }
      }
      return true;
    },
    deleteProperty(_, key) {
      if (typeof key === "symbol") {
        return Reflect.deleteProperty(data, key);
      } else if (key.includes(".")) {
        const [p1, k] = popPath(key);
        const targetProxy = navigateProxy(p1);
        if (targetProxy === null || typeof targetProxy !== "object")
          return false;
        return Reflect.deleteProperty(targetProxy, k);
      } else if (isArray) {
        if (/^-?[0-9]+$/.test(key)) {
          const index = key.startsWith("-") ? data.length + parseInt(key) : parseInt(key);
          if (!Number.isSafeInteger(index))
            throw new Error("Provided index is too large: " + index.toString());
          if (index < 0)
            return false;
          else {
            delete data[index];
            if (noKCP)
              noKCP = false;
            else
              sendKCP(getLoc(), 2 /* DELETE */, index);
            handleListener(index.toString(), undefined);
            return true;
          }
        } else
          return false;
      } else if (key in data) {
        Reflect.deleteProperty(data, key);
        if (noKCP)
          noKCP = false;
        else
          sendKCP(getLoc(), 2 /* DELETE */, key);
        handleListener(key, undefined);
        return true;
      } else {
        return false;
      }
    }
  });
  function setProp(key, value) {
    if (key.includes(".")) {
      const [p1, k] = popPath(key);
      const targetProxy = navigateProxy(p1);
      if (typeof targetProxy === "object" && targetProxy !== null)
        return Reflect.set(targetProxy, k, value);
      return false;
    } else if (typeof value === "function" || value instanceof Observable) {
      listeners.set(key, typeof value === "function" ? value : value.set.bind(value));
      if (value instanceof Observable)
        value.set(Reflect.get(data, key));
      return false;
    } else if (typeof value === "object" && value !== null) {
      if (isArray || Array.isArray(value) || Object.keys(value).length) {
        Reflect.set(data, key, toKcpProxy(sendKCP, value, isArray ? arrayUpperLocFunc : key, proxy));
        return true;
      } else
        return false;
    } else if (Reflect.get(data, key) !== value) {
      Reflect.set(data, key, value);
      return true;
    } else {
      return false;
    }
  }
  function prepForArray(items) {
    for (const i in items) {
      if (items[i] !== null && typeof items[i] === "object")
        items[i] = toKcpProxy(sendKCP, items[i], arrayUpperLocFunc, proxy);
    }
    return items;
  }
  for (const k in data)
    setProp(k, Reflect.get(data, k));
  return proxy;
}

class KcpLink {
  sender;
  obs;
  get root() {
    return this.obs.value;
  }
  set root(value) {
    const com = `${0 /* OVERWRITE */},${JSON.stringify(value)}`;
    const root = this.root;
    if (typeof root === "object" && root !== null)
      root.__kcp = com;
    else if (typeof value === "object" && value !== null)
      this.obs.set(toKcpProxy(this.sendKCP.bind(this), value, "", this));
    else if (value !== undefined)
      this.obs.set(value);
    else
      throw new Error("Root object may not be set to undefined, use null instead.");
    this.sendKCP("", com);
  }
  receiveKCP(command) {
    const eiLoc = command.indexOf(",");
    const loc = command.slice(0, eiLoc).split(".").slice(1);
    let temp = this.root;
    console.log(`receivedKCP > loc:"${loc}", command:"${command}", op:"${Operators[parseInt(command.slice(eiLoc + 1, command.indexOf(",", eiLoc + 1)))]}"`);
    if (typeof temp === "object" && temp !== null) {
      for (const part of loc)
        temp = temp[part];
      temp.__kcp = command.slice(eiLoc + 1);
    } else if (command.startsWith(`,${0 /* OVERWRITE */},`)) {
      const value = JSON.parse(command.slice(command.indexOf(",", eiLoc + 1) + 1));
      if (typeof value === "object" && value !== null)
        this.obs.set(toKcpProxy(this.sendKCP.bind(this), value, "", this));
      else
        this.obs.set(value);
    } else
      throw new Error("Couldn't process received KCP as root is not an object, thus the only allowed command is a root-level overwrite, but instead received the above ^^^");
  }
  sendKCP(...commandParts) {
    return this.sender(commandParts.join(","));
  }
  constructor(sender, init) {
    this.sender = sender;
    this.obs = new Observable(typeof init === "object" && init !== null ? toKcpProxy(this.sendKCP.bind(this), init, "", this) : init, false, init !== undefined);
  }
  toJSON() {
    return this.root;
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
  wsc = new KcpWebSocketClient("/kisdb");
  wsc.obs.on((root) => {
    serverStorage = root;
    window.x.replaceWith(element("span", {
      innerText: root.name = new Observable
    }));
  });
}
var wsc;
