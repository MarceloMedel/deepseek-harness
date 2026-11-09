/**
 * The privileged `/api` plane's request policy. Loopback is the baseline this
 * package has always enforced; a deployment that receives its requests through
 * Cloudflare Access may declare authorities where a verified Access assertion
 * stands in for loopback, because that is authentication rather than a trust
 * grant on the Host header. Without that declaration the policy is exactly the
 * loopback pin, so an upstream deployment sees no behavior change.
 */

import { assertTrustedAuthority, isTrustedApiRequest, type ApiTrustRequest } from './api-request-trust.ts'
import { CloudflareAccessVerifier } from './cloudflare-access.ts'
import { isLoopbackHostname } from './loopback-hostname.ts'

/** Cloudflare Access coordinates and the authorities whose callers they admit. */
export interface CloudflareAccessConfig {
  /**
   * Team origin such as `https://team.cloudflareaccess.com`. Its key set is the
   * trust root, and it is also the `iss` every accepted assertion must carry.
   */
  teamOrigin?: string
  /** Application Audience (AUD) tag of this deployment's Access application. */
  audience?: string
  /** Non-loopback authorities whose verified callers reach the privileged plane. */
  hosts?: string[]
}

/** Deployment extension of the privileged plane beyond loopback. */
export interface PrivilegedAccessConfig {
  /** Cloudflare Access as the authenticator for declared authorities. */
  cloudflareAccess?: CloudflareAccessConfig
}

/** Decides whether one request may reach a privileged endpoint. */
export interface PrivilegedRequestPolicy {
  /**
   * @param request - request facts the fence reads.
   * @returns whether the request reaches privileged endpoints.
   */
  allows(request: ApiTrustRequest): Promise<boolean>
}

/** Loopback-only policy: the behavior of every deployment that declares no extension. */
const LOOPBACK_ONLY: PrivilegedRequestPolicy = {
  allows: request => Promise.resolve(isTrustedApiRequest(request, [])),
}

/** Fully resolved Access parameters; validation and defaulting happen here. */
interface ResolvedCloudflareAccess {
  teamOrigin: string
  audience: string
  hosts: string[]
}

/**
 * Resolve and validate the privileged-plane extension.
 * @param config - the plugin's `privilegedAccess` section, when the deployment declares one.
 * @param trustedHosts - the deployment's general-fence authorities.
 * @returns the policy; the loopback baseline when no extension is declared.
 */
export function createPrivilegedPolicy(
  config: PrivilegedAccessConfig | undefined,
  trustedHosts: readonly string[],
): PrivilegedRequestPolicy {
  const access = config?.cloudflareAccess
  if (access === undefined) return LOOPBACK_ONLY
  const { teamOrigin, audience, hosts } = resolveCloudflareAccess(access, trustedHosts)
  const verifier = new CloudflareAccessVerifier({ teamOrigin, audience })
  return {
    async allows(request) {
      if (isTrustedApiRequest(request, [])) return true
      // The general fence first: a browser marker from another origin, or a
      // Host the deployment does not serve, is refused before any assertion is
      // looked at. It also requires the Host to be one of the declared
      // authorities, so a valid token from an undeclared origin admits nothing.
      if (!isTrustedApiRequest(request, hosts)) return false
      return verifier.accepts(request.headers)
    },
  }
}

/**
 * Validate the Access section in full, so a typo fails the plugin load instead
 * of silently leaving an authority unauthenticated or unreachable.
 * @param access - raw `privilegedAccess.cloudflareAccess` values.
 * @param trustedHosts - the deployment's general-fence authorities.
 * @returns the resolved parameters the verifier and policy use.
 */
function resolveCloudflareAccess(
  access: CloudflareAccessConfig,
  trustedHosts: readonly string[],
): ResolvedCloudflareAccess {
  const teamOrigin = resolveTeamOrigin(access.teamOrigin)
  const audience = (access.audience ?? '').trim()
  if (audience === '') {
    throw new Error('client-connection: privilegedAccess.cloudflareAccess.audience must be the application AUD tag')
  }
  const declared = access.hosts ?? []
  if (declared.length === 0) {
    throw new Error('client-connection: privilegedAccess.cloudflareAccess.hosts must name at least one authority')
  }
  const trusted = new Set(trustedHosts.map(entry => entry.toLowerCase()))
  const hosts = declared.map((entry) => {
    assertTrustedAuthority(entry)
    if (isLoopbackHostname(new URL(`http://${entry}`).hostname)) {
      throw new Error(
        `client-connection: privilegedAccess.cloudflareAccess.hosts entry ${JSON.stringify(entry)} is loopback, `
        + 'which already reaches the privileged plane without an assertion',
      )
    }
    if (!trusted.has(entry.toLowerCase())) {
      throw new Error(
        `client-connection: privilegedAccess.cloudflareAccess.hosts entry ${JSON.stringify(entry)} `
        + 'must also appear in trustedHosts, otherwise the general fence refuses it before the assertion is read',
      )
    }
    return entry
  })
  return { teamOrigin, audience, hosts }
}

/**
 * Validate the team origin. A plaintext origin is accepted only when it is
 * loopback, where nothing crosses a network: that is the shape a test key
 * server uses, and an https origin is the shape every real deployment uses.
 * @param value - raw `teamOrigin` value.
 * @returns the origin, without a trailing path.
 */
function resolveTeamOrigin(value: string | undefined): string {
  const raw = (value ?? '').trim()
  try {
    const url = new URL(raw)
    if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '' || url.pathname !== '/') {
      throw new Error('not a bare origin')
    }
    const secure = url.protocol === 'https:'
    const plaintextOnLoopback = url.protocol === 'http:' && isLoopbackHostname(url.hostname)
    if (!secure && !plaintextOnLoopback) throw new Error('not a secure origin')
    return url.origin
  } catch {
    // The thrown value above and URL's own parse error both mean one thing:
    // this string cannot name the Access team whose keys we would trust.
    throw new Error(
      'client-connection: privilegedAccess.cloudflareAccess.teamOrigin must be an https origin '
      + '(http is accepted only for a loopback origin)',
    )
  }
}
