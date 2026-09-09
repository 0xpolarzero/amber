import { writeFile } from 'node:fs/promises'
import {
  type PreviewProjectionCapture,
  projectPreviewTrace,
  projectReplyTrace,
} from './preview-projection.ts'
import capture from './preview-result.json' with { type: 'json' }

const recorded = capture as unknown as PreviewProjectionCapture
const { telegram, messaging } = capture.projection
const projection = {
  question: telegram.questions[0],
  source: {
    disclosure: capture.projection.disclosure,
    batchId: telegram.batchId,
    groupId: telegram.groupId,
    messages: telegram.messages,
    outcomes: {
      posts: telegram.posts.map((post) => ({
        authorId: post.authorId,
        title: post.title,
        outcome: telegram.diffs.some(({ postId }) => postId === post.id) ? 'updated' : 'created',
        questionCount: telegram.questions.filter(({ postId }) => postId === post.id).length,
      })),
      ignored: telegram.ignored,
    },
  },
  trace: projectPreviewTrace(recorded),
  replyTrace: projectReplyTrace(recorded),
  messaging,
}
await writeFile(
  new URL('../src/preview/generated/amber-question-preview.ts', import.meta.url),
  `// Generated from poc/preview-result.json by poc/project-question-preview.ts.\nexport default ${JSON.stringify(projection, null, 2)} as const\n`,
)
