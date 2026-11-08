// @vitest-environment jsdom
/** The first formula paints its TeX source and upgrades in place once the engine lands. */
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { MarkdownText } from '../src/markdown/MarkdownText.tsx'
import { loadMathEngine } from '../src/markdown/math-engine.ts'

afterEach(cleanup)

describe('math before the engine arrives', () => {
  it('paints the TeX source, then upgrades the same message in place', async () => {
    // This file never preloads the engine, so the first render is the real
    // on-demand path: a plain-source fallback with no KaTeX tree.
    const view = render(<MarkdownText text={'Inline $E = mc^2$ and display\n\n$$\\frac{1}{2}$$'} />)
    expect(view.container.querySelectorAll('.katex')).toHaveLength(0)
    const pending = [...view.container.querySelectorAll('.katex-pending')]
    expect(pending.map(node => node.textContent)).toEqual(['E = mc^2', '\\frac{1}{2}'])
    // Display math keeps block semantics while it waits.
    expect(pending.map(node => node.tagName)).toEqual(['SPAN', 'DIV'])

    await act(async () => { await loadMathEngine() })
    expect(view.container.querySelectorAll('.katex-pending')).toHaveLength(0)
    expect(view.container.querySelectorAll('.katex')).toHaveLength(2)
  })
})
