type TelegramMessage = {
  id: string
  authorId: string | null
  text: string
  replyToId: string | null
  albumId: string | null
}

type Candidate = {
  authorId: string
  project: string
  messageIds: readonly string[]
}

type RecordedPost = {
  id: string
  authorId: string
  version: number
  title: string
  summary: string
  detail: string
  published?: boolean
}

type RecordedMemory = {
  id: string
  text: string
  userId?: string
  version?: number
}

type RecordedRequest = {
  id: string
  text: string
  intent: string
  linkedPostId: string | null
}

type RecordedMessage = RecordedRequest & {
  role: 'user' | 'assistant'
}

type MessagingQuery = {
  resource: 'posts' | 'user_messages' | 'assistant_messages'
  terms: readonly string[]
  limit: number
}

type QueryPlannerCall = {
  task: 'query-planner'
  input: {
    pendingRequests: readonly RecordedMessage[]
  }
  output: { queries: readonly MessagingQuery[] }
}

type ResponderCall = {
  task: 'responder'
  input: {
    queryResults: {
      posts: readonly RecordedPost[]
      userMessages: readonly RecordedMessage[]
      assistantMessages: readonly RecordedMessage[]
      linkedRequestPostIds: readonly string[]
    }
    memories: readonly RecordedMemory[]
    unaddressed: readonly RecordedMessage[]
  }
  output: {
    classification: string
    intent: string
    text: string
    pendingOutcome: { kind: string }
    postChanges: readonly {
      postId: string
      expectedVersion: number
      title: string
      summary: string
      detail: string
      evidence: readonly {
        kind: string
        id?: string
        version?: number
        url?: string
      }[]
    }[]
  }
}

type MemoryCall = {
  task: 'memory'
  input: { memories: readonly RecordedMemory[] }
  output: {
    operations: readonly {
      kind: string
      id: string
      text?: string
      expectedVersion?: number
    }[]
  }
}

type AddressingCall = {
  task: 'addressing'
  input: { unaddressedSnapshot: readonly RecordedMessage[] }
  output: {
    resolutions: readonly {
      requestMessageId: string
      outcome: 'answered' | 'ignored'
      reason: string
    }[]
  }
}

type MessagingCall = QueryPlannerCall | ResponderCall | MemoryCall | AddressingCall

type SelectionCall = {
  task: 'selection'
  output: {
    candidates: readonly Candidate[]
  }
}

type PostCall = {
  task: 'post'
  input: {
    work: { candidate: Candidate }
    posts: readonly RecordedPost[]
    memories: readonly RecordedMemory[]
    unaddressed: readonly RecordedRequest[]
  }
  output: {
    kind: string
    title: string
    summary: string
    detail: string
    question: string | null
    existingPostId: string | null
    expectedVersion: number | null
    sources: readonly { kind: string; messageId: string }[]
  }
}

export type PreviewProjectionCapture = {
  provenance: { model: string }
  extraction: {
    input: { messages: readonly TelegramMessage[] }
    result: {
      posts: readonly RecordedPost[]
      questions: readonly {
        authorId: string
        postId: string | null
        text: string
      }[]
      diffs: readonly { postId: string }[]
    }
    calls: readonly (SelectionCall | PostCall)[]
    observations: readonly {
      task: string
      authorId?: string
      observation: {
        kind: string
        observedTools?: readonly string[]
      }
    }[]
  }
  messaging: {
    calls: readonly MessagingCall[]
  }
  projection: {
    version: number
    disclosure: string
    telegram: {
      questions: readonly {
        id: string
        authorId: string
        postId: string | null
        text: string
      }[]
    }
    [key: string]: unknown
  }
}

const unique = <T>(values: readonly T[]) => [...new Set(values)]

const contextPost = ({ id, title, summary }: RecordedPost) => ({
  id,
  title,
  summary,
})

const publishedPost = ({ id, title, summary, detail }: RecordedPost) => ({
  id,
  title,
  summary,
  detail,
})

const recordedMessage = ({ id, text, linkedPostId }: RecordedMessage) => ({
  id,
  text,
  linkedPostId,
})

const messagingCall = <Task extends MessagingCall['task']>(
  calls: PreviewProjectionCapture['messaging']['calls'],
  task: Task,
) => calls.find((call): call is Extract<MessagingCall, { task: Task }> => call.task === task)

/** Project the recorded messaging calls into concise browser-safe evidence. */
export function projectReplyTrace(capture: PreviewProjectionCapture) {
  const planner = messagingCall(capture.messaging.calls, 'query-planner')
  const responder = messagingCall(capture.messaging.calls, 'responder')
  const memory = messagingCall(capture.messaging.calls, 'memory')
  const addressing = messagingCall(capture.messaging.calls, 'addressing')
  if (!planner || !responder || !memory || !addressing)
    throw new Error('The reply trace is missing a recorded messaging call.')

  return {
    planner: {
      pendingRequests: planner.input.pendingRequests.map(recordedMessage),
      queries: planner.output.queries,
    },
    context: {
      posts: responder.input.queryResults.posts.map(({ id, version, title, summary, detail }) => ({
        id,
        version,
        title,
        summary,
        detail,
      })),
      userMessages: responder.input.queryResults.userMessages.map(recordedMessage),
      assistantMessages: responder.input.queryResults.assistantMessages.map(recordedMessage),
      linkedRequestPostIds: responder.input.queryResults.linkedRequestPostIds,
      memories: responder.input.memories.map(({ id, text, version }) => ({
        id,
        text,
        version,
      })),
      unaddressed: responder.input.unaddressed.map(recordedMessage),
    },
    response: {
      classification: responder.output.classification,
      intent: responder.output.intent,
      text: responder.output.text,
      pendingOutcome: responder.output.pendingOutcome,
      postChanges: responder.output.postChanges,
    },
    memory: {
      existing: memory.input.memories.map(({ id, text, version }) => ({
        id,
        text,
        version,
      })),
      operations: memory.output.operations,
    },
    addressing: {
      requests: addressing.input.unaddressedSnapshot.map(recordedMessage),
      resolutions: addressing.output.resolutions,
    },
  }
}

const postCallFor = (calls: PreviewProjectionCapture['extraction']['calls'], authorId: string) =>
  calls.find(
    (call): call is PostCall =>
      call.task === 'post' && call.input.work.candidate.authorId === authorId,
  )

/** Build the browser-safe trace by identity, never parallel completion position. */
export function projectPreviewTrace(capture: PreviewProjectionCapture) {
  const question = capture.projection.telegram.questions[0]
  if (!question) throw new Error('The preview capture has no extracted question.')
  const selection = capture.extraction.calls.find(
    (call): call is SelectionCall => call.task === 'selection',
  )
  if (!selection) throw new Error('The preview capture has no selection result.')
  const candidate = selection.output.candidates.find(
    ({ authorId }) => authorId === question.authorId,
  )
  const writer = postCallFor(capture.extraction.calls, question.authorId)
  const post = capture.extraction.result.posts.find(
    ({ id, authorId }) => id === question.postId && authorId === question.authorId,
  )
  if (!candidate || !writer || !post)
    throw new Error('The question trace cannot resolve its candidate, writer, or post by identity.')

  const writerObservations = capture.extraction.observations.filter(
    ({ task, authorId }) => task === 'post' && (!authorId || authorId === question.authorId),
  )
  const observationScope = writerObservations.some(({ authorId }) => authorId)
    ? 'this writer branch'
    : 'both recorded writer branches'
  const observedTools = unique(
    writerObservations.flatMap(({ observation }) =>
      observation.kind === 'configuration' ? (observation.observedTools ?? []) : [],
    ),
  )

  const related = selection.output.candidates
    .filter(({ authorId }) => authorId !== question.authorId)
    .map((relatedCandidate) => {
      const relatedWriter = postCallFor(capture.extraction.calls, relatedCandidate.authorId)
      const relatedPost = capture.extraction.result.posts.find(
        ({ authorId }) => authorId === relatedCandidate.authorId,
      )
      if (!relatedWriter || !relatedPost)
        throw new Error(`The related ${relatedCandidate.authorId} branch is incomplete.`)
      return {
        authorId: relatedCandidate.authorId,
        project: relatedCandidate.project,
        messageIds: relatedCandidate.messageIds,
        existingPosts: relatedWriter.input.posts.map(contextPost),
        resultPost: contextPost(relatedPost),
        outcome: capture.extraction.result.diffs.some(({ postId }) => postId === relatedPost.id)
          ? ('updated' as const)
          : ('created' as const),
      }
    })

  return {
    questionId: question.id,
    authorId: question.authorId,
    project: candidate.project,
    selectedMessageIds: candidate.messageIds,
    context: {
      existingPosts: writer.input.posts.map(contextPost),
      memories: writer.input.memories.map(({ id, text }) => ({ id, text })),
      outstandingRequests: writer.input.unaddressed.map(({ id, text, intent, linkedPostId }) => ({
        id,
        text,
        intent,
        linkedPostId,
      })),
      observedTools,
      observationScope,
    },
    publication: {
      post: publishedPost(post),
      output: {
        existingPostId: writer.output.existingPostId,
        sources: writer.output.sources,
      },
    },
    question: question.text,
    related,
    recording: {
      model: capture.provenance.model,
      disclosure: capture.projection.disclosure,
    },
  }
}
