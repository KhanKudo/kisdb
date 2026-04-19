import type { KCPHandle, KCPRawHandle, CallerType, KCPRawContext, KCPTrustedContext } from "./kcp"
import { isBadKey } from './kcp'

// TODO: users have a 32-bit random unique number (identity) assigned
//       global 32-bit bitmask for groups exists, each user has a gbm (group bit map).
//       This allows 32 groups in total to exist, good enough for now.

// TODO: make efficient helper for mapping key permissions to appropriate allowed actions

export interface AuthSchema {
  api: {
    changePassword: (ctx: KCPTrustedContext, args: { oldPassword: string, newPassword: string }) => Promise<void>,
    chown: (ctx: KCPTrustedContext, args: { base: string, owner: number | null }) => Promise<void>,
    whoami: (ctx: KCPTrustedContext) => Promise<number>,
    identify: (ctx: KCPTrustedContext, token: string) => Promise<number>,
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
    read?: number, // TODO: make array, for now just single-option. Though maybe instead of array, just a group as single-option?
    write?: number, // TODO: make array, for now just single-option. Though maybe instead of array, just a group as single-option?
    execute?: number, // TODO: make array, for now just single-option. Though maybe instead of array, just a group as single-option?
  }>,
  tokens: Record<string, number>,
}

enum OP {
  Read = 0b100,
  Write = 0b010,
  Execute = 0b001
}

export const NOACCESS = Symbol('Access Denied')
//
//  !!!  !!!  !!!  MAKE SURE TO NOT CHANGE THESE VALUES -> WILL BE TROUBLE FOR MIGRATION  !!!  !!!  !!!
//
// explicitly unauthenticated. Does NOT include authenticated Users, ONLY unauthenticated!
// note that if a token is provided but not actually valid, the ctx will be assigned ANONYMOUS instead of refusing
// however if a token is provided and is valid but is not allowed to perform requested action, then a NOACCESS error (Symbol) is thrown
export const ANONYMOUS = 0
// all authenticated as well as unauthenticated, basically Anonymous & Users
export const EVERYONE = 1
// all authenticated users, basically Everyone except Anonymous
export const USERS = 2
// special 'god-role', all access is always granted to everything.
// If the token is valid, all further checks are skipped, everything is permitted.
export const SUPERADMIN = 5

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
          // all requests are always granted, everything is permitted, all checks are skipped
          identity: SUPERADMIN,
          name: 'superadmin',
          passwordHash: Bun.password.hashSync('DEFAULT_PA$$WORD'), // default password
        },
      },
      tokens: {},
      access: {
        'auth': {
          owner: SUPERADMIN,
        },
        'changePassword': {
          owner: SUPERADMIN,
          execute: USERS,
        },
        'whoami': {
          owner: SUPERADMIN,
          execute: EVERYONE,
        },
        'identify': {
          owner: SUPERADMIN,
          execute: EVERYONE,
        },
        'login': {
          owner: SUPERADMIN,
          execute: ANONYMOUS,
        },
        'logout': {
          owner: SUPERADMIN,
          execute: USERS,
        },
        'logoutAll': {
          owner: SUPERADMIN,
          execute: EVERYONE,
        },
      },
    } as any)
  }
  kpidefs.set('changePassword', <AuthSchema['api']['changePassword']>
    (async ({ identity }, { oldPassword, newPassword }) => {
      const key = `auth.users.${identity}.passwordHash`
      const hash = await getter(key)
      if (typeof hash !== 'string')
        throw new Error('Login is forbidden for current user/identity!')

      const match = await Bun.password.verify(oldPassword, hash)
      if (!match)
        throw new Error('Incorrect password!')

      await setter(key, await Bun.password.hash(newPassword))
    }) as any)
  kpidefs.set('whoami', <AuthSchema['api']['whoami']>
    (async ({ identity }) => {
      return identity
    }) as any)
  kpidefs.set('identify', <AuthSchema['api']['identify']>
    (async ({ identity }, token) => {
      const id = await getter('auth.tokens.' + token)
      return id || 0
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
      if (identity !== id && identity !== SUPERADMIN)
        throw new Error('Cannot destroy foreign token!')

      await setter('auth.tokens.' + token)
      // TODO: revoke active subscriptions of token
    }) as any)
  kpidefs.set('logoutAll', <AuthSchema['api']['logoutAll']>
    (async (ctx, { username, password }) => {
      // TODO: use ctx.identity & password instead of username
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

  const authenticate = async (raw: KCPRawContext, key: string, op: OP): Promise<KCPTrustedContext> => {
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
      console.error(`Access Denied to "${key}" for non-admin`)
      throw NOACCESS
    }
    else if (
      access.owner === ctx.identity
      || access.owner === EVERYONE
      || (access.owner === USERS && ctx.identity !== ANONYMOUS)
      || (op === OP.Read && access.read !== undefined && (access.read === ctx.identity || access.read === EVERYONE || (access.read === USERS && ctx.identity !== ANONYMOUS)))
      || (op === OP.Write && access.write !== undefined && (access.write === ctx.identity || access.write === EVERYONE || (access.write === USERS && ctx.identity !== ANONYMOUS)))
      || (op === OP.Execute && access.execute !== undefined && (access.execute === ctx.identity || access.execute === EVERYONE || (access.execute === USERS && ctx.identity !== ANONYMOUS)))
    ) {
      return ctx
    }
    else {
      console.error(`Access Denied to "${key}" for identity "${ctx.identity}" with OP "${op}"`)
      throw NOACCESS
    }
  }

  return {
    async getter(raw, key) {
      const kpifunc = kpidefs.get(key)
      const op = kpifunc ? OP.Execute : OP.Read
      const ctx = await authenticate(raw, key, op)

      if (op === OP.Execute) {
        return kpifunc!(ctx)
      }
      else {
        const res = await getter(key)
        return res
      }
    },
    async setter(raw, key, value) {
      const kpifunc = kpidefs.get(key)
      const isFunc = typeof value === 'function'
      const op = (kpifunc && !isFunc) ? OP.Execute : OP.Write
      const ctx = await authenticate(raw, key, op)

      if (isFunc) {
        kpidefs.set(key, value)
      }
      else if (op === OP.Execute) {
        if (value === undefined)
          kpidefs.delete(key)
        else
          return kpifunc!(ctx, value)
      }
      else {
        return await setter(key, value)
      }
    },
    async subber(raw, key, listener, type) {
      if (key === null)
        return subber(null, listener, type)

      const ctx = await authenticate(raw, key, OP.Read)

      if (kpidefs.has(key)) {
        throw new Error('Cannot subscribe to KPI function!')
      }

      return subber(key, listener, type)
    },
  }
}