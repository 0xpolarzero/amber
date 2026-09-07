import type * as S from './schemas'
import type { NativeToolName } from './tools'

const maximumTextLength = 12_000
const urlKeys = new Set(['url', 'Url', 'link', 'href'])

function publicUrl(raw: string) {
  try {
    const clean = raw.replace(/[),.;]+$/, '')
    const url = new URL(clean)
    if (!['http:', 'https:'].includes(url.protocol)) return undefined
    if (url.username || url.password) return undefined
    const hostname = url.hostname.replace(/^\[|\]$/g, '')
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.local') ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname.startsWith('127.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('169.254.') ||
      hostname.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    )
      return undefined
    return clean
  } catch {
    return undefined
  }
}

function outputText(output: unknown) {
  if (typeof output === 'string') return output.slice(0, maximumTextLength)
  try {
    return JSON.stringify(output).slice(0, maximumTextLength)
  } catch {
    return ''
  }
}

function resultUrls(value: unknown, found = new Set<string>()): Set<string> {
  if (typeof value === 'string') {
    for (const match of value.matchAll(/https?:\/\/[^\s<>"']+/g)) {
      const url = publicUrl(match[0])
      if (url) found.add(url)
    }
  } else if (Array.isArray(value)) {
    for (const item of value) resultUrls(item, found)
  } else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (urlKeys.has(key) && typeof item === 'string') {
        const url = publicUrl(item)
        if (url) found.add(url)
      }
      resultUrls(item, found)
    }
  }
  return found
}

export function pagesFromNativeTool(name: NativeToolName, input: unknown, output: unknown) {
  let text = outputText(output)
  const urls = resultUrls(output)
  if (name === 'read_url_content' && input && typeof input === 'object') {
    const raw = Reflect.get(input, 'Url')
    if (typeof raw === 'string') {
      const url = publicUrl(raw)
      if (url) urls.add(url)
    }
  }
  // CLI 1.1.27 exposes the successful tool name and parameters but no native web body in NDJSON.
  // A fetched URL is evidence only because parseAntigravityStream observed its completed call.
  if (!text.trim() && name === 'read_url_content' && urls.size)
    text = 'Antigravity completed read_url_content; CLI 1.1.27 omitted its page body from NDJSON.'
  if (!text.trim()) return []
  return [...urls].slice(0, 5).map((url) => ({
    url,
    title: new URL(url).hostname,
    text,
  })) satisfies (typeof S.WebPage.Type)[]
}
