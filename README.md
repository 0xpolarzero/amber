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

Start with the [Telegram PoC test](poc/telegram/workflow.test.ts): [fictional messages](poc/telegram/testing/fixtures.ts) pass through real Smithers workflows and real Gemini 3.8 Flash requests. Telegram and storage remain fixtures; web research uses Antigravity's native tools. The test checks ownership, creation versus update, research and follow-up routing without requiring exact wording. Its `result.json` records generated posts, questions, diffs, model answers, declared capabilities, the CLI's public runtime inventory and observed tool calls for human review. The deterministic tests keep a separate fake native-web observation.

Install the PoC with `pnpm --dir poc/telegram install`. Install [Antigravity CLI](https://antigravity.google/docs/cli/install/) and run `agy` once to sign in with Google Pro. This adapter was tested with CLI 1.1.27. Google [ended consumer Gemini CLI access](https://developers.googleblog.com/en/an-important-update-transitioning-gemini-cli-to-antigravity-cli/); Antigravity is the supported subscription route.

In `~/.gemini/antigravity-cli/settings.json`, set `useG1Credits` to `false` and add `mcp(amber/*)` and `read_url(*)` to `permissions.allow`. Preserve existing settings. Antigravity omits the default `false` value when saving; the adapter rejects an explicit `true`. The [credit setting](https://www.antigravity.google/docs/cli/credits/) disables overage fallback. The broad URL grant is currently required because CLI 1.1.27 soft-denies native page reads in headless mode without it; a workspace `PreToolUse` permission override did not bypass that prompt when `inheritCustomizations` was false. The custom-agent tool list, not this process-wide permission grant, selects which Amber task receives the native fetch tool.

Each task gets a fresh custom primary agent with `inheritCustomizations: false`, empty skills/plugins, command execution off and slash expansion disabled. Selection declares only `finish`. Writing declares `finish`, native `search_web` and `read_url_content`, plus an inline Amber MCP server exposing exactly `searchMessages`, `readMessages` and `searchPosts`. No file, shell, browser or subagent tool appears in either task declaration. These are declared [custom-agent controls](https://www.antigravity.google/docs/subagents/), not proof of the complete model-visible prompt. CLI 1.1.27's [stream init inventory](https://www.antigravity.google/docs/cli/headless/) is process-wide and remains much broader. The live probe records that only native search and fetch ran, forbidden shell and foreign MCP requests did not run, and a temporary workspace-rule sentinel was not observed. That one probe does not prove that every global rule, memory or Google runtime instruction was excluded. Amber cannot inspect or replace Google's runtime/model instructions, so this is controlled capability selection, not full isolation.

Native calls are bound to completed NDJSON tool steps. CLI 1.1.27 returns `undefined` for native `tool_info.output`, and `PostToolUse` did not fire for these calls with inherited customizations disabled. Amber therefore reads only the matching CLI step's documented artifact files, keyed by the validated conversation ID and stream step index. Search evidence accepts links only from the tool's `Sources:` block. Fetch evidence requires a successful receipt, nonempty captured page content and matching requested, receipt and content-source URLs. Empty output, errors, unrelated body links and model-written URLs produce no evidence. Direct IP and local hostnames are rejected as evidence, but the provider resolves DNS and holds the broad URL permission, so this is not a complete application SSRF boundary. The focused [live native-web result](poc/telegram/native-web-result.json) contains sanitized actual search, fetch, source and adversarial-probe evidence for the reviewed IANA assertion.

- `pnpm test:telegram`: **live subscription requests**; inspect `poc/telegram/result.json` and `poc/telegram/native-web-result.json` afterward.
- `pnpm --dir poc/telegram test`: deterministic workflow and native MCP transport tests, also run in CI.

The PoC has its own [package](poc/telegram/package.json), lockfile and TypeScript config. Smithers 1.0 is [not yet published](https://github.com/smithersai/smithers/blob/6d40cbc3cdae14fc1a8b65c5ecbc0f01966b468c/apps/site/docs/installation.mdx), so its packages use the Git revision pinned in [the PoC dependency config](poc/telegram/pnpm-workspace.yaml).
