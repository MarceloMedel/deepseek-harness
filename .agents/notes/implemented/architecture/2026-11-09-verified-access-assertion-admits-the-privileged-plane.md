# Agent Note: A verified Access assertion admits the privileged plane

Status: implemented

## Problem

The `/api` trust fence pins the privileged method set — the configuration plane (`settings.*`), credentials (`credentials.*`), `llm.discoverModels`, the native dialogs, and the agent-preset authoring plane — to loopback by running the fence with an empty trust list. `trustedHosts` is a DNS-rebinding fence, explicitly not authentication, so no declared authority reaches those methods. A deployment served only through a tunnel therefore had no browser path to its own configuration: the Models page requested `llm.providers` and `settings.describe` together, got `200` for the catalog and `403` for the settings, and failed its whole load with a message about the provider directory.

That deployment does authenticate, one layer up: Cloudflare Access protects the hostname with an email-OTP policy and hands the origin a signed assertion per authenticated request. The pin was correct for an unauthenticated carrier; the missing piece was a way for the process to check the authentication that already happened.

## Decision

`client-connection` takes an optional `privilegedAccess.cloudflareAccess` section that names the Access team origin, the application's Audience (AUD) tag, and the authorities it applies to. With it declared, a request reaches the privileged method set when it is loopback, or when it matches the general fence for a declared authority **and** carries an assertion this process verified. Without it — the default, and the only shape upstream deployments have — the pin is unchanged.

Verification is local and cryptographic: RS256 over the compact token against the team's published keys (`<teamOrigin>/cdn-cgi/access/certs`), with `iss` equal to `teamOrigin`, `aud` naming the application, and `exp`/`nbf` current within a minute. Keys are cached in memory for an hour, an unknown `kid` forces one refetch no more than once a minute, and every other outcome — no assertion, another team, another application, an expired token, an unreachable or unusable key set — is the same `403` an assertion-free request gets. The assertion arrives in `Cf-Access-Jwt-Assertion`, or in the `CF_Authorization` cookie when the header does not reach the process.

Two properties keep the extension from becoming a second, weaker fence. The general fence runs first with the declared authorities, so an undeclared `Host` and any cross-site marker are refused before an assertion is read, and the `Origin` must still equal the Host authority. And configuration is validated in full at load: a loopback entry (already admitted), an authority the deployment does not trust, a non-canonical authority, an empty audience, or a `teamOrigin` that is not a bare https origin fails the plugin load instead of leaving an authority quietly closed. Plaintext is accepted only on a loopback `teamOrigin`, where nothing crosses a network and a test key server can stand in.

The same policy drives both places that apply the pin: the `PRIVILEGED_METHODS` check on the shared `/api` fetch handler and the `authority: 'loopback'` interceptor branch, so a loopback-authority channel and a named privileged method cannot disagree.

## Alternatives considered

**An edge-injected shared secret** (Caddy adds a header for authenticated requests, DSH compares it to a configured value) was rejected: the secret would live in two places, every container on the shared `edge` network that learned it could present it, and DSH could not distinguish a request Access authenticated from one that merely copied the header. Signature verification does not depend on the delivery path.

**A DSH-native admin token typed once in the GUI** was rejected for this deployment: it adds a login surface, a secret to store and rotate, and browser storage for it, where the deployment already has an authenticator with its own policy, revocation, and session lifetime.

**Trusting `Cf-Access-Authenticated-User-Email` or another Access-injected plain header** was rejected: those headers are only as good as the guarantee that nothing before DSH could set them, which is exactly what signature verification stops assuming.

**Unpinning the method set outright** (letting `trustedHosts` reach the configuration plane) was rejected: `settings.describe` returns every exposed namespace, `credentials.describe` reports where an arbitrary credential reference comes from, and `llm.discoverModels` makes the host fetch a caller-chosen URL — an anonymous LAN caller must not have any of that.

**Making the Models page render read-only over the public hostname** was rejected as a substitute: it would show state without allowing the write the page exists for, and it leaves the reported defect (the page fails to load) in place.

## Consequences

A deployment opts in with one value, the application's AUD tag, passed to the container; without it the bootstrap does not even apply the patch layer, so the old behavior is the default rather than a mode someone must remember to keep safe.

The trust root moved to the team's key set. A key rotation is honoured from the first unknown `kid` after the one-minute refetch interval, and a request arriving inside that interval is refused rather than delayed, which is the same failure mode as any other unverifiable assertion. Nothing is written to disk: only public keys are cached, and a refusal never carries the token.

The extension decides admission, not authority: it changes no method's privilege, authenticates nobody on its own (identity and policy stay in Cloudflare Access), and admits no undeclared authority. A stolen assertion inside its lifetime is equivalent to the Access session it belongs to, which already reaches the conversation and `bash` — the plane adds no capability that session did not have, and revoking the identity stays a Cloudflare Access policy change.

`llm.discoverModels` becomes reachable from the public hostname for that authenticated caller, so the host can be made to probe whatever it can reach. That is the same single operator who runs the agent, and the tunnel exposes the container to nobody else; the risk is recorded here rather than defended against.

Verification lives in `packages/client/connection/tests/cloudflare-access.host.spec.ts` (signature, claims, key fetching and its failure modes, against a real loopback JWKS endpoint) and `tests/node-half.host.spec.ts` (the assembled route over real HTTP: admitted authority, undeclared authority, absent and expired assertions, cross-site markers, and the loopback baseline), with a fake team fixture in `tests/access-team.fixture.ts`.
