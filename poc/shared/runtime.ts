import { type Effect, Schema } from 'effect'

export class Failure extends Schema.TaggedError<Failure>()('AgentFailure', {
  operation: Schema.String,
  message: Schema.String,
}) {}

export type Run<A> = Effect.Effect<A, Failure>
export type NativeToolName = 'search_web' | 'read_url_content'
export type ModelObservation =
  | {
      kind: 'configuration'
      agent: string
      model: string
      declaredTools: readonly string[]
      runtimeInventory: readonly string[]
      observedTools: readonly string[]
      failedTools: readonly string[]
      controlProvenance: 'antigravity-stream-json-v1'
    }
  | { kind: 'native-tool'; name: NativeToolName; input: unknown; output: unknown }

export type ModelRequest = {
  task: string
  instruction: string
  input: unknown
  outputSchema: unknown
  tools: readonly { name: string; description: string; inputSchema: unknown }[]
  nativeTools: readonly NativeToolName[]
  callTool: (name: string, input: unknown) => Run<unknown>
  observe: (observation: ModelObservation) => Run<void>
}

export type Model = (request: ModelRequest) => Run<unknown>
