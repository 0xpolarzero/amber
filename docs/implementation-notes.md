# Implementation notes

Verified 6 September 2026. These findings support the web foundation; the larger service architecture remains in [architecture.md](./architecture.md).

| Decision | Evidence and consequence |
| --- | --- |
| Start with Vite | TanStack documents a small manual setup using a router, a root route and the Start Vite plugin before the React plugin. File routes generate routeTree.gen.ts. Keep page UI separate from route wiring. [Build from scratch](https://tanstack.com/start/latest/docs/framework/react/build-from-scratch) |
| Favicon caching | Import the favicon from src/assets with ?no-inline so Vite emits a file with a content hash in production. Its URL then changes when the artwork changes. A fixed public/favicon.svg URL left Zen showing the old icon after the Amber rename. [Vite static assets](https://vite.dev/guide/assets.html) |
| Node production server | Start's hosting guide documents Nitro and the .output/server/index.mjs entry point. The app selects Nitro's node-server preset. `pnpm build` produces the server; `pnpm start` runs it. [Hosting](https://raw.githubusercontent.com/TanStack/router/main/docs/start/framework/react/guide/hosting.md) |
| Effect v4 | Pin effect to 4.0.0-rc.112, a prerelease, and use its current APIs. Add matching Effect packages only as their integrations are built. [Effect package](https://github.com/Effect-TS/effect/blob/main/packages/effect/package.json) |
| Shared form validation | TanStack Form accepts Standard Schema validators. Effect v4 exposes Schema.toStandardSchemaV1. Form validation does not return transformed values, so decode submitted data where normalized values are needed. [Form validation](https://tanstack.com/form/latest/docs/framework/react/guides/validation), [Effect Schema](https://github.com/Effect-TS/effect/blob/main/packages/effect/src/Schema.ts) |

Dependency versions are exact pins. Nitro uses 3.0.260610-beta rather than a release newer than the environment's seven-day dependency maturity policy. This is a compatibility choice for the initial scaffold, not a claim of stable Nitro 3. Preserve the lockfile; review dependency changes separately. [pnpm release age setting](https://pnpm.io/settings#minimumreleaseage)

The current server reads fixtures; preview mutations stay local. Tests at this stage cover domain behavior and browser journeys, not persistence or authenticated ownership. The original HTML files remain review artifacts; src is the maintained app.

CI actions use Node 24 and verified commit pins: [checkout 7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1), [setup-node 7.0.0](https://github.com/actions/setup-node/releases/tag/v7.0.0) and [pnpm setup 6.0.10](https://github.com/pnpm/action-setup/releases/tag/v6.0.10). The first run passed with older actions but reported their deprecated Node 20 runtimes; these versions remove that dependency. pnpm setup 6.1.0 was skipped because it was less than seven days old.

Google AI Pro access remains a separate setup check: use official Gemini CLI Google sign-in and subscription quota, with no API-credit fallback. Gemini 3.8 Flash access through that signed-in CLI has not been demonstrated. [CLI authentication](https://geminicli.com/docs/get-started/authentication/), [CLI model selection](https://geminicli.com/docs/cli/model/)

Feed filters compose in the URL: `groups` and `authors` each match any selected value, `me` resolves against the current account, and `bookmarked` intersects with that account’s bookmarks. Group options come from posts by the selected authors; author options come from posts in the selected groups. Each picker ignores its own selections when deriving alternatives, and bookmarks/search do not restrict picker options. Incompatible URL selections remain visible and removable. Two fictional groups demonstrate this interaction; Telegram collection remains unimplemented.

The group and author buttons open nonmodal popovers containing a searchable multiselect listbox. Arrow keys move the active option; Enter toggles its selection. The picker stays open and clears its local query for another selection. Escape restores trigger focus; Tab exits the picker. The scrollable listbox has tabindex=-1 because arrow keys already navigate it through the input; this avoids Chromium's extra Tab stop when the list overflows on mobile. Active chips sit below the toolbar. Clear filters removes groups, authors and bookmarks while preserving the search query and sort. [WAI combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)

Search keeps a fixed 200px width on desktop and fills its own row at viewport widths up to 640px. Focus changes only the border. The query and clear action remain visible after blur; Escape releases focus without clearing the query. Mobile inputs and toolbar buttons are 44px tall, and search inputs use 16px text to avoid focus zoom. On the narrowest phones the bookmark label gives way to its icon while keeping its accessible name.

Agent replaces the inbox and per-post conversations. `/agent` opens the active account’s single conversation; an optional `post` query attaches context to the composer without changing history or draft. Old `/messages` and `/messages/:postId` links redirect there. Each message can reference a post, but messages and memory belong to the user. Removing a post preserves the conversation and preferences; references to deleted posts degrade to a label.

The preview stores `agentByUser`, including messages, one draft, read position and memory. All agent state switches with the account, including for members without posts. Enter sends; Shift+Enter inserts a line break. The history scrolls inside the available viewport so the header, Memory button and composer stay accessible. Opening Agent marks the current messages read; the badge counts unread Amber messages.

The scripted example records Alex’s writing preference from a message and retrieves it for two separate post updates. Update actions capture the actual before/after text and the memory snapshots used. They reject another owner’s post, stale field values, repeated source/post updates and missing or forgotten memory IDs. A shared source message can support updates to distinct owned posts. Memory controls add, edit and forget preferences for the current account; historical use remains as an audit of the earlier update.

All data is still temporary sample state, reset on reload. Normal messages are stored locally; no live model extracts memories or generates responses. The production conversation and memory work is specified in implementation-plan tasks 20, 30 and 31. The preview adds no dependencies. Old `/saved` and `/dashboard` links still redirect to the corresponding feed filters.

The account dropdown follows the WAI menu-button pattern without adding a dependency. Opening it focuses an item; arrows, Home and End move within the menu; Escape restores avatar focus; Tab exits normally. It exposes only the working profile and sign-out actions. [WAI menu button](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/), [WAI menu keyboard behavior](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/)

## Search and toolbar design, 7 September 2026

Accepted and implemented: stationary desktop controls with search on its own row on mobile, searchable group/author dropdowns, removable chips and Clear filters. Member testing remains the next validation step.

NN/g's intranet research found that exposed search fields improve discoverability and avoid the extra interactions of hidden search. Baymard's ecommerce research supports visible, removable applied-filter overviews, including below horizontal toolbars. These findings support the principles; their application to Amber and the dimensions are design judgments, not evidence of a universally best layout. [NN/g: Intranet-Search Essentials](https://www.nngroup.com/articles/intranet-search/), [Baymard: Applied Filters](https://baymard.com/blog/how-to-design-applied-filters)

Validate the next prototype by asking three group members to find a remembered project, narrow it by author/group, and return to the full feed without guidance. Record completion, mistaken actions and whether they can identify the active constraints.
