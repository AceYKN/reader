import { promptFor, type AIOperation } from '../src/core/ai/prompts'

type Provider = 'openai' | 'gemini' | 'anthropic' | 'openrouter' | 'deepseek'
type Operation = AIOperation
type WorkerEnv = Env & { DEEPSEEK_API_KEY?: string }

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

function extractJson(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  return JSON.parse(cleaned)
}

async function aiProxy(request: Request, env: WorkerEnv) {
  if (Number(request.headers.get('content-length') ?? 0) > 40_000) return json({ message: '请求内容过大。' }, 413)
  let input: { provider?: Provider; model?: string; operation?: Operation; payload?: Record<string, unknown> }
  try { input = await request.json() } catch { return json({ message: '请求格式无效。' }, 400) }
  if (!input.provider || !['openai', 'gemini', 'anthropic', 'openrouter', 'deepseek'].includes(input.provider)) return json({ message: '不支持这个 AI Provider。' }, 400)
  if (!input.operation || !['translation', 'syntax'].includes(input.operation) || !input.payload) return json({ message: '不支持这个操作。' }, 400)
  if (!input.model || !/^[\w./:-]{1,100}$/.test(input.model)) return json({ message: '模型名称无效。' }, 400)
  const suppliedKey = request.headers.get('X-Provider-Key')?.trim()
  const usesPublicDeepSeek = input.provider === 'deepseek' && !suppliedKey
  const key = usesPublicDeepSeek ? env.DEEPSEEK_API_KEY?.trim() : suppliedKey
  if (!key || key.length > 4096) return json({ message: usesPublicDeepSeek ? '本站 DeepSeek 公益服务暂时不可用。' : '缺少 Provider API Key。' }, usesPublicDeepSeek ? 503 : 401)
  const model = usesPublicDeepSeek ? 'deepseek-v4-flash' : input.model
  const prompt = promptFor(input.operation, input.payload)
  let upstream: Response
  if (input.provider === 'anthropic') {
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: input.operation === 'syntax' ? 4096 : 2048, temperature: 0.1, messages: [{ role: 'user', content: prompt }] }),
    })
  } else if (input.provider === 'gemini') {
    upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, responseMimeType: 'application/json' } }),
    })
  } else {
    const endpoint = input.provider === 'openai'
      ? 'https://api.openai.com/v1/chat/completions'
      : input.provider === 'deepseek'
        ? 'https://api.deepseek.com/chat/completions'
        : 'https://openrouter.ai/api/v1/chat/completions'
    upstream = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, ...(input.provider === 'openrouter' ? { 'HTTP-Referer': new URL(request.url).origin, 'X-Title': 'Margin Reader' } : {}) },
      body: JSON.stringify({ model, temperature: 0.1, max_tokens: input.operation === 'syntax' ? 4096 : 2048, response_format: { type: 'json_object' }, ...(input.provider === 'deepseek' ? { thinking: { type: 'disabled' } } : {}), messages: [{ role: 'user', content: prompt }] }),
    })
  }
  const raw = await upstream.json().catch(() => null) as Record<string, any> | null
  if (!upstream.ok) return json({ message: raw?.error?.message ?? `Provider 请求失败（${upstream.status}）` }, upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502)
  const content = input.provider === 'anthropic' ? raw?.content?.[0]?.text : input.provider === 'gemini' ? raw?.candidates?.[0]?.content?.parts?.[0]?.text : raw?.choices?.[0]?.message?.content
  if (typeof content !== 'string') return json({ message: 'Provider 没有返回可读取内容。' }, 502)
  try { return json({ result: extractJson(content) }) } catch { return json({ message: 'Provider 返回了无效的结构化数据，请重试。' }, 502) }
}

async function deepSeekChineseGloss(word: string, key?: string) {
  if (!key) return []
  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'deepseek-v4-flash',
      thinking: { type: 'disabled' },
      temperature: 0.1,
      max_tokens: 180,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: `Give 1 to 4 concise Simplified Chinese dictionary glosses for the English word or phrase below. Include distinct common parts of speech when useful. No pinyin, examples, Markdown, or commentary. Return JSON only: {"definitions":["..."]}\nWORD: ${word}` }],
    }),
  })
  if (!response.ok) return []
  const raw = await response.json().catch(() => null) as Record<string, any> | null
  const content = raw?.choices?.[0]?.message?.content
  if (typeof content !== 'string') return []
  try {
    const definitions = (extractJson(content) as { definitions?: unknown }).definitions
    return Array.isArray(definitions) ? definitions.filter((value): value is string => typeof value === 'string' && /[\u3400-\u9fff]/.test(value)).slice(0, 4) : []
  } catch { return [] }
}

async function dictionary(request: Request, env: WorkerEnv) {
  const word = new URL(request.url).searchParams.get('word')?.trim() ?? ''
  if (!/^[A-Za-z][A-Za-z' -]{0,60}$/.test(word)) return json([], 400)
  const chineseUrl = new URL('https://api.mymemory.translated.net/get')
  chineseUrl.searchParams.set('q', word)
  chineseUrl.searchParams.set('langpair', 'en|zh-CN')
  const [response, chineseResponse] = await Promise.all([
    fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`),
    fetch(chineseUrl),
  ])
  const raw = response.ok ? await response.json() as Array<any> : []
  const chineseRaw = chineseResponse.ok ? await chineseResponse.json().catch(() => null) as { responseData?: { translatedText?: string }; matches?: Array<{ translation?: string }> } | null : null
  let chineseDefinitions = Array.from(new Set([
    chineseRaw?.responseData?.translatedText,
    ...(chineseRaw?.matches?.map((match) => match.translation) ?? []),
  ].filter((value): value is string => typeof value === 'string' && /[\u3400-\u9fff]/.test(value)).map((value) => value.trim()))).slice(0, 4)
  let chineseSource = 'MyMemory 中英翻译记忆库'
  if (!chineseDefinitions.length) {
    chineseDefinitions = await deepSeekChineseGloss(word, env.DEEPSEEK_API_KEY?.trim())
    chineseSource = 'DeepSeek Flash 中文速释'
  }
  const entries = raw.flatMap((entry) => entry.meanings.map((meaning: any) => ({
    word: entry.word,
    phonetic: entry.phonetic || entry.phonetics?.find((item: any) => item.text)?.text,
    audio: entry.phonetics?.find((item: any) => item.audio)?.audio || undefined,
    partOfSpeech: meaning.partOfSpeech,
    definitions: meaning.definitions.slice(0, 4).map((item: any) => item.definition),
    source: 'DictionaryAPI.dev',
  }))).slice(0, 8)
  if (entries.length) Object.assign(entries[0], { chineseDefinitions, chineseSource })
  else if (chineseDefinitions.length) entries.push({ word, partOfSpeech: '中英速释', definitions: [], source: 'DictionaryAPI.dev', chineseDefinitions, chineseSource })
  if (!entries.length) return json([], response.status === 404 ? 404 : 502)
  return json(entries, 200, { 'Cache-Control': 'public, max-age=3600' })
}

export default {
  async fetch(request: Request, env: WorkerEnv) {
    const url = new URL(request.url)
    if (url.pathname === '/api/health') return json({ ok: true, service: 'margin-reader', storage: 'local-first' })
    if (url.pathname === '/api/fetch-url' && request.method === 'POST') return fetchUrl(request)
    if (url.pathname === '/api/ai' && request.method === 'POST') return aiProxy(request, env)
    if ((url.pathname === '/api/dictionary/en-zh' || url.pathname === '/api/dictionary/free') && request.method === 'GET') return dictionary(request, env)
    if (url.pathname.startsWith('/api/')) return json({ message: '接口不存在。' }, 404)
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<WorkerEnv>
