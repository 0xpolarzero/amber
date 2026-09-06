import { Effect, Schema } from 'effect'
import { Feed } from '../domain/post'
import fixtures from './fixtures.json'

// Replace this read boundary with Postgres when ingestion is implemented.
export const readFeed = () => Schema.decodeUnknownEffect(Feed)(fixtures)
export const loadFeed = () => Effect.runPromise(readFeed())
