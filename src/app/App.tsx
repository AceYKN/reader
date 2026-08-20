import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { AlignJustify, BookMarked, ChevronDown, Columns2, FilePlus2, Languages, Library, LoaderCircle, Menu, Moon, PanelRightClose, Settings2, Sun, X } from 'lucide-react'
import { SettingsDrawer } from '../components/settings/SettingsDrawer'
import { ReaderView } from '../components/reader/ReaderView'
import { ContextPanel } from '../components/context/ContextPanel'
import type { AISettings, DictionaryEntry, ReaderDocument, ReaderPreferences, SyntaxResult, TranslationRecord } from '../core/document/types'
import { analyzeSyntax, loadAISettings, saveAISettings, translateParagraph } from '../core/ai/client'
import { translationOutcomeMessage } from '../core/ai/translation-outcome'
import { blockText, hashText } from '../core/document/hash'
import { deleteDocument, loadDocuments, loadPreferences, loadSessionDocument, loadTranslations, saveDocument, savePreferences, saveTranslation } from '../core/storage/db'
import { lookupWord, speak } from '../features/dictionary/lookup'

const ImportDialog = lazy(() => import('../components/import/ImportDialog').then((module) => ({ default: module.ImportDialog })))

const defaultPreferences: ReaderPreferences = {
  theme: 'system', fontFamily: 'serif', fontSize: 20, lineHeight: 1.8, contentWidth: 720, paragraphSpacing: 1.25,
  translationVisible: true, layout: 'parallel', targetLanguage: '简体中文', translationMode: 'learning', localPersistence: true,
}

const sample = `Reading is often described as the act of receiving information, but careful reading is closer to building a temporary world. A sentence gives us materials; attention decides how they fit together.

When we slow down enough to notice a conjunction, a change of tense, or the weight of a particular verb, the page stops being a surface. It becomes a structure we can enter, examine, and remember.

The goal is not to interrupt reading with endless explanations. It is to make help available at the exact moment curiosity appears—and then let the article become quiet again.`

function App() {
  const [document, setDocument] = useState<ReaderDocument | null>(() => loadSessionDocument())
  const [documents, setDocuments] = useState<ReaderDocument[]>([])
  const [translations, setTranslations] = useState<Map<string, TranslationRecord>>(new Map())
  const [preferences, setPreferences] = useState<ReaderPreferences>(defaultPreferences)
  const [preferencesReady, setPreferencesReady] = useState(false)
  const [ai, setAI] = useState<AISettings>(() => loadAISettings())
  const [importOpen, setImportOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [panelMode, setPanelMode] = useState<'dictionary' | 'syntax'>('dictionary')
  const [query, setQuery] = useState('')
  const [entries, setEntries] = useState<DictionaryEntry[]>([])
  const [syntax, setSyntax] = useState<SyntaxResult | null>(null)
  const [activeSyntax, setActiveSyntax] = useState<{ blockId: string; sentence: string; result: SyntaxResult } | null>(null)
  const [analyzingTarget, setAnalyzingTarget] = useState<{ blockId: string; sentence: string } | null>(null)
  const [panelLoading, setPanelLoading] = useState(false)
  const [panelError, setPanelError] = useState('')
  const [translationProgress, setTranslationProgress] = useState<{ done: number; total: number } | null>(null)
  const [notice, setNotice] = useState('')
  const panelRequest = useRef<AbortController | null>(null)

  useEffect(() => { void loadDocuments().then(setDocuments); void loadPreferences().then((saved) => { if (saved) setPreferences({ ...defaultPreferences, ...saved }); setPreferencesReady(true) }) }, [])
  useEffect(() => { saveAISettings(ai) }, [ai])
  useEffect(() => { if (preferencesReady) void savePreferences(preferences) }, [preferences, preferencesReady])
  useEffect(() => {
    const root = window.document.documentElement
    if (preferences.theme === 'system') root.removeAttribute('data-theme')
    else root.dataset.theme = preferences.theme
  }, [preferences.theme])
  useEffect(() => {
    if (!document) { setTranslations(new Map()); return }
    void loadTranslations(document.id).then((records) => setTranslations(new Map(records.map((record) => [record.blockId, record]))))
  }, [document?.id])
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 2600); return () => clearTimeout(timer) }, [notice])
  useEffect(() => () => panelRequest.current?.abort(), [])

  const readableBlocks = useMemo(() => document?.blocks.filter((block) => ['paragraph', 'heading', 'quote', 'list'].includes(block.type) && blockText(block).trim()) ?? [], [document])

  const acceptDocument = async (next: ReaderDocument) => {
    panelRequest.current?.abort(); panelRequest.current = null
    setDocument(next); setActiveSyntax(null); setAnalyzingTarget(null); setPanelOpen(false); setTranslations(new Map())
    await saveDocument(next, preferences.localPersistence)
    setDocuments(await loadDocuments())
  }

  const chooseDocument = (next: ReaderDocument) => {
    panelRequest.current?.abort(); panelRequest.current = null
    setDocument(next); setActiveSyntax(null); setAnalyzingTarget(null); setPanelOpen(false)
    sessionStorage.setItem('margin-reader:current', JSON.stringify(next)); setLibraryOpen(false)
  }

  const lookup = async (text: string) => {
    setQuery(text); setEntries([]); setPanelMode('dictionary'); setPanelOpen(true); setPanelError(''); setPanelLoading(true)
    try { setEntries(await lookupWord(text)) } catch { setPanelError('词典暂时不可用，请稍后重试。') } finally { setPanelLoading(false) }
  }

  const analyze = async (sentence: string, blockId: string) => {
    panelRequest.current?.abort()
    const controller = new AbortController()
    panelRequest.current = controller
    setPanelMode('syntax'); setPanelOpen(true); setPanelLoading(true); setPanelError(''); setSyntax(null)
    setAnalyzingTarget({ blockId, sentence })
    if (!ai.apiKey && ai.provider !== 'deepseek') { setPanelLoading(false); setAnalyzingTarget(null); panelRequest.current = null; setPanelError('这个服务商需要你的 AI API Key。请在阅读设置中配置。'); setSettingsOpen(true); return }
    try {
      const result = await analyzeSyntax(sentence, document?.meta.language ?? 'auto', preferences.targetLanguage, ai, controller.signal)
      if (panelRequest.current !== controller || controller.signal.aborted) return
      setSyntax(result); setActiveSyntax({ blockId, sentence, result })
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === 'AbortError') && panelRequest.current === controller) setPanelError(caught instanceof Error ? caught.message : '分析失败，请重试。')
    } finally {
      if (panelRequest.current === controller) { setPanelLoading(false); setAnalyzingTarget(null); panelRequest.current = null }
    }
  }

  const translateSelection = async (text: string) => {
    if (!ai.apiKey && ai.provider !== 'deepseek') { setSettingsOpen(true); setNotice('请先配置自己的 AI API Key'); return }
    panelRequest.current?.abort()
    const controller = new AbortController()
    panelRequest.current = controller
    setAnalyzingTarget(null)
    setPanelMode('syntax'); setPanelOpen(true); setPanelLoading(true); setPanelError(''); setSyntax(null)
    try {
      const translation = await translateParagraph(text, preferences.targetLanguage, preferences.translationMode, ai, undefined, controller.signal)
      if (panelRequest.current !== controller || controller.signal.aborted) return
      setSyntax({ sentence: text, translation, spans: [], grammar: [], difficulty: { cefr: 'B1', confidence: 0 } })
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === 'AbortError') && panelRequest.current === controller) setPanelError(caught instanceof Error ? caught.message : '翻译失败，请重试。')
    } finally {
      if (panelRequest.current === controller) { setPanelLoading(false); panelRequest.current = null }
    }
  }

  const translateDocument = async () => {
    if (!document || translationProgress) return
    if (!ai.apiKey && ai.provider !== 'deepseek') { setSettingsOpen(true); setNotice('请先配置自己的 AI API Key'); return }
    const queue = readableBlocks.filter((block) => !translations.has(block.id))
    if (!queue.length) { setPreferences((current) => ({ ...current, translationVisible: true })); setNotice('当前文章已经翻译完成'); return }
    let cursor = 0; let done = 0; let succeeded = 0; let failed = 0; let lastError = ''
    setTranslationProgress({ done, total: queue.length }); setPreferences((current) => ({ ...current, translationVisible: true }))
    const worker = async () => {
      while (cursor < queue.length) {
        const block = queue[cursor++]
        const text = blockText(block)
        try {
          const translation = await translateParagraph(text, preferences.targetLanguage, preferences.translationMode, ai)
          const record: TranslationRecord = { documentId: document.id, blockId: block.id, originalHash: await hashText(text), translation, edited: false }
          await saveTranslation(record); setTranslations((current) => new Map(current).set(block.id, record))
          succeeded += 1
        } catch (caught) {
          failed += 1
          lastError = caught instanceof Error ? caught.message : 'Provider 请求失败'
        }
        done += 1; setTranslationProgress({ done, total: queue.length })
      }
    }
    await Promise.all([worker(), worker()])
    setTranslationProgress(null)
    setNotice(translationOutcomeMessage(succeeded, failed, queue.length, lastError))
  }

  const updatePreferences = (next: ReaderPreferences) => setPreferences(next)
  const wordCount = document ? document.blocks.reduce((sum, block) => sum + blockText(block).trim().split(/\s+/).filter(Boolean).length, 0) : 0

  return <div className={`app-shell ${panelOpen ? 'panel-visible' : ''}`}>
    <header className="app-header">
      <button className="brand" onClick={() => setLibraryOpen(!libraryOpen)} aria-label="打开文库"><span className="brand-glyph">间</span><span><strong>页间</strong><small>MARGIN READER</small></span><ChevronDown /></button>
      <div className="desktop-nav">
        <button className="header-button" onClick={() => setImportOpen(true)}><FilePlus2 />导入</button>
        {document && <><span className="header-divider" /><div className="document-crumb"><BookMarked /><span>{document.meta.title || '未命名文章'}</span><small>{wordCount.toLocaleString()} 词</small></div></>}
      </div>
      <div className="header-actions">
        {document && <>
          <button className="header-button translate-button" onClick={() => void translateDocument()}>{translationProgress ? <LoaderCircle className="spin" /> : <Languages />}<span>{translationProgress ? `${translationProgress.done}/${translationProgress.total}` : '翻译全文'}</span></button>
          <button className="header-button compact" onClick={() => setPreferences({ ...preferences, layout: preferences.layout === 'reading' ? 'parallel' : 'reading' })}>{preferences.layout === 'reading' ? <Columns2 /> : <AlignJustify />}<span>{preferences.layout === 'reading' ? '对照' : '顺序'}</span></button>
        </>}
        <button className="header-button compact" onClick={() => setSettingsOpen(true)}><Settings2 /><span>设置</span></button>
        <button className="mobile-menu-button" onClick={() => setMobileNavOpen(!mobileNavOpen)}><Menu /></button>
      </div>
    </header>

    {libraryOpen && <><div className="library-scrim" onClick={() => setLibraryOpen(false)} /><aside className="library-panel"><header><span className="kicker">LOCAL LIBRARY</span><button className="icon-button" onClick={() => setLibraryOpen(false)}><X /></button></header><h2>本机文库</h2><button className="new-reading" onClick={() => { setLibraryOpen(false); setImportOpen(true) }}><FilePlus2 />导入新文章</button><div className="library-list">{documents.map((item) => <article className={item.id === document?.id ? 'active' : ''} key={item.id} onClick={() => chooseDocument(item)}><span>{item.meta.language === 'ja' ? '日' : 'EN'}</span><div><strong>{item.meta.title || '未命名文章'}</strong><small>{new Date(item.updatedAt).toLocaleDateString('zh-CN')}</small></div><button aria-label="删除" onClick={async (event) => { event.stopPropagation(); await deleteDocument(item.id); setDocuments(await loadDocuments()) }}><X /></button></article>)}</div>{!documents.length && <p className="library-empty">保存过的文章会出现在这里。</p>}</aside></>}

    {mobileNavOpen && <div className="mobile-nav"><button onClick={() => { setMobileNavOpen(false); setImportOpen(true) }}><FilePlus2 />导入文章</button><button onClick={() => { setMobileNavOpen(false); setLibraryOpen(true) }}><Library />本机文库</button><button onClick={() => { setMobileNavOpen(false); setSettingsOpen(true) }}><Settings2 />阅读设置</button></div>}

    {!document ? <main className="welcome">
      <div className="welcome-copy"><span className="kicker">READ · SELECT · UNDERSTAND</span><h1>让文章保持安静，<br /><em>让理解恰好出现。</em></h1><p>一个以文章本身为中心的交互式外文精读器。导入英文或日文，选择一个词、词组或句子，在需要时获得帮助。</p><div className="welcome-actions"><button className="primary large" onClick={() => setImportOpen(true)}><FilePlus2 />导入第一篇文章</button><button className="text-action" onClick={async () => { const { importText } = await import('../features/article-import/importers'); await acceptDocument(await importText(sample, 'plain', 'The Quiet Architecture of Attention')) }}>试读示例 <span>→</span></button></div><div className="privacy-line"><span>LOCAL-FIRST</span><i />无账户<i />无数据库<i />API Key 不落服务器</div></div>
      <div className="welcome-visual" aria-hidden="true"><div className="page page-back" /><div className="page page-front"><span>THE QUIET ARCHITECTURE</span><h2>Attention<br />builds a world.</h2><p>Reading is often described as the act of receiving information, but careful reading is closer to building a temporary world.</p><p className="marked-line">A sentence gives us materials;</p><small>SUBJECT</small><p>attention decides how they fit together.</p><i className="margin-note">understand,<br />then continue</i></div></div>
    </main> : <div className="workspace">
      <ReaderView document={document} preferences={preferences} translations={translations} activeSyntax={activeSyntax} analyzingTarget={analyzingTarget} onLookup={(text) => void lookup(text)} onSpeak={(text) => speak(text, document.meta.language)} onAnalyze={(sentence, blockId) => void analyze(sentence, blockId)} onTranslateSentence={(text) => void translateSelection(text)} />
      <ContextPanel open={panelOpen} mode={panelMode} query={query} entries={entries} syntax={syntax} loading={panelLoading} error={panelError} onClose={() => setPanelOpen(false)} onSpeak={(text) => speak(text, document.meta.language)} />
      {panelOpen && <button className="panel-collapse" onClick={() => setPanelOpen(false)} aria-label="收起详情"><PanelRightClose /></button>}
    </div>}

    {notice && <div className="toast">{notice}</div>}
    <Suspense fallback={null}><ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImported={(next) => void acceptDocument(next)} /></Suspense>
    <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} preferences={preferences} onPreferences={updatePreferences} ai={ai} onAI={setAI} />
  </div>
}

export default App
