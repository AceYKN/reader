/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import { normalizeImportUrl } from '../../components/import/ImportDialog'
import { importFile, importText } from './importers'

describe('article imports', () => {
  it('normalizes pasted URLs without duplicating the scheme', () => {
    expect(normalizeImportUrl('example.com/story')).toBe('https://example.com/story')
    expect(normalizeImportUrl('https://example.com/story')).toBe('https://example.com/story')
    expect(normalizeImportUrl('http://example.com/story')).toBe('http://example.com/story')
  })

  it('preserves Markdown emphasis, links, code and inline formula metadata', async () => {
    const document = await importText('A **bold** [link](https://example.com), `code`, and $E=mc^2$.', 'markdown')
    const paragraph = document.blocks.find((block) => block.type === 'paragraph')
    expect(paragraph?.type).toBe('paragraph')
    if (paragraph?.type !== 'paragraph') return
    expect(paragraph.segments.some((segment) => segment.marks?.bold && segment.text === 'bold')).toBe(true)
    expect(paragraph.segments.some((segment) => segment.marks?.link === 'https://example.com' && segment.text === 'link')).toBe(true)
    expect(paragraph.segments.some((segment) => segment.marks?.code && segment.text === 'code')).toBe(true)
    expect(paragraph.segments.some((segment) => segment.marks?.formula === 'latex' && segment.text === 'E=mc^2')).toBe(true)
  })

  it('imports display formulas and allows selecting the same file content repeatedly', async () => {
    const markdown = '# Notes\n\n$$\n\\int_0^1 x^2 dx\n$$'
    const first = await importFile(new File([markdown], 'notes.md', { type: 'text/markdown' }))
    const second = await importFile(new File([markdown], 'notes.md', { type: 'text/markdown' }))
    expect(first.blocks.some((block) => block.type === 'formula' && block.source === 'latex')).toBe(true)
    expect(second.meta.title).toBe('notes')
  })
})
