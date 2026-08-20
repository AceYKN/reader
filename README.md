# 页间 · Margin Reader

一个以文章本身为中心的交互式外文精读器。导入英文或日文文章后，围绕 `read → select → understand → continue reading` 提供翻译、词典、句法高亮、OCR 与朗读。

## 已实现

- TXT、纯文本、Markdown、HTML、网页 URL、PDF、DOCX、JPG / PNG / WebP 导入
- 统一 `ReaderDocument` AST；所有后续能力与源文件格式解耦
- 英文 / 日文 / 混合文本本地识别与 `Intl.Segmenter` 句词切分
- 桌面 Context Panel 与移动端 Bottom Sheet
- DictionaryAPI.dev 英英词典、中文速释、日文罗马音辅助与浏览器 TTS
- 公益 DeepSeek Flash 翻译 / 句法分析，以及 OpenAI、Gemini、Anthropic、OpenRouter 的 BYOK 模式
- Faithful / Natural / Academic / Learning 四种翻译模式
- 段落翻译队列（并发 2）、只读左右对照译文与 IndexedDB 本地保存
- Markdown 粗体、斜体、链接、行内代码、表格及 KaTeX 数学公式渲染
- PDF.js 文本提取、Mammoth DOCX 解析、Tesseract.js 英日文 OCR
- 字体、字号、行高、宽度、主题、对照布局和隐私模式
- PWA 安装、离线静态资源缓存与 OCR 模型缓存
- Cloudflare Worker + Static Assets 单项目部署
- 固定 Provider allowlist、HTTPS-only URL 抓取、内网地址拦截、响应体与重定向限制

## 本地开发

需要 Node.js 22 或更新版本。

```bash
npm install
npm run dev
```

完整验证：

```bash
npm run check
npm audit --audit-level=high
```

## Cloudflare 部署

本项目使用 Cloudflare Vite Plugin，将 React 静态资源和 `/api/*` Worker 部署为一个 Workers 项目，而不是旧式“Pages + 独立 Worker”。

```bash
npx wrangler login
npx wrangler secret put DEEPSEEK_API_KEY
npm run deploy
```

部署名在 [`wrangler.jsonc`](./wrangler.jsonc) 中设置为 `margin-reader`。发布后检查：

```bash
curl https://<your-domain>/api/health
```

公益 DeepSeek Key 只存放在 Cloudflare Worker Secret 中，不进入前端或仓库。BYOK Key 通过 `X-Provider-Key` 在一次请求中转给固定的上游服务商；Worker 不保存 Key、文章、Prompt 或响应，也没有数据库和账户系统。

## 目录

```text
src/app                    应用编排
src/components             阅读器、导入、详情面板和设置 UI
src/core/document          Document AST、HTML 归一化与哈希
src/core/language          语言识别和选择分类
src/core/ai                Provider 无关的 AI 客户端
src/core/storage           IndexedDB 本地持久化
src/features               导入与词典功能
worker/index.ts            无状态 Cloudflare Edge Gateway
```

## 隐私与边界

- 文档和译文默认只写入本机 IndexedDB，可切换为仅会话保存。
- API Key 默认只写入当前标签页的 `sessionStorage`，关闭标签页后消失。
- 未配置个人 AI Key 时可直接使用本站的 DeepSeek Flash 公益额度；文章片段会发送给 DeepSeek 完成翻译、中文速释或句法分析。
- 扫描 PDF 当前建议先导出页面图片再走 OCR；复杂 PDF 双栏与数学公式只能尽力恢复。
- 日语完整版 JMdict 分片数据尚未随仓库分发，当前提供读音 / 罗马音辅助和 AI 语境分析。
- 正式大流量公开运行前，建议按设计书补上 Turnstile → 短期 HMAC Session Token，以进一步保护动态请求额度。

## License

MIT
