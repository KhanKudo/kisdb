export type DataType = string | number | boolean | null | { [key: string]: DataType } | DataType[]
export type ResultType = Promise<DataType | undefined | void>
export type CallerType = (ctx: KCPTrustedContext, arg?: DataType) => ResultType

export type SubType = 'future' | 'now+future' | 'next' | 'now+next' | 'never'

export type ListenerType = (value: DataType | undefined, key: string) => void

export interface KCPHandle {
  getter(key: string): ResultType
  setter(key: string, value?: DataType): ResultType
  subber(key: string | null, listener: ListenerType, type: SubType): Promise<void>
}
export interface KCPRawHandle extends KCPCtxHandle<KCPRawContext> { }
export interface KCPTrustedHandle extends KCPCtxHandle<KCPTrustedContext> { }

export interface KCPCtxHandle<T extends Record<string, any> = {}> {
  getter(ctx: T, key: string): ResultType
  setter(ctx: T, key: string, value?: DataType | CallerType): ResultType
  subber(ctx: T, key: string | null, listener: ListenerType, type: SubType): Promise<void>
}

export interface KCPRawContext {
  token: string
  connection: number
}

export interface KCPTrustedContext {
  identity: number
  connection: number
}

export function isBadKey(key: string): boolean {
  return /[$%]|(?:\.(?:then|finally|catch|toString|toJSON)(?:\.|$))/.test(key)
}

// TODO: handle potential security bug with subbers and function-values.
// Subber should be subbed to raw-db entry at the given key, never receive other's calling arguments or responses

//TODO: helper for client & server subber handling
// must support multiplexing of received data based on key-value and auto-call related listeners
// must support sub-types (e.g. once) and smartly accept a function to create and a function to destroy a key-subscription (helper must handle duplicate listeners, etc.)
// must return a function that is to be called by any received subscription events (will accept (key,value) arguments), the above mentioned ^^^ sub/unsub functions are global and won't take a listener, but use this one instead

// SubberService is a class intended for DBs
// SubberHelper (or similar) should be a function intended to aid clients and servers with handling subbers and their lifecycles as well as efficient multiplexing
// export class SubberService {
//   private subbers: BiMap<string, (value?: DataType) => ResultType> = new BiMap()

//   constructor(private getter: (key: string) => ResultType) {

//   }

//   add(listener: CallerType): void {

//   }

//   hasSub(key: string): boolean {
//     return this.subbers.hasKey(key)
//   }

//   trigger(key: string, value?: DataType): void {
//     return this.subbers.callValues(key, value)
//   }

//   triggerHeavy(key: string, getValue: () => undefined | DataType): void {
//     if (!this.subbers.hasKey(key))
//       return

//     return this.subbers.callValues(key, getValue())
//   }
// }

// client-side sub-helper
export class SubMux {
  protected subbers: BiMap<string, ListenerType> = new BiMap()
  private cache: Map<string, DataType | undefined> = new Map()

  protected awaitNow: Map<string, Set<ListenerType>> = new Map()
  protected awaitNext: Map<string, Set<ListenerType>> = new Map()

  private mySub: ListenerType

  get listener() {
    return this.mySub
  }

  getSubber(): KCPHandle['subber'] {
    return this.sub.bind(this)
  }

  static MISS = Symbol('cache miss')

  tryCache(key: string): DataType | undefined | Symbol {
    if (!this.cache.has(key))
      return SubMux.MISS

    return this.cache.get(key)
  }

  constructor(private subberFunc: KCPHandle['subber']) {
    this.mySub = (function (this: SubMux, value: DataType | undefined, key: string) {
      this.cache.set(key, value)

      let nowSubs = this.awaitNow.get(key)
      if (nowSubs) {
        this.awaitNow.delete(key)
        for (const sub of nowSubs) {
          try {
            sub(value, key)
          } catch (err) { console.error(err) }
        }
        return
      }

      let nextSubs = this.awaitNext.get(key)
      if (nextSubs) {
        this.awaitNext.delete(key)
        for (const sub of nextSubs) {
          try {
            sub(value, key)
          } catch (err) { console.error(err) }
        }

        if (!this.subbers.hasKey(key)) {
          this.cache.delete(key)
          return
        }
        // no return here
      }

      for (const sub of this.subbers.getValues(key) ?? []) {
        try {
          sub(value, key)
        } catch (err) { console.error(err) }
      }
    }).bind(this)
  }

  // calls provided subberFunc (or existing one) as if it's a new server, to set up all currently active subs again
  reconnect(newSubberFunc?: KCPHandle['subber']): void {
    if (newSubberFunc)
      this.subberFunc = newSubberFunc

    this.cache.clear()

    for (const key of this.subbers.keys())
      this.subberFunc(key, this.mySub, 'now+future') // assume something has changed during disconnect, so request now-event as a kind of missed future-event

    for (const key of this.awaitNext.keys())
      if (!this.subbers.hasKey(key))
        this.subberFunc(key, this.mySub, 'now+next') // assume something has changed during disconnect, this.awaitNow is still unchanged
  }

  async sub(key: string | null, listener: ListenerType, type: SubType): Promise<void> {
    if (key === null) {
      if (type !== 'never')
        throw new Error('type must be never, when key is null')

      this.unsub(listener)
      return
    }

    if (type === 'now+future' || type === 'now+next') {
      if (this.cache.has(key)) {
        try {
          listener(this.cache.get(key), key)
        } catch (err) { console.error(err) }
        type = type.slice(4) as 'next' | 'future'
      }
      else {
        let list = this.awaitNow.get(key)
        if (list)
          type = type.slice(4) as 'next' | 'future'
        else
          this.awaitNow.set(key, list = new Set())
        list.add(listener)
      }
    }

    switch (type) {
      case 'now+future':
      case 'future': {
        const list = this.awaitNext.get(key)
        if (list && list.delete(listener) && list.size === 0)
          this.awaitNext.delete(key)

        if (this.subbers.hasKey(key) && type !== 'now+future') {
          this.subbers.add(key, listener)
        } else {
          this.subbers.add(key, listener)
          this.subberFunc(key, this.mySub, type)
        }
        break
      }
      case 'now+next':
      case 'next': {
        const removedFuture = this.subbers.delete(key, listener)
        let list = this.awaitNext.get(key)
        if (list) {
          list.add(listener)
          if (removedFuture || type === 'now+next')
            this.subberFunc(key, this.mySub, type)
        } else {
          this.awaitNext.set(key, list = new Set())
          list.add(listener)
          if (removedFuture || !this.subbers.hasKey(key) || type === 'now+next')
            this.subberFunc(key, this.mySub, type)
        }
        break
      }
      case 'never': {
        // unregister now-listener, but keep now-list (even if empty) since mySub uses the list's existence as a flag for upcoming now-events
        this.awaitNow.get(key)?.delete(listener)

        const hasFuture = this.subbers.hasKey(key)
        const hasNext = this.awaitNext.get(key)

        if (!hasFuture && !hasNext)
          return

        // ASSUMES: a listener can never be both in future and next list
        const removedFuture = hasFuture && this.subbers.delete(key, listener)
        const removedNext = hasNext && hasNext.delete(listener) && hasNext.size === 0
        if (removedNext)
          this.awaitNext.delete(key)

        if (removedFuture) {
          if (hasNext) {
            this.subberFunc(key, this.mySub, 'next')
          }
          else {
            this.subberFunc(key, this.mySub, 'never')
            this.cache.delete(key)
          }
        }
        else if (removedNext) {
          if (hasFuture) {
            // do nothing
          }
          else {
            this.subberFunc(key, this.mySub, 'never')
            this.cache.delete(key)
          }
        }
        break
      }
    }
  }

  // clears all internal lists and unsubscribes host-listener from all assigned keys
  destroy(): void {
    this.subberFunc(null, this.mySub, 'never')
    this.cache.clear()
    this.awaitNow.clear()
    this.awaitNext.clear()
    this.subbers.clear()
  }

  // register for all future changes
  on(key: string, listener: ListenerType): void {
    this.sub(key, listener, 'future')
  }

  // register for the current state and all future changes
  onNow(key: string, listener: ListenerType): void {
    this.sub(key, listener, 'now+future')
  }

  // register for only the next change
  once(key: string, listener: ListenerType): void {
    this.sub(key, listener, 'next')
  }

  // register for the current state and only the next change
  onceNow(key: string, listener: ListenerType): void {
    this.sub(key, listener, 'now+next')
  }

  // unregister from given key
  off(key: string, listener: ListenerType): void {
    this.sub(key, listener, 'never')
  }

  // unregister listener from all keys
  unsub(listener: ListenerType): void {
    for (const key of this.subbers.getKeys(listener) ?? []) {
      this.sub(key, listener, 'never')
    }
  }
}

// server-side sub-service
export class SubService extends SubMux {
  constructor(private getter: KCPHandle['getter']) {
    super(async (key, listener, type) => {
      if (key === null)
        return

      switch (type) {
        case 'now+future':
        case 'now+next':
          listener(await getter(key) as DataType | undefined, key)
          break
        default:
          break
      }
    })
  }


  // checks all related keys and triggers them as needed
  // parents:
  //  undef: includes parents,self,children
  //  false: includes self,children
  //   true: includes parents
  setValue(key: string, value?: DataType, parents?: boolean) {
    // TODO: make it much more efficient
    if (parents !== false)
      this.getSubbed(key, true).forEach(async k => {
        this.listener(await this.getter(key) as DataType | undefined, k)
      })

    if (parents !== true)
      for (const k of this.getSubbed(key, false)) {
        if (k === key) {
          this.listener(value, k)
        } else {
          let tmp: any = value
          for (const t of k.slice(key.length + 2).split('.')) {
            tmp = tmp?.[t]
          }
          this.listener(tmp, k)
        }
      }
  }

  // same as setValue, only resolves value if listeners exist
  async setHeavyValue(key: string, valueGetter: () => ResultType, parents?: boolean) {
    if (!this.isSubbed(key))
      return

    this.setValue(key, await valueGetter() as DataType | undefined, parents)
  }

  // only strictly triggers specified key listeners (no parents or children)
  trigger(key: string, value?: DataType) {
    this.listener(value, key)
  }

  // only strictly triggers specified key listeners (no parents or children)
  async triggerHeavy(key: string, valueGetter: () => ResultType) {
    if (!this.isSubbed(key, null))
      return

    this.listener(await valueGetter() as DataType | undefined, key)
  }

  // get keys that are have listeners attached
  subbed(): Set<string> {
    return new Set(this.subbers.keys())
      .union(this.awaitNext)
  }

  // check whether the specified key is being listened for (includes parent paths)
  // parents:
  //  undef: includes parents,self,children
  //  false: includes self,children
  //   true: includes parents
  getSubbed(key: string, parents?: boolean): Set<string> {
    const subs = new Set<string>()
    if (parents !== false) {
      let k = key
      let i = 0
      while (i !== -1) {
        i = k.lastIndexOf('.')
        k = k.slice(0, Math.max(0, i))
        if (this.subbers.hasKey(k) || this.awaitNext.has(k))
          subs.add(k)
      }

      if (parents === true)
        return subs
    }

    if (this.subbers.hasKey(key) || this.awaitNext.has(key))
      subs.add(key)

    key += '.'

    for (const k of this.subbers.keys())
      if (k.startsWith(key))
        subs.add(k)

    for (const k of this.awaitNext.keys())
      if (k.startsWith(key))
        subs.add(k)

    return subs
  }

  // check whether the specified key is being listened for (includes parent paths)
  // children:
  //  undef: checks parent,self,children
  //  false: checks parent,self
  //   true: checks children
  //   null: checks self
  isSubbed(key: string, children?: boolean | null): boolean {
    if (children === null)
      return this.subbers.hasKey(key) || this.awaitNext.has(key)

    if (children !== true) {
      let i = 0
      while (true) {
        if (this.subbers.hasKey(key) || this.awaitNext.has(key))
          return true

        if (i === -1)
          break

        i = key.lastIndexOf('.')
        key = key.slice(0, Math.max(0, i))
      }
    }

    if (children === false)
      return false

    key += '.'

    for (const k of this.subbers.keys()) {
      if (k.startsWith(key))
        return true
    }

    for (const k of this.awaitNext.keys()) {
      if (k.startsWith(key))
        return true
    }

    return false
  }
}


// Flow should be:
//    from DB-side, the same listener ref is considered as one connection. From db-side, one connection can only ever have one listener.
//        That one listener is itself responsible (or rather it's corresponding client on the receiving end) for splitting out the key subscription.
//        The DB-side doesn't care about what parts of the app/client subbed, only the connection as a whole unit from db-side acts as a subber.
//        Same db sub-service can handle different connections from http-server, websocket-server or whatever, it doesn't matter. A connection is a connection.
//      * If the sub-service has a connection subbed to key XYZ as 'future' but then later gets from same connection sub to same key XYZ as 'now+next', then send curr and destroy on next. Overwrites prior 'future' event
//    from server-side (http-case), through the connection identifier (muxId), the responsible listener should be obtained and then simply given over to db-subber
//    from client-side, this is where the sub-helper must give each listener that requested a subscription it's value corresponding to the specified key.
//        The client must also differentiate when same listener changes it's subtype in a subsequent subber call, then send further update
//        If func A is subbed to key XYZ as 'future' and later func B requests sub to same key XYZ as 'next', this must be handled client-side.
//          * The client must locally only give func B the next received appropriate event, then cancel it.
//            |-> if client forwards the key XYZ as 'next' change to server->DB sub-service, the whole connection will be unsubbed from key XYZ on next change, invalidating client's still active 'future' listener.
//
//!!! this form of sub-helper vvv is not useful. The DB sub-service would handle all it's features anyways so it's just plain bloat.
// export class SubHelper {
//   private subs: Map<string, SubType> = new Map()

//   constructor(private listener: (key: string, value?: DataType) => void, private subber: KCPHandle['subber']) {

//   }

//   sub(key: string, type: SubType = 'future') {

//   }

//   destroy(): void {
//     this.subber(null, this.listener, 'never')
//   }
// }

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

export class BiMap<K = string, V = (...args: any[]) => any> {
  private kv: Map<K, Set<V>> = new Map()
  private vk: Map<V, Set<K>> = new Map()

  keys(): MapIterator<K> {
    return this.kv.keys()
  }
  values(): MapIterator<V> {
    return this.vk.keys()
  }

  hasKey(key: K): boolean {
    return this.kv.has(key)
  }
  hasValue(value: V): boolean {
    return this.vk.has(value)
  }
  has(key: K, value: V): boolean {
    return this.kv.has(key) && this.vk.has(value)
  }

  getValues(key: K): Set<V> | undefined {
    return this.kv.get(key)
  }
  getKeys(value: V): Set<K> | undefined {
    return this.vk.get(value)
  }
  get() {
    return this.vk.entries()
  }

  add(key: K, value: V): void {
    let vs = this.kv.get(key)
    if (!vs) {
      vs = new Set()
      this.kv.set(key, vs)
    }
    vs.add(value)

    let ks = this.vk.get(value)
    if (!ks) {
      ks = new Set()
      this.vk.set(value, ks)
    }
    ks.add(key)
  }

  // returns true, if that key has no more values linked to it
  delete(key: K, value: V): boolean {
    const ks = this.vk.get(value)
    if (ks?.delete(key) && ks.size === 0)
      this.vk.delete(value)

    const vs = this.kv.get(key)
    if (vs?.delete(value) && vs.size === 0) {
      this.kv.delete(key)
      return true
    }
    return false
  }

  deleteKey(key: K): void {
    const vs = this.kv.get(key)
    if (!vs)
      return

    this.kv.delete(key)
    let ks
    for (const v of vs) {
      ks = this.vk.get(v)
      if (ks?.delete(key) && ks.size === 0)
        this.vk.delete(v)
    }
  }

  deleteValue(value: V): void {
    const ks = this.vk.get(value)
    if (!ks)
      return

    this.vk.delete(value)
    let vs
    for (const k of ks) {
      vs = this.kv.get(k)
      if (vs?.delete(value) && vs.size === 0)
        this.kv.delete(k)
    }
  }

  clear(): void {
    this.kv.clear()
    this.vk.clear()
  }

  // callKeys(value: V, ...args: K extends (() => any) ? Parameters<K> : never): void {
  //   for (const k of this.vk.get(value) ?? []) {
  //     (k as any)(...args)
  //   }
  // }

  // callValues(key: K, ...args: V extends (() => any) ? Parameters<V> : never): void {
  //   for (const v of this.kv.get(key) ?? []) {
  //     (v as any)(...args)
  //   }
  // }
}

// users have a 32-bit uid random unique number assigned
// global 32-bit bitmask for groups exists, each user has a gbm (group bit map). This allows 32 groups in total to exist, good enough for now.

// make efficient helper for mapping key permissions to appropriate allowed actions

interface AuthSchema {
  api: {
    changePassword: (ctx: KCPTrustedContext, args: { oldPassword: string, newPassword: string }) => Promise<void>,
    chown: (ctx: KCPTrustedContext, args: { base: string, owner: number | null }) => Promise<void>,
    login: (ctx: KCPTrustedContext, args: { username: string, password: string }) => Promise<string>,
    logout: (ctx: KCPTrustedContext, token: string) => Promise<void>,
    logoutAll: (ctx: KCPTrustedContext, args: { username: string, password: string }) => Promise<void>,
  },
  users: Record<number, {
    identity: number,
    name: string,
    passwordHash?: string, // if missing, cannot be logged into, only superadmin might provide tokens
  }>,
  access: Record<string, {
    owner: number,
    // TODO: add these vvv later, for now just have owner. owner can be EVERYONE or USERS as first basic kind of 'group-access'
    // read: number[],
    // write: number[],
    // execute: number[],
  }>,
  tokens: Record<string, number>,
}

export const NOACCESS = Symbol('Access Denied')
export const ANONYMOUS = 0 // MAKE SURE TO NOT CHANGE THESE VALUES -> WILL BE TROUBLE FOR MIGRATION
export const EVERYONE = 1 // MAKE SURE TO NOT CHANGE THESE VALUES -> WILL BE TROUBLE FOR MIGRATION
export const USERS = 2 // MAKE SURE TO NOT CHANGE THESE VALUES -> WILL BE TROUBLE FOR MIGRATION
export const SUPERADMIN = 5 // MAKE SURE TO NOT CHANGE THESE VALUES -> WILL BE TROUBLE FOR MIGRATION

export async function dbHandle({ getter, setter, subber }: KCPHandle): Promise<KCPRawHandle> {
  const kpidefs: Map<string, CallerType> = new Map()

  // await setter('auth')
  const auth = await getter('auth') as undefined | AuthSchema

  if (auth) {
    if (typeof auth?.users !== 'object' || !(
      ANONYMOUS in auth.users
      && EVERYONE in auth.users
      && USERS in auth.users
      && SUPERADMIN in auth.users
    )) {
      throw new Error('"auth" DB entry already exists but is wrong!')
    }
  }
  else {
    await setter('auth', <Omit<AuthSchema, 'api'>>{
      users: {
        [ANONYMOUS]: {
          // an unauthenticated user
          identity: ANONYMOUS,
          name: 'anonymous',
        },
        [EVERYONE]: {
          // any user, including anonymous
          identity: EVERYONE,
          name: 'everyone',
        },
        [USERS]: {
          // any authenticated user
          identity: USERS,
          name: 'users',
        },
        [SUPERADMIN]: {
          // always has all permissions for everything granted
          identity: SUPERADMIN,
          name: 'superadmin',
          passwordHash: Bun.password.hashSync('abc'), // default password
        },
      },
      tokens: {
        'xyz': USERS, // !!! testing-only !!!
      },
      access: {
        'auth': {
          owner: SUPERADMIN,
          read: [],
          write: [],
          execute: [],
        },
        'chown': {
          owner: SUPERADMIN,
          read: [],
          write: [],
          execute: [],
        },
        'changePassword': {
          owner: USERS,
          read: [],
          write: [],
          execute: [],
        },
        '': { // TODO: !!! testing-only !!!
          owner: USERS,
          read: [],
          write: [],
          execute: [],
        },
        'login': {
          owner: ANONYMOUS,
          read: [],
          write: [],
          execute: [],
        },
        'logout': {
          owner: USERS,
          read: [],
          write: [],
          execute: [],
        },
        'logoutAll': {
          owner: EVERYONE,
          read: [],
          write: [],
          execute: [],
        },
      },
    } as any)
  }
  kpidefs.set('changePassword', <AuthSchema['api']['changePassword']>
    (async ({ identity }, { oldPassword, newPassword }) => {
      const key = `auth.users.${identity}.passwordHash`
      const hash = await getter(key)
      if (typeof hash !== 'string')
        throw new Error('Login is forbidden for select user (identity)!')

      const match = await Bun.password.verify(oldPassword, hash)
      if (!match)
        throw new Error('Incorrect password!')

      await setter(key, await Bun.password.hash(newPassword))
    }) as any)
  kpidefs.set('chown', <AuthSchema['api']['chown']>
    (async ({ identity }, { base, owner }) => {
      if (owner === null)
        await setter('auth.access.' + base)
      else
        await setter('auth.access.' + base, { owner, read: [], write: [], execute: [] })
    }) as any)
  kpidefs.set('login', <AuthSchema['api']['login']>
    (async (_, { username, password }) => {
      const users = Object.values(await getter(`auth.users`) as AuthSchema['users'])
      const { identity, passwordHash } = users.find(({ name }) => name === username) ?? { identity: ANONYMOUS }
      if (identity === ANONYMOUS || typeof passwordHash !== 'string' || !await Bun.password.verify(password, passwordHash))
        throw new Error('Failed to login (user login may be forbidden or username/password is wrong)!')

      const token = (crypto.randomUUID() + crypto.randomUUID()).replaceAll('-', '')
      await setter('auth.tokens.' + token, identity)
      return token
    }) as any)
  kpidefs.set('logout', <AuthSchema['api']['logout']>
    (async ({ identity }, token) => {
      const id = await getter('auth.tokens.' + token)
      if (identity !== id)
        throw new Error('Cannot destroy foreign token!')

      await setter('auth.tokens.' + token)
      // TODO: revoke active subscriptions of token
    }) as any)
  kpidefs.set('logoutAll', <AuthSchema['api']['logoutAll']>
    (async (_, { username, password }) => {
      const users = await getter(`auth.users`) as AuthSchema['users']
      const [identity, { passwordHash }] = Object.entries(users).find(([id, data]) => data.name === username) ?? [ANONYMOUS, {}]
      if (identity === ANONYMOUS || typeof passwordHash !== 'string' || !await Bun.password.verify(password, passwordHash))
        throw new Error('Failed to login (user login may be forbidden or username/password is wrong)!')

      const tokens = Object.entries((await getter('auth.tokens') as AuthSchema['tokens'])).filter(([token, id]) => id === identity)
      for (const [token, id] of tokens)
        await setter('auth.tokens.' + token)
      // TODO: revoke active subscriptions of token
    }) as any)

  const toTrustedContext = async (ctx: KCPRawContext): Promise<KCPTrustedContext> => {
    if (ctx.token.includes('.'))
      throw new Error('unsupported token characters!')

    const res = (ctx.token && await getter('auth.tokens.' + ctx.token)) || ANONYMOUS
    if (typeof res !== 'number')
      throw NOACCESS
    return {
      identity: res,
      connection: ctx.connection,
    }
  }

  const authenticate = async (raw: KCPRawContext, key: string): Promise<KCPTrustedContext> => {
    if (isBadKey(key))
      throw new Error('Bad key! (contains prohibited characters)')

    const ctx = await toTrustedContext(raw)
    if (ctx.identity === SUPERADMIN)
      return ctx // ALL ACCESS GRANTED

    const dotIndex = key.indexOf('.')
    // TODO: implement homedir accessed via leading $, as in either "$" or "$.xyz" resulting in something like "user-5.xyz", 5 being example identity
    const base = dotIndex === -1 ? key : key.slice(0, dotIndex)
    // TODO: optimize with synched js-map
    const access = await getter('auth.access.' + base) as undefined | AuthSchema['access']['']
    if (!access) {
      throw NOACCESS
    }
    else if (access.owner === ctx.identity || access.owner === EVERYONE || (access.owner === USERS && ctx.identity !== ANONYMOUS)) {
      return ctx
    }
    else {
      throw NOACCESS
    }
  }

  return {
    async getter(raw, key) {
      const kpifunc = kpidefs.get(key)
      const ctx = await authenticate(raw, key)

      if (kpifunc) {
        return kpifunc(ctx)
      }
      else {
        const res = await getter(key)
        return res
      }
    },
    async setter(raw, key, value) {
      const kpifunc = kpidefs.get(key)
      const ctx = await authenticate(raw, key)

      if (typeof value === 'function') {
        kpidefs.set(key, value)
      }
      else if (kpifunc) {
        if (value === undefined)
          kpidefs.delete(key)
        else
          return kpifunc(ctx, value)
      }
      else {
        return await setter(key, value)
      }
    },
    async subber(raw, key, listener, type) {
      if (key !== null) {
        await authenticate(raw, key)

        if (kpidefs.has(key)) {
          throw new Error('Cannot subscribe to KPI function!')
        }
      }

      return subber(key, listener, type)
    },
  }
}

export function bindContext(context: KCPRawContext, { getter, setter, subber }: KCPRawHandle): KCPHandle {
  return {
    getter(key) {
      return getter(context, key)
    },
    setter(key, value) {
      return setter(context, key, value)
    },
    subber(key, listener, type) {
      return subber(context, key, listener, type)
    },
  }
}