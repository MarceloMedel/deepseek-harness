/**
 * Verification of Cloudflare Access assertions for the privileged `/api` plane.
 *
 * A deployment behind Cloudflare Access receives one signed JWT per
 * authenticated request, and the team publishes the matching public keys under
 * `/cdn-cgi/access/certs`. Checking that assertion in-process is what turns
 * "the edge authenticated this caller" into a fact this server can decide on:
 * the signature is checked against the team's published keys, and the claims
 * pin the token to this team, this application, and its own lifetime. The trust
 * root is the team's public key set, so no secret is shared with the edge and
 * no network path is assumed.
 */

import {
  createPublicKey,
  verify as verifySignature,
  type JsonWebKey,
  type KeyObject,
} from 'node:crypto'
import { requestHeader, type RequestHeaders } from './request-headers.ts'

/** Cloudflare Access coordinates one deployment pins its assertions to. */
export interface CloudflareAccessOptions {
  /** Team origin such as `https://team.cloudflareaccess.com`; also the expected `iss`. */
  teamOrigin: string
  /** Application Audience (AUD) tag of this deployment's Access application. */
  audience: string
}

/** Where the team publishes the keys that sign its assertions. */
const CERTS_PATH = '/cdn-cgi/access/certs'
/** Header Cloudflare adds to every request that passed Access. */
const ASSERTION_HEADER = 'cf-access-jwt-assertion'
/** Cookie carrying the same assertion, for requests the header does not reach. */
const ASSERTION_COOKIE = 'CF_Authorization'
/** The only signature algorithm Access uses for these assertions. */
const ASSERTION_ALGORITHM = 'RS256'
/** Reuse window for the fetched key set; the team rotates keys far slower. */
const KEYS_CACHE_TTL_MS = 60 * 60 * 1000
/** Minimum gap between load attempts, so a failed or unknown key id cannot drive a fetch storm. */
const KEYS_FETCH_INTERVAL_MS = 60 * 1000
/** Bound on one key fetch. */
const KEYS_FETCH_TIMEOUT_MS = 5000
/** Tolerance for clock drift against `exp` and `nbf`. */
const CLOCK_SKEW_SECONDS = 60
/** base64url alphabet, the only encoding a JWT segment may use. */
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/

/** One assertion split into the parts signature verification consumes. */
interface ParsedAssertion {
  /** `alg` from the JOSE header, unvalidated. */
  algorithm: unknown
  /** `kid` from the JOSE header, when it names one key. */
  keyId: string | undefined
  /** Decoded claims. */
  claims: Record<string, unknown>
  /** The signed bytes, exactly as received. */
  signingInput: string
  /** Decoded signature bytes. */
  signature: Buffer
}

/**
 * Whether one request carries an assertion this deployment accepts.
 *
 * Every refusal is final and silent to the caller: a request without an
 * assertion, with a malformed one, with a token from another team or
 * application, with an expired token, or whose key id the team does not publish
 * is simply not privileged.
 */
export class CloudflareAccessVerifier {
  private readonly teamOrigin: string
  private readonly audience: string
  private readonly certsUrl: string
  private keys = new Map<string, KeyObject>()
  /** Last successful load; undefined until the team's keys arrive once. */
  private fetchedAt: number | undefined
  /** Last load attempt, successful or not, bounding the retry rate. */
  private attemptedAt: number | undefined
  private pending: Promise<void> | undefined

  /**
   * @param options - the team origin and application audience to pin.
   */
  constructor(options: CloudflareAccessOptions) {
    this.teamOrigin = new URL(options.teamOrigin).origin
    this.audience = options.audience
    this.certsUrl = new URL(CERTS_PATH, this.teamOrigin).href
  }

  /**
   * Decide one request's assertion.
   * @param headers - Node or Fetch request headers.
   * @returns true only for a correctly signed, current token from this team and application.
   */
  async accepts(headers: RequestHeaders): Promise<boolean> {
    const token = assertionToken(headers)
    if (token === undefined) return false
    const assertion = parseAssertion(token)
    if (assertion === undefined) return false
    if (assertion.algorithm !== ASSERTION_ALGORITHM) return false
    if (assertion.keyId === undefined) return false
    if (!this.claimsHold(assertion.claims)) return false
    const key = await this.keyFor(assertion.keyId)
    if (key === undefined) return false
    return verifySignature(
      'RSA-SHA256',
      Buffer.from(assertion.signingInput, 'utf8'),
      key,
      assertion.signature,
    )
  }

  /**
   * The claims that bind the token to this deployment. They are checked before
   * any key work so a token for another audience or an expired one costs no
   * fetch; the signature remains the authority.
   */
  private claimsHold(claims: Record<string, unknown>): boolean {
    if (claims.iss !== this.teamOrigin) return false
    if (!audienceNames(claims.aud, this.audience)) return false
    const expiresAt = numericClaim(claims.exp)
    if (expiresAt === undefined) return false
    const now = Date.now() / 1000
    if (now > expiresAt + CLOCK_SKEW_SECONDS) return false
    const notBefore = numericClaim(claims.nbf)
    if (notBefore !== undefined && now + CLOCK_SKEW_SECONDS < notBefore) return false
    return true
  }

  /**
   * The published key for one key id, fetching the set when the id is unknown.
   * An unknown id forces one refetch, rate-limited by {@link KEYS_FETCH_INTERVAL_MS}.
   */
  private async keyFor(keyId: string): Promise<KeyObject | undefined> {
    await this.ensureKeys(false)
    const cached = this.keys.get(keyId)
    if (cached !== undefined) return cached
    await this.ensureKeys(true)
    return this.keys.get(keyId)
  }

  /**
   * Load the key set when the cached one is too old for this call. Concurrent
   * callers share one load, and every load attempt opens the retry interval, so
   * an unreachable certs endpoint is retried once a minute rather than per
   * request.
   */
  private async ensureKeys(refresh: boolean): Promise<void> {
    if (this.pending !== undefined) {
      await this.pending
      return
    }
    const reuse = refresh ? KEYS_FETCH_INTERVAL_MS : KEYS_CACHE_TTL_MS
    if (this.fetchedAt !== undefined && Date.now() - this.fetchedAt < reuse) return
    if (this.attemptedAt !== undefined && Date.now() - this.attemptedAt < KEYS_FETCH_INTERVAL_MS) return
    this.attemptedAt = Date.now()
    this.pending = this.loadKeys().finally(() => { this.pending = undefined })
    await this.pending
  }

  private async loadKeys(): Promise<void> {
    try {
      const response = await fetch(this.certsUrl, { signal: AbortSignal.timeout(KEYS_FETCH_TIMEOUT_MS) })
      if (!response.ok) return
      const document: unknown = await response.json()
      const keys = publishableKeys(document)
      if (keys.size === 0) return
      this.keys = keys
      this.fetchedAt = Date.now()
    } catch {
      // A timeout, a transport failure, or a body that is not JSON: the keys
      // already held stay in force and an unknown key id keeps failing closed.
    }
  }
}

/** The assertion a request carries: the Access header first, its cookie second. */
function assertionToken(headers: RequestHeaders): string | undefined {
  const fromHeader = requestHeader(headers, ASSERTION_HEADER)?.trim()
  if (fromHeader !== undefined && fromHeader !== '') return fromHeader
  const cookies = requestHeader(headers, 'cookie')
  if (cookies === undefined) return undefined
  for (const pair of cookies.split(';')) {
    const separator = pair.indexOf('=')
    if (separator === -1) continue
    if (pair.slice(0, separator).trim() !== ASSERTION_COOKIE) continue
    const value = pair.slice(separator + 1).trim()
    if (value !== '') return value
  }
  return undefined
}

/** Split one compact JWT, refusing anything that is not three well-formed segments. */
function parseAssertion(token: string): ParsedAssertion | undefined {
  const segments = token.split('.')
  if (segments.length !== 3) return undefined
  const [encodedHeader, encodedClaims, encodedSignature] = segments as [string, string, string]
  const header = decodeJsonObject(encodedHeader)
  const claims = decodeJsonObject(encodedClaims)
  if (header === undefined || claims === undefined) return undefined
  const signature = decodeBase64Url(encodedSignature)
  if (signature === undefined) return undefined
  const keyId = header.kid
  return {
    algorithm: header.alg,
    keyId: typeof keyId === 'string' && keyId !== '' ? keyId : undefined,
    claims,
    signingInput: `${encodedHeader}.${encodedClaims}`,
    signature,
  }
}

/** Decode one base64url JSON segment into an object. */
function decodeJsonObject(segment: string): Record<string, unknown> | undefined {
  const bytes = decodeBase64Url(segment)
  if (bytes === undefined) return undefined
  try {
    const parsed: unknown = JSON.parse(bytes.toString('utf8'))
    return isObject(parsed) ? parsed : undefined
  } catch {
    // A segment that is not JSON is not an assertion this verifier can use.
    return undefined
  }
}

/** Decode one base64url segment, refusing text outside the alphabet. */
function decodeBase64Url(segment: string): Buffer | undefined {
  if (!BASE64URL_PATTERN.test(segment)) return undefined
  return Buffer.from(segment, 'base64url')
}

/** The RSA keys one published set names by key id. */
function publishableKeys(document: unknown): Map<string, KeyObject> {
  const keys = new Map<string, KeyObject>()
  const candidates = isObject(document) ? document.keys : undefined
  if (!Array.isArray(candidates)) return keys
  for (const candidate of candidates) {
    if (!isObject(candidate)) continue
    const keyId = candidate.kid
    if (typeof keyId !== 'string' || keyId === '') continue
    if (candidate.kty !== 'RSA') continue
    if (candidate.alg !== undefined && candidate.alg !== ASSERTION_ALGORITHM) continue
    try {
      keys.set(keyId, createPublicKey({ key: candidate as unknown as JsonWebKey, format: 'jwk' }))
    } catch {
      // A key-set entry that is not a usable RSA public key cannot have signed
      // any assertion this verifier accepts.
    }
  }
  return keys
}

/** Whether an `aud` claim names the configured application. */
function audienceNames(claim: unknown, audience: string): boolean {
  if (typeof claim === 'string') return claim === audience
  return Array.isArray(claim) && claim.includes(audience)
}

/** Whether a claim is a numeric timestamp. JSON carries no NaN or infinities. */
function numericClaim(claim: unknown): number | undefined {
  return typeof claim === 'number' ? claim : undefined
}

/** Narrow an unknown JSON value to an object. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
