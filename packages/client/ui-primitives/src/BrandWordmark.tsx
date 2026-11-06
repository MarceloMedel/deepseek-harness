import type { CSSProperties } from 'react'
import clsx from 'clsx'
import type { IconProps } from './icons/props.ts'
import css from './BrandWordmark.module.css'

/**
 * Render the MDL-HARNESS brand name as scalable text.
 * @param props.size - container height in px; text scales proportionally (default 24).
 * @param props.className - extra class for layout placement.
 * @returns the decorative brand text; the owner supplies the accessible name.
 */
export function BrandWordmark({ size = 24, className }: IconProps) {
  const style = { '--mdl-brand-height': `${size}px` } as CSSProperties
  return (
    <span className={clsx(css.root, className)} style={style} aria-hidden="true">
      MDL-HARNESS
    </span>
  )
}
