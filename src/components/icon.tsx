import type { SVGProps } from 'react'

const glyphs = {
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  comment: (
    <path d="M20 11.5a8 8 0 0 1-8 8 9.7 9.7 0 0 1-3.5-.7L4 20l1.2-4.5A8 8 0 1 1 20 11.5Z" />
  ),
  bookmark: <path d="M6.5 4.5h11v16L12 17l-5.5 3.5z" />,
  group: <path d="M4 8h16M4 16h16M10 3 8 21M16 3l-2 18" />,
  arrow: <path d="M6 18 18 6M7 6h11v11" />,
  chevron: <path d="m10 6 6 6-6 6" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  back: <path d="m10 5-7 7 7 7M3 12h17" />,
  more: (
    <>
      <circle cx="5" cy="12" r=".9" fill="currentColor" />
      <circle cx="12" cy="12" r=".9" fill="currentColor" />
      <circle cx="19" cy="12" r=".9" fill="currentColor" />
    </>
  ),
  close: <path d="M6 6L18 18M6 18L18 6" />,
  share: <path d="M12 15V3m-4 4 4-4 4 4M5 11v9h14v-9" />,
  check: <path d="m5 12 4 4L19 6" />,
  telegram: <path d="m3 11 18-7-4 17-6-5-4 3v-6zM7 13 17 7l-6 9" />,
  x: <path d="m5 4 14 16M19 4 5 20M5 4h4l10 16h-4Z" />,
  spark: <path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3z" />,
  edit: <path d="m15 4 5 5M4 20l1-5L17 3l4 4L9 19z" />,
  trash: <path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" />,
  flag: <path d="M5 21V4c4-3 8 3 14 0v10c-6 3-10-3-14 0" />,
  link: (
    <path
      d="m9 15 6-6M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 10a4 4 0 0 0 6 0l4-4a4 4 0 0 0-6-6l-1 1"
      transform="translate(1 -1) scale(.9)"
    />
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
    </>
  ),
  logout: <path d="M9 4H4v16h5M14 8l4 4-4 4M8 12h10" />,
}

export type IconName = keyof typeof glyphs

type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & {
  name: IconName
}

export function Icon({ name, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {glyphs[name]}
    </svg>
  )
}
