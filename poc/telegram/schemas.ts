import { Schema } from 'effect'

export { Failure } from '../shared/runtime'

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
  associations: Schema.Array(
    Schema.Struct({
      messageId: Id,
      targetId: Id,
      targetKind: Schema.Literals(['post', 'candidate']),
      ownerId: Id,
    }),
  ).check(Schema.isMaxLength(100)),
})
export const PublicProject = Schema.Struct({
  targetId: Id,
  targetKind: Schema.Literals(['post', 'candidate']),
  ownerId: Id,
  ownerName: text(140),
  project: text(140),
  knownLinks: Schema.Array(text(2_000)).check(Schema.isMaxLength(8)),
  version: Version,
})
export const ProjectSearchPage = Schema.Struct({
  items: Schema.Array(PublicProject).check(Schema.isMaxLength(20)),
  nextCursor: Schema.NullOr(Version),
})
export const Target = Schema.Union([
  Schema.Struct({ kind: Schema.Literal('new'), ownerId: Id }),
  Schema.Struct({ kind: Schema.Literal('existing'), targetId: Id }),
])
export const Candidate = Schema.Struct({
  // The actor supplied the fresh evidence. Existing targets derive their owner from targetId.
  authorId: Id,
  project: text(140),
  messageIds: Schema.Array(Id).check(Schema.isMinLength(1)),
  target: Target,
})
export const ModelSelection = Schema.Struct({
  candidates: Schema.Array(Candidate).check(Schema.isMaxLength(100)),
  ignored: Schema.Array(Schema.Struct({ messageId: Id, reason: text(300) })),
  unresolved: Schema.Array(Schema.Struct({ messageId: Id, reason: text(300) })),
})
export const Selection = Schema.Struct({
  ...ModelSelection.fields,
  lookedUpProjects: Schema.Array(PublicProject).check(Schema.isMaxLength(160)),
})
export const WorkItem = Schema.Struct({
  ...Batch.fields,
  candidateId: Id,
  revision: Version,
  ownerId: Id,
  candidate: Candidate,
})
export const PendingRequest = Schema.Struct({
  id: Id,
  sequence: Version,
  text: text(2_000),
  intent: Schema.Literals(['question', 'request', 'suggestion']),
  linkedPostId: Schema.NullOr(Id),
  pendingCandidateId: Schema.NullOr(Id),
  addressed: Schema.Boolean,
})
export const ProjectContext = Schema.Struct({
  work: WorkItem,
  messages: Schema.Array(TelegramMessage),
  clarifications: Schema.Array(Message),
  selectedPost: Schema.NullOr(Post),
  selectedCandidate: Schema.NullOr(
    Schema.Struct({
      id: Id,
      authorId: Id,
      version: Version,
      title: text(140),
      summary: text(500),
      detail: text(6_000),
    }),
  ),
  memories: Schema.Array(Memory),
  pendingRequests: Schema.Array(PendingRequest).check(Schema.isMaxLength(20)),
})
export const Source = Schema.Union([
  Schema.Struct({ kind: Schema.Literal('clarification'), messageId: Id }),
  Schema.Struct({ kind: Schema.Literal('telegram'), messageId: Id }),
  Schema.Struct({ kind: Schema.Literal('web'), url: text(2000) }),
])
export const PostEdit = Schema.Struct({
  // null creates; an existing owned ID updates that project instead of duplicating it.
  existingPostId: Schema.NullOr(Id),
  expectedVersion: Schema.NullOr(Version),
  ...PostFields,
  sources: Schema.Array(Source).check(Schema.isMinLength(1)),
})
export const RequestResolution = Schema.Struct({
  requestMessageId: Id,
  outcome: Schema.Literals(['answered', 'ignored']),
  reason: text(500),
  sources: Schema.Array(Source).check(Schema.isMinLength(1)),
})
export const FactualQuestion = Schema.Struct({
  text: text(1_000),
  sources: Schema.Array(Source).check(Schema.isMinLength(1)),
})
export const Proposal = Schema.Struct({
  postEdit: Schema.NullOr(PostEdit),
  resolutions: Schema.Array(RequestResolution).check(Schema.isMaxLength(20)),
  question: Schema.NullOr(FactualQuestion),
  reason: text(500),
})
export const WebPage = Schema.Struct({ url: text(2000), title: text(300), text: text(12000) })
export const Evidence = Schema.Struct({
  messages: Schema.Array(TelegramMessage),
  projects: Schema.Array(PublicProject),
  pages: Schema.Array(WebPage),
})
export const Draft = Schema.Struct({ proposal: Proposal, evidence: Evidence })
export const ProjectResult = Schema.Struct({
  candidateId: Id,
  outcome: Schema.Literals(['created', 'updated', 'resolved', 'question', 'skipped', 'retry']),
  postId: Schema.NullOr(Id),
  resolvedRequestIds: Schema.Array(Id),
  notificationMessageId: Schema.NullOr(Id),
})
