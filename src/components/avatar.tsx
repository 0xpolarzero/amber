import { Link } from '@tanstack/react-router'
import { usePreview } from '../preview/provider'

export function Avatar({
  personId,
  size = '',
}: {
  personId: string
  size?: '' | 'tiny' | 'large'
}) {
  const { state } = usePreview()
  const person = state.people[personId]
  return (
    <span
      className={`avatar ${size}`}
      style={{ background: person.background, color: person.color }}
    >
      {person.initials}
    </span>
  )
}
export function PersonLink({ personId }: { personId: string }) {
  const { state } = usePreview()
  return (
    <Link
      to="/people/$personId"
      params={{ personId }}
      className="avatar-button"
      aria-label={`View ${state.people[personId].name}’s profile`}
    >
      <Avatar personId={personId} />
    </Link>
  )
}
