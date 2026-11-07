import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const DIST_ROOT = fileURLToPath(new URL('../dist', import.meta.url))

it('ships install metadata with the built web application', async () => {
  const index = await readFile(join(DIST_ROOT, 'index.html'), 'utf8')
  expect(index).toContain('<html lang="en">')
  expect(index).toContain('<link rel="manifest" href="/manifest.webmanifest" />')
  expect(index).toContain('<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png?v=cat-1" />')
  expect(index).toContain('<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=cat-1" />')

  const manifest: unknown = JSON.parse(await readFile(join(DIST_ROOT, 'manifest.webmanifest'), 'utf8'))
  expect(manifest).toEqual({
    id: '/',
    name: 'NIM',
    short_name: 'NIM',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    theme_color: '#D40000',
    background_color: '#F9FAFB',
    icons: [{
      src: '/apple-touch-icon.png?v=cat-1',
      sizes: '180x180',
      type: 'image/png',
      purpose: 'any',
    }, {
      src: '/icon-192.png?v=cat-1',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any',
    }, {
      src: '/icon-512.png?v=cat-1',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any',
    }, {
      src: '/icon-maskable-512.png?v=cat-1',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    }],
  })
})

it('ships the iOS home-screen tags: install label, standalone launch, page below the status bar', async () => {
  const index = await readFile(join(DIST_ROOT, 'index.html'), 'utf8')
  expect(index).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />')
  expect(index).toContain('<meta name="mobile-web-app-capable" content="yes" />')
  expect(index).toContain('<meta name="apple-mobile-web-app-title" content="NIM" />')
  // `default`, never `black-translucent`: the conversation header and the frame
  // menu reserve the width of the frame's own control, not the status bar.
  expect(index).toContain('<meta name="apple-mobile-web-app-status-bar-style" content="default" />')
  // The phone layout reaches the notch and the home indicator itself.
  expect(index).toContain('viewport-fit=cover')
})

it('ships PNG application and touch icons at their declared dimensions', async () => {
  const cases = [
    ['favicon-32.png', 32],
    ['apple-touch-icon.png', 180],
    ['icon-192.png', 192],
    ['icon-512.png', 512],
    ['icon-maskable-512.png', 512],
  ] as const
  for (const [name, dimension] of cases) {
    const png = await readFile(join(DIST_ROOT, name))
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG')
    expect(png.readUInt32BE(16)).toBe(dimension)
    expect(png.readUInt32BE(20)).toBe(dimension)
  }
})
