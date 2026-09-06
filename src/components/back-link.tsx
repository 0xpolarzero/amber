import { useCanGoBack, useRouter } from '@tanstack/react-router'
import { Icon } from './icon'

export function BackLink({ title }: { title: string }) {
  const router = useRouter()
  const canGoBack = useCanGoBack()
  return (
    <div className="detail-nav">
      <button
        type="button"
        className="icon-button"
        aria-label="Go back"
        onClick={() =>
          canGoBack
            ? router.history.back()
            : router.navigate({ to: '/', search: { sort: 'latest', q: '' } })
        }
      >
        <Icon name="back" />
      </button>
      <span>{title}</span>
    </div>
  )
}
