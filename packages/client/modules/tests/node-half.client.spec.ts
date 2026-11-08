/** Node-half composition diagnostics for package metadata and built client bundles. */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import type { WebServer, WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { ClientModuleRegistry } from '../src/index.ts'

let root: string | undefined

afterEach(() => {
  if (root !== undefined) rmSync(root, { recursive: true, force: true })
  root = undefined
})

/** Create a resolvable package whose client export points at the returned path. */
function writePackage(
  packageName: string,
  metadata: Record<string, unknown> = { dsh: { client: { platform: 'web' } } },
): string {
  root ??= realpathSync(mkdtempSync(join(tmpdir(), 'dsh-client-modules-')))
  const pkgRoot = join(root, 'node_modules', ...packageName.split('/'))
  const clientPath = join(pkgRoot, 'lib', 'client.js')
  mkdirSync(pkgRoot, { recursive: true })
  writeFileSync(join(pkgRoot, 'package.json'), JSON.stringify({
    name: packageName,
    exports: {
      './client': './lib/client.js',
      './package.json': './package.json',
    },
    ...metadata,
  }))
  return clientPath
}

/** Construct the node-half service and capture its plugin-bundle route. */
function constructWithRoute(packageNames: string[]): { service: ClientModuleRegistry; route: WebRoute } {
  const ctx = new Context()
  ctx.baseUrl = pathToFileURL(root!).href + '/'
  ctx.provide('loader', {
    *entries() {
      for (const packageName of packageNames) {
        yield { options: { name: packageName }, fiber: {}, disabled: false }
      }
    },
  })
  let route: WebRoute | undefined
  const webServer: Pick<WebServer, 'port' | 'register' | 'tapIndex'> = {
    port: 0,
    register: (candidate) => {
      if (candidate.path === '/plugins') route = candidate
      return () => {}
    },
    tapIndex: () => () => {},
  }
  ctx.provide('webServer', webServer as WebServer)
  const service = new ClientModuleRegistry(ctx)
  if (route === undefined) throw new Error('client bundle route was not registered')
  return { service, route }
}

/** Construct the node-half service over the enabled fixture entries. */
function construct(packageNames: string[]): ClientModuleRegistry {
  return constructWithRoute(packageNames).service
}

describe('client bundle activation', () => {
  it('allows sibling dsh roles', () => {
    const currentName = '@fixture/current-client-field'
    const clientPath = writePackage(currentName, {
      dsh: {
        bundle: { patch: './cordis.patch.yml' },
        client: { platform: 'web' },
        profile: { bundles: [] },
      },
    })
    mkdirSync(dirname(clientPath), { recursive: true })
    writeFileSync(clientPath, 'module.exports = {}\n')
    expect(construct([currentName]).graph().entries.map(entry => entry.id)).toEqual([currentName])
  })

  it('carries a surface declaration onto the graph row', () => {
    const bootName = '@fixture/boot-row'
    const surfaceName = '@fixture/surface-row'
    for (const [name, declaration] of [
      [bootName, { platform: 'web' }],
      [surfaceName, { platform: 'web', surface: 'settings' }],
    ] as const) {
      const clientPath = writePackage(name, { dsh: { client: declaration } })
      mkdirSync(dirname(clientPath), { recursive: true })
      writeFileSync(clientPath, name)
    }
    const entries = construct([bootName, surfaceName]).graph().entries
    expect(entries.map(entry => [entry.id, entry.surface])).toEqual([
      [bootName, undefined],
      [surfaceName, 'settings'],
    ])
  })

  it('rejects a row that is both a surface row and an immediate prefetch row', () => {
    const packageName = '@fixture/surface-conflict'
    const clientPath = writePackage(packageName, {
      dsh: { client: { platform: 'web', surface: 'settings', immediately: true } },
    })
    mkdirSync(dirname(clientPath), { recursive: true })
    writeFileSync(clientPath, 'module.exports = {}\n')
    expect(() => construct([packageName])).toThrow(
      `${packageName} declares both dsh.client.surface and dsh.client.immediately`,
    )
  })

  it('rejects a non-string surface declaration', () => {
    const packageName = '@fixture/surface-invalid'
    const clientPath = writePackage(packageName, { dsh: { client: { platform: 'web', surface: 7 } } })
    mkdirSync(dirname(clientPath), { recursive: true })
    writeFileSync(clientPath, 'module.exports = {}\n')
    expect(() => construct([packageName])).toThrow(`${packageName} dsh.client.surface must be a non-empty string`)
  })

  it('groups missing bundles under one source-build instruction with a package/path list', () => {
    const firstName = '@fixture/missing-first'
    const secondName = '@fixture/missing-second'
    const firstPath = writePackage(firstName)
    const secondPath = writePackage(secondName)
    expect(() => construct([firstName, secondName])).toThrow([
      'client-modules: 2 client packages failed to compose:',
      '  client bundles not found; run `pnpm run build` before launch:',
      `    - package: ${firstName}`,
      `      path: ${firstPath}`,
      `    - package: ${secondName}`,
      `      path: ${secondPath}`,
    ].join('\n'))
  })

  it('does not report other bundle read failures as missing builds', () => {
    const packageName = '@fixture/unreadable-client'
    const clientPath = writePackage(packageName)
    mkdirSync(clientPath, { recursive: true })
    let thrown: unknown
    try {
      construct([packageName])
    } catch (error) {
      thrown = error
    }
    expect(String(thrown)).toContain('client-modules: 1 client package failed to compose:')
    expect(String(thrown)).toContain('  other failures:')
    expect(String(thrown)).toContain('EISDIR')
    expect(String(thrown)).not.toContain('pnpm run build')
  })

  it('serves the source map beside a registered client bundle', async () => {
    const packageName = '@fixture/source-map'
    const clientPath = writePackage(packageName)
    mkdirSync(dirname(clientPath), { recursive: true })
    writeFileSync(clientPath, 'module.exports = {}\n')
    const map = '{"version":3,"sources":["src/client/index.tsx"]}\n'
    writeFileSync(`${clientPath}.map`, map)
    const { route } = constructWithRoute([packageName])
    let status = 0
    let headers: Record<string, string> | undefined
    let body = ''
    const response = {
      writeHead(nextStatus: number, nextHeaders?: Record<string, string>) {
        status = nextStatus
        headers = nextHeaders
        return response
      },
      end(chunk?: Uint8Array) {
        body = chunk === undefined ? '' : Buffer.from(chunk).toString('utf8')
        return response
      },
    } as unknown as ServerResponse

    await route.handler({
      method: 'GET',
      url: `/plugins/${packageName}/client.js.map`,
      headers: {},
    } as IncomingMessage, response)

    expect(status).toBe(200)
    expect(headers).toMatchObject({
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-cache',
    })
    expect(body).toBe(map)
  })

  it('revalidates a bundle by content ETag, including the weak form a proxy publishes', async () => {
    const packageName = '@fixture/etag'
    const clientPath = writePackage(packageName)
    mkdirSync(dirname(clientPath), { recursive: true })
    writeFileSync(clientPath, 'export const bundle = 1\n')
    const { route } = constructWithRoute([packageName])
    const call = async (ifNoneMatch?: string): Promise<{ status: number; headers: Record<string, string> | undefined }> => {
      let status = 0
      let headers: Record<string, string> | undefined
      const response = {
        writeHead(nextStatus: number, nextHeaders?: Record<string, string>) {
          status = nextStatus
          headers = nextHeaders
          return response
        },
        end() {
          return response
        },
      } as unknown as ServerResponse
      await route.handler({
        method: 'GET',
        url: `/plugins/${packageName}/client.js`,
        headers: ifNoneMatch === undefined ? {} : { 'if-none-match': ifNoneMatch },
      } as unknown as IncomingMessage, response)
      return { status, headers }
    }

    const first = await call()
    expect(first.status).toBe(200)
    const etag = first.headers?.etag
    expect(etag).toMatch(/^"[A-Za-z0-9_-]+"$/)
    expect(first.headers?.['cache-control']).toBe('no-cache')

    expect((await call(etag)).status).toBe(304)
    // A compressing proxy republishes the tag as `W/"..."` and the browser echoes
    // that form, so revalidation has to compare weakly or the body is resent.
    expect((await call(`W/${etag ?? ''}`)).status).toBe(304)
    expect((await call(`"other", W/${etag ?? ''}`)).status).toBe(304)
    expect((await call('"stale-revision"')).status).toBe(200)
    expect((await call('W/"stale-revision"')).status).toBe(200)
  })
})
