import { describe, expect, it } from 'vitest'
import {
  type Call,
  recordedContextStage,
  recordedStage,
} from '../../src/server/recorded-stage'

const call = (
  task: string,
  input: unknown,
  output: unknown,
  observations: unknown[] = [],
): Call => ({ task, input, output, observations, status: 'succeeded' })

describe('readable recorded workflow evidence', () => {
  it('shows the original messages beside selection and exclusion decisions', () => {
    const stage = recordedStage(
      call(
        'selection',
        {
          messages: [
            { id: 'm1', authorId: 'a', text: 'I shipped the demo.' },
            { id: 'm2', text: 'Nice!' },
          ],
        },
        {
          candidates: [
            {
              project: 'Demo',
              authorId: 'a',
              messageIds: ['m1'],
              target: { kind: 'new', ownerId: 'a' },
            },
          ],
          ignored: [
            { messageId: 'm2', category: 'chatter', reason: 'Reaction only.' },
          ],
          unresolved: [],
        },
      ),
      { a: { name: 'Ada' } },
    )
    expect(stage.sections).toContainEqual(
      expect.objectContaining({
        title: 'Telegram messages',
        items: expect.arrayContaining([
          expect.objectContaining({
            title: 'Ada',
            text: 'I shipped the demo.',
          }),
        ]),
      }),
    )
    expect(
      stage.sections?.find((s) => s.title === 'Selected projects')?.items[0]
        ?.text,
    ).toContain('Owner: Ada')
    expect(
      stage.sections?.find((s) => s.title === 'Ignored messages')?.items[0]
        ?.text,
    ).toBe('Nice!\nReaction only.')
  })
  it('formats each query as one readable line', () => {
    const stage = recordedStage(
      call(
        'query-planner',
        {},
        {
          queries: [
            { resource: 'user_messages', terms: ['demo', 'launch'], limit: 3 },
          ],
        },
      ),
    )
    expect(
      stage.sections?.find((s) => s.title === 'Planned queries')?.items[0]
        ?.text,
    ).toBe('user messages: demo + launch · up to 3 results')
  })
  it('preserves retrieved post details and message bodies in a separate context stage', () => {
    const stage = recordedContextStage(
      call(
        'responder',
        {
          queryResults: {
            posts: [
              {
                id: 'p',
                title: 'Demo',
                summary: 'Short summary.',
                detail: 'Original full detail.',
              },
            ],
            userMessages: [{ id: 'm', text: 'Make it shorter.' }],
            assistantMessages: [],
          },
        },
        {},
      ),
    )
    expect(
      stage?.sections?.find((s) => s.title === 'Retrieved posts')?.items[0],
    ).toMatchObject({
      title: 'Demo',
      text: 'Short summary.\nOriginal full detail.',
    })
    expect(
      stage?.sections?.find((s) => s.title === 'Retrieved user messages')
        ?.items[0]?.text,
    ).toBe('Make it shorter.')
    expect(recordedContextStage(call('selection', {}, {}))).toBeNull()
  })
  it('flattens recent exchanges and omits empty context collections', () => {
    const stage = recordedContextStage(
      call(
        'responder',
        {
          queryResults: { posts: [], userMessages: [], assistantMessages: [] },
          recentExchanges: [
            {
              userMessage: { id: 'u', userId: 'a', text: 'Earlier request.' },
              assistantMessage: {
                id: 'r',
                userId: 'a',
                role: 'assistant',
                text: 'Earlier answer.',
              },
            },
          ],
        },
        {},
      ),
      { a: { name: 'Ada' } },
    )
    expect(stage?.sections).toHaveLength(1)
    expect(stage?.sections?.[0]?.items).toEqual([
      { id: '0-u', title: 'Ada', text: 'Earlier request.' },
      { id: '1-r', title: 'Amber', text: 'Earlier answer.' },
    ])
  })
  it('renders fetched web text and empty search outcomes without raw JSON', () => {
    const stage = recordedStage(
      call('post', {}, {}, [
        {
          kind: 'native-tool',
          name: 'read_url_content',
          input: { Url: 'https://demo.example' },
          output: {
            pages: [
              {
                title: 'Demo docs',
                url: 'https://demo.example',
                text: 'Actual retrieved page content.',
              },
            ],
          },
        },
        {
          kind: 'tool',
          name: 'searchPosts',
          input: { queries: ['demo'] },
          output: { items: [] },
        },
      ]),
    )
    expect(
      stage.sections?.find((s) => s.title.startsWith('read_url_content'))
        ?.items[0]?.text,
    ).toContain('Actual retrieved page content.')
    expect(
      stage.sections?.find((s) => s.title.startsWith('searchPosts')),
    ).toMatchObject({ items: [], empty: 'No results returned.' })
  })
  it('explains preference operations, request resolutions and failed calls', () => {
    const memory = recordedStage(
      call(
        'memory',
        {},
        {
          operations: [
            { kind: 'create', id: 'pref', text: 'Keep posts factual.' },
          ],
        },
      ),
    )
    expect(
      memory.sections?.find((s) => s.title === 'Proposed preference changes')
        ?.items[0]?.text,
    ).toBe('Keep posts factual.')
    const requests = recordedStage(
      call(
        'addressing',
        {},
        {
          resolutions: [
            {
              messageId: 'request',
              outcome: 'answered',
              reason: 'The owner supplied the date.',
            },
          ],
        },
      ),
    )
    expect(
      requests.sections?.find((s) => s.title === 'Proposed request resolutions')
        ?.items[0],
    ).toMatchObject({
      title: 'request · answered',
      text: 'The owner supplied the date.',
    })
    const failed = recordedStage({
      ...call('responder', {}, undefined),
      status: 'failed',
      error: 'Provider timed out.',
    })
    expect(failed.status).toBe('failed')
    expect(
      failed.sections?.find((s) => s.title === 'Error')?.items[0]?.text,
    ).toBe('Provider timed out.')
  })
})
