// Only expose links actually present in cited Telegram messages or recorded web evidence.
export function postLinks(
  texts: readonly string[],
  webUrls: readonly string[],
) {
  const links = texts.flatMap(
    (text) => text.match(/https?:\/\/[^\s<>"`]+/g) ?? [],
  )
  const unique = [
    ...new Set(
      [...links, ...webUrls].flatMap((raw) => {
        try {
          const url = new URL(raw.replace(/[),.;!?]+$/, ''))
          if (
            !['http:', 'https:'].includes(url.protocol) ||
            url.username ||
            url.password ||
            ['t.me', 'telegram.me'].includes(url.hostname)
          )
            return []
          return [url.href]
        } catch {
          return []
        }
      }),
    ),
  ]
  return unique.filter((href) => {
    const url = new URL(href)
    if (url.hostname !== 'raw.githubusercontent.com') return true
    const [owner, repo, ref, ...path] = url.pathname.slice(1).split('/')
    const readable = `https://github.com/${owner}/${repo}/blob/${ref}/${path.join('/')}`
    return !unique.includes(readable)
  })
}
