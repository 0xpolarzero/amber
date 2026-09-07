import { isIP } from 'node:net'
import type * as S from './schemas'
import type { NativeToolName } from './tools'

const maximumTextLength = 12_000

export type CapturedNativeOutput = {
  provenance: 'antigravity-cli-step-artifact-v1'
  status: 'success' | 'error'
  toolOutput: string
  pageContent?: string
  error?: string
}

function publicUrl(raw: string) {
  try {
    const url = new URL(raw.trim())
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      return undefined
    const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
    // Direct IP targets are unnecessary for Amber research and are rejected rather than trying
    // to maintain a partial private-range list. Provider-side DNS resolution remains outside the
    // application's control, so this is an evidence filter, not a complete SSRF boundary.
    if (
      isIP(hostname) ||
      !hostname.includes('.') ||
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    )
      return undefined
    return raw.trim()
  } catch {
    return undefined
  }
}

function captured(output: unknown): CapturedNativeOutput | undefined {
  if (!output || typeof output !== 'object') return undefined
  if (Reflect.get(output, 'provenance') !== 'antigravity-cli-step-artifact-v1') return undefined
  const status = Reflect.get(output, 'status')
  const toolOutput = Reflect.get(output, 'toolOutput')
  if (!['success', 'error'].includes(String(status)) || typeof toolOutput !== 'string')
    return undefined
  const pageContent = Reflect.get(output, 'pageContent')
  const error = Reflect.get(output, 'error')
  return {
    provenance: 'antigravity-cli-step-artifact-v1',
    status: status as CapturedNativeOutput['status'],
    toolOutput,
    ...(typeof pageContent === 'string' ? { pageContent } : {}),
    ...(typeof error === 'string' ? { error } : {}),
  }
}

function searchPages(result: CapturedNativeOutput) {
  const marker = /^Sources:\s*$/im.exec(result.toolOutput)
  if (!marker) return []
  const sourceBlock = result.toolOutput.slice(marker.index + marker[0].length)
  const pages: (typeof S.WebPage.Type)[] = []
  for (const line of sourceBlock.split('\n')) {
    const match = /^\s*\[\d+\]\s+\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)\s*$/.exec(line)
    if (!match) continue
    const url = publicUrl(match[2])
    if (!url) continue
    pages.push({
      url,
      title: match[1].slice(0, 300),
      text: result.toolOutput.slice(0, maximumTextLength),
    })
    if (pages.length === 5) break
  }
  return pages
}

function fetchedPage(input: unknown, result: CapturedNativeOutput) {
  if (!input || typeof input !== 'object' || !result.pageContent?.trim()) return undefined
  const requested = Reflect.get(input, 'Url')
  if (typeof requested !== 'string') return undefined
  const requestedUrl = publicUrl(requested)
  const receipt = /^The full content of the article at (https?:\/\/\S+) has been saved to:/im.exec(
    result.toolOutput,
  )
  const receiptUrl = receipt ? publicUrl(receipt[1]) : undefined
  const contentSource = /^Source:\s*(https?:\/\/\S+)\s*$/im.exec(result.pageContent)
  const contentUrl = contentSource ? publicUrl(contentSource[1]) : undefined
  if (
    !requestedUrl ||
    !receiptUrl ||
    !contentUrl ||
    new URL(receiptUrl).href !== new URL(requestedUrl).href ||
    new URL(contentUrl).href !== new URL(requestedUrl).href
  )
    return undefined
  const title =
    /^Title:\s*(.+)$/im.exec(result.pageContent)?.[1]?.trim() || new URL(requestedUrl).hostname
  return {
    url: requestedUrl,
    title: title.slice(0, 300),
    text: result.pageContent,
  }
}

export function fetchedPageFromNativeTool(input: unknown, output: unknown) {
  const result = captured(output)
  if (result?.status !== 'success' || !result.toolOutput.trim()) return undefined
  return fetchedPage(input, result)
}

export function pagesFromNativeTool(name: NativeToolName, input: unknown, output: unknown) {
  const result = captured(output)
  if (result?.status !== 'success' || !result.toolOutput.trim()) return []
  if (name === 'search_web') return searchPages(result)
  const page = fetchedPage(input, result)
  return page ? [{ ...page, text: page.text.slice(0, maximumTextLength) }] : []
}
