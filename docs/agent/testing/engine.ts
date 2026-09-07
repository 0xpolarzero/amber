import { createHash, randomBytes } from 'node:crypto'
import * as FlowEngine from '@smthrs/engine/FlowEngine'
import { Crypto, Effect, Layer } from 'effect'

export const testEngine = FlowEngine.layerMemory.pipe(
  Layer.provideMerge(
    Layer.succeed(
      Crypto.Crypto,
      Crypto.make({
        randomBytes: (size) => randomBytes(size),
        digest: (algorithm, data) =>
          Effect.sync(
            () => new Uint8Array(createHash(algorithm.replace('-', '')).update(data).digest()),
          ),
      }),
    ),
  ),
)
