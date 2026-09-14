import { Effect, Schema } from 'effect'
import { Feed } from '../domain/post'
import fixtures from './fixtures.json'
import { loadRealFeed } from './real-feed'

// Replace this read boundary with Postgres when ingestion is implemented.
export const readFeed = () => Schema.decodeUnknownEffect(Feed)(fixtures)
export const loadFeed = async () =>
  (await loadRealFeed()) ?? Effect.runPromise(readFeed())
