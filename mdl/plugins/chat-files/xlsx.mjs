/**
 * Spreadsheet-to-text for dsh-chat-files.
 *
 * An `.xlsx` file is a zip of XML parts. Reading cell text needs four of them:
 * the workbook (sheet names in order), its relationship table (sheet part
 * paths), the shared string table (most text lives there once and is referenced
 * by index), and each sheet. `fflate` unzips; everything below is the small
 * amount of OOXML this reader actually needs. Formatting, charts, pivot tables
 * and formulas' own syntax stay out: a formula contributes its cached value,
 * which is what the user sees anyway.
 *
 * Dates are the one place where the file format hides meaning behind a style
 * index, so the reader also resolves a cell's number format to decide whether a
 * serial number is a date.
 */

import { unzipSync, strFromU8 } from 'fflate'

/** Excel's day one in serial terms: 1899-12-30, the value 1 being 1900-01-01. */
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30)

/** Built-in number formats that render as dates or times. */
const BUILTIN_DATE_FORMATS = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53,
  54, 55, 56, 57, 58,
])

/** Decode the XML entities a spreadsheet string may carry. */
export function decodeXmlEntities(text) {
  return String(text).replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (whole, body) => {
    if (body === 'amp') return '&'
    if (body === 'lt') return '<'
    if (body === 'gt') return '>'
    if (body === 'quot') return '"'
    if (body === 'apos') return "'"
    if (body[0] === '#') {
      const hex = body[1] === 'x' || body[1] === 'X'
      const code = hex ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10)
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
    }
    return whole
  })
}

/** One attribute of a start tag. */
function attr(tag, name) {
  const pattern = new RegExp(`(?:^|\\s)${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}="([^"]*)"`)
  const found = pattern.exec(tag)
  return found === null ? undefined : decodeXmlEntities(found[1])
}

/** The visible text of every `<t>` run inside one fragment. */
function runText(fragment) {
  let text = ''
  for (const match of String(fragment ?? '').matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) {
    text += decodeXmlEntities(match[1])
  }
  return text
}

/** The shared string table, indexed in file order. */
function sharedStrings(xml) {
  const list = []
  for (const match of String(xml ?? '').matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)) {
    list.push(runText(match[1]))
  }
  return list
}

/** Column index (0-based) of one cell reference such as `AB12`. */
function columnIndex(reference) {
  const letters = /^[A-Za-z]+/.exec(String(reference ?? ''))?.[0]
  if (letters === undefined) return undefined
  let index = 0
  for (const letter of letters.toUpperCase()) index = index * 26 + (letter.charCodeAt(0) - 64)
  return index - 1
}

/** Whether a number format renders as a date or a time. */
function isDateFormat(code) {
  const cleaned = String(code ?? '')
    // Quoted literals and escapes carry no meaning for this decision.
    .replace(/"[^"]*"/g, '')
    .replace(/\\./g, '')
    .replace(/\[[^\]]*\]/g, '')
  return /[ymdhs]/i.test(cleaned) && !/^[#0.,%eE+-]*$/.test(cleaned)
}

/** One cell value as text, resolving shared strings, booleans and dates. */
function cellValue(attributes, body, shared, styleFormats) {
  const type = attr(`<c${attributes}>`, 't')
  const styleAt = Number(attr(`<c${attributes}>`, 's'))
  const raw = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(body)?.[1]
  if (type === 'inlineStr') return runText(/<is(?:\s[^>]*)?>([\s\S]*?)<\/is>/.exec(body)?.[1])
  if (raw === undefined) return ''
  const value = decodeXmlEntities(raw)
  if (type === 's') {
    const index = Number(value)
    return Number.isInteger(index) ? shared[index] ?? '' : ''
  }
  if (type === 'str' || type === 'd') return value
  if (type === 'b') return value === '1' ? 'TRUE' : 'FALSE'
  if (type === 'e') return value
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return value
  const formatCode = Number.isInteger(styleAt) ? styleFormats.get(styleAt) : undefined
  if (formatCode === undefined) return value
  const dateLike = typeof formatCode === 'number'
    ? BUILTIN_DATE_FORMATS.has(formatCode)
    : isDateFormat(formatCode)
  if (!dateLike) return value
  const millis = EXCEL_EPOCH_MS + Math.round(numeric * 86400000)
  const date = new Date(millis)
  return Number.isNaN(date.getTime()) ? value : date.toISOString().replace('.000Z', 'Z')
}

/** Map each cell style index to the number format it renders with. */
function styleFormats(xml) {
  const formats = new Map()
  const custom = new Map()
  for (const match of String(xml ?? '').matchAll(/<numFmt\b[^>]*>/g)) {
    const id = Number(attr(match[0], 'numFmtId'))
    const code = attr(match[0], 'formatCode')
    if (Number.isInteger(id) && code !== undefined) custom.set(id, code)
  }
  const cellXfs = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(String(xml ?? ''))?.[1] ?? ''
  let index = 0
  for (const match of cellXfs.matchAll(/<xf\b[^>]*>/g)) {
    const id = Number(attr(match[0], 'numFmtId'))
    if (Number.isInteger(id)) formats.set(index, custom.get(id) ?? id)
    index += 1
  }
  return formats
}

/** Quote one CSV cell when it carries a delimiter, quote or newline. */
function csvCell(text) {
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * Extract one workbook as CSV blocks, one per sheet.
 * @param bytes - the `.xlsx` file bytes.
 * @param limits - sheet and row caps.
 * @returns the text and the notes explaining anything the caps dropped.
 */
export function xlsxToText(bytes, limits) {
  let files
  try {
    files = unzipSync(new Uint8Array(bytes), {
      // Only the parts this reader consumes are inflated.
      filter: file => /^xl\/(workbook\.xml|sharedStrings\.xml|styles\.xml|_rels\/workbook\.xml\.rels|worksheets\/[^/]+\.xml)$/.test(file.name),
    })
  } catch (error) {
    throw new Error(`the spreadsheet could not be unzipped: ${error instanceof Error ? error.message : String(error)}`)
  }
  const read = (name) => (files[name] === undefined ? '' : strFromU8(files[name]))
  const workbook = read('xl/workbook.xml')
  if (workbook === '') throw new Error('the spreadsheet has no workbook part')
  const shared = sharedStrings(read('xl/sharedStrings.xml'))
  const formats = styleFormats(read('xl/styles.xml'))

  const targets = new Map()
  for (const match of read('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(match[0], 'Id')
    const target = attr(match[0], 'Target')
    if (id !== undefined && target !== undefined) targets.set(id, target.replace(/^\/?xl\//, '').replace(/^\//, ''))
  }

  const sheets = []
  for (const match of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const name = attr(match[0], 'name') ?? 'Sheet'
    const relId = attr(match[0], 'r:id')
    const target = relId === undefined ? undefined : targets.get(relId)
    sheets.push({ name, part: target === undefined ? undefined : `xl/${target}` })
  }

  const notes = []
  const kept = sheets.slice(0, limits.maxSheets)
  if (sheets.length > kept.length) {
    notes.push(`only the first ${String(kept.length)} of ${String(sheets.length)} sheets were read`)
  }
  const blocks = []
  for (const sheet of kept) {
    const xml = sheet.part === undefined ? '' : read(sheet.part)
    const lines = [`## Sheet: ${sheet.name}`]
    let rows = 0
    let capped = false
    for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      if (rows >= limits.maxRows) {
        capped = true
        break
      }
      const cells = []
      for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const at = columnIndex(attr(`<c${cellMatch[1]}>`, 'r'))
        const value = cellValue(cellMatch[1], cellMatch[2] ?? '', shared, formats)
        if (at === undefined) {
          cells.push(value)
          continue
        }
        // A sparse row keeps its column positions: an empty cell before a value
        // is a CSV empty field, not a shifted row.
        while (cells.length < at) cells.push('')
        cells[at] = value
      }
      if (cells.length === 0) continue
      rows += 1
      lines.push(cells.map(cell => csvCell(cell)).join(','))
    }
    if (capped) notes.push(`sheet "${sheet.name}" was read up to ${String(rows)} rows`)
    blocks.push(lines.join('\n'))
  }
  return { text: blocks.join('\n\n'), notes }
}
