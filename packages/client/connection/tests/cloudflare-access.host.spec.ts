/** Cloudflare Access assertion verification: signature, claims, and key fetching. */
import { describe, expect, it, vi } from 'vitest'
import { CloudflareAccessVerifier } from '../src/cloudflare-access.ts'
import {
  assertionClaims,
  certServer,
  mint,
  tampered,
  teamKeys,
  type CertServer,
} from './access-team.fixture.ts'
import { AUDIENCE } from './access-team.fixture.ts'

/** Run the verifier against a published key set, closing the fake endpoint after. */
async function withTeam(
  entries: readonly Record<string, unknown>[],
  run: (verifier: CloudflareAccessVerifier, server: CertServer) => Promise<void>,
): Promise<void> {
  const server = await certServer(entries)
  try {
    await run(new CloudflareAccessVerifier({ teamOrigin: server.origin, audience: AUDIENCE }), server)
  } finally {
    await server.close()
  }
}

describe('cloudflare access assertion verifier', () => {
  it('accepts a correctly signed assertion from the Access header', async () => {
    const keys = teamKeys()
    await withTeam([keys.jwk], async (verifier, server) => {
      const token = mint(keys, assertionClaims(server.origin))
      expect(await verifier.accepts(new Headers({ 'cf-access-jwt-assertion': token }))).toBe(true)
    })
  })

  it('accepts the same assertion from the CF_Authorization cookie', async () => {
    const keys = teamKeys()
    await withTeam([keys.jwk], async (verifier, server) => {
      const token = mint(keys, assertionClaims(server.origin))
      const headers = new Headers({ cookie: `theme=dark; CF_Authorization=${token}; other=1` })
      expect(await verifier.accepts(headers)).toBe(true)
    })
  })

  it('refuses tokens this team would not have signed, one condition at a time', async () => {
    const keys = teamKeys()
    const foreign = teamKeys()
    await withTeam([keys.jwk], async (verifier, server) => {
      const now = Math.floor(Date.now() / 1000)
      const cases: (readonly [string, Headers])[] = [
        ['absent assertion', new Headers({ host: 'harness.example' })],
        ['empty assertion', new Headers({ 'cf-access-jwt-assertion': '' })],
        ['not a compact JWT', new Headers({ 'cf-access-jwt-assertion': 'not-a-jwt' })],
        ['two segments', new Headers({ 'cf-access-jwt-assertion': 'aaa.bbb' })],
        ['segments outside base64url', new Headers({ 'cf-access-jwt-assertion': 'a+b/c.d/e.f+g' })],
        ['header that is not JSON', new Headers({ 'cf-access-jwt-assertion': `${base64url('nope')}.e30.c2ln` })],
        ['cookie without the assertion', new Headers({ cookie: 'theme=dark; other=1' })],
      ]
      const tokens: (readonly [string, string])[] = [
        ['header without alg', mint(keys, assertionClaims(server.origin), { alg: undefined })],
        ['symmetric alg', mint(keys, assertionClaims(server.origin), { alg: 'HS256' })],
        ['header without kid', mint(keys, assertionClaims(server.origin), { kid: undefined })],
        ['foreign signing key', mint(foreign, assertionClaims(server.origin))],
        ['expired token', mint(keys, assertionClaims(server.origin, { exp: now - 3600 }))],
        ['token without exp', mint(keys, assertionClaims(server.origin, { exp: undefined }))],
        ['token not yet valid', mint(keys, assertionClaims(server.origin, { nbf: now + 3600 }))],
        ['another team', mint(keys, assertionClaims('https://other.cloudflareaccess.com'))],
        ['another application', mint(keys, assertionClaims(server.origin, { aud: 'someone-else' }))],
        ['audience list without ours', mint(keys, assertionClaims(server.origin, { aud: ['someone-else'] }))],
        ['tampered payload', tampered(keys, assertionClaims(server.origin))],
      ]
      for (const [label, token] of tokens) {
        cases.push([label, new Headers({ 'cf-access-jwt-assertion': token })])
      }
      for (const [label, headers] of cases) {
        expect([label, await verifier.accepts(headers)]).toEqual([label, false])
      }
      // The same key set and claims do verify when nothing is wrong with them,
      // including an `aud` list that names this application.
      expect(await verifier.accepts(new Headers({
        'cf-access-jwt-assertion': mint(keys, assertionClaims(server.origin, { aud: [AUDIENCE] })),
      }))).toBe(true)
    })
  })

  it('refuses a key id the team does not publish', async () => {
    const keys = teamKeys()
    await withTeam([keys.jwk], async (verifier, server) => {
      const unknown = mint(keys, assertionClaims(server.origin), { kid: 'retired-key' })
      expect(await verifier.accepts(new Headers({ 'cf-access-jwt-assertion': unknown }))).toBe(false)
    })
  })

  it('asks for the key set once per interval no matter how many unknown ids arrive', async () => {
    const keys = teamKeys()
    const foreign = teamKeys('attacker-key')
    await withTeam([keys.jwk], async (verifier, server) => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const token = mint(foreign, assertionClaims(server.origin), { kid: 'attacker-key' })
        expect(await verifier.accepts(new Headers({ 'cf-access-jwt-assertion': token }))).toBe(false)
      }
      expect(server.requests()).toBe(1)
    })
  })

  it('fails closed and stops retrying while the certs endpoint is down', async () => {
    const keys = teamKeys()
    await withTeam([keys.jwk], async (verifier, server) => {
      server.fail(503)
      const token = mint(keys, assertionClaims(server.origin))
      expect(await verifier.accepts(new Headers({ 'cf-access-jwt-assertion': token }))).toBe(false)
      expect(await verifier.accepts(new Headers({ 'cf-access-jwt-assertion': token }))).toBe(false)
      expect(server.requests()).toBe(1)
    })
  })

  it('refuses a published set with no usable RSA key', async () => {
    const keys = teamKeys()
    await withTeam([{ ...keys.jwk, kty: 'EC' }], async (verifier, server) => {
      const token = mint(keys, assertionClaims(server.origin))
      expect(await verifier.accepts(new Headers({ 'cf-access-jwt-assertion': token }))).toBe(false)
      expect(server.requests()).toBe(1)
    })
  })

  it('accepts a key published without an algorithm field and skips unusable entries', async () => {
    const keys = teamKeys()
    await withTeam([], async (verifier, server) => {
      server.body(JSON.stringify({
        keys: [
          null,
          42,
          { kid: '', kty: 'RSA' },
          { ...keys.jwk, kid: 'broken', n: 'not base64url' },
          { ...keys.jwk, kid: 'elliptic', alg: 'ES256' },
          { kid: keys.jwk.kid, kty: 'RSA', n: keys.jwk.n, e: keys.jwk.e, use: 'sig' },
        ],
      }))
      expect(await verifier.accepts(new Headers({
        'cf-access-jwt-assertion': mint(keys, assertionClaims(server.origin)),
      }))).toBe(true)
    })
  })

  it('refuses a key set that is not a JWKS document', async () => {
    const keys = teamKeys()
    await withTeam([keys.jwk], async (verifier, server) => {
      server.body('[]')
      expect(await verifier.accepts(new Headers({
        'cf-access-jwt-assertion': mint(keys, assertionClaims(server.origin)),
      }))).toBe(false)
    })
  })

  it('refuses a team endpoint it cannot reach', async () => {
    const keys = teamKeys()
    // Nothing listens on port 1: the fetch rejects and the request fails closed.
    const verifier = new CloudflareAccessVerifier({ teamOrigin: 'http://127.0.0.1:1', audience: AUDIENCE })
    expect(await verifier.accepts(new Headers({
      'cf-access-jwt-assertion': mint(keys, assertionClaims('http://127.0.0.1:1')),
    }))).toBe(false)
  })

  it('shares one key fetch between concurrent requests', async () => {
    const keys = teamKeys()
    const foreign = teamKeys('attacker-key')
    await withTeam([keys.jwk], async (verifier, server) => {
      const token = mint(foreign, assertionClaims(server.origin), { kid: 'attacker-key' })
      const answers = await Promise.all([
        verifier.accepts(new Headers({ 'cf-access-jwt-assertion': token })),
        verifier.accepts(new Headers({ 'cf-access-jwt-assertion': token })),
      ])
      expect(answers).toEqual([false, false])
      expect(server.requests()).toBe(1)
    })
  })

  it('refetches after the interval and admits a rotated key', async () => {
    const first = teamKeys()
    const rotated = teamKeys('rotated-key')
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      await withTeam([first.jwk], async (verifier, server) => {
        expect(await verifier.accepts(new Headers({
          'cf-access-jwt-assertion': mint(first, assertionClaims(server.origin)),
        }))).toBe(true)

        server.publish([rotated.jwk])
        const rotatedToken = mint(rotated, assertionClaims(server.origin), { kid: 'rotated-key' })
        // Inside the refetch interval the new key is unknown and refused.
        expect(await verifier.accepts(new Headers({ 'cf-access-jwt-assertion': rotatedToken }))).toBe(false)

        vi.setSystemTime(new Date(Date.now() + 61_000))
        expect(await verifier.accepts(new Headers({ 'cf-access-jwt-assertion': rotatedToken }))).toBe(true)
        expect(server.requests()).toBe(2)
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores cookie entries it cannot use and a header segment that is not an object', async () => {
    const keys = teamKeys()
    await withTeam([keys.jwk], async (verifier, server) => {
      const token = mint(keys, assertionClaims(server.origin))
      expect(await verifier.accepts(new Headers({ cookie: 'flag; CF_Authorization=; theme=dark' }))).toBe(false)
      expect(await verifier.accepts(new Headers({ cookie: `CF_Authorization=${token}` }))).toBe(true)
      expect(await verifier.accepts(new Headers({ 'cf-access-jwt-assertion': `${base64url('42')}.e30.c2ln` }))).toBe(false)
    })
  })

  it('refuses claims whose lifetime or audience cannot be read', async () => {
    const keys = teamKeys()
    await withTeam([keys.jwk], async (verifier, server) => {
      const now = Math.floor(Date.now() / 1000)
      const tokens = [
        mint(keys, assertionClaims(server.origin, { exp: '300' })),
        mint(keys, assertionClaims(server.origin, { aud: 42 })),
        mint(keys, assertionClaims(server.origin), { kid: '' }),
      ]
      for (const token of tokens) {
        expect(await verifier.accepts(new Headers({ 'cf-access-jwt-assertion': token }))).toBe(false)
      }
      // A token whose `nbf` already passed is current.
      expect(await verifier.accepts(new Headers({
        'cf-access-jwt-assertion': mint(keys, assertionClaims(server.origin, { nbf: now - 10 })),
      }))).toBe(true)
    })
  })

  it('refuses segments that are not JSON or not base64url', async () => {
    const keys = teamKeys()
    await withTeam([keys.jwk], async (verifier, server) => {
      const header = base64url(JSON.stringify({ alg: 'RS256', kid: keys.jwk.kid }))
      const tokens = [
        // Claims segment that is not JSON, behind a well-formed header.
        `${header}.${base64url('not json')}.c2ln`,
        // Signature segment outside the base64url alphabet.
        `${header}.${base64url(JSON.stringify(assertionClaims(server.origin)))}.a+b/c`,
      ]
      for (const token of tokens) {
        expect(await verifier.accepts(new Headers({ 'cf-access-jwt-assertion': token }))).toBe(false)
      }
      expect(await verifier.accepts(new Headers({
        'cf-access-jwt-assertion': mint(keys, assertionClaims(server.origin)),
      }))).toBe(true)
    })
  })
})

/** base64url of one JSON fragment, for hand-built malformed tokens. */
function base64url(value: string): string {
  return Buffer.from(value).toString('base64url')
}
