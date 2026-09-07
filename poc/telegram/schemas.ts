import { Schema } from 'effect'

const text = (max: number) => Schema.String.check(Schema.isPattern(/\S/), Schema.isMaxLength(max))
export const Id = text(200)
export const Version = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
export const Message = Schema.Struct({
  id: Id,
  sequence: Version,
  text: text(8000),
  candidateId: Schema.optionalKey(Id),
})
export const Memory = Schema.Struct({ id: Id, text: text(500) })
export const PostFields = { title: text(140), summary: text(500), detail: text(6000) }
export const Post = Schema.Struct({ id: Id, authorId: Id, version: Version, ...PostFields })
export const Receipt = Schema.Struct({ completed: Schema.Boolean })
export class Failure extends Schema.TaggedError<Failure>()('AgentFailure', {
  operation: Schema.String,
  message: Schema.String,
}) {}

// Telegram IDs stay strings. Usernames are display names, never ownership keys.
export const Batch = Schema.Struct({ batchId: Id, groupId: Id })
export const TelegramMessage = Schema.Struct({
  id: Id,
  authorId: Schema.NullOr(Id),
  text: text(8000),
  replyToId: Schema.NullOr(Id),
  albumId: Schema.NullOr(Id),
})
export const BatchContext = Schema.Struct({
  ...Batch.fields,
  messages: Schema.Array(TelegramMessage),
  newMessageIds: Schema.Array(Id).check(Schema.isMaxLength(100)),
})
export const Candidate = Schema.Struct({
  authorId: Id,
  project: text(140),
  messageIds: Schema.Array(Id).check(Schema.isMinLength(1)),
})
export const Selection = Schema.Struct({
  candidates: Schema.Array(Candidate).check(Schema.isMaxLength(20)),
  ignored: Schema.Array(Schema.Struct({ messageId: Id, reason: text(300) })),
})
export const WorkItem = Schema.Struct({
  ...Batch.fields,
  candidateId: Id,
  revision: Version,
  candidate: Candidate,
})
export const ProjectContext = Schema.Struct({
  work: WorkItem,
  messages: Schema.Array(TelegramMessage),
  clarifications: Schema.Array(Message),
  posts: Schema.Array(Post),
  memories: Schema.Array(Memory),
  unaddressed: Schema.Array(Message),
})
export const Source = Schema.Union([
  Schema.Struct({ kind: Schema.Literal('clarification'), messageId: Id }),
  Schema.Struct({ kind: Schema.Literal('telegram'), messageId: Id }),
  Schema.Struct({ kind: Schema.Literal('web'), url: text(2000) }),
])
export const Proposal = Schema.Union([
  Schema.Struct({ kind: Schema.Literal('skip'), reason: text(500) }),
  Schema.Struct({
    kind: Schema.Literal('question'),
    text: text(1000),
    sources: Schema.Array(Source),
  }),
  Schema.Struct({
    kind: Schema.Literal('post'),
    // null creates; an existing owned ID updates that project instead of duplicating it.
    existingPostId: Schema.NullOr(Id),
    expectedVersion: Schema.NullOr(Version),
    ...PostFields,
    sources: Schema.Array(Source).check(Schema.isMinLength(1)),
    question: Schema.NullOr(text(1000)),
  }),
])
export const WebPage = Schema.Struct({ url: text(2000), title: text(300), text: text(12000) })
export const Evidence = Schema.Struct({
  messages: Schema.Array(TelegramMessage),
  posts: Schema.Array(Post),
  pages: Schema.Array(WebPage),
})
export const Draft = Schema.Struct({ proposal: Proposal, evidence: Evidence })
export const ProjectResult = Schema.Struct({
  candidateId: Id,
  outcome: Schema.Literals(['created', 'updated', 'question', 'skipped', 'retry']),
  postId: Schema.NullOr(Id),
})
