import { useMemo, useState } from 'react'
import DOMPurify from 'dompurify'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { Languages, ScanText, Search, Volume2 } from 'lucide-react'
import type { DocumentBlock, ReaderDocument, ReaderPreferences, SyntaxResult, TextSegment, TranslationRecord } from '../../core/document/types'
import { isSyntaxTarget } from '../../core/ai/syntax'
import { classifySelection, segmentSentences } from '../../core/language/detect'

interface SelectionAction { text: string; type: ReturnType<typeof classifySelection>; blockId: string; x: number; y: number }
interface SyntaxTarget { blockId: string; sentence: string }
interface Props {
  document: ReaderDocument
  preferences: ReaderPreferences
  translations: Map<string, TranslationRecord>
  activeSyntax: (SyntaxTarget & { result: SyntaxResult }) | null
  analyzingTarget: SyntaxTarget | null
  onLookup: (text: string) => void
  onSpeak: (text: string) => void
  onAnalyze: (sentence: string, blockId: string) => void
  onTranslateSentence: (sentence: string) => void
}

function Formula({ content, source, display = false }: { content: string; source: 'latex' | 'mathml' | 'unknown'; display?: boolean }) {
  if (source === 'latex') {
    const html = katex.renderToString(content, { displayMode: display, throwOnError: false, strict: 'warn', trust: false })
    const Tag = display ? 'div' : 'span'
    return <Tag className={display ? 'formula formula-display' : 'formula formula-inline'} dangerouslySetInnerHTML={{ __html: html }} />
  }
  if (source === 'mathml') {
    const clean = DOMPurify.sanitize(content, { USE_PROFILES: { html: true, mathMl: true } })
    return <span className="formula formula-inline" dangerouslySetInnerHTML={{ __html: clean }} />
  }
  return <code className="formula-fallback">{content}</code>
}

function RichSegments({ segments }: { segments: TextSegment[] }) {
  return <>{segments.map((segment, index) => {
    const marks = segment.marks
    if (marks?.formula) return <Formula key={index} content={segment.text} source={marks.formula} display={marks.displayFormula} />
    let node: React.ReactNode = segment.text
    if (marks?.code) node = <code>{node}</code>
    if (marks?.bold) node = <strong>{node}</strong>
    if (marks?.italic) node = <em>{node}</em>
    if (marks?.underline) node = <u>{node}</u>
    if (marks?.link) node = <a href={marks.link} target="_blank" rel="noreferrer">{node}</a>
    return <span key={index}>{node}</span>
  })}</>
}

export function sliceSegments(segments: TextSegment[], start: number, end: number) {
  const output: TextSegment[] = []
  let cursor = 0
  for (const segment of segments) {
    const segmentEnd = cursor + segment.text.length
    const from = Math.max(start, cursor)
    const to = Math.min(end, segmentEnd)
    if (from < to) output.push({ ...segment, text: segment.text.slice(from - cursor, to - cursor) })
    cursor = segmentEnd
    if (cursor >= end) break
  }
  return output
}

function SyntaxText({ text, result }: { text: string; result: SyntaxResult }) {
  const pieces = useMemo(() => {
    const points = new Set([0, text.length])
    result.spans.forEach((span) => { points.add(span.start); points.add(span.end) })
    const sorted = [...points].sort((a, b) => a - b)
    return sorted.slice(0, -1).map((start, index) => {
      const end = sorted[index + 1]
      const span = result.spans.filter((candidate) => candidate.start <= start && candidate.end >= end).sort((a, b) => (a.end - a.start) - (b.end - b.start))[0]
      return { start, end, text: text.slice(start, end), span }
    })
  }, [text, result])
  return <>{pieces.map((piece) => piece.span ? <mark key={piece.start} className={`syntax-mark role-${piece.span.role}`} title={`${piece.span.label}${piece.span.explanation ? `：${piece.span.explanation}` : ''}`}>{piece.text}<small>{piece.span.label}</small></mark> : <span key={piece.start}>{piece.text}</span>)}</>
}

function Paragraph({ block, activeSyntax, analyzingTarget, onAnalyze }: { block: Extract<DocumentBlock, { segments: unknown }>; activeSyntax: Props['activeSyntax']; analyzingTarget: Props['analyzingTarget']; onAnalyze: Props['onAnalyze'] }) {
  const text = block.segments.map((segment) => segment.text).join('')
  const sentences = segmentSentences(text, block.language ?? 'unknown')
  let cursor = 0
  return <>{sentences.map((sentence, index) => {
    const start = cursor
    const end = start + sentence.length
    cursor = end
    const core = sentence.trim()
    const leading = sentence.slice(0, sentence.indexOf(core))
    const trailing = sentence.slice(leading.length + core.length)
    const active = isSyntaxTarget(activeSyntax, block.id, core)
    const analyzing = isSyntaxTarget(analyzingTarget, block.id, core)
    return <span
      className={`sentence ${active ? 'analyzed' : ''} ${analyzing ? 'analyzing' : ''}`}
      key={`${block.id}-${index}`}
      role="button"
      tabIndex={0}
      title="点击分析句子"
      onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && core) onAnalyze(core, block.id) }}
      onClick={() => { if (!window.getSelection()?.toString().trim() && core) onAnalyze(core, block.id) }}
    >
      {active && activeSyntax ? <>{leading}<SyntaxText text={core} result={activeSyntax.result} />{trailing}</> : <RichSegments segments={sliceSegments(block.segments, start, end)} />}
    </span>
  })}</>
}

export function ReaderView(props: Props) {
  const { document, preferences, translations, activeSyntax, analyzingTarget, onLookup, onSpeak, onAnalyze, onTranslateSentence } = props
  const [selection, setSelection] = useState<SelectionAction | null>(null)
  const style = { '--reader-font-size': `${preferences.fontSize}px`, '--reader-line-height': preferences.lineHeight, '--reader-width': `${preferences.contentWidth}px`, '--paragraph-space': `${preferences.paragraphSpacing}em`, '--reader-font': preferences.fontFamily } as React.CSSProperties
  const select = () => {
    const current = window.getSelection()
    const text = current?.toString().trim() ?? ''
    if (!text || !current?.rangeCount) { setSelection(null); return }
    const range = current.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    const origin = range.commonAncestorContainer instanceof Element ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement
    const blockId = origin?.closest<HTMLElement>('[data-block-id]')?.dataset.blockId ?? 'selection'
    setSelection({ text, blockId, type: classifySelection(text), x: Math.min(rect.left + rect.width / 2, innerWidth - 150), y: rect.top + window.scrollY - 48 })
  }

  const renderBlock = (block: DocumentBlock) => {
    const translation = translations.get(block.id)
    let original: React.ReactNode
    if (block.type === 'heading') original = <h2 className={`level-${block.level ?? 2}`}><Paragraph block={block} activeSyntax={activeSyntax} analyzingTarget={analyzingTarget} onAnalyze={onAnalyze} /></h2>
    else if (block.type === 'paragraph') original = <p><Paragraph block={block} activeSyntax={activeSyntax} analyzingTarget={analyzingTarget} onAnalyze={onAnalyze} /></p>
    else if (block.type === 'quote') original = <blockquote><Paragraph block={block} activeSyntax={activeSyntax} analyzingTarget={analyzingTarget} onAnalyze={onAnalyze} /></blockquote>
    else if (block.type === 'list') original = block.ordered ? <ol>{block.items.map((item, index) => <li key={index}><RichSegments segments={item} /></li>)}</ol> : <ul>{block.items.map((item, index) => <li key={index}><RichSegments segments={item} /></li>)}</ul>
    else if (block.type === 'image') original = <figure><img src={block.src} alt={block.alt ?? ''} />{block.caption && <figcaption>{block.caption}</figcaption>}</figure>
    else if (block.type === 'table') original = <div className="table-scroll"><table><tbody>{block.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>
    else if (block.type === 'code') original = <pre><code>{block.text}</code></pre>
    else if (block.type === 'formula') original = <Formula content={block.content} source={block.source} display />
    else original = null
    return <article data-block-id={block.id} key={block.id} className={`reader-block ${translation && preferences.translationVisible ? 'has-translation' : ''} ${preferences.layout === 'parallel' ? 'parallel-block' : ''}`}>
      <div className="original-block">{original}</div>
      {translation && preferences.translationVisible && <div className="translation-block"><p>{translation.translation}</p></div>}
    </article>
  }

  return <main className="reader-area" onMouseUp={select} onTouchEnd={select} style={style}>
    <div className="paper"><header className="article-header"><span className="article-language">{document.meta.language === 'ja' ? 'JAPANESE' : document.meta.language === 'en' ? 'ENGLISH' : 'MIXED TEXT'}</span><h1>{document.meta.title || '未命名文章'}</h1>{(document.meta.author || document.meta.sourceUrl) && <p>{document.meta.author}{document.meta.author && document.meta.sourceUrl ? ' · ' : ''}{document.meta.sourceUrl && <a href={document.meta.sourceUrl} target="_blank" rel="noreferrer">查看来源</a>}</p>}</header>
      <div className="document-content">{document.blocks.map(renderBlock)}</div>
      <footer className="article-end"><i /><span>END OF READING</span><i /></footer>
    </div>
    {selection && <div className="selection-menu" style={{ left: selection.x, top: selection.y }}>
      {(selection.type === 'word' || selection.type === 'phrase') && <button onClick={() => { onLookup(selection.text); setSelection(null) }}><Search />释义</button>}
      <button onClick={() => { onSpeak(selection.text); setSelection(null) }}><Volume2 />朗读</button>
      {(selection.type === 'sentence' || selection.type === 'paragraph' || selection.type === 'phrase') && <button onClick={() => { onAnalyze(selection.text, selection.blockId); setSelection(null) }}><ScanText />句法</button>}
      {(selection.type === 'sentence' || selection.type === 'paragraph' || selection.type === 'phrase') && <button onClick={() => { onTranslateSentence(selection.text); setSelection(null) }}><Languages />翻译</button>}
    </div>}
  </main>
}
