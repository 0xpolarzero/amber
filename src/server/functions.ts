import { createServerFn } from '@tanstack/react-start'
import { loadFeed } from './feed'

export const getFeed = createServerFn({ method: 'GET' }).handler(() =>
  loadFeed(),
)
