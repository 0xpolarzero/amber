import { Link } from '@tanstack/react-router'
import { Icon, type IconName } from './icon'

export function EmptyState({
  title,
  children,
  icon = 'search',
}: {
  title: string
  children: string
  icon?: IconName
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} />
      </div>
      <h2>{title}</h2>
      <p>{children}</p>
      <Link className="text-button" to="/" search={{ sort: 'latest', q: '' }}>
        Back to the feed
      </Link>
    </div>
  )
}
