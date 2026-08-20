import { useMemo, useState } from 'react'
import { Languages, Search, Volume2 } from 'lucide-react'
import type { DocumentBlock, ReaderDocument, ReaderPreferences, SyntaxResult, TranslationRecord } from '../../core/document/types'
import { blockText } from '../../core/document/hash'
import { classifySelection, segmentSentences } from '../../core/language/detect'

interface SelectionAction { text: string; type: ReturnType<typeof classifySelection>; x: number; y: number }
interface Props {
  document: ReaderDocument
  preferences: ReaderPreferences
  translations: Map<string, TranslationRecord>
  activeSyntax: { sentence: string; result: SyntaxResult } | null
  onLookup: (text: string) => void
  onSpeak: (text: string) => void
  onAnalyze: (sentence: string, blockId: string) => void
  onTranslateSentence: (sentence: string) => void
  onEditTranslation: (block: DocumentBlock, value: string) => void
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

function Paragraph({ block, activeSyntax, onAnalyze }: { block: Extract<DocumentBlock, { segments: unknown }>; activeSyntax: Props['activeSyntax']; onAnalyze: Props['onAnalyze'] }) {
  const text = block.segments.map((segment) => segment.text).join('')
  const sentences = segmentSentences(text, block.language ?? 'unknown')
  return <>{sentences.map((sentence, index) => {
    const active = activeSyntax?.sentence === sentence.trim()
    return <span className={`sentence ${active ? 'analyzed' : ''}`} key={`${block.id}-${index}`} onClick={() => { if (!window.getSelection()?.toString().trim() && !active) onAnalyze(sentence.trim(), block.id) }}>
      {active ? <SyntaxText text={sentence.trim()} result={activeSyntax.result} /> : sentence}
      {!active && sentence.trim().length > 3 && <button className="sentence-analyze" onClick={(event) => { event.stopPropagation(); onAnalyze(sentence.trim(), block.id) }}>分析</button>}
    </span>
  })}</>
}

export function ReaderView(props: Props) {
  const { document, preferences, translations, activeSyntax, onLookup, onSpeak, onAnalyze, onTranslateSentence, onEditTranslation } = props
  const [selection, setSelection] = useState<SelectionAction | null>(null)
  const style = { '--reader-font-size': `${preferences.fontSize}px`, '--reader-line-height': preferences.lineHeight, '--reader-width': `${preferences.contentWidth}px`, '--paragraph-space': `${preferences.paragraphSpacing}em`, '--reader-font': preferences.fontFamily } as React.CSSProperties
  const select = () => {
    const current = window.getSelection()
    const text = current?.toString().trim() ?? ''
    if (!text || !current?.rangeCount) { setSelection(null); return }
    const rect = current.getRangeAt(0).getBoundingClientRect()
    setSelection({ text, type: classifySelection(text), x: Math.min(rect.left + rect.width / 2, innerWidth - 150), y: rect.top + window.scrollY - 48 })
  }

  const renderBlock = (block: DocumentBlock) => {
    const translation = translations.get(block.id)
    let original: React.ReactNode
    if (block.type === 'heading') original = <h2 className={`level-${block.level ?? 2}`}><Paragraph block={block} activeSyntax={activeSyntax} onAnalyze={onAnalyze} /></h2>
    else if (block.type === 'paragraph') original = <p><Paragraph block={block} activeSyntax={activeSyntax} onAnalyze={onAnalyze} /></p>
    else if (block.type === 'quote') original = <blockquote><Paragraph block={block} activeSyntax={activeSyntax} onAnalyze={onAnalyze} /></blockquote>
    else if (block.type === 'list') original = block.ordered ? <ol>{block.items.map((item, index) => <li key={index}>{item.map((part) => part.text).join('')}</li>)}</ol> : <ul>{block.items.map((item, index) => <li key={index}>{item.map((part) => part.text).join('')}</li>)}</ul>
    else if (block.type === 'image') original = <figure><img src={block.src} alt={block.alt ?? ''} />{block.caption && <figcaption>{block.caption}</figcaption>}</figure>
    else if (block.type === 'table') original = <div className="table-scroll"><table><tbody>{block.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>
    else if (block.type === 'code') original = <pre><code>{block.text}</code></pre>
    else if (block.type === 'formula') original = <div className="formula">{block.content}</div>
    else original = null
    return <article key={block.id} className={`reader-block ${translation && preferences.translationVisible ? 'has-translation' : ''} ${preferences.layout === 'parallel' ? 'parallel-block' : ''}`}>
      <div className="original-block">{original}</div>
      {translation && preferences.translationVisible && <div className="translation-block"><textarea aria-label="编辑译文" value={translation.translation} onChange={(event) => onEditTranslation(block, event.target.value)} /><small>{translation.edited ? '已编辑 · 仅存本机' : 'AI 译文 · 可直接编辑'}</small></div>}
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
      {(selection.type === 'sentence' || selection.type === 'paragraph' || selection.type === 'phrase') && <button onClick={() => { onTranslateSentence(selection.text); setSelection(null) }}><Languages />翻译</button>}
    </div>}
  </main>
}
