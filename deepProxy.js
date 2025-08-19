// This file is originally from early 2021, from the home-page project
/**
 *
 * INFO: to "delete" properties, set them to undefined and the "delete" keyword will be used in the background, using the "delete" keyword will not get detected by the proxy
 * @param {object} object the target object to proxify
 * @param {{
 *   allowFreeze: boolean,
 *   key: string|number,
 *   parent: object,
 *   setListener: function({target: object, key: string|number, value: any, path: (string|number)[], parent: object}[])|function(object, string|number, any, (string|number)[], object): undefined,
 *   getListener: function({target: object, key: string|number, path: (string|number)[], parent: object}[])|function(object, string|number, (string|number)[], object): any,
 *   setter: function({target: object, key: string|number, value: any, path: (string|number)[], parent: object}[])|function(object, string|number, any, (string|number)[], object): undefined,
 *   getter: function({target: object, key: string|number, path: (string|number)[], parent: object}[])|function(object, string|number, (string|number)[], object): any
 * }} [options]
 * @param {boolean} [options.allowFreeze] if true allows you to use the freeze functionality, default: false
 * NOTE: if allowed, the setListener, getListener, setter and getter will get an object array with potentially multiple variable objects containing all the data of the individual variable
 * if not allowed, gets all the data of one single variable through the function arguments
 * @param {function({target: object, key: string|number, value: any, path: (string|number)[], parent: object}[])|function(object, string|number, any, (string|number)[], object): undefined} [options.setListener] parameters: target, key, value, path: Array, topParent: object
 * the listener should have no effect on the result, but just be notified when something happens to potentially do something unrelated
 * NOTE: setListener is only called if setter is undefined
 * @param {function({target: object, key: string|number, path: (string|number)[], parent: object}[])|function(object, string|number, (string|number)[], object): any} [options.getListener] parameters: target, key, path: Array, topParent: object
 * the listener should have no effect on the result, but just be notified when something happens to potentially do something unrelated
 * NOTE: getListener is only called if getter is undefined
 * @param {function({target: object, key: string|number, value: any, path: (string|number)[], parent: object}[])|function(object, string|number, any, (string|number)[], object): undefined} [options.setter] parameters: target, key, value, path: Array, topParent: object
 * NOTE: the proxy doesn't automatically set the target[key] to value (unless the setter is undefined), the setter needs to do that
 * @param {function({target: object, key: string|number, path: (string|number)[], parent: object}[])|function(object, string|number, (string|number)[], object): any} [options.getter] parameters: target, key, path: Array, topParent: object
 * NOTE: the proxy doesn't automatically return the target[key] value (unless the getter is undefined), the getter needs to do that
 * @returns {{__parent: object, __key: string|number, __target: object, __proxyHandler: object, __allowFreeze: boolean, ?__isFrozen: boolean, ?__frozenTarget: object, ?freeze: function(): undefined, ?revert: function(): undefined, ?commit: function(): undefined, ?silentCommit: function(): undefined}} deepProxy
 */
export function toDeepProxy(object, { allowFreeze, key, parent, setListener, getListener, setter, getter }) {
  // console.log('allowFreeze:', allowFreeze, 'key:', key, 'parent:', parent);
  const options = {
    'allowFreeze': allowFreeze,
    'key': key,
    'parent': parent,
    'setListener': setListener,
    'getListener': getListener,
    'setter': setter,
    'getter': getter,
  };
  function getPath(deepProxy, key) {
    let path = [];
    if (key !== undefined) path.push(key);
    if (deepProxy.__key !== undefined) path.unshift(deepProxy.__key);
    let parent = deepProxy;
    while (parent.__parent !== undefined) {
      parent = parent.__parent;
      if (parent.__key !== undefined) path.unshift(parent.__key);
    }
    return path;
  }
  function getTopParent(deepProxy) {
    let parent = deepProxy;
    while (parent.__parent !== undefined) {
      parent = parent.__parent;
    }
    return parent;
  }
  const deepProxyHandler = {
    get(target, key, receiver) {
      if (key === '__parent' || key === '__key' || (allowFreeze && (key === '__isFrozen' || key === '__frozenTarget' || key === 'freeze' || key === 'revert' || key === 'commit' || key === 'silentCommit'))) {
        return this[key];
      }
      else if (key === '__target') {
        return target;
      }
      else if (key === '__proxyHandler') {
        return deepProxyHandler;
      }
      else if (key === '__allowFreeze') {
        return allowFreeze;
      }

      // console.log('get', key);

      let path = getPath(this, key);
      let parent = getTopParent(this);

      if (this.__isFrozen) {
        if (typeof getter === 'function') {
          return getter([{
            'target': target,
            'key': key,
            'path': path,
            'topParent': parent
          }]);
        }
        else {
          return target[key];
        }
      }
      else if (typeof getter === 'function') {
        if (allowFreeze) return getter([{
          'target': target,
          'key': key,
          'path': path,
          'topParent': parent
        }]);
        else return getter(target, key, path, parent);
      }
      else {
        if (typeof getListener === 'function') {
          if (allowFreeze) getListener([{
            'target': target,
            'key': key,
            'path': path,
            'topParent': parent
          }]);
          else getListener(target, key, path, parent);
        }
        return target[key];
      }

    },
    set(target, key, value, receiver) {
      if (key === '__parent' || key === '__key') {
        this[key] = value;
        return true;
      }
      else if (key === '__allowFreeze') {
        throw new Error('__allowFreeze may only be set at initial function call (options.allowFreeze parameter)');
      }
      else if (key === '__proxyHandler' || key === '__target' || (allowFreeze && (key === '__isFrozen' || key === '__frozenTarget' || key === 'freeze' || key === 'revert' || key === 'commit' || key === 'silentCommit'))) {
        throw new Error(`${key} is a read-only property`);
      }

      // console.log('set', key, value);

      let path = getPath(proxy, key);
      let parent = getTopParent(proxy);

      if (this.__isFrozen) {
        if (value !== null && typeof value === 'object' && Array.isArray(object)) {
          while (value.__target !== undefined) {
            value = value.__target;
          }
          let proxy = toDeepProxy(value, Object.assign({}, options, {
            'key': key,
            'parent': receiver
          }));
          target[key].freeze();
          if (typeof setter === 'function') {
            setter([{
              'target': target,
              'key': key,
              'value': proxy,
              'path': path,
              'topParent': parent
            }]);
          }
          else {
            this.__frozenTarget[key] = target[key];
            target[key] = proxy;
          }
        }
        else {
          this.__frozenTarget[key] = target[key];
          target[key] = value;
        }
      }
      else if (value !== null && typeof value === 'object') {
        while (value.__target !== undefined) {
          value = value.__target;
        }
        let proxy = toDeepProxy(value, Object.assign({}, options, {
          'key': key,
          'parent': receiver
        }));

        if (typeof setter === 'function') {
          if (allowFreeze) return setter([{
            'target': target,
            'key': key,
            'value': proxy,
            'path': path,
            'topParent': parent
          }]);
          else return setter(target, key, proxy, path, parent);
        }
        else {
          target[key] = proxy;
          if (typeof setListener === 'function') {
            if (allowFreeze) return setListener([{
              'target': target,
              'key': key,
              'value': proxy,
              'path': path,
              'topParent': parent
            }]);
            else return setListener(target, key, proxy, path, parent);
          }
        }
      }
      else {
        if (typeof setter === 'function') {
          if (allowFreeze) return setter([{
            'target': target,
            'key': key,
            'value': value,
            'path': path,
            'topParent': parent
          }]);
          else return setter(target, key, value, path, parent);
        }
        else {
          if (value === undefined) {
            delete target[key];
          }
          else {
            target[key] = value;
          }
          if (typeof setListener === 'function') {
            if (allowFreeze) return setListener([{
              'target': target,
              'key': key,
              'value': value,
              'path': path,
              'topParent': parent
            }]);
            else return setListener(target, key, value, path, parent);
          }
        }
      }
      // return true needed because a set operation ("=") throws an error if return value is a conditional "false" (e.g. null, undefined, 0, false, ...)
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
        }
        else {
          throw new Error('cannot freeze a deep proxy that is already frozen');
        }
      }
      else {
        throw new Error('cannot freeze the deep proxy, freezing is not allowed');
      }
    },
    revert: () => {
      if (deepProxyHandler.__isFrozen) {
        for (let entry of Object.entries(deepProxyHandler.__frozenTarget)) {
          if (entry[1] === undefined) delete object[entry[0]]
          else object[entry[0]] = entry[1];
        }
        deepProxyHandler.__frozenTarget = undefined;
        deepProxyHandler.__isFrozen = false;
      }
      else {
        throw new Error('cannot revert a deep proxy that is not frozen');
      }
    },
    commit: () => {
      if (deepProxyHandler.__isFrozen) {
        deepProxyHandler.silentCommit(true);

        if (typeof setListener === 'function') {
          let path = getPath(proxy);
          let parent = getTopParent(proxy);

          let changes = [];
          for (let key of Object.keys(deepProxyHandler.__frozenTarget)) {
            changes.push({
              'target': proxy.__target,
              'key': key,
              'value': proxy.__target[key],
              'path': [...path, key],
              'topParent': parent
            });
          }

          setListener(changes);
        }

        deepProxyHandler.__frozenTarget = undefined;
      }
      else {
        throw new Error('cannot commit a deep proxy that is not frozen');
      }
    },
    // same as commit, except it doesn't call any of the listeners
    silentCommit: (keepFrozenTarget = false) => {
      if (deepProxyHandler.__isFrozen) {
        for (let key of Object.keys(deepProxyHandler.__frozenTarget)) {
          let child = object[key];
          if (child !== null && typeof child === 'object' && child.__allowFreeze && child.__isFrozen && typeof child.silentCommit === 'function') child.silentCommit();
          if (child === undefined) delete object[key]
        }
        if (!keepFrozenTarget) deepProxyHandler.__frozenTarget = undefined;
        deepProxyHandler.__isFrozen = false;
      }
      else {
        throw new Error('cannot silent commit a deep proxy that is not frozen');
      }
    }
  }
  let proxy;
  if (typeof object !== 'object' || object === null) return proxy = new Proxy({}, deepProxyHandler);
  proxy = new Proxy(object, deepProxyHandler);
  for (let entry of Object.entries(object)) {
    let key = entry[0];
    let val = entry[1];
    if (typeof val === 'object' && val !== null) {
      object[key] = toDeepProxy(val, Object.assign({}, options, {
        'key': key,
        'parent': proxy
      }));
    }
    else if (val === undefined) {
      delete object[key];
    }
  }
  return proxy;
}

try {
  module.exports.toDeepProxy = toDeepProxy;
} catch (error) { }