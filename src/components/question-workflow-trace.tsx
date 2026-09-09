import type { TelegramSource, WorkflowTrace } from '../preview/state'
import { Icon } from './icon'
import { PostChangeDiff } from './post-change-diff'
import { TraceCollection, TraceStep } from './workflow-trace'

export function QuestionWorkflowTrace({
  source,
  trace,
  open,
}: {
  source: TelegramSource
  trace: WorkflowTrace
  open: boolean
}) {
  const selected = source.messages.filter(({ id }) =>
    trace.selectedMessageIds.includes(id),
  )
  const post = trace.publication.post
  const created = !trace.publication.output.existingPostId
  const update = trace.telegramUpdate
  const stageId = (number: number) =>
    `question-${trace.questionId}-stage-${number}`
  return (
    <details className="workflow-trace extraction-workflow-trace" open={open}>
      <summary aria-label="Question workflow">
        <span className="workflow-trace-toggle-icons">
          <Icon name="telegram" />
          <Icon name="chevronDown" className="workflow-trace-caret" />
        </span>
        <span>Question workflow</span>
        <span className="workflow-trace-count">Complete</span>
      </summary>
      <div className="workflow-trace-content">
        <ol
          className="workflow-trace-steps"
          aria-label="Question task progress"
        >
          <TraceStep
            id={stageId(1)}
            number={1}
            title="Group messages"
            status="complete"
            summary={`${selected.length} messages · ${trace.project}`}
          >
            <div className="trace-messages">
              {selected.map((message) => (
                <div className="trace-record" key={message.id}>
                  <span>{name(message.authorId)}</span>
                  <p>{message.text}</p>
                </div>
              ))}
            </div>
            {source.outcomes.ignored.length ? (
              <details className="trace-nested">
                <summary>{source.outcomes.ignored.length} skipped</summary>
                {source.outcomes.ignored.map((ignored) => (
                  <div className="trace-record" key={ignored.messageId}>
                    <p>
                      {
                        source.messages.find(
                          ({ id }) => id === ignored.messageId,
                        )?.text
                      }
                    </p>
                    <span>{ignored.reason}</span>
                  </div>
                ))}
              </details>
            ) : null}
          </TraceStep>
          <TraceStep
            id={stageId(2)}
            number={2}
            title="Gather context"
            status="complete"
            summary={`${trace.context.existingPosts.length} posts · ${trace.context.memories.length} ${trace.context.memories.length === 1 ? 'preference' : 'preferences'}`}
          >
            {trace.context.existingPosts.length ? (
              <section className="trace-post-list" aria-label="Existing posts">
                {trace.context.existingPosts.map((existing) => (
                  <details className="trace-post-preview" key={existing.id}>
                    <summary>
                      {existing.title}
                      <Icon name="chevronDown" />
                    </summary>
                    <div>
                      <p>{existing.summary}</p>
                    </div>
                  </details>
                ))}
              </section>
            ) : (
              <p>No existing post.</p>
            )}
            {trace.context.memories.length ? (
              <TraceCollection
                title="Preferences"
                empty=""
                items={trace.context.memories.map((memory) => ({
                  ...memory,
                  title: '',
                }))}
              />
            ) : null}
            {trace.context.outstandingRequests.length ? (
              <TraceCollection
                title="Pending requests"
                empty=""
                items={trace.context.outstandingRequests.map((request) => ({
                  ...request,
                  title: '',
                }))}
              />
            ) : null}
            {trace.context.observedTools.length ? (
              <details className="trace-nested">
                <summary>Research tools</summary>
                <p>{trace.context.observedTools.join(' · ')}</p>
                <p>
                  Observed across {trace.context.observationScope}; results were
                  not saved.
                </p>
              </details>
            ) : null}
          </TraceStep>
          <TraceStep
            id={stageId(3)}
            number={3}
            title="Publish post"
            status="complete"
            summary={`${created ? 'Created' : 'Updated'} ${trace.project}`}
          >
            {created ? (
              <section className="trace-post-diffs" aria-label="Published post">
                <PostChangeDiff
                  expanded={false}
                  change={{
                    kind: 'created',
                    postId: post.id,
                    project: trace.project,
                    toVersion: 1,
                    fields: (['title', 'summary', 'detail'] as const).map(
                      (field) => ({ field, before: '', after: post[field] }),
                    ),
                  }}
                />
              </section>
            ) : (
              <details className="trace-post-preview">
                <summary>
                  {post.title}
                  <Icon name="chevronDown" />
                </summary>
                <div>
                  <p>{post.summary}</p>
                  <p>{post.detail}</p>
                </div>
              </details>
            )}
          </TraceStep>
          <TraceStep
            id={stageId(4)}
            number={4}
            title="Ask question"
            status="complete"
            summary={`Sent to ${name(trace.authorId)}`}
          >
            <p>The selected messages left this question unanswered:</p>
            {selected
              .filter(({ authorId }) => authorId !== trace.authorId)
              .map((message) => (
                <div className="trace-record" key={message.id}>
                  <span>{name(message.authorId)}</span>
                  <p>{message.text}</p>
                </div>
              ))}
          </TraceStep>
          {update ? (
            <TraceStep
              id={stageId(5)}
              number={5}
              title="Apply Telegram update"
              status="complete"
              summary={update.notification.text}
            >
              <div className="trace-messages">
                {update.messages
                  .filter(({ id }) => update.selectedMessageIds.includes(id))
                  .map((message) => (
                    <div className="trace-record" key={message.id}>
                      <span>{name(message.authorId)}</span>
                      <p>{message.text}</p>
                    </div>
                  ))}
              </div>
              <section
                className="trace-post-diffs"
                aria-label="Telegram post update"
              >
                <PostChangeDiff
                  expanded={false}
                  change={{
                    kind: 'updated',
                    postId: update.after.id,
                    project: update.after.title,
                    fromVersion: update.before.version,
                    toVersion: update.after.version,
                    fields: (['title', 'summary', 'detail'] as const)
                      .filter(
                        (field) => update.before[field] !== update.after[field],
                      )
                      .map((field) => ({
                        field,
                        before: update.before[field],
                        after: update.after[field],
                      })),
                  }}
                />
              </section>
              <p>Sources: {update.notification.sourceIds.join(' · ')}</p>
            </TraceStep>
          ) : null}
          {update ? (
            <TraceStep
              id={stageId(6)}
              number={6}
              title="Resolve question"
              status="complete"
              summary={`Question ${update.resolution.outcome}`}
            >
              <p>{update.resolution.reason}</p>
              <p>Sources: {update.resolution.sourceIds.join(' · ')}</p>
            </TraceStep>
          ) : null}
        </ol>
        <p className="trace-recording">
          {source.groupId} · {trace.recording.model}
        </p>
      </div>
    </details>
  )
}

const name = (id: string | null) =>
  id ? `${id.charAt(0).toUpperCase()}${id.slice(1)}` : 'Unknown'
