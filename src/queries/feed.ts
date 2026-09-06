import { queryOptions } from '@tanstack/react-query'
import { getFeed } from '../server/functions'

export const feedQuery = queryOptions({
  queryKey: ['feed', 'sample'],
  queryFn: () => getFeed(),
  staleTime: Infinity,
})
