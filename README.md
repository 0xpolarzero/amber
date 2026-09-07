# Amber

A minimal social feed for projects shared in a Telegram group.

Amber preserves worthwhile work from a fleeting conversation and keeps it connected to the person who made it.

The app preserves the reviewed feed design: one narrow column, quiet typography, simple project links, and a dropdown for newest, most commented or most bookmarked posts. It is now a React application built with TanStack Start and Vite.

## Run

Use Node.js 24.11 or newer and pnpm 11.1.3.

```sh
pnpm install
pnpm dev
```

Open [the app](http://127.0.0.1:3000). No credentials or database are needed for this stage.

| Command | Purpose |
| --- | --- |
| `pnpm check` | TypeScript, Biome and unit tests |
| `pnpm build` | Build the browser bundle and Node server |
| `pnpm start` | Serve the production build |
| `pnpm test:e2e` | Build and test desktop/mobile browser journeys |

For the first browser test run, install Chromium with `pnpm exec playwright install chromium`.

## What works now

Browse, sort, search, combine group, author (including Me) and bookmark filters, open posts and profiles, add comments, and edit sample posts. Group and author choices narrow each other. Agent opens one private conversation per account, across all posts. Post links identify the context; automatic updates include diffs. A scripted example records a writing preference once and reuses it for Noted and Tab tidy. Memory can be inspected, edited, forgotten or added. Sending illustrates task progress and locks the next send until the example finishes, while allowing drafting. The timing is explicitly labelled as a preview; no model runs. Drafts survive navigation and post changes; all preview state resets on reload. The bottom selector switches between Visitor, Member and Author so we can review each experience.

Posts, people and the two groups are fictional fixtures. Account switching and changes use local preview state that resets on reload. Telegram/X sign-in, project links and source links are previews. The app is not connected to real authentication, Telegram collection, model processing, PostgreSQL or a persistent queue. The separate Telegram PoC below makes real model requests.

## Structure

```text
src/
  routes/       URLs, loaders and the page shell
  pages/        Feed, Agent, post and profile screens
  components/   Shared UI, forms and icons
  queries/      TanStack Query definitions
  domain/       Effect schemas and pure post rules
  server/       Start server functions and sample data reads
  preview/      Temporary account state and sample interactions
  styles.css    Design tokens, components and responsive layout
tests/
  unit/         Domain behavior
  e2e/          Browser journeys
poc/telegram/   Executable workflow, prompts, tools and example test
docs/           Reviewed design, implementation plan and architecture
```

TanStack Router connects the screens, Query manages loaded data, Form manages inputs, and Effect supplies validation and application logic. Nitro builds the Node server. The future collector and queue will be added as separate pieces once their behavior is reviewed.

See the [implementation plan](docs/implementation-plan.md), [design direction](docs/design-direction.md), [planned architecture](docs/architecture.md) and [implementation notes](docs/implementation-notes.md). The original [HTML prototype](docs/feed-prototype.html) remains as a design reference.

Start with the [Telegram PoC test](poc/telegram/workflow.test.ts): [fictional messages](poc/telegram/testing/fixtures.ts) pass through real Smithers workflows and real Gemini 3.8 Flash requests. Telegram, storage and web results remain fixtures. The test checks ownership, creation versus update, research and follow-up routing without requiring exact wording. Its `result.json` records the generated posts, questions, diffs, model answers and tool results for human review.

Install the PoC with `pnpm --dir poc/telegram install`. Install [Antigravity CLI](https://antigravity.google/docs/cli/install/) and run `agy` once to sign in with Google Pro. This adapter was tested with CLI 1.1.27. Google [ended consumer Gemini CLI access](https://developers.googleblog.com/en/an-important-update-transitioning-gemini-cli-to-antigravity-cli/); Antigravity is the supported subscription route.

In `~/.gemini/antigravity-cli/settings.json`, set `useG1Credits` to `false` and add `mcp(amber/*)` to `permissions.allow`. Preserve any existing settings. Antigravity omits the default `false` value when saving; the adapter rejects an explicit `true`. The [credit setting](https://antigravity.google/docs/cli/credits/) disables overage fallback. The [MCP permission](https://antigravity.google/docs/cli/mcp/) allows only the PoC's read tools. The adapter starts each task in a fresh workspace, limits model concurrency to two, and validates every returned value with Effect.

- `pnpm test:telegram`: **live subscription requests**; inspect `poc/telegram/result.json` afterward.
- `pnpm --dir poc/telegram test`: deterministic workflow and native MCP transport tests, also run in CI.

The PoC has its own [package](poc/telegram/package.json), lockfile and TypeScript config. Smithers 1.0 is [not yet published](https://github.com/smithersai/smithers/blob/6d40cbc3cdae14fc1a8b65c5ecbc0f01966b468c/apps/site/docs/installation.mdx), so its packages use the Git revision pinned in [the PoC dependency config](poc/telegram/pnpm-workspace.yaml).
