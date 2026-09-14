import { chromium } from '@playwright/test'
import { type PageResponse, publicHttps, type WebPage } from './pi-web'

// Routing covers every page and blocks service workers; never use route.continue/fetch.
// https://playwright.dev/docs/api/class-browsercontext#browser-context-route
export async function renderPage(
  initial: PageResponse,
  callerSignal: AbortSignal,
  fetchResource: (url: string, signal: AbortSignal) => Promise<PageResponse>,
): Promise<WebPage> {
  const signal = AbortSignal.any([callerSignal, AbortSignal.timeout(20_000)])
  signal.throwIfAborted()
  const browser = await chromium.launch({
    timeout: 10_000,
    // Unrouted browser traffic has no working egress; only our Node transport fetches.
    proxy: { server: 'http://127.0.0.1:9', bypass: '<-loopback>' },
    args: [
      '--disable-background-networking',
      '--disable-quic',
      '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
      '--host-resolver-rules=MAP * ~NOTFOUND',
    ],
  })
  const abort = () => void browser.close().catch(() => {})
  signal.addEventListener('abort', abort, { once: true })
  try {
    signal.throwIfAborted()
    const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false })
    await context.routeWebSocket('**/*', (socket) => socket.close())
    let requests = 0
    let bytes = 0
    await context.route('**/*', async (route) => {
      const request = route.request()
      try {
        if (
          request.method() !== 'GET' ||
          !['document', 'script', 'stylesheet', 'fetch', 'xhr'].includes(request.resourceType()) ||
          ++requests > 40
        ) {
          await route.abort()
          return
        }
        const url = publicHttps(request.url()).href
        const response = url === initial.url ? initial : await fetchResource(url, signal)
        bytes += Buffer.byteLength(response.body)
        if (bytes > 5_000_000) throw new Error('Rendered page exceeds 5 MB.')
        await route.fulfill({
          status: response.status,
          contentType: response.contentType,
          body: response.body,
        })
      } catch {
        await route.abort().catch(() => {})
      }
    })
    const page = await context.newPage()
    await page.goto(initial.url, { waitUntil: 'networkidle', timeout: 15_000 })
    await page.waitForFunction(() => document.body?.innerText.trim().length >= 200, undefined, {
      timeout: 3000,
    })
    return {
      url: publicHttps(page.url()).href,
      title: (await page.title()).slice(0, 300),
      text: (await page.locator('body').innerText()).trim().slice(0, 24_000),
    }
  } finally {
    signal.removeEventListener('abort', abort)
    await browser.close()
  }
}
