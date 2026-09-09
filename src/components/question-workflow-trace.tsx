import type {
  TelegramSource,
  TelegramUpdateTrace,
  WorkflowTrace,
} from '../preview/state'
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
        </ol>
        <p className="trace-recording">
          {source.groupId} · {trace.recording.model}
        </p>
      </div>
    </details>
  )
}

export function TelegramUpdateWorkflowTrace({
  trace,
}: {
  trace: TelegramUpdateTrace
}) {
  const selected = trace.messages.filter(({ id }) =>
    trace.selectedMessageIds.includes(id),
  )
  const cited = trace.messages.filter(({ id }) =>
    trace.notification.sourceIds.includes(id),
  )
  const stageId = (number: number) =>
    `telegram-update-${trace.notification.id}-stage-${number}`
  return (
    <details className="workflow-trace telegram-update-workflow-trace">
      <summary aria-label="Telegram update workflow">
        <span className="workflow-trace-toggle-icons">
          <Icon name="telegram" />
          <Icon name="chevronDown" className="workflow-trace-caret" />
        </span>
        <span>Telegram update workflow</span>
        <span className="workflow-trace-count">Complete</span>
      </summary>
      <div className="workflow-trace-content">
        <ol
          className="workflow-trace-steps"
          aria-label="Telegram update progress"
        >
          <TraceStep
            id={stageId(1)}
            number={1}
            title="Match update"
            status="complete"
            summary={`${selected.length} messages · ${trace.target.kind} ${trace.project} post`}
          >
            <details className="trace-post-preview">
              <summary>
                {trace.before.title}
                <Icon name="chevronDown" />
              </summary>
              <div>
                <p>{trace.before.summary}</p>
              </div>
            </details>
            <TraceCollection
              title="Selected Telegram messages"
              empty="No messages selected."
              items={selected.map((message) => ({
                id: message.id,
                title: name(message.authorId),
                text: message.text,
              }))}
            />
          </TraceStep>
          <TraceStep
            id={stageId(2)}
            number={2}
            title="Verify sources"
            status="complete"
            summary={`${cited.length} messages cited`}
          >
            <TraceCollection
              title="Cited Telegram messages"
              empty="No cited messages."
              items={cited.map((message) => ({
                id: message.id,
                title: name(message.authorId),
                text: message.text,
              }))}
            />
          </TraceStep>
          <TraceStep
            id={stageId(3)}
            number={3}
            title="Update post"
            status="complete"
            summary={`${trace.project} · version ${trace.before.version} to ${trace.after.version}`}
          >
            <section
              className="trace-post-diffs"
              aria-label="Telegram post update"
            >
              <PostChangeDiff
                expanded={false}
                change={{
                  kind: 'updated',
                  postId: trace.after.id,
                  project: trace.after.title,
                  fromVersion: trace.before.version,
                  toVersion: trace.after.version,
                  fields: (['title', 'summary', 'detail'] as const)
                    .filter(
                      (field) => trace.before[field] !== trace.after[field],
                    )
                    .map((field) => ({
                      field,
                      before: trace.before[field],
                      after: trace.after[field],
                    })),
                }}
              />
            </section>
          </TraceStep>
          <TraceStep
            id={stageId(4)}
            number={4}
            title="Close question"
            status="complete"
            summary={`Question ${trace.resolution.outcome}`}
          >
            <p>{trace.resolution.reason}</p>
            <TraceCollection
              title="Answer evidence"
              empty="No answer evidence."
              items={trace.messages
                .filter(({ id }) => trace.resolution.sourceIds.includes(id))
                .map((message) => ({
                  id: message.id,
                  title: name(message.authorId),
                  text: message.text,
                }))}
            />
          </TraceStep>
        </ol>
        <p className="trace-recording">
          {trace.groupId} · {trace.recording.model}
        </p>
      </div>
    </details>
  )
}

const name = (id: string | null) =>
  id ? `${id.charAt(0).toUpperCase()}${id.slice(1)}` : 'Unknown'
