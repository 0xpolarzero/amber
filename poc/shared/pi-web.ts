import { lookup } from 'node:dns/promises'
import { request } from 'node:https'
import { isIP } from 'node:net'

export type WebPage = { url: string; title: string; text: string }
export type PiWebOutput = {
  provenance: 'pi-web-v1'
  status: 'success' | 'error'
  pages: WebPage[]
  usage?: unknown
}

export function publicHttps(raw: string) {
  const url = new URL(raw)
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    isIP(url.hostname.replace(/^\[|\]$/g, '')) ||
    !url.hostname.includes('.') ||
    /\.(localhost|local|internal|example|test|invalid)$/i.test(url.hostname)
  )
    throw new Error('Only public HTTPS pages are supported.')
  return url
}

// Use only globally routable IPv4 addresses. Pin the validated DNS answer to the socket;
// redirects go through the same checks, preventing DNS rebinding and local-network fetches.
export function publicIpv4(address: string) {
  if (isIP(address) !== 4) return false
  const [a, b] = address.split('.').map(Number)
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && [0, 2, 168].includes(b)) ||
    (a === 198 && [18, 19, 51].includes(b)) ||
    (a === 203 && b === 0)
  )
}

export type PageResponse = { url: string; status: number; body: string; contentType?: string }

export async function fetchPublicResource(
  raw: string,
  signal: AbortSignal,
  redirects = 0,
): Promise<PageResponse> {
  if (redirects > 4) throw new Error('Too many page redirects.')
  const url = publicHttps(raw)
  const addresses = await lookup(url.hostname, { all: true, family: 4 })
  const selected = addresses.find(({ address }) => publicIpv4(address))
  if (!selected) throw new Error('The page hostname has no public IPv4 address.')
  const response = await new Promise<{
    status: number
    location?: string
    body: string
    contentType?: string
  }>((resolve, reject) => {
    const req = request(
      url,
      {
        signal,
        family: 4,
        headers: { Accept: 'text/html,text/plain', 'User-Agent': 'Amber/1.0' },
        lookup: (_host, _options, callback) => callback(null, selected.address, 4),
      },
      (res) => {
        const status = res.statusCode ?? 0
        if (status >= 300 && status < 400) {
          res.resume()
          resolve({ status, location: res.headers.location, body: '' })
          return
        }
        if (
          status !== 200 ||
          !/^(text\/|application\/(json|javascript|x-javascript))/i.test(
            res.headers['content-type'] ?? '',
          )
        ) {
          res.resume()
          reject(new Error(`Page unavailable or unsupported content (${status}).`))
          return
        }
        let size = 0
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > 1_000_000) req.destroy(new Error('Page exceeds 1 MB.'))
          else chunks.push(chunk)
        })
        res.on('error', reject)
        res.on('end', () =>
          resolve({
            status,
            body: Buffer.concat(chunks).toString('utf8'),
            contentType: res.headers['content-type'],
          }),
        )
      },
    )
    req.on('error', reject)
    req.end()
  })
  if (response.location)
    return fetchPublicResource(new URL(response.location, url).href, signal, redirects + 1)
  if (response.status !== 200) throw new Error(`Page failed (${response.status}).`)
  return { ...response, url: url.href }
}

export async function fetchPage(raw: string, signal: AbortSignal): Promise<WebPage> {
  const response = await fetchPublicResource(readableSourceUrl(raw), signal)
  return readablePage(response, signal)
}

// GitHub's file viewer is large app HTML; the raw endpoint serves the exact linked file.
export function readableSourceUrl(raw: string) {
  const url = publicHttps(raw)
  const match = /^\/([^/]+)\/([^/]+)\/blob\/(.+)$/.exec(url.pathname)
  return url.hostname === 'github.com' && match
    ? `https://raw.githubusercontent.com/${match[1]}/${match[2]}/${match[3]}`
    : url.href
}

export async function readablePage(
  response: PageResponse,
  signal: AbortSignal,
  render = async (page: PageResponse, signal: AbortSignal) => {
    const { renderPage } = await import('./pi-web-render')
    return renderPage(page, signal, fetchPublicResource)
  },
): Promise<WebPage> {
  const url = new URL(response.url)
  const html = /^text\/html/i.test(response.contentType ?? '')
  const title =
    (html ? /<title[^>]*>([\s\S]*?)<\/title>/i.exec(response.body)?.[1] : undefined) ?? url.hostname
  const text = pageText(response.body, html).slice(0, 24_000)
  if (html && text.length < 200) {
    const rendered = await render(response, signal)
    if (rendered.text.trim().length < 200)
      throw new Error('Page rendered without enough readable content to verify.')
    return {
      ...rendered,
      text: rendered.text.slice(0, 24_000),
      title: rendered.title.slice(0, 300),
    }
  }
  if (!text) throw new Error('Page returned no readable text.')
  return { url: url.href, title: title.slice(0, 300), text }
}

export function pageText(body: string, html: boolean) {
  if (!html) return body.trim()
  return body
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

// Only provider-supplied citations are evidence. The search model's prose is never a page.
// https://openrouter.ai/docs/guides/features/plugins/web-search
export async function searchWeb(
  query: string,
  apiKey: string,
  model: string,
  signal: AbortSignal,
): Promise<PiWebOutput> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: query }],
      plugins: [{ id: 'web', engine: 'exa', max_results: 5 }],
      max_tokens: 1000,
    }),
  })
  if (!response.ok) throw new Error(`OpenRouter search failed (${response.status}).`)
  const result = (await response.json()) as {
    usage?: unknown
    choices?: {
      message?: {
        annotations?: {
          type?: string
          url_citation?: { url?: string; title?: string; content?: string }
        }[]
      }
    }[]
  }
  const pages = (result.choices?.[0]?.message?.annotations ?? [])
    .flatMap((annotation) => {
      const page = annotation.url_citation
      if (annotation.type !== 'url_citation' || !page?.url) return []
      try {
        publicHttps(page.url)
      } catch {
        return []
      }
      return [
        {
          url: page.url,
          title: (page.title ?? page.url).slice(0, 300),
          text: (page.content ?? '').slice(0, 12_000),
        },
      ]
    })
    .slice(0, 5)
  return { provenance: 'pi-web-v1', status: 'success', pages, usage: result.usage }
}
