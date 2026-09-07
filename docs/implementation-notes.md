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

The group and author pickers share the WAI combobox behavior: arrow keys move the active option, Enter adds its filter chip, Escape dismisses the popup, and focus stays in the input. Active chips sit below the single control row. [WAI combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)

Search stays visible as a compact input. CSS focus-within switches it instantly to full width without shifting chips or posts. Blur and Escape restore the controls without clearing the URL query; the clear action keeps input focus. On narrow phones the sort control uses an icon to leave room for the search field.

Messages currently reuses each sample post’s private question. Opening a question marks it read for its recipient; accepting an answer removes the pending question. Read state is temporary preview state, like bookmarks and edits. Persistent conversations and server authorization remain future work. Old `/saved` and `/dashboard` links redirect to the corresponding feed filters.

The account dropdown follows the WAI menu-button pattern without adding a dependency. Opening it focuses an item; arrows, Home and End move within the menu; Escape restores avatar focus; Tab exits normally. It exposes only the working profile and sign-out actions. [WAI menu button](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/), [WAI menu keyboard behavior](https://www.w3.org/WAI/ARIA/apg/patterns/menubar/)

## Search and toolbar recommendation, 7 September 2026

Under review; this recommendation has not changed the app. Keep desktop controls stationary: Group, Author, Bookmarks, then sort and a search field approximately 180–220px wide. Search focus changes only its focus indicator. Group and Author open searchable multiselect popovers; selected values remain removable chips below, with Clear filters. Preserve reciprocal group/author filtering and the query while using other controls. On mobile, put search on its own row above the filter and sort controls instead of shrinking labels or replacing controls.

NN/g's intranet research found that exposed search fields improve discoverability and avoid the extra interactions of hidden search. Baymard's ecommerce research supports visible, removable applied-filter overviews, including below horizontal toolbars. These findings support the principles; their application to Amber and the proposed dimensions are design judgments, not evidence of a universally best layout. [NN/g: Intranet-Search Essentials](https://www.nngroup.com/articles/intranet-search/), [Baymard: Applied Filters](https://baymard.com/blog/how-to-design-applied-filters)

Validate the next prototype by asking three group members to find a remembered project, narrow it by author/group, and return to the full feed without guidance. Record completion, mistaken actions and whether they can identify the active constraints.
