// Only expose links actually present in cited Telegram messages or recorded web evidence.
export function postLinks(
  texts: readonly string[],
  webUrls: readonly string[],
) {
  const links = texts.flatMap(
    (text) => text.match(/https?:\/\/[^\s<>"`]+/g) ?? [],
  )
  return [
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
}
