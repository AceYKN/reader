import { BookOpenText, ChevronDown, LoaderCircle, Search, Volume2, X } from 'lucide-react'
import type { DictionaryEntry, SyntaxResult } from '../../core/document/types'

interface Props {
  open: boolean
  mode: 'dictionary' | 'syntax'
  query: string
  entries: DictionaryEntry[]
  syntax: SyntaxResult | null
  loading: boolean
  error: string
  onClose: () => void
  onSpeak: (text: string) => void
}

export function ContextPanel({ open, mode, query, entries, syntax, loading, error, onClose, onSpeak }: Props) {
  const translationOnly = mode === 'syntax' && syntax && syntax.spans.length === 0 && syntax.grammar.length === 0 && syntax.difficulty.confidence === 0
  const chineseDefinitions = [...new Set(entries.flatMap((entry) => entry.chineseDefinitions ?? []))]
  const chineseSource = entries.find((entry) => entry.chineseSource)?.chineseSource
  return <aside className={`context-panel ${open ? 'open' : ''}`}>
    <div className="sheet-handle"><ChevronDown /></div><header><span className="kicker">{mode === 'dictionary' ? 'DICTIONARY' : translationOnly ? 'TRANSLATION' : 'SENTENCE LAB'}</span><button className="icon-button" onClick={onClose}><X /></button></header>
    <div className="context-scroll">
      {loading && <div className="panel-state"><LoaderCircle className="spin" /><p>{mode === 'dictionary' ? '正在查找…' : <>正在拆解句子…<br />点击另一个句子会自动取消本次分析</>}</p></div>}
      {error && <div className="panel-error">{error}</div>}
      {!loading && mode === 'dictionary' && <>
        <div className="word-heading"><div><h2>{query || '选择一个词'}</h2>{entries[0]?.phonetic && <span>{entries[0].phonetic}</span>}{entries[0]?.reading && <span>{entries[0].reading} · {entries[0].romaji}</span>}</div>{query && <button className="round-action" onClick={() => onSpeak(query)}><Volume2 /></button>}</div>
        {!query && <div className="panel-empty"><Search /><h3>双击单词查看释义</h3><p>也可以选择最多八个词，按词组查询。</p></div>}
        {query && !entries.length && !error && <div className="panel-empty"><BookOpenText /><h3>没有找到词条</h3><p>你仍可以选择整句进行 AI 句法分析。</p></div>}
        {!!chineseDefinitions.length && <section className="chinese-gloss"><div><strong>中文速释</strong><span>{chineseSource}</span></div><p>{chineseDefinitions.join(' · ')}</p></section>}
        <div className="definitions">{entries.map((entry, index) => <section key={`${entry.partOfSpeech}-${index}`}><div className="definition-meta"><b>{entry.partOfSpeech ?? 'entry'}</b><span>{entry.source}</span></div>{entry.definitions.map((definition, definitionIndex) => <p key={definitionIndex}><i>{definitionIndex + 1}</i>{definition}</p>)}</section>)}</div>
      </>}
      {!loading && mode === 'syntax' && syntax && <>
        <div className="syntax-overview"><span>译文</span><p>{syntax.translation}</p>{!translationOnly && <div className="cefr"><strong>{syntax.difficulty.cefr}</strong><span>预估 CEFR<br />置信度 {Math.round(syntax.difficulty.confidence * 100)}%</span></div>}</div>
        {!translationOnly && <section className="analysis-section"><h3>句子成分</h3>{syntax.spans.map((span, index) => <article className={`span-detail role-${span.role}`} key={`${span.start}-${index}`}><span>{span.label}</span><strong>{syntax.sentence.slice(span.start, span.end)}</strong>{span.explanation && <p>{span.explanation}</p>}</article>)}</section>}
        {!!syntax.grammar.length && <section className="analysis-section grammar-notes"><h3>语法提示</h3>{syntax.grammar.map((item, index) => <article key={index}><strong>{item.label}</strong><p>{item.explanation}</p></article>)}</section>}
      </>}
    </div>
  </aside>
}
