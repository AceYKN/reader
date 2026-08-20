import DOMPurify from 'dompurify'
import type { DocumentBlock, ReaderDocument, TextSegment } from './types'
import { detectLanguage } from '../language/detect'

const id = () => crypto.randomUUID()

function segmentsFrom(node: Node): TextSegment[] {
  const output: TextSegment[] = []
  const walk = (current: Node, marks: TextSegment['marks'] = {}) => {
    if (current.nodeType === Node.TEXT_NODE) {
      if (current.textContent) output.push({ text: current.textContent, marks: Object.keys(marks).length ? marks : undefined })
      return
    }
    if (!(current instanceof HTMLElement)) return
    const tag = current.tagName.toLowerCase()
    const next = {
      ...marks,
      bold: marks.bold || tag === 'strong' || tag === 'b',
      italic: marks.italic || tag === 'em' || tag === 'i',
      underline: marks.underline || tag === 'u',
      code: marks.code || tag === 'code',
      link: tag === 'a' ? current.getAttribute('href') ?? undefined : marks.link,
    }
    if (tag === 'br') output.push({ text: '\n' })
    current.childNodes.forEach((child) => walk(child, next))
  }
  walk(node)
  return output
}

function resolveUrl(value: string | null, baseUrl?: string) {
  if (!value) return ''
  try { return new URL(value, baseUrl).href } catch { return '' }
}

export function htmlToDocument(html: string, meta: ReaderDocument['meta'] = {}): ReaderDocument {
  const clean = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, mathMl: true },
    ADD_TAGS: ['math', 'mrow', 'mi', 'mn', 'mo', 'msup', 'msub', 'mfrac'],
    FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'object', 'embed'],
    FORBID_ATTR: ['style', 'srcset'],
  })
  const parsed = new DOMParser().parseFromString(clean, 'text/html')
  const blocks: DocumentBlock[] = []
  const roots = [...parsed.body.children]

  const append = (element: Element) => {
    const tag = element.tagName.toLowerCase()
    if (/^h[1-6]$/.test(tag)) {
      const segments = segmentsFrom(element)
      if (segments.some((part) => part.text.trim())) blocks.push({ id: id(), type: 'heading', level: Number(tag[1]), segments })
    } else if (tag === 'p' || tag === 'figcaption') {
      const segments = segmentsFrom(element)
      if (segments.some((part) => part.text.trim())) blocks.push({ id: id(), type: 'paragraph', segments })
    } else if (tag === 'blockquote') {
      const segments = segmentsFrom(element)
      if (segments.some((part) => part.text.trim())) blocks.push({ id: id(), type: 'quote', segments })
    } else if (tag === 'ul' || tag === 'ol') {
      const items = [...element.querySelectorAll(':scope > li')].map(segmentsFrom)
      if (items.length) blocks.push({ id: id(), type: 'list', ordered: tag === 'ol', items })
    } else if (tag === 'pre') {
      blocks.push({ id: id(), type: 'code', text: element.textContent ?? '' })
    } else if (tag === 'img') {
      const image = element as HTMLImageElement
      const src = resolveUrl(image.getAttribute('src'), meta.sourceUrl)
      if (src) blocks.push({ id: id(), type: 'image', src, alt: image.alt })
    } else if (tag === 'figure') {
      const image = element.querySelector('img')
      if (image) {
        const src = resolveUrl(image.getAttribute('src'), meta.sourceUrl)
        if (src) blocks.push({ id: id(), type: 'image', src, alt: image.alt, caption: element.querySelector('figcaption')?.textContent?.trim() })
      }
    } else if (tag === 'table') {
      const rows = [...element.querySelectorAll('tr')].map((row) => [...row.querySelectorAll('th,td')].map((cell) => cell.textContent?.trim() ?? ''))
      if (rows.length) blocks.push({ id: id(), type: 'table', rows })
    } else if (tag === 'math') {
      blocks.push({ id: id(), type: 'formula', source: 'mathml', content: element.outerHTML })
    } else {
      ;[...element.children].forEach(append)
      if (!element.children.length && element.textContent?.trim()) blocks.push({ id: id(), type: 'paragraph', segments: segmentsFrom(element) })
    }
  }
  roots.forEach(append)
  const text = blocks.map((block) => 'segments' in block ? block.segments.map((segment) => segment.text).join('') : '').join('\n')
  const language = detectLanguage(text)
  blocks.forEach((block) => { if ('language' in block) block.language = detectLanguage('segments' in block ? block.segments.map((segment) => segment.text).join('') : '') })
  const now = Date.now()
  return { id: id(), meta: { ...meta, language }, blocks, createdAt: now, updatedAt: now }
}

export function plainTextToDocument(text: string, title = '未命名文章'): ReaderDocument {
  const html = text.trim().split(/\n\s*\n/).map((paragraph) => `<p>${paragraph.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\n', '<br>')}</p>`).join('')
  return htmlToDocument(html, { title })
}
