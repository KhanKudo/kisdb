// call this file either 'admin.ts' or 'management.ts', depending on features & implementation
// TODO: add here easy functions for handling users and permissions as well as overall database stuff
//       add some perhaps 'cleanup' functions or just inspection tools for the various entries inside the database

import type { AuthSchema } from "./auth";
import type { KCPHandle, KCPRawContext, KCPRawHandle } from "./kcp";

interface AdminType {
  chown(path: string, owner: number): Promise<void>
  getIdentity(username: string): Promise<number>
  ensureUser(username: string, password: string | false | null, keepExistingTokens: boolean, ...tokens: string[]): Promise<number>
  ensureToken(token: string, user: string | number): Promise<void>
  ensureAccess(path: string, owner: string | number, read: string | number | false | null, write: string | number | false | null, execute: string | number | false | null): Promise<void>
  destroy(): Promise<void> // if used with KCPRawHandle and password, it's good to destroy the created token
}

// this viewer expects the provided KCPHandle to be authenticated as SUPERADMIN, otherwise most actions will fail.
export async function createAdminHelper(handle: Omit<KCPHandle, 'subber'>): Promise<AdminType>
export async function createAdminHelper(handle: Omit<KCPRawHandle, 'subber'>, password: string): Promise<AdminType>
export async function createAdminHelper(...args: [Omit<KCPHandle, 'subber'>] | [Omit<KCPRawHandle, 'subber'>, string]): Promise<AdminType> {
  const ctx: KCPRawContext = {
    connection: 0,
    token: ''
  }
  if (args.length === 2) {
    const [{ setter }, password] = args
    ctx.token = await setter(ctx, 'login', { username: 'superadmin', password }) as string
  }

  const { getter, setter }: Omit<KCPHandle, 'subber'> = args.length === 2 ? {
    getter(key) {
      return args[0].getter(ctx, key)
    },
    setter(key, value) {
      return args[0].setter(ctx, key, value)
    },
  } : args[0]

  const API: AdminType = {
    async destroy() {
      if (!ctx.token)
        return

      await setter('logout', ctx.token)
    },
    async chown(path, owner) {
      if (path.includes('.'))
        throw new Error(`Only base-paths support auth! Got: ${path}`)

      await setter(`auth.access.${path}.owner`, owner)
    },
    // // the passwordHash if provided must be from Bun.password.hash (or .hashSync ofc)
    // // returns the new user's identity
    // async createUser(username: string, password?: string): Promise<number> {
    //   let identity: number
    //   do {
    //     identity = Math.floor(Math.random() * (Math.pow(2, 32) - 1))
    //   } while (await getter(`auth.users.${identity}`) !== undefined)

    //   const user: AuthSchema['users'][0] = {
    //     identity,
    //     name: username, // TODO: need to make sure that the username is unique and also kept unique
    //   }

    //   if (password !== undefined)
    //     user.passwordHash = await Bun.password.hash(password)

    //   await setter(`auth.users.${identity}`, user)

    //   return identity
    // },
    async getIdentity(username) {
      const users = await getter('auth.users') as AuthSchema['users']
      for (const id in users) {
        const u = users[id]!
        if (u.name === username) {
          return u.identity
        }
      }

      throw new Error(`Could not find identity for username "${username}"`)
    },
    async ensureUser(username, password = null, keepExistingTokens = true, ...tokens) {
      const users = await getter('auth.users') as AuthSchema['users']

      let user: AuthSchema['users'][0] | undefined = Object.values(users).find(({ name }) => name === username)

      const hash: string | undefined = typeof password === 'string' ? await Bun.password.hash(password) : undefined

      if (user) {
        if (password !== null)
          await setter(`auth.users.${user.identity}.passwordHash`, hash)
      }
      else {
        let identity: number
        do {
          identity = Math.floor(Math.random() * (Math.pow(2, 32) - 1))
        } while (identity in users)

        user = {
          identity,
          name: username,
        }
        if (hash)
          user.passwordHash = hash

        await setter(`auth.users.${user.identity}`, user)
      }

      if (keepExistingTokens === false) {
        const extTkns = await getter('auth.tokens') as AuthSchema['tokens']
        for (const tkn in extTkns) {
          if (extTkns[tkn] === user.identity)
            await setter(`auth.tokens.${tkn}`)
        }
      }

      for (const token of tokens) {
        await setter(`auth.tokens.${token}`, user.identity)
      }

      return user.identity
    },
    async ensureToken(token, user) {
      if (typeof user === 'string') {
        user = await API.getIdentity(user)
      }
      await setter(`auth.tokens.${token}`, user)
    },
    async ensureAccess(path, owner, read = null, write = null, execute = null) {
      if (path.includes('.'))
        throw new Error(`Access control is only supported for base paths! (got "${path}")`)

      if (typeof owner === 'string')
        owner = await API.getIdentity(owner)
      if (typeof read === 'string')
        read = await API.getIdentity(read)
      if (typeof write === 'string')
        write = await API.getIdentity(write)
      if (typeof execute === 'string')
        execute = await API.getIdentity(execute)

      const is = await getter(`auth.access.${path}`) as AuthSchema['access']['']
      const tobe: Partial<AuthSchema['access']['']> = {}
      tobe.owner = owner
      if (read !== null)
        tobe.read = read === false ? undefined : read
      if (write !== null)
        tobe.write = write === false ? undefined : write
      if (execute !== null)
        tobe.execute = execute === false ? undefined : execute

      for (const key in tobe) {
        //@ts-ignore
        if (!is || is[key] !== tobe[key]) {
          await setter(`auth.access.${path}`, tobe)
          break
        }
      }
    },
  }

  return API
}
