// kcp.ts
function isBadKey(key) {
  return /[$%]|(?:\.(?:then|finally|catch|toString|toJSON)(?:\.|$))/.test(key);
}
var proxyRefs = new Map;
function toKcpProxy({ path = "", getter, setter }) {
  if (proxyRefs.has(path))
    return proxyRefs.get(path);
  const func = function(...args) {
    console.log(`func called at path "${path}" with:`, ...args, ";");
    if (args.length === 0)
      return getter(path);
    else if (args.length === 1)
      return setter(path, args[0]);
    else
      throw new Error("multiple arguments are not yet supported!");
  };
  const toPath = (key) => path + "." + key;
  const proxy = new Proxy(func, {
    get(_, key) {
      if (typeof key !== "string")
        return;
      let tmp;
      switch (key) {
        case "then":
          try {
            tmp = getter(path);
            if (tmp instanceof Promise)
              return tmp.then.bind(tmp);
            else {
              const res = Promise.resolve(tmp);
              return res.then.bind(res);
            }
          } catch (err) {
            const res = Promise.reject(err);
            return res.then.bind(res);
          }
        case "catch":
          try {
            tmp = getter(path);
            if (tmp instanceof Promise)
              return tmp.catch.bind(tmp);
            else {
              const res = Promise.resolve(tmp);
              return res.catch.bind(res);
            }
          } catch (err) {
            const res = Promise.reject(err);
            return res.catch.bind(res);
          }
        case "finally":
          try {
            tmp = getter(path);
            if (tmp instanceof Promise)
              return tmp.finally.bind(tmp);
            else {
              const res = Promise.resolve(tmp);
              return res.finally.bind(res);
            }
          } catch (err) {
            const res = Promise.reject(err);
            return res.finally.bind(res);
          }
        default:
          if (isBadKey(key))
            throw new Error(`Invalid key requested: "${key}"!`);
          console.log(`get(${toPath(key)})`);
          return toKcpProxy({ path: toPath(key), getter, setter });
      }
    },
    set(_, key, value) {
      if (typeof key !== "string" || isBadKey(key))
        return false;
      console.log(`set(${toPath(key)}) =`, value);
      setter(toPath(key), value);
      return true;
    },
    deleteProperty(_, key) {
      if (typeof key !== "string" || isBadKey(key))
        return false;
      console.log(`delete(${toPath(key)})`);
      setter(toPath(key));
      return true;
    }
  });
  proxyRefs.set(path, proxy);
  return proxy;
}

// client/http.ts
function createHttpClient(apiPath = "/kisdb") {
  if (!apiPath.endsWith("/"))
    apiPath += "/";
  const toPath = (key) => apiPath + encodeURIComponent(key);
  return toKcpProxy({
    path: "",
    async getter(key) {
      const res = await fetch(toPath(key), { method: "GET" });
      if (res.status === 200)
        return res.json();
      else if (res.status === 204)
        return;
      throw new Error(`Got code ${res.status} from "${toPath(key)}" with error: ` + (await res.text() || res.statusText));
    },
    async setter(key, value) {
      const config = {
        method: "POST",
        body: JSON.stringify(value)
      };
      if (value === undefined) {
        config.method = "DELETE";
        delete config.body;
      }
      const res = await fetch(toPath(key), config);
      if (res.ok)
        return;
      throw new Error(`Got code ${res.status} from "${toPath(key)}" with error: ` + (await res.text() || res.statusText));
    }
  });
}

// client.js
window.DB = createHttpClient();
