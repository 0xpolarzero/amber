import { Effect } from 'effect'
import type { Model } from '../../shared/runtime'

// Script the quality boundary; each existing test still controls its selection and post calls.
export const withQuality =
  (model: Model): Model =>
  (request) => {
    if (request.task === 'evidence') {
      const { work } = request.input as { work: { candidate: { messageIds: string[] } } }
      return Effect.succeed({
        purpose: {
          claim: 'The selected project’s demonstrated function.',
          sources: [{ kind: 'telegram', messageId: work.candidate.messageIds[0] }],
        },
        subject: 'The selected project',
        facts: [],
        uncertainties: [],
        links: [],
      })
    }
    if (request.task === 'grouping') {
      const { selection } = request.input as { selection: { candidates: { project: string }[] } }
      return Effect.succeed({
        groups: selection.candidates.map((candidate, index) => ({
          indexes: [index],
          project: candidate.project,
          reason: 'Independent scripted candidate.',
        })),
      })
    }
    if (request.task === 'verification') return Effect.succeed({ issues: [] })
    return model(request)
  }
