/**
 * A fake Cloudflare Access team for the connection tests: an RSA key pair, the
 * JWKS document that publishes it over a real loopback endpoint, and a minting
 * helper for assertions with whatever claims a case needs.
 */

import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

/** The AUD tag the fake deployment pins; never a real application's. */
export const AUDIENCE = 'application-audience-for-tests'

/** Key id of the assertion-signing key the fake team publishes. */
export const KEY_ID = 'team-key-one'

/** One RSA key pair plus the JWKS entry that publishes its public half. */
export interface TeamKeys {
  privateKey: KeyObject
  jwk: Record<string, unknown>
}

/** Generate one signing key pair with the published JWK entry that matches it. */
export function teamKeys(keyId: string = KEY_ID): TeamKeys {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  return {
    privateKey,
    jwk: { ...publicKey.export({ format: 'jwk' }), kid: keyId, alg: 'RS256', use: 'sig' },
  }
}

/** Access claim set for the fake team origin. */
export function assertionClaims(origin: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000)
  return {
    iss: origin,
    aud: AUDIENCE,
    exp: now + 300,
    iat: now,
    email: 'owner@example.test',
    ...overrides,
  }
}

/** One signed compact JWT. */
export function mint(
  keys: TeamKeys,
  claims: Record<string, unknown>,
  header: Record<string, unknown> = {},
): string {
  const encode = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url')
  const signingInput = `${encode({ alg: 'RS256', kid: KEY_ID, typ: 'JWT', ...header })}.${encode(claims)}`
  const signature = sign('RSA-SHA256', Buffer.from(signingInput), keys.privateKey)
  return `${signingInput}.${signature.toString('base64url')}`
}

/** A token whose claims were replaced after signing. */
export function tampered(keys: TeamKeys, claims: Record<string, unknown>): string {
  const [header, , signature] = mint(keys, claims).split('.') as [string, string, string]
  const forged = Buffer.from(JSON.stringify({ ...claims, email: 'attacker@example.test' })).toString('base64url')
  return `${header}.${forged}.${signature}`
}

/** A fake team certs endpoint that records how often the verifier asks for keys. */
export interface CertServer {
  origin: string
  requests: () => number
  publish: (entries: readonly Record<string, unknown>[]) => void
  fail: (status: number) => void
  /** Answer with this body verbatim instead of a JWKS document. */
  body: (body: string) => void
  close: () => Promise<void>
}

interface CertServerState {
  entries: readonly Record<string, unknown>[]
  status: number | undefined
  raw: string | undefined
  count: number
}

/** Serve a JWKS document on loopback and hand back its origin and controls. */
export async function certServer(entries: readonly Record<string, unknown>[]): Promise<CertServer> {
  const state: CertServerState = { entries, status: undefined, raw: undefined, count: 0 }
  const server = createServer((_request, response) => {
    state.count += 1
    if (state.status !== undefined) {
      response.writeHead(state.status)
      response.end()
      return
    }
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(state.raw ?? JSON.stringify({ keys: state.entries }))
  })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const { port } = server.address() as AddressInfo
  return {
    origin: `http://127.0.0.1:${String(port)}`,
    requests: () => state.count,
    publish: (next) => { state.entries = next },
    fail: (status) => { state.status = status },
    body: (raw) => { state.raw = raw },
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error === undefined) resolve()
        else reject(error)
      })
    }),
  }
}
