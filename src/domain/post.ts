import { Schema } from 'effect'
import type { RealDemo } from './real-demo'

export const Person = Schema.Struct({
  name: Schema.String,
  initials: Schema.String,
  background: Schema.String,
  color: Schema.String,
  bio: Schema.String,
})
export type Person = typeof Person.Type

export const Group = Schema.Struct({ name: Schema.String })
export type Group = typeof Group.Type

export const Comment = Schema.Struct({
  id: Schema.String,
  author: Schema.String,
  text: Schema.String,
  time: Schema.String,
})
export type Comment = typeof Comment.Type

export const Post = Schema.Struct({
  id: Schema.String,
  author: Schema.String,
  publishedAt: Schema.String,
  group: Schema.String,
  time: Schema.String,
  title: Schema.String,
  summary: Schema.String,
  detail: Schema.String,
  project: Schema.String,
  domain: Schema.String,
  mark: Schema.String,
  bookmarks: Schema.Number,
  sourceUrl: Schema.optional(Schema.String),
  telegramSources: Schema.optional(
    Schema.Array(
      Schema.Struct({
        id: Schema.String,
        text: Schema.String,
        url: Schema.String,
      }),
    ),
  ),
  projectUrl: Schema.optional(Schema.String),
  projectUrls: Schema.optional(Schema.Array(Schema.String)),
  question: Schema.optional(Schema.String),
  comments: Schema.Array(Comment),
})
export type Post = typeof Post.Type

export const Feed = Schema.Struct({
  groups: Schema.Record(Schema.String, Group),
  people: Schema.Record(Schema.String, Person),
  posts: Schema.Array(Post),
})
export type Feed = typeof Feed.Type & { realDemo?: RealDemo }
