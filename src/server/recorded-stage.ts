import type { AgentMessage } from '../preview/state'

export type Call = {
  task: string
  input: unknown
  output?: unknown
  observations: unknown[]
  status: string
  error?: string
}
type Stage = NonNullable<AgentMessage['recordedTrace']>['stages'][number]
type Section = NonNullable<Stage['sections']>[number]
type People = Record<string, { name: string }>
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])
const string = (value: unknown) => (typeof value === 'string' ? value : '')
const join = (...values: unknown[]) =>
  values.map(string).filter(Boolean).join('\n')
const counted = (s: Section) =>
  `${s.items.length} ${s.items.length === 1 ? s.title.toLowerCase().replace(/ies$/, 'y').replace(/s$/, '') : s.title.toLowerCase()}`
const person = (id: unknown, people: People) =>
  people[string(id)]?.name ?? string(id)
const section = (
  title: string,
  items: Section['items'],
  empty = 'None recorded.',
): Section => ({ title, items, empty })
function messages(title: string, value: unknown, people: People): Section {
  return section(
    title,
    list(value).map((item, index) => {
      const m = record(item)
      return {
        id: `${index}-${string(m.id)}`,
        title:
          m.role === 'assistant'
            ? 'Amber'
            : person(m.authorId ?? m.userId, people),
        text: string(m.text),
      }
    }),
  )
}
function posts(title: string, value: unknown): Section {
  return section(
    title,
    list(value).map((item, index) => {
      const p = record(item)
      return {
        id: `${index}-${string(p.id ?? p.postId)}`,
        title: string(p.title) || string(p.id ?? p.postId),
        text: join(p.summary, p.detail),
      }
    }),
  )
}
function contextSections(
  input: Record<string, unknown>,
  people: People,
): Section[] {
  const q = record(input.queryResults)
  return [
    posts('Retrieved posts', q.posts),
    messages('Retrieved user messages', q.userMessages, people),
    messages('Retrieved Amber messages', q.assistantMessages, people),
    messages(
      'Recent exchanges',
      list(input.recentExchanges).flatMap((value) => {
        const exchange = record(value)
        return [exchange.userMessage, exchange.assistantMessage].filter(Boolean)
      }),
      people,
    ),
    messages('Preferences in context', input.memories, people),
    messages(
      'Pending requests',
      input.pendingRequests ?? input.unaddressed,
      people,
    ),
    posts('Pending projects', input.candidates),
  ]
}
export function recordedContextStage(
  call: Call,
  people: People = {},
): Stage | null {
  const input = record(call.input)
  if (!('queryResults' in input)) return null
  const sections = contextSections(input, people).filter((s) => s.items.length)
  if (!sections.length)
    sections.push(section('Context', [], 'No matching context found.'))
  return {
    label: 'Retrieve context',
    summary:
      sections
        .filter((s) => s.items.length)
        .map(counted)
        .join(' · ') || 'No matching context found',
    status: 'complete',
    sections: sections.map((s) => ({
      ...s,
      collapsible:
        s.title === 'Retrieved posts' ||
        s.items.some((item) => Boolean(item.href)),
    })),
    detail: JSON.stringify(input.queryResults, null, 2),
  }
}
export function recordedStage(call: Call, people: People = {}): Stage {
  const input = record(call.input)
  const output = record(call.output)
  const sections: Section[] = []
  const labels: Record<string, string> = {
    selection: 'Select projects',
    post: 'Prepare post and follow-up',
    'query-planner': 'Plan context search',
    responder: 'Prepare reply',
    respond: 'Prepare reply',
    memory: 'Review preferences',
    addressing: 'Review pending requests',
  }
  if (Array.isArray(input.messages))
    sections.push(messages('Telegram messages', input.messages, people))
  const turn = record(input.turn)
  if (turn.text)
    sections.push(
      messages('Your message', [{ ...turn, id: turn.userMessageId }], people),
    )
  if (input.userMessage)
    sections.push(messages('Your message', [input.userMessage], people))
  if (input.assistantAnswer)
    sections.push(messages('Amber’s answer', [input.assistantAnswer], people))
  if (call.task === 'selection') {
    sections.push(
      section(
        'Selected projects',
        list(output.candidates).map((value, i) => {
          const c = record(value),
            target = record(c.target)
          return {
            id: String(i),
            title: string(c.project),
            text: join(
              `Actor: ${person(c.authorId, people)}`,
              target.kind === 'new'
                ? `New project · Owner: ${person(target.ownerId, people)}`
                : `Existing project: ${string(target.targetId)}`,
              `Messages: ${list(c.messageIds).join(', ')}`,
            ),
          }
        }),
        'No projects selected.',
      ),
    )
    for (const key of ['ignored', 'unresolved'])
      sections.push(
        section(
          key === 'ignored' ? 'Ignored messages' : 'Unresolved messages',
          list(output[key]).map((value, i) => {
            const m = record(value)
            const original = list(input.messages)
              .map(record)
              .find((item) => item.id === m.messageId)
            return {
              id: String(i),
              title: [string(m.messageId), string(m.category)]
                .filter(Boolean)
                .join(' · '),
              text: join(original?.text, m.reason),
            }
          }),
        ),
      )
  }
  if (call.task === 'query-planner')
    sections.push(
      section(
        'Planned queries',
        list(output.queries).map((value, i) => {
          const q = record(value)
          return {
            id: String(i),
            title: '',
            text: `${string(q.resource).replaceAll('_', ' ')}: ${list(q.terms).join(' + ')}${typeof q.limit === 'number' ? ` · up to ${q.limit} results` : ''}`,
          }
        }),
        'No context search requested.',
      ),
    )
  if (call.task === 'post') {
    if (input.selectedPost)
      sections.push(posts('Selected post', [input.selectedPost]))
    if (input.selectedCandidate)
      sections.push(
        posts('Selected pending project', [input.selectedCandidate]),
      )
    sections.push(
      messages('Owner preferences', input.memories, people),
      messages('Pending requests', input.pendingRequests, people),
    )
  }
  if (output.postEdit) sections.push(posts('Proposed post', [output.postEdit]))
  if (output.postChanges)
    sections.push(posts('Proposed post changes', output.postChanges))
  if (output.question)
    sections.push(
      section('Follow-up question', [
        {
          id: 'question',
          title: '',
          text: string(record(output.question).text) || string(output.question),
        },
      ]),
    )
  if (call.task === 'memory') {
    sections.push(messages('Existing preferences', input.memories, people))
    sections.push(
      section(
        'Proposed preference changes',
        list(output.operations).map((value, i) => {
          const op = record(value)
          return {
            id: String(i),
            title: `${string(op.kind)} · ${string(op.id)}`,
            text: join(op.text, op.reason) || 'Remove this preference.',
          }
        }),
        'No preference changes proposed.',
      ),
    )
  }
  if (call.task === 'addressing')
    sections.push(
      messages('Requests reviewed', input.unaddressedSnapshot, people),
    )
  if (Array.isArray(output.resolutions))
    sections.push(
      section(
        'Proposed request resolutions',
        output.resolutions.map((value, i) => {
          const r = record(value)
          return {
            id: String(i),
            title: [
              string(r.requestMessageId ?? r.messageId),
              string(r.outcome),
            ]
              .filter(Boolean)
              .join(' · '),
            text: string(r.reason),
          }
        }),
        'No requests resolved.',
      ),
    )
  for (const [index, value] of call.observations.entries()) {
    const tool = record(value)
    if (tool.kind !== 'tool' && tool.kind !== 'native-tool') continue
    const args = record(tool.input),
      result = record(tool.output)
    const query = join(
      args.query,
      args.url,
      args.Url,
      list(args.queries).join(' · '),
      list(args.messageIds).join(', '),
    )
    const results = Array.isArray(tool.output)
      ? tool.output
      : list(result.pages ?? result.items ?? result.results ?? result.messages)
    sections.push(
      section(
        `${string(tool.name)}${query ? ` · ${query}` : ''}`,
        results.map((item, i) => {
          const r = record(item)
          return {
            id: `${index}-${i}`,
            href: /^https?:\/\//i.test(string(r.url))
              ? string(r.url)
              : undefined,
            title:
              string(r.title) || person(r.authorId, people) || string(r.id),
            text: join(r.text, r.summary, r.detail, r.snippet) || string(item),
          }
        }),
        join(
          result.text,
          result.error,
          tool.error,
          typeof tool.output === 'string' ? tool.output : '',
        ) ||
          (result.status === 'error' || result.status === 'failed'
            ? 'Tool failed.'
            : 'No results returned.'),
      ),
    )
  }
  if (output.reason)
    sections.push(
      section('Decision', [
        { id: 'reason', title: '', text: string(output.reason) },
      ]),
    )
  if (call.error)
    sections.push(
      section('Error', [{ id: 'error', title: '', text: call.error }]),
    )
  if (!sections.length)
    sections.push(
      section(
        'Result',
        [],
        call.status === 'failed'
          ? 'The recorded call failed.'
          : call.status === 'succeeded'
            ? 'No readable result was recorded for this call.'
            : 'Waiting for the recorded result.',
      ),
    )
  const numberOf = (value: unknown, noun: string) => {
    const n = list(value).length
    return `${n} ${noun}${n === 1 ? '' : 's'}`
  }
  const resultSummary =
    call.task === 'selection'
      ? [
          list(output.candidates).length
            ? numberOf(output.candidates, 'selected project')
            : null,
          list(output.ignored).length
            ? numberOf(output.ignored, 'ignored message')
            : null,
          list(output.unresolved).length
            ? numberOf(output.unresolved, 'unresolved message')
            : null,
        ]
          .filter(Boolean)
          .join(' · ') || 'No projects selected'
      : call.task === 'query-planner'
        ? numberOf(output.queries, 'planned query').replace('querys', 'queries')
        : call.task === 'memory'
          ? numberOf(output.operations, 'preference change')
          : call.task === 'addressing'
            ? numberOf(output.resolutions, 'request resolution')
            : call.task === 'post'
              ? string(record(output.postEdit).title) ||
                string(output.reason) ||
                'No post changes'
              : numberOf(output.postChanges, 'proposed post change')
  const summary =
    call.status === 'failed'
      ? 'Model call failed'
      : call.status !== 'succeeded'
        ? 'Model call in progress'
        : resultSummary

  return {
    label: labels[call.task] ?? call.task,
    summary,
    status:
      call.status === 'succeeded'
        ? 'complete'
        : call.status === 'failed'
          ? 'failed'
          : 'running',
    sections: sections.map((s) => ({
      ...s,
      collapsible:
        s.title === 'Retrieved posts' ||
        s.items.some((item) => Boolean(item.href)),
    })),
    detail: JSON.stringify(
      {
        task: call.task,
        input: call.input,
        tools: call.observations,
        output: call.output,
        error: call.error,
      },
      null,
      2,
    ),
  }
}
