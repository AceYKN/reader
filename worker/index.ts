interface Env {
  ASSETS: Fetcher
}

type Provider = 'openai' | 'gemini' | 'anthropic' | 'openrouter'
type Operation = 'translation' | 'syntax'

const json = (body: unknown, status = 200, headers: HeadersInit = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
})

function safeHostname(hostname: string) {
  const lower = hostname.toLowerCase().replace(/\.$/, '')
  if (lower === 'localhost' || lower.endsWith('.localhost') || lower.endsWith('.local')) return false
  const ipv4 = lower.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)?.slice(1).map(Number)
  if (ipv4) {
    const [a, b] = ipv4
    if (ipv4.some((part) => part > 255) || a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return false
  }
  if (lower === '[::1]' || lower.startsWith('[fc') || lower.startsWith('[fd') || lower.startsWith('[fe8') || lower.startsWith('[fe9') || lower.startsWith('[fea') || lower.startsWith('[feb')) return false
  return true
}

async function fetchUrl(request: Request) {
  let body: { url?: unknown }
  try { body = await request.json() } catch { return json({ message: '请求格式无效。' }, 400) }
  if (typeof body.url !== 'string' || body.url.length > 2048) return json({ message: '请输入有效网址。' }, 400)
  let target: URL
  try { target = new URL(body.url) } catch { return json({ message: '网址格式无效。' }, 400) }
  if (target.protocol !== 'https:' || !safeHostname(target.hostname) || target.username || target.password) return json({ message: '只允许访问公开 HTTPS 网页。' }, 400)
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    const response = await fetch(target, { redirect: 'manual', headers: { 'User-Agent': 'MarginReader/1.0 (+https://github.com/AceYKN/reader)', Accept: 'text/html,application/xhtml+xml' } })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location || redirects === 3) return json({ message: '网页重定向次数过多。' }, 400)
      target = new URL(location, target)
      if (target.protocol !== 'https:' || !safeHostname(target.hostname)) return json({ message: '网页重定向到了不安全的地址。' }, 400)
      continue
    }
    if (!response.ok) return json({ message: '无法访问该网页。网站可能禁止外部抓取。' }, 422)
    const type = response.headers.get('content-type') ?? ''
    if (!type.includes('text/html') && !type.includes('application/xhtml+xml')) return json({ message: '该网址不是 HTML 网页。' }, 415)
    const declared = Number(response.headers.get('content-length') ?? 0)
    if (declared > 3_000_000) return json({ message: '网页内容过大，请粘贴正文。' }, 413)
    const html = await response.text()
    if (html.length > 3_000_000) return json({ message: '网页内容过大，请粘贴正文。' }, 413)
    return json({ url: target.href, contentType: type, html })
  }
  return json({ message: '无法访问网页。' }, 422)
}

function promptFor(operation: Operation, payload: Record<string, unknown>) {
  if (operation === 'translation') {
    const modes: Record<string, string> = {
      faithful: 'Be maximally faithful and add nothing.', natural: 'Write natural, fluent target-language prose.', academic: 'Preserve terminology and formal academic register.', learning: 'Make the original logic and structure visible for a language learner.',
    }
    return `Translate the paragraph into ${String(payload.targetLanguage).slice(0, 40)}. ${modes[String(payload.mode)] ?? modes.faithful}\nPrevious context (may be empty): ${String(payload.context ?? '').slice(0, 600)}\nReturn only JSON: {"translation":"..."}\nParagraph:\n${String(payload.text).slice(0, 12000)}`
  }
  return `Analyze this ${String(payload.language).slice(0, 10)} sentence for a language learner. Return valid JSON only. Use UTF-16 character offsets into the exact input; never rewrite it. Roles: subject, predicate, object, complement, adverbial, modifier, clause, grammar. Include a translation into ${String(payload.targetLanguage).slice(0, 40)}, concise span explanations, grammar notes, and an estimated CEFR level with confidence from 0 to 1. Schema: {"sentence":"exact input","translation":"...","spans":[{"start":0,"end":1,"role":"subject","label":"Subject","explanation":"..."}],"grammar":[{"label":"...","explanation":"..."}],"difficulty":{"cefr":"B2","confidence":0.75}}\nInput:\n${String(payload.sentence).slice(0, 3000)}`
}

function extractJson(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  return JSON.parse(cleaned)
}

async function aiProxy(request: Request) {
  if (Number(request.headers.get('content-length') ?? 0) > 40_000) return json({ message: '请求内容过大。' }, 413)
  const key = request.headers.get('X-Provider-Key')?.trim()
  if (!key || key.length > 4096) return json({ message: '缺少 Provider API Key。' }, 401)
  let input: { provider?: Provider; model?: string; operation?: Operation; payload?: Record<string, unknown> }
  try { input = await request.json() } catch { return json({ message: '请求格式无效。' }, 400) }
  if (!input.provider || !['openai', 'gemini', 'anthropic', 'openrouter'].includes(input.provider)) return json({ message: '不支持这个 AI Provider。' }, 400)
  if (!input.operation || !['translation', 'syntax'].includes(input.operation) || !input.payload) return json({ message: '不支持这个操作。' }, 400)
  if (!input.model || !/^[\w./:-]{1,100}$/.test(input.model)) return json({ message: '模型名称无效。' }, 400)
  const prompt = promptFor(input.operation, input.payload)
  let upstream: Response
  if (input.provider === 'anthropic') {
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: input.model, max_tokens: input.operation === 'syntax' ? 4096 : 2048, temperature: 0.2, messages: [{ role: 'user', content: prompt }] }),
    })
  } else if (input.provider === 'gemini') {
    upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.model)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, responseMimeType: 'application/json' } }),
    })
  } else {
    const endpoint = input.provider === 'openai' ? 'https://api.openai.com/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions'
    upstream = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, ...(input.provider === 'openrouter' ? { 'HTTP-Referer': new URL(request.url).origin, 'X-Title': 'Margin Reader' } : {}) },
      body: JSON.stringify({ model: input.model, temperature: 0.2, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }),
    })
  }
  const raw = await upstream.json().catch(() => null) as Record<string, any> | null
  if (!upstream.ok) return json({ message: raw?.error?.message ?? `Provider 请求失败（${upstream.status}）` }, upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502)
  const content = input.provider === 'anthropic' ? raw?.content?.[0]?.text : input.provider === 'gemini' ? raw?.candidates?.[0]?.content?.parts?.[0]?.text : raw?.choices?.[0]?.message?.content
  if (typeof content !== 'string') return json({ message: 'Provider 没有返回可读取内容。' }, 502)
  try { return json({ result: extractJson(content) }) } catch { return json({ message: 'Provider 返回了无效的结构化数据，请重试。' }, 502) }
}

async function dictionary(request: Request) {
  const word = new URL(request.url).searchParams.get('word')?.trim() ?? ''
  if (!/^[A-Za-z][A-Za-z' -]{0,60}$/.test(word)) return json([], 400)
  const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`)
  if (!response.ok) return json([], response.status === 404 ? 404 : 502)
  const raw = await response.json() as Array<any>
  const entries = raw.flatMap((entry) => entry.meanings.map((meaning: any) => ({
    word: entry.word,
    phonetic: entry.phonetic || entry.phonetics?.find((item: any) => item.text)?.text,
    audio: entry.phonetics?.find((item: any) => item.audio)?.audio || undefined,
    partOfSpeech: meaning.partOfSpeech,
    definitions: meaning.definitions.slice(0, 4).map((item: any) => item.definition),
    source: 'Free Dictionary API',
  }))).slice(0, 8)
  return json(entries, 200, { 'Cache-Control': 'public, max-age=86400' })
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)
    if (url.pathname === '/api/health') return json({ ok: true, service: 'margin-reader', storage: 'local-first' })
    if (url.pathname === '/api/fetch-url' && request.method === 'POST') return fetchUrl(request)
    if (url.pathname === '/api/ai' && request.method === 'POST') return aiProxy(request)
    if (url.pathname === '/api/dictionary/free' && request.method === 'GET') return dictionary(request)
    if (url.pathname.startsWith('/api/')) return json({ message: '接口不存在。' }, 404)
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
