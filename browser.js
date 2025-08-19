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
  ws.addEventListener("message", (msg) => {
    if (firstMsg) {
      serverStorage = toDeepProxy(JSON.parse(msg.data), {
        setListener(target, key, value, path, parent) {
          ws.send(JSON.stringify([key, value]));
        }
      });
      firstMsg = false;
      console.log("Connected!");
      return;
    }
    console.log("msg:", msg.data);
  });
}
