import { Effect } from 'effect'
import type { Model } from '../../shared/runtime'

// Script the quality boundary; each existing test still controls its selection and post calls.
export const withQuality =
  (model: Model): Model =>
  (request) => {
    if (request.task === 'evidence')
      return Effect.succeed({
        subject: 'The selected project',
        facts: [],
        uncertainties: [],
        links: [],
      })
    if (request.task === 'verification') return Effect.succeed({ issues: [] })
    return model(request)
  }
