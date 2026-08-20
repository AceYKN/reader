import { KeyRound, Moon, Settings, ShieldCheck, Sun, X } from 'lucide-react'
import type { AISettings, ReaderPreferences } from '../../core/document/types'
import { defaultModel } from '../../core/ai/client'

interface Props {
  open: boolean
  onClose: () => void
  preferences: ReaderPreferences
  onPreferences: (value: ReaderPreferences) => void
  ai: AISettings
  onAI: (value: AISettings) => void
}

export function SettingsDrawer({ open, onClose, preferences, onPreferences, ai, onAI }: Props) {
  return <><div className={`drawer-scrim ${open ? 'open' : ''}`} onClick={onClose} /><aside className={`settings-drawer ${open ? 'open' : ''}`} aria-hidden={!open}>
    <header><div><span className="kicker">PREFERENCES</span><h2><Settings />阅读设置</h2></div><button className="icon-button" onClick={onClose}><X /></button></header>
    <div className="settings-scroll">
      <section><h3>排版</h3>
        <label className="field"><span>字体</span><select value={preferences.fontFamily} onChange={(event) => onPreferences({ ...preferences, fontFamily: event.target.value as ReaderPreferences['fontFamily'] })}><option value="serif">衬线</option><option value="sans-serif">无衬线</option><option value="system-ui">系统字体</option></select></label>
        <label className="range-field"><span>字号 <b>{preferences.fontSize}px</b></span><input type="range" min="15" max="28" value={preferences.fontSize} onChange={(event) => onPreferences({ ...preferences, fontSize: Number(event.target.value) })} /></label>
        <label className="range-field"><span>行高 <b>{preferences.lineHeight.toFixed(1)}</b></span><input type="range" min="1.4" max="2.2" step="0.1" value={preferences.lineHeight} onChange={(event) => onPreferences({ ...preferences, lineHeight: Number(event.target.value) })} /></label>
        <label className="range-field"><span>正文宽度 <b>{preferences.contentWidth}px</b></span><input type="range" min="560" max="920" step="20" value={preferences.contentWidth} onChange={(event) => onPreferences({ ...preferences, contentWidth: Number(event.target.value) })} /></label>
      </section>
      <section><h3>外观</h3><div className="theme-choice">
        <button className={preferences.theme === 'light' ? 'active' : ''} onClick={() => onPreferences({ ...preferences, theme: 'light' })}><Sun />浅色</button>
        <button className={preferences.theme === 'dark' ? 'active' : ''} onClick={() => onPreferences({ ...preferences, theme: 'dark' })}><Moon />深色</button>
        <button className={preferences.theme === 'system' ? 'active' : ''} onClick={() => onPreferences({ ...preferences, theme: 'system' })}>自动</button>
      </div></section>
      <section><h3><KeyRound />AI · 自备 Key</h3><p className="section-help">Key 只保留在当前标签页的 sessionStorage，通过无状态边缘代理发送给你选择的服务商。</p>
        <label className="field"><span>Provider</span><select value={ai.provider} onChange={(event) => { const provider = event.target.value as AISettings['provider']; onAI({ ...ai, provider, model: defaultModel(provider) }) }}><option value="openai">OpenAI</option><option value="gemini">Google Gemini</option><option value="anthropic">Anthropic</option><option value="openrouter">OpenRouter</option><option value="deepseek">DeepSeek</option></select></label>
        <label className="field"><span>Model</span><input value={ai.model} onChange={(event) => onAI({ ...ai, model: event.target.value })} /></label>
        <label className="field"><span>API Key</span><input type="password" autoComplete="off" value={ai.apiKey} onChange={(event) => onAI({ ...ai, apiKey: event.target.value })} placeholder="仅保存在当前会话" /></label>
        <div className="privacy-note"><ShieldCheck /><span><strong>Local-first</strong> 文章、译文和阅读设置不上传到项目方数据库。</span></div>
      </section>
      <section><h3>本地数据</h3><label className="switch-row"><span><strong>保存文档到本机</strong><small>关闭后只保留到当前标签页关闭</small></span><input type="checkbox" checked={preferences.localPersistence} onChange={(event) => onPreferences({ ...preferences, localPersistence: event.target.checked })} /></label></section>
    </div>
  </aside></>
}
