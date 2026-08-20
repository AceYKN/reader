import { useRef, useState } from 'react'
import { FileText, Globe2, Image, Link2, LoaderCircle, Upload, X } from 'lucide-react'
import type { ReaderDocument } from '../../core/document/types'
import { importFile, importText, importUrl, type ImportProgress } from '../../features/article-import/importers'

interface Props { open: boolean; onClose: () => void; onImported: (document: ReaderDocument) => void }

export function ImportDialog({ open, onClose, onImported }: Props) {
  const [tab, setTab] = useState<'paste' | 'url' | 'file'>('paste')
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [markdown, setMarkdown] = useState(false)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  if (!open) return null

  const finish = (document: ReaderDocument) => { setError(''); setProgress(null); onImported(document); onClose() }
  const fail = (caught: unknown) => { setProgress(null); setError(caught instanceof Error ? caught.message : '导入失败，请换一种方式重试。') }
  const handleFile = async (file?: File) => {
    if (!file) return
    setError(''); setProgress({ stage: '正在打开文件…', progress: 1 })
    try { finish(await importFile(file, setProgress)) } catch (caught) { fail(caught) }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title">
      <header><div><span className="kicker">NEW READING</span><h2 id="import-title">把文章带到页间</h2><p>内容只在你的浏览器中处理和保存。</p></div><button className="icon-button" onClick={onClose} aria-label="关闭"><X /></button></header>
      <div className="import-tabs" role="tablist">
        <button className={tab === 'paste' ? 'active' : ''} onClick={() => setTab('paste')}><FileText />粘贴文本</button>
        <button className={tab === 'url' ? 'active' : ''} onClick={() => setTab('url')}><Link2 />网页链接</button>
        <button className={tab === 'file' ? 'active' : ''} onClick={() => setTab('file')}><Upload />上传文件</button>
      </div>
      <div className="import-body">
        {tab === 'paste' && <>
          <textarea autoFocus value={text} onChange={(event) => setText(event.target.value)} placeholder="在这里粘贴英文或日文文章…" />
          <div className="import-row"><label className="check"><input type="checkbox" checked={markdown} onChange={(event) => setMarkdown(event.target.checked)} />按 Markdown 解析</label><span>{text.length.toLocaleString()} 字符</span></div>
          <button className="primary" disabled={!text.trim() || !!progress} onClick={async () => { setProgress({ stage: '正在整理文章…' }); try { finish(await importText(text, markdown ? 'markdown' : 'plain')) } catch (caught) { fail(caught) } }}>进入阅读</button>
        </>}
        {tab === 'url' && <div className="url-import">
          <Globe2 className="large-icon" /><h3>导入公开网页</h3><p>适合新闻、博客和静态文章。登录墙与动态网站可能无法提取。</p>
          <div className="url-field"><span>https://</span><input value={url.replace(/^https:\/\//, '')} onChange={(event) => setUrl(`https://${event.target.value.replace(/^https:\/\//, '')}`)} placeholder="example.com/article" /></div>
          <button className="primary" disabled={!url.replace('https://', '').trim() || !!progress} onClick={async () => { setProgress({ stage: '正在获取并提取正文…' }); try { finish(await importUrl(url)) } catch (caught) { fail(caught) } }}>提取文章</button>
        </div>}
        {tab === 'file' && <div className="drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void handleFile(event.dataTransfer.files[0]) }} onClick={() => inputRef.current?.click()}>
          <input ref={inputRef} type="file" hidden accept=".txt,.md,.markdown,.html,.htm,.pdf,.docx,image/png,image/jpeg,image/webp" onChange={(event) => void handleFile(event.target.files?.[0])} />
          <div className="file-glyph"><Upload /></div><h3>拖放文件，或点击选择</h3><p>TXT · Markdown · HTML · PDF · DOCX · JPG · PNG · WebP</p>
          <div className="local-badges"><span><FileText />数字文档</span><span><Image />图片本地 OCR</span></div>
        </div>}
        {progress && <div className="progress-box"><LoaderCircle className="spin" /><div><strong>{progress.stage}</strong>{progress.progress !== undefined && <div className="progress-track"><i style={{ width: `${progress.progress}%` }} /></div>}</div></div>}
        {error && <p className="form-error">{error}</p>}
      </div>
    </section>
  </div>
}
