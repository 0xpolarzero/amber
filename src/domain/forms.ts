import { Schema } from 'effect'

const requiredText = (max: number) =>
  Schema.String.check(Schema.isPattern(/\S/), Schema.isMaxLength(max))
export const CommentText = requiredText(2000)
export const AnswerText = requiredText(1000)
export const EditPost = Schema.Struct({
  title: requiredText(140),
  summary: requiredText(500),
  detail: Schema.String.check(Schema.isMaxLength(5000)),
})
export const CommentForm = Schema.toStandardSchemaV1(
  Schema.Struct({ text: CommentText }),
)
export const AnswerForm = Schema.toStandardSchemaV1(
  Schema.Struct({ text: AnswerText }),
)
export const EditPostForm = Schema.toStandardSchemaV1(EditPost)
