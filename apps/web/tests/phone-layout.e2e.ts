// Web e2e scenario: the phone layout. A 390x844 viewport must spend the whole
// width on the conversation (no 56px rail), open the session list as a drawer
// from the frame's own menu control, close it from the scrim, keep every
// composer control at a fingertip-sized box, and restore the three-column
// layout once the viewport widens again (SPEC-009).
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { launchWebScaffold, watchConsole, type WebScaffold } from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, saveFailureShot } from './support.ts'

const PHONE = { width: 390, height: 844 } as const
const DESKTOP = { width: 1280, height: 900 } as const
/** SIDEBAR_COLLAPSED: the rail the phone layout must not spend on a phone. */
const RAIL = 56
/** A finger needs ~36px; the desktop composer draws 28px chips and a 34px send. */
const TOUCH_FLOOR = 36

describe('web e2e: phone layout', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold()
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    // Connect the workspace at desktop width: the drawer starts closed, so the
    // sidebar's own controls are off-canvas until the menu opens them.
    await page.setViewportSize(DESKTOP)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await connectFreshWorkspace(page, scaffold.workspaceCwd)
    await page.setViewportSize(PHONE)
    await expect.poll(() => frameAttribute('data-mobile'), { timeout: 10_000 }).toBe('true')
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  /** The frame element (the grid host) of the assembled shell. */
  function frame(): ReturnType<Page['locator']> {
    return page.locator('[class*="frame"]').first()
  }

  async function frameAttribute(name: string): Promise<string | null> {
    return frame().evaluate((element, key) => element.getAttribute(key), name)
  }

  /** Horizontal box of one of the frame's three column tracks, by position. */
  async function column(index: number): Promise<{ left: number; width: number }> {
    return frame().evaluate((element, position) => {
      const column = element.children[position] as HTMLElement | undefined
      const box = column?.getBoundingClientRect()
      return { left: box?.left ?? Number.NaN, width: box?.width ?? Number.NaN }
    }, index)
  }

  it('gives the conversation the whole viewport and keeps the drawer off-canvas', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-phone-layout'))
    const center = await column(1)
    expect(Math.round(center.width)).toBe(PHONE.width)
    // The sidebar column is out of the grid flow and parked off the left edge.
    const sidebar = await column(0)
    expect(sidebar.left + sidebar.width).toBeLessThanOrEqual(0)
    expect(sidebar.width).toBeGreaterThan(RAIL)
    expect(await frameAttribute('data-drawer-open')).toBeNull()
  })

  it('opens the drawer from the menu control and closes it from the scrim', async () => {
    const menu = page.getByRole('button', { name: 'Open sessions' })
    await menu.click()
    await expect.poll(() => frameAttribute('data-drawer-open'), { timeout: 5_000 }).toBe('true')
    await expect.poll(async () => Math.round((await column(0)).left), { timeout: 5_000 }).toBe(0)
    const scrim = page.locator('[data-mobile-scrim]')
    expect(await scrim.count()).toBe(1)

    await scrim.click()
    await expect.poll(() => frameAttribute('data-drawer-open'), { timeout: 5_000 }).toBeNull()
    expect(await page.locator('[data-mobile-scrim]').count()).toBe(0)
  })

  it('draws every composer control at a fingertip-sized box', async () => {
    const boxes = await page.locator('[data-composer-card] button, [data-composer-card] select')
      .evaluateAll(elements => elements.map((element) => {
        const box = element.getBoundingClientRect()
        return { width: Math.round(box.width), height: Math.round(box.height) }
      }))
    expect(boxes.length).toBeGreaterThan(0)
    for (const box of boxes) {
      expect(box.height).toBeGreaterThanOrEqual(TOUCH_FLOOR)
      expect(box.width).toBeGreaterThanOrEqual(TOUCH_FLOOR)
    }
  })

  it('reserves the home-indicator inset under the composer', async () => {
    // The seat pads env(safe-area-inset-bottom, 0px): 0 on a desktop browser,
    // present as a resolved length (never the literal env() text) on a phone.
    const padding = await page.locator('[data-composer-seat]').evaluate(element =>
      getComputedStyle(element).paddingBottom)
    expect(padding.endsWith('px')).toBe(true)
  })

  it('restores the three-column layout and drops the phone chrome when widened', async () => {
    await page.setViewportSize(DESKTOP)
    await expect.poll(() => frameAttribute('data-mobile'), { timeout: 10_000 }).toBeNull()
    expect(await page.getByRole('button', { name: 'Open sessions' }).count()).toBe(0)
    const sidebar = await column(0)
    expect(sidebar.left).toBe(0)
    expect(Math.round(sidebar.width)).toBe(280)
    const center = await column(1)
    expect(center.width).toBe(DESKTOP.width - 280)

    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  })
})
