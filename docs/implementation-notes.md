# Implementation notes

Verified 6 September 2026. These findings support the web foundation; the larger service architecture remains in [architecture.md](./architecture.md).

| Decision | Evidence and consequence |
| --- | --- |
| Start with Vite | TanStack documents a small manual setup using a router, a root route and the Start Vite plugin before the React plugin. File routes generate routeTree.gen.ts. Keep page UI separate from route wiring. [Build from scratch](https://tanstack.com/start/latest/docs/framework/react/build-from-scratch) |
| Node production server | Start's hosting guide documents Nitro and the .output/server/index.mjs entry point. The app selects Nitro's node-server preset. `pnpm build` produces the server; `pnpm start` runs it. [Hosting](https://raw.githubusercontent.com/TanStack/router/main/docs/start/framework/react/guide/hosting.md) |
| Effect v4 | Pin effect to 4.0.0-rc.112, a prerelease, and use its current APIs. Add matching Effect packages only as their integrations are built. [Effect package](https://github.com/Effect-TS/effect/blob/main/packages/effect/package.json) |
| Shared form validation | TanStack Form accepts Standard Schema validators. Effect v4 exposes Schema.toStandardSchemaV1. Form validation does not return transformed values, so decode submitted data where normalized values are needed. [Form validation](https://tanstack.com/form/latest/docs/framework/react/guides/validation), [Effect Schema](https://github.com/Effect-TS/effect/blob/main/packages/effect/src/Schema.ts) |

Dependency versions are exact pins. Nitro uses 3.0.260610-beta rather than a release newer than the environment's seven-day dependency maturity policy. This is a compatibility choice for the initial scaffold, not a claim of stable Nitro 3. Preserve the lockfile; review dependency changes separately. [pnpm release age setting](https://pnpm.io/settings#minimumreleaseage)

The current server reads fixtures; preview mutations stay local. Tests at this stage cover domain behavior and browser journeys, not persistence or authenticated ownership. The original HTML files remain review artifacts; src is the maintained app.

CI actions use Node 24 and verified commit pins: [checkout 7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1), [setup-node 7.0.0](https://github.com/actions/setup-node/releases/tag/v7.0.0) and [pnpm setup 6.0.10](https://github.com/pnpm/action-setup/releases/tag/v6.0.10). The first run passed with older actions but reported their deprecated Node 20 runtimes; these versions remove that dependency. pnpm setup 6.1.0 was skipped because it was less than seven days old.

Google AI Pro access remains a separate setup check: use official Gemini CLI Google sign-in and subscription quota, with no API-credit fallback. Gemini 3.8 Flash access through that signed-in CLI has not been demonstrated. [CLI authentication](https://geminicli.com/docs/get-started/authentication/), [CLI model selection](https://geminicli.com/docs/cli/model/)
