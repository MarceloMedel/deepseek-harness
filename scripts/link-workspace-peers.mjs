/**
 * Link each workspace member's workspace-resolvable peerDependencies into its
 * own `node_modules`, so a production-only install can resolve the framework
 * packages its peers name.
 *
 * Every harness package declares `@deepseek-ai/cordis` and the capability
 * services it consumes as peerDependencies plus devDependencies, following the
 * repository convention. `pnpm install --prod` skips those devDependencies, so
 * the peer links the development install provides never appear and the first
 * import of the framework fails with ERR_MODULE_NOT_FOUND. This script restores
 * exactly those links; it adds no package to the dependency closure.
 *
 * External peers (react, react-dom, …) are reported and skipped: they resolve
 * inside browser bundles, which are built before this runs, never from the Host
 * process this tree serves.
 *
 * Usage: `node scripts/link-workspace-peers.mjs [workspaceRoot]`
 */

import { mkdirSync, readFileSync, readdirSync, lstatSync, symlinkSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

/** Workspace list entry from pnpm-workspace.yaml, comment-stripped. */
const WORKSPACE_LIST_ENTRY = /^\s*-\s+(\S+)\s*(?:#.*)?$/

/**
 * Read the workspace member globs from `pnpm-workspace.yaml`.
 * @param root - absolute workspace root.
 * @returns the glob patterns, in declared order.
 */
function readWorkspacePatterns(root) {
  const lines = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8').split('\n')
  const patterns = []
  let insideList = false
  for (const line of lines) {
    if (/^packages:\s*$/.test(line)) {
      insideList = true
      continue
    }
    if (!insideList) continue
    if (/^\S/.test(line)) break
    const match = WORKSPACE_LIST_ENTRY.exec(line)
    if (match?.[1] !== undefined) patterns.push(match[1])
    else if (line.trim() !== '' && !line.trim().startsWith('#')) break
  }
  return patterns
}

/**
 * Expand one glob pattern into member directories. Only `*` segments occur in
 * pnpm-workspace.yaml, so each segment is either literal or a single wildcard.
 * @param root - absolute workspace root.
 * @param pattern - a pattern from pnpm-workspace.yaml.
 * @returns absolute member directories that contain a package.json.
 */
function expandPattern(root, pattern) {
  const segments = pattern.split('/')
  let current = [root]
  for (const segment of segments) {
    const next = []
    for (const dir of current) {
      if (segment === '*') {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (entry.isDirectory()) next.push(join(dir, entry.name))
        }
        continue
      }
      next.push(join(dir, segment))
    }
    current = next
  }
  return current.filter(dir => {
    try {
      readdirSync(dir)
      return lstatSync(join(dir, 'package.json')).isFile()
    } catch {
      // A pattern candidate that is not a readable directory with a manifest is
      // not a workspace member; every real member has both.
      return false
    }
  })
}

/**
 * Create the peer links for one member.
 * @param member - absolute member directory.
 * @param byName - workspace package name to absolute directory.
 * @param report - accumulator for the run summary.
 */
function linkMemberPeers(member, byName, report) {
  const manifest = JSON.parse(readFileSync(join(member, 'package.json'), 'utf8'))
  for (const peer of Object.keys(manifest.peerDependencies ?? {})) {
    const target = byName.get(peer)
    if (target === undefined) {
      report.externalPeers.add(peer)
      continue
    }
    const linkPath = join(member, 'node_modules', peer)
    try {
      lstatSync(linkPath)
      continue // already resolvable; the dev install or a dependency link owns it
    } catch {
      // Missing link, which is the whole point of this repair.
    }
    mkdirSync(dirname(linkPath), { recursive: true })
    symlinkSync(relative(dirname(linkPath), target), linkPath, 'dir')
    report.links += 1
    report.perPeer.set(peer, (report.perPeer.get(peer) ?? 0) + 1)
  }
}

/**
 * Link workspace peers across every workspace member.
 * @param root - absolute workspace root.
 */
function main(root) {
  const patterns = readWorkspacePatterns(root)
  if (patterns.length === 0) throw new Error('link-workspace-peers: pnpm-workspace.yaml declares no members')
  const members = []
  for (const pattern of patterns) {
    for (const dir of expandPattern(root, pattern)) {
      const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
      if (typeof manifest.name === 'string') members.push({ dir, name: manifest.name })
    }
  }
  const byName = new Map(members.map(member => [member.name, member.dir]))
  const report = { links: 0, externalPeers: new Set(), perPeer: new Map() }
  for (const member of members) linkMemberPeers(member.dir, byName, report)
  const top = [...report.perPeer.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  process.stdout.write(
    `link-workspace-peers: ${report.links} peer links across ${members.length} members`
    + (top.length > 0 ? ` (${top.map(([peer, count]) => `${peer} ×${count}`).join(', ')})` : '')
    + '\n',
  )
  if (report.externalPeers.size > 0) {
    process.stdout.write(
      `link-workspace-peers: skipped non-workspace peers: ${[...report.externalPeers].sort().join(', ')}\n`,
    )
  }
}

main(resolve(process.argv[2] ?? '.'))
