import { Schema } from 'effect'

export { Failure } from '../shared/runtime'

const text = (max: number) => Schema.String.check(Schema.isPattern(/\S/), Schema.isMaxLength(max))
export const Id = text(200)
export const Version = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
export const Intent = Schema.Literals(['informational', 'question', 'request', 'suggestion'])
export const Message = Schema.Struct({
  id: Id,
  userId: Id,
  conversationId: Id,
  role: Schema.Literals(['user', 'assistant']),
  text: text(8_000),
  sequence: Version,
  turnId: Schema.NullOr(Id),
  intent: Intent,
  linkedPostId: Schema.NullOr(Id),
  pendingCandidateId: Schema.NullOr(Id),
  addressed: Schema.Boolean,
})
export const Memory = Schema.Struct({ id: Id, userId: Id, text: text(500), version: Version })
export const Post = Schema.Struct({
  id: Id,
  authorId: Id,
  version: Version,
  title: text(140),
  summary: text(500),
  detail: text(6_000),
  published: Schema.Boolean,
})
export const Candidate = Schema.Struct({
  id: Id,
  userId: Id,
  version: Version,
  title: text(140),
  summary: text(500),
  detail: text(6_000),
  status: Schema.Literals(['pending', 'published']),
})
export const Exchange = Schema.Struct({
  turnId: Id,
  userMessage: Message,
  assistantMessage: Message,
})
export const TurnInput = Schema.Struct({ turnId: Id, userId: Id, text: text(8_000) })
export const Turn = Schema.Struct({
  ...TurnInput.fields,
  userMessageId: Id,
  cutoffSequence: Version,
})
export const PlannerContext = Schema.Struct({
  turn: Turn,
  recentExchanges: Schema.Array(Exchange).check(Schema.isMaxLength(3)),
  pendingRequests: Schema.Array(Message).check(Schema.isMaxLength(20)),
})
export const Query = Schema.Struct({
  resource: Schema.Literals(['posts', 'user_messages', 'assistant_messages']),
  terms: Schema.Array(text(80)).check(Schema.isMinLength(1), Schema.isMaxLength(5)),
  limit: Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(10)),
})
export const QueryPlan = Schema.Struct({
  queries: Schema.Array(Query).check(Schema.isMaxLength(6)),
})
export const QueryResults = Schema.Struct({
  posts: Schema.Array(Post).check(Schema.isMaxLength(30)),
  userMessages: Schema.Array(Message).check(Schema.isMaxLength(30)),
  assistantMessages: Schema.Array(Message).check(Schema.isMaxLength(30)),
  linkedRequestPostIds: Schema.Array(Id).check(Schema.isMaxLength(20)),
})
export const ResponderContext = Schema.Struct({
  ...PlannerContext.fields,
  queryResults: QueryResults,
  memories: Schema.Array(Memory),
  unaddressed: Schema.Array(Message),
  candidates: Schema.Array(Candidate).check(Schema.isMaxLength(10)),
})
export const Evidence = Schema.Union([
  Schema.Struct({ kind: Schema.Literal('post'), id: Id, version: Version }),
  Schema.Struct({
    kind: Schema.Literals(['user_message', 'assistant_message', 'request']),
    id: Id,
  }),
  Schema.Struct({ kind: Schema.Literal('memory'), id: Id, version: Version }),
  Schema.Struct({ kind: Schema.Literal('candidate'), id: Id, version: Version }),
  Schema.Struct({ kind: Schema.Literal('web'), url: text(2_000) }),
])
export const PostChange = Schema.Struct({
  postId: Id,
  expectedVersion: Version,
  title: text(140),
  summary: text(500),
  detail: text(6_000),
  published: Schema.Boolean,
  evidence: Schema.Array(Evidence).check(Schema.isMinLength(1), Schema.isMaxLength(12)),
})
export const PendingOutcome = Schema.Union([
  Schema.Struct({ kind: Schema.Literal('none') }),
  Schema.Struct({ kind: Schema.Literal('clarify'), candidateId: Id, question: text(1_000) }),
  Schema.Struct({
    kind: Schema.Literal('publish'),
    candidateId: Id,
    expectedVersion: Version,
    title: text(140),
    summary: text(500),
    detail: text(6_000),
    evidence: Schema.Array(Evidence).check(Schema.isMinLength(1), Schema.isMaxLength(12)),
  }),
])
export const Response = Schema.Struct({
  text: text(4_000),
  intent: Intent,
  classification: Schema.Literals(['answer', 'instruction', 'clarification', 'partial']),
  postChanges: Schema.Array(PostChange).check(Schema.isMaxLength(5)),
  pendingOutcome: PendingOutcome,
})
export const WebPage = Schema.Struct({ url: text(2_000), title: text(300), text: text(12_000) })
export const ResponderResult = Schema.Struct({
  response: Response,
  webEvidence: Schema.Array(WebPage).check(Schema.isMaxLength(8)),
})
export const PostDiff = Schema.Struct({ postId: Id, before: Post, after: Post })
export const CandidatePublication = Schema.Struct({ candidateId: Id, postId: Id })
export const PublishedTurn = Schema.Struct({
  turn: Turn,
  userMessage: Message,
  assistantMessage: Message,
  response: Response,
  webEvidence: Schema.Array(WebPage),
  diffs: Schema.Array(PostDiff),
  candidatePublications: Schema.Array(CandidatePublication),
  memorySnapshot: Schema.Array(Memory),
  requestSnapshot: Schema.Array(Message),
})
export const MemoryOperation = Schema.Union([
  Schema.Struct({ kind: Schema.Literal('create'), id: Id, text: text(500) }),
  Schema.Struct({
    kind: Schema.Literal('update'),
    id: Id,
    expectedVersion: Version,
    text: text(500),
  }),
  Schema.Struct({ kind: Schema.Literal('delete'), id: Id, expectedVersion: Version }),
])
export const MemoryPlan = Schema.Struct({
  operations: Schema.Array(MemoryOperation).check(Schema.isMaxLength(10)),
})
export const AddressingPlan = Schema.Struct({
  resolutions: Schema.Array(
    Schema.Struct({
      requestMessageId: Id,
      outcome: Schema.Literals(['answered', 'ignored']),
      reason: text(400),
    }),
  ).check(Schema.isMaxLength(20)),
})
export const BackgroundTask = Schema.Literals(['memory', 'addressing'])
export const JobReceipt = Schema.Struct({
  task: BackgroundTask,
  status: Schema.Literals(['done', 'failed']),
  reason: Schema.NullOr(text(500)),
})
export const BackgroundContext = Schema.Struct({
  published: PublishedTurn,
  task: BackgroundTask,
  skip: Schema.Boolean,
  receipt: Schema.NullOr(JobReceipt),
})
export const BackgroundJobs = Schema.Struct({ memory: JobReceipt, addressing: JobReceipt })
export const TurnReceipt = Schema.Struct({
  turnId: Id,
  userId: Id,
  status: Schema.Literals(['completed', 'background_failed', 'failed']),
  assistantMessageId: Schema.NullOr(Id),
  diffs: Schema.Array(PostDiff),
  candidatePublications: Schema.Array(CandidatePublication),
  background: Schema.Array(JobReceipt),
})
export const AdmissionResult = Schema.Union([
  Schema.Struct({ kind: Schema.Literal('admitted'), context: PlannerContext }),
  Schema.Struct({ kind: Schema.Literal('replay'), receipt: TurnReceipt }),
  Schema.Struct({
    kind: Schema.Literal('rejected'),
    receipt: TurnReceipt,
    reason: text(500),
  }),
])
export const Admission = Schema.Struct({ result: AdmissionResult })
export const RetryInput = Schema.Struct({ turnId: Id, userId: Id })
