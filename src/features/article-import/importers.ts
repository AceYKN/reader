import { Readability } from '@mozilla/readability'
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import markedKatex from 'marked-katex-extension'
import type { ReaderDocument } from '../../core/document/types'
import { htmlToDocument, plainTextToDocument } from '../../core/document/html-to-ast'

export interface ImportProgress { stage: string; progress?: number }

marked.use(markedKatex({ nonStandard: true, throwOnError: false, strict: 'warn', trust: false }))

export async function importText(text: string, format: 'plain' | 'markdown' = 'plain', title?: string) {
  if (format === 'markdown') return htmlToDocument(await marked.parse(text, { async: true }), { title: title || 'Markdown 文档' })
  return plainTextToDocument(text, title)
}

export async function importUrl(url: string): Promise<ReaderDocument> {
  const response = await fetch('/api/fetch-url', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }),
  })
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.message ?? '无法访问该网页，请粘贴正文或上传截图。')
  const payload = await response.json() as { html: string; url: string }
  const sanitized = DOMPurify.sanitize(payload.html, { WHOLE_DOCUMENT: true, FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed'] })
  const document = new DOMParser().parseFromString(sanitized, 'text/html')
  const article = new Readability(document).parse()
  if (!article?.content) throw new Error('没有识别到正文，请粘贴文章正文或上传截图。')
  return htmlToDocument(article.content, { title: article.title || new URL(payload.url).hostname, author: article.byline ?? undefined, sourceUrl: payload.url })
}

async function importPdf(file: File, onProgress?: (progress: ImportProgress) => void) {
  onProgress?.({ stage: '正在加载 PDF 解析器…', progress: 2 })
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const paragraphs: string[] = []
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    onProgress?.({ stage: `正在提取第 ${pageNumber} / ${pdf.numPages} 页…`, progress: Math.round(pageNumber / pdf.numPages * 90) })
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const items = content.items.filter((item): item is typeof item & { str: string; transform: number[]; width: number } => 'str' in item)
      .map((item) => ({ text: item.str, x: item.transform[4], y: item.transform[5], width: item.width }))
      .sort((a, b) => Math.abs(b.y - a.y) > 4 ? b.y - a.y : a.x - b.x)
    const lines: Array<{ y: number; text: string }> = []
    for (const item of items) {
      const line = lines.find((candidate) => Math.abs(candidate.y - item.y) < 4)
      if (line) line.text += `${line.text.endsWith('-') ? '' : ' '}${item.text}`
      else lines.push({ y: item.y, text: item.text })
    }
    paragraphs.push(lines.map((line) => line.text).join('\n'))
  }
  const text = paragraphs.join('\n\n').trim()
  if (!text) throw new Error('该 PDF 没有可提取文本。请将页面导出为图片后使用 OCR。')
  return plainTextToDocument(text, file.name.replace(/\.pdf$/i, ''))
}

async function importDocx(file: File, onProgress?: (progress: ImportProgress) => void) {
  onProgress?.({ stage: '正在读取 Word 文档…', progress: 15 })
  const mammoth = await import('mammoth/mammoth.browser')
  const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() })
  return htmlToDocument(result.value, { title: file.name.replace(/\.docx$/i, '') })
}

async function importImage(file: File, onProgress?: (progress: ImportProgress) => void) {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker(['eng', 'jpn'], 1, {
    logger: (message) => onProgress?.({ stage: message.status === 'recognizing text' ? '正在本地识别文字…' : '正在准备 OCR…', progress: message.progress ? Math.round(message.progress * 100) : undefined }),
  })
  try {
    const result = await worker.recognize(file)
    const confidence = result.data.confidence
    const suffix = confidence < 60 ? ' · 识别置信度较低，请校对原文' : ''
    return plainTextToDocument(result.data.text, `${file.name}${suffix}`)
  } finally { await worker.terminate() }
}

export async function importFile(file: File, onProgress?: (progress: ImportProgress) => void): Promise<ReaderDocument> {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension === 'txt') return importText(await file.text(), 'plain', file.name.replace(/\.txt$/i, ''))
  if (extension === 'md' || extension === 'markdown') return importText(await file.text(), 'markdown', file.name.replace(/\.(md|markdown)$/i, ''))
  if (extension === 'html' || extension === 'htm') return htmlToDocument(await file.text(), { title: file.name })
  if (extension === 'pdf') return importPdf(file, onProgress)
  if (extension === 'docx') return importDocx(file, onProgress)
  if (file.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp'].includes(extension ?? '')) return importImage(file, onProgress)
  throw new Error('暂不支持这种文件。请选择 TXT、Markdown、HTML、PDF、DOCX 或图片。')
}
