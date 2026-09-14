import { Effect, Schema } from 'effect'
import { validateDraft, validateSources } from './guards'
import type { ModelPorts } from './model'
import { checked, createModelTasks } from './model'
import evidencePrompt from './prompts/evidence.mdx?raw'
import postPrompt from './prompts/post.mdx?raw'
import verificationPrompt from './prompts/verification.mdx?raw'
import * as S from './schemas'

const text = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(600))
export const Facts = Schema.Struct({
  subject: text,
  purpose: Schema.NullOr(
    Schema.Struct({
      claim: text,
      sources: Schema.Array(S.Source).check(Schema.isMinLength(1)),
    }),
  ),
  facts: Schema.Array(
    Schema.Struct({
      claim: text,
      kind: Schema.Literals(['purpose', 'status', 'owner_claim', 'limitation', 'owner_followup']),
      sources: Schema.Array(S.Source).check(Schema.isMinLength(1)),
    }),
  ).check(Schema.isMaxLength(16)),
  uncertainties: Schema.Array(text).check(Schema.isMaxLength(8)),
  links: Schema.Array(
    Schema.Struct({
      url: S.WebPage.fields.url,
      description: text,
    }),
  ).check(Schema.isMaxLength(8)),
})
export const Review = Schema.Struct({
  issues: Schema.Array(
    Schema.Struct({
      field: Schema.Literals(['title', 'summary', 'detail', 'sources', 'question', 'decision']),
      problem: text,
      correction: text,
    }),
  ).check(Schema.isMaxLength(12)),
})
const projectTools = ['searchMessages', 'readMessages', 'searchPosts'] as const
const webTools = ['search_web', 'read_url_content'] as const
const combine = (a: typeof S.Evidence.Type, b: typeof S.Evidence.Type): typeof S.Evidence.Type => ({
  messages: [...new Map([...a.messages, ...b.messages].map((m) => [m.id, m])).values()],
  projects: [...new Map([...a.projects, ...b.projects].map((p) => [p.targetId, p])).values()],
  pages: [...new Map([...a.pages, ...b.pages].map((p) => [p.url, p])).values()],
})

// Each generate call creates a fresh agent. Only a checked draft crosses publication's seam.
export function reviewedPost(ports: ModelPorts, context: typeof S.ProjectContext.Type) {
  const { track, generate } = createModelTasks(ports)
  const scope = {
    userId: context.work.ownerId,
    groupId: context.work.groupId,
    batchId: context.work.batchId,
  }
  return Effect.gen(function* () {
    const research = yield* track(
      'evidence',
      scope,
      generate(
        Facts,
        'evidence',
        evidencePrompt,
        context,
        scope,
        projectTools,
        webTools,
        (facts, evidence) => {
          validateSources(context, evidence, [
            ...(facts.purpose?.sources ?? []),
            ...facts.facts.flatMap((f) => f.sources),
          ])
          for (const link of facts.links)
            if (!evidence.pages.some((p) => p.url === link.url))
              throw new Error('Evidence links must come from actual web results.')
        },
      ),
    )
    let evidence: typeof S.Evidence.Type = research.evidence
    let corrections: (typeof Review.Type)['issues'] = []
    let previousDraft: typeof S.Proposal.Type | null = null
    // One repair is allowed. A second rejection queues review, never publishes a suspect draft.
    for (let attempt = 0; attempt < 2; attempt++) {
      const written: { value: typeof S.Proposal.Type; evidence: typeof S.Evidence.Type } =
        yield* track(
          'post',
          scope,
          generate(
            S.Proposal,
            'post',
            postPrompt,
            { ...context, facts: research.value, research: evidence, previousDraft, corrections },
            scope,
            projectTools,
            webTools,
            (proposal, extra) => {
              if (proposal.postEdit?.existingPostId === null && !research.value.purpose)
                throw new Error(
                  'A new post needs a supported end-user purpose. Return no edit and ask what the work does, plus its link if missing.',
                )
              validateDraft(context, { proposal, evidence: combine(evidence, extra) })
            },
          ),
        )
      evidence = combine(evidence, written.evidence)
      const draft: typeof S.Draft.Type = { proposal: written.value, evidence }
      yield* checked('project-evidence', () => validateDraft(context, draft))
      const review = yield* track(
        'verification',
        scope,
        generate(
          Review,
          'verification',
          verificationPrompt,
          { ...context, facts: research.value, draft },
          scope,
          projectTools,
          webTools,
        ),
      )
      evidence = combine(evidence, review.evidence)
      if (!review.value.issues.length) return { proposal: draft.proposal, evidence }
      corrections = review.value.issues
      previousDraft = draft.proposal
    }
    return yield* Effect.fail(
      new S.Failure({
        operation: 'post-verification',
        message: `Draft rejected after repair: ${corrections.map((i) => `${i.field}: ${i.problem}`).join('; ')}`,
      }),
    )
  })
}
