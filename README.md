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

Browse, sort, search, combine group, author (including Me) and bookmark filters, open posts and profiles, add comments, and edit sample posts. Group and author choices narrow each other. Agent opens one private conversation per account, across all posts. The main guide replays recorded output from the real Gemini extraction and messaging workflows over clearly disclosed fictional Telegram messages and in-memory records. Post links identify context, automatic updates include diffs, and the source batch remains inspectable beside the extracted question. Memory can be inspected, edited, forgotten or added. Progress and failure checkpoints are explicitly labeled simulations; no model runs in the browser. Drafts survive navigation and post changes; all preview state resets on reload. The bottom selector switches between Visitor, Member and Author so we can review each experience.

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
poc/messaging/  Private-conversation workflow, four prompts and recorded proof
poc/shared/     Shared Antigravity subscription adapter and native-web evidence
```

TanStack Router connects the screens, Query manages loaded data, Form manages inputs, and Effect supplies validation and application logic. Nitro builds the Node server. The future collector and queue will be added as separate pieces once their behavior is reviewed.

Start with the [Telegram PoC walkthrough](poc/telegram/walkthrough.html) and [messaging PoC walkthrough](poc/messaging/walkthrough.html). The Telegram PoC turns [fictional messages](poc/telegram/testing/fixtures.ts) into project posts. The messaging PoC admits one private user turn, plans bounded reads, publishes an answer and versioned post changes, then runs memory and request addressing in parallel before unlocking the next send. Both execute real Smithers workflows; their deterministic suites use scripted models, while explicit live commands use real Gemini 3.8 Flash requests. Storage and Telegram delivery remain fixtures.

Install the PoC workspace with `pnpm --dir poc install`. Install [Antigravity CLI](https://antigravity.google/docs/cli/install/) and run `agy` once to sign in with Google Pro. This adapter was tested with CLI 1.1.27. Google [ended consumer Gemini CLI access](https://developers.googleblog.com/en/an-important-update-transitioning-gemini-cli-to-antigravity-cli/); Antigravity is the supported subscription route.

In `~/.gemini/antigravity-cli/settings.json`, set `useG1Credits` to `false` and add `mcp(amber/*)` and `read_url(*)` to `permissions.allow`. Preserve existing settings. Antigravity omits the default `false` value when saving; the adapter rejects an explicit `true`. The [credit setting](https://www.antigravity.google/docs/cli/credits/) disables overage fallback. The broad URL grant is currently required because CLI 1.1.27 soft-denies native page reads in headless mode without it; a workspace `PreToolUse` permission override did not bypass that prompt when `inheritCustomizations` was false. The custom-agent tool list, not this process-wide permission grant, selects which Amber task receives the native fetch tool.

Each task gets a fresh custom primary agent with `inheritCustomizations: false`, empty skills/plugins, command execution off and slash expansion disabled. Selection declares only `finish`. Writing declares `finish`, native `search_web` and `read_url_content`, plus an inline Amber MCP server exposing the three read-only database tools `searchMessages`, `readMessages` and `searchPosts` and the provider-specific `readFetchedPage` artifact reader. The reader is not a fourth database tool. No file, shell, browser or subagent tool appears in either task declaration. These are declared [custom-agent controls](https://www.antigravity.google/docs/subagents/), not proof of the complete model-visible prompt. CLI 1.1.27's [stream init inventory](https://www.antigravity.google/docs/cli/headless/) is process-wide and remains much broader. The live probes record the tools that actually ran and verify that forbidden file and shell tools did not run. Those probes do not prove that every global rule, memory or Google runtime instruction was excluded. Amber cannot inspect or replace Google's runtime/model instructions, so this is controlled capability selection, not full isolation.

Native calls are bound to completed NDJSON tool steps. CLI 1.1.27 returns `undefined` for native `tool_info.output`, and `PostToolUse` did not fire for these calls with inherited customizations disabled. Amber incrementally reads bounded CLI stdout so `readFetchedPage` can bind the validated current conversation ID and completed fetch step while the model is still running. The tool accepts only the fetched URL, an optional offset and a chunk size up to 6,000 characters, with a 24,000-character task budget. It makes no HTTP request and cannot select an artifact path or another conversation. Search evidence accepts links only from the tool's `Sources:` block. Fetch evidence and reader access both require a successful receipt, nonempty captured page content and matching requested, receipt and content-source URLs. Empty output, errors, missing bodies, unrelated body links and model-written URLs fail closed. Direct IP and local hostnames are rejected as evidence, but the provider resolves DNS and holds the broad `read_url(*)` permission, so this is not a complete application SSRF boundary. The focused [live native-web result](poc/telegram/native-web-result.json) contains sanitized actual search, fetch, source and adversarial-probe evidence for the reviewed IANA assertion; [the fetched-page result](poc/telegram/fetched-page-result.json) records a fresh response UUID read through the scoped reader.

- `pnpm --dir poc install`: install the shared PoC workspace.
- `pnpm --dir poc test`: run both deterministic PoC suites; no live model requests.
- `pnpm test:telegram`: make **live subscription requests** for the Telegram PoC; inspect its three saved result files afterward.
- `pnpm test:messaging`: make **eight live subscription requests** for the two-turn messaging proof; inspect `poc/messaging/result.json` afterward.
- `AGY_BINARY="$PWD/poc/telegram/node_modules/.bin/agy" pnpm preview:refresh`: make **seven live subscription requests** for the guided preview, save the full review artifact to `poc/preview-result.json`, and refresh the compact browser projection in `src/preview/generated/amber-real-preview.ts`. The command uses the existing fictional Telegram batch, one extracted question, and one fake maker reply; it does not contact Telegram or persistent storage.

The PoCs share one [workspace](poc/pnpm-workspace.yaml), lockfile and subscription adapter. Each PoC keeps its own package and TypeScript config. Smithers 1.0 is [not yet published](https://github.com/smithersai/smithers/blob/6d40cbc3cdae14fc1a8b65c5ecbc0f01966b468c/apps/site/docs/installation.mdx), so the workspace pins one immutable Git revision.
