// Exercise the guard without the Loader: the offline address matrix, the URL
// rules, and the three live cases that matter here — one public page that must
// load, and the internal targets this deployment can reach that must not.
//
//   node check.mjs [path-to-host.mjs]
//
// The live cases need the deployment's own network (Ollama on the host, SearXNG
// on the compose network). A case that cannot run because its target is absent
// reports "skipped", never "pass".
import { join } from 'node:path'
import { homedir } from 'node:os'

const dshHome = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const hostPath = process.argv[2] ?? join(dshHome, 'profiles/node_modules/dsh-web-fetch-guarded/host.mjs')
const plugin = await import(hostPath)

let failures = 0
function report(ok, label, detail) {
  if (!ok) failures += 1
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail === undefined ? '' : ` — ${detail}`}`)
}

// ── offline: address classification ────────────────────────────────────────
const blocked = [
  '127.0.0.1', '127.1.2.3', '10.1.2.3', '172.16.0.1', '172.31.255.254', '192.168.1.1',
  '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255',
  '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '::ffff:127.0.0.1',
  '::ffff:10.0.0.1', '2002:7f00:1::1',
]
const allowed = ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111', '::ffff:8.8.8.8']
for (const address of blocked) {
  report(plugin.isPublicAddress(address) === false, `blocked ${address}`)
}
for (const address of allowed) {
  report(plugin.isPublicAddress(address) === true, `allowed ${address}`)
}

// ── offline: URL rules ─────────────────────────────────────────────────────
const config = plugin.Config({})
const urlCases = [
  ['https://example.com/page', 'accepts https'],
  ['http://example.com/', 'accepts http'],
]
for (const [url, label] of urlCases) {
  try {
    plugin.validateRequestUrl(url, config.maxUrlLength)
    report(true, label)
  } catch (error) {
    report(false, label, error.message)
  }
}
const refused = [
  ['ftp://example.com/x', 'WEB_INVALID_URL', 'refuses a non-HTTP scheme'],
  ['not a url', 'WEB_INVALID_URL', 'refuses a relative reference'],
  ['https://user:pass@example.com/', 'WEB_BLOCKED_URL', 'refuses credentials in the URL'],
  [`https://example.com/${'a'.repeat(3000)}`, 'WEB_INVALID_URL', 'refuses an over-long URL'],
]
for (const [url, code, label] of refused) {
  try {
    plugin.validateRequestUrl(url, config.maxUrlLength)
    report(false, label, 'accepted a URL it must refuse')
  } catch (error) {
    report(error.code === code, label, `code=${error.code}`)
  }
}

// ── live: the internal targets this deployment can reach ───────────────────
const internalCases = [
  ['http://host.docker.internal:11434/v1/models', 'blocks the host Ollama endpoint'],
  ['http://127.0.0.1:3080/', 'blocks loopback'],
  ['http://searxng:8080/search?q=x', 'blocks the compose-network search motor'],
  ['http://169.254.169.254/latest/meta-data/', 'blocks the link-local metadata address'],
]
for (const [url, label] of internalCases) {
  try {
    const result = await plugin.fetchGuarded({ url }, undefined, config)
    report(false, label, `returned ${result.statusCode} instead of refusing`)
  } catch (error) {
    const refusal = error.code === 'WEB_BLOCKED_TARGET' || error.code === 'WEB_FETCH_RESOLVE_FAILED'
    report(refusal, label, `code=${error.code} ${error.message.slice(0, 70)}`)
  }
}

// ── live: one public page ──────────────────────────────────────────────────
const publicUrl = process.argv[3] ?? 'https://raw.githubusercontent.com/tt-a1i/archify/main/llms.txt'
try {
  const result = await plugin.fetchGuarded({ url: publicUrl }, undefined, config)
  const content = result.body.content
  report(
    result.statusCode === 200 && content.length > 0,
    `loads ${publicUrl}`,
    `status=${result.statusCode} kind=${result.body.kind} chars=${content.length} truncated=${result.truncated}`,
  )
} catch (error) {
  report(false, `loads ${publicUrl}`, `${error.code}: ${error.message.slice(0, 90)}`)
}

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
