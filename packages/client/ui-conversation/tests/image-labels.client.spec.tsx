// @vitest-environment jsdom
// The conversation-side bridge to the ui-attachment atoms: dictionary strings
// flow through image-labels into the gallery, and assistant images keep their
// block position between text blocks.

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { AttachmentId } from '@deepseek-ai/dsh-attachment'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { es as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/es.ts'
import { AssistantMarkdown } from '../src/client/chat/AssistantMarkdown.tsx'
import { attachmentErrorText, imageSizeText } from '../src/client/image-labels.ts'
import { en, es } from '../src/client/locales.ts'

afterEach(cleanup)

const t = makeTranslate(es, commonZh)
const enT = makeTranslate(en, commonZh)

const attachment = {
  attachmentId: AttachmentId(`sha256:${'a'.repeat(64)}`),
  mediaType: 'image/png' as const,
  bytes: 68,
  width: 640,
  height: 320,
  name: 'history.png',
}

describe('attachment rejection copy', () => {
  const limits = {
    maxImageBytes: 5 * 1024 * 1024,
    maxImagesPerMessage: 20,
    maxMessageImageBytes: 100 * 1024 * 1024,
    maxImagePixels: 40_000_000,
    mediaTypes: ['image/png'] as const,
  }

  it('renders megabytes without a trailing fraction unless one exists', () => {
    expect(imageSizeText(10 * 1024 * 1024)).toBe('10MB')
    expect(imageSizeText(2.5 * 1024 * 1024)).toBe('2.5MB')
  })

  it('maps user-solvable reasons to limit-naming copy', () => {
    expect(attachmentErrorText(t, 'MODEL_DOES_NOT_SUPPORT_IMAGES')).toBe('El modelo actual no admite imágenes; cambiá a un modelo que sí')
    expect(attachmentErrorText(t, 'SUBAGENT_IMAGE_UNSUPPORTED')).toBe('Las sesiones de subagentes todavía no admiten imágenes')
    expect(attachmentErrorText(t, 'IMAGE_TOO_MANY_PIXELS')).toBe('La resolución de la imagen es demasiado alta; comprimila y volvé a intentar')
    expect(attachmentErrorText(t, 'INVALID_IMAGE')).toBe('Solo se admiten imágenes PNG, JPG, WebP y GIF')
    expect(attachmentErrorText(t, 'IMAGE_TYPE_MISMATCH')).toBe('Solo se admiten imágenes PNG, JPG, WebP y GIF')
    expect(attachmentErrorText(t, 'TOO_MANY_IMAGES', limits)).toBe('Un mensaje puede incluir hasta 20 imágenes')
    expect(attachmentErrorText(t, 'IMAGE_TOO_LARGE', limits)).toBe('Cada imagen debe pesar menos de 5MB')
    expect(attachmentErrorText(t, 'IMAGES_TOO_LARGE', limits)).toBe('Las imágenes superan 100MB en total; quitá algunas y volvé a intentar')
    expect(attachmentErrorText(enT, 'TOO_MANY_IMAGES', limits)).toBe('A message can include up to 20 images')
  })

  it('folds unknown reasons and limit reasons without projected limits into the send-failed line', () => {
    expect(attachmentErrorText(t, 'INVALID_IMAGE_BASE64')).toBe('Falló el envío de imágenes (INVALID_IMAGE_BASE64); agregalas de nuevo y reintentá')
    expect(attachmentErrorText(t, 'TOO_MANY_IMAGES')).toBe('Falló el envío de imágenes (TOO_MANY_IMAGES); agregalas de nuevo y reintentá')
    expect(attachmentErrorText(t, 'IMAGE_TOO_LARGE')).toBe('Falló el envío de imágenes (IMAGE_TOO_LARGE); agregalas de nuevo y reintentá')
    expect(attachmentErrorText(t, 'IMAGES_TOO_LARGE')).toBe('Falló el envío de imágenes (IMAGES_TOO_LARGE); agregalas de nuevo y reintentá')
  })
})

describe('assistant images through the label bridge', () => {
  it('resolves es dictionary strings and opens the lightbox on a single click', async () => {
    const view = render(
      <AssistantMarkdown
        t={t}
        blocks={[{ kind: 'image', attachment }]}
        streaming={false}
        loadImage={() => Promise.resolve('blob:history')}
      />,
    )
    const frame = await view.findByRole('button', { name: 'history.png, clic para ver el original' })
    expect(frame.getAttribute('title')).toBe('Ver original')
    await view.findByAltText('history.png')
    fireEvent.click(frame)
    expect(view.getByRole('dialog', { name: 'Vista previa de la imagen original' })).toBeTruthy()
    fireEvent.click(view.getByRole('button', { name: 'Cerrar la vista previa' }))
    expect(view.queryByRole('dialog', { name: 'Vista previa de la imagen original' })).toBeNull()
  })

  it('resolves the active English dictionary', async () => {
    const view = render(
      <AssistantMarkdown
        t={enT}
        blocks={[{ kind: 'image', attachment }]}
        streaming={false}
        loadImage={() => Promise.resolve('blob:history')}
      />,
    )
    const frame = await view.findByRole('button', { name: 'history.png, click to view original' })
    await view.findByAltText('history.png')
    fireEvent.click(frame)
    expect(view.getByRole('dialog', { name: 'Original image preview' })).toBeTruthy()
    expect(view.getByRole('button', { name: 'Close original image preview' })).toBeTruthy()
  })

  it('merges consecutive image blocks into one tiled gallery, split by text', async () => {
    const view = render(
      <AssistantMarkdown
        t={t}
        blocks={[
          { kind: 'image', attachment },
          { kind: 'image', attachment },
          { kind: 'text', text: 'between' },
          { kind: 'image', attachment },
        ]}
        streaming={false}
        loadImage={() => Promise.resolve('blob:grouped')}
      />,
    )
    await view.findAllByAltText('history.png')
    const galleries = view.container.querySelectorAll('[data-align="start"]')
    expect(galleries).toHaveLength(2)
    expect(galleries[0]?.querySelectorAll('[data-variant="tile"]')).toHaveLength(2)
    expect(galleries[1]?.querySelectorAll('[data-variant="single"]')).toHaveLength(1)
  })

  it('keeps assistant images at their original position between text blocks', async () => {
    const view = render(
      <AssistantMarkdown
        t={t}
        blocks={[
          { kind: 'text', text: 'before' },
          { kind: 'image', attachment },
          { kind: 'text', text: 'after' },
        ]}
        streaming={false}
        loadImage={() => Promise.resolve('blob:middle')}
      />,
    )
    const image = await view.findByAltText('history.png')
    const before = view.getByText('before')
    const after = view.getByText('after')
    expect(before.compareDocumentPosition(image) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
    expect(image.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
  })
})
