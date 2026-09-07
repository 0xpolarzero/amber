# Feed design direction

The reviewed design now lives in the React app. Run `pnpm dev` and open [the app](http://127.0.0.1:3000). The original [standalone prototype](./feed-prototype.html) remains a visual reference and opens directly in Zen. The product is named Amber. All content is fictional sample data.

The feed is the home screen: one narrow column, white background, dark text, subtle dividers and generous spacing. Each post shows its creator, a short title and explanation, one project link, comments and a bookmark action.

| Interaction | Proposed behavior |
| --- | --- |
| Navigate | Feed and Agent are the two main sections. |
| Account | The avatar opens a compact dropdown with only Your profile and Sign out. The Me shortcut stays in the author filter. Outside clicks, Escape and Tab close the menu. |
| Filter | Group and Author buttons open searchable multiselect dropdowns. Keep the dropdown open while selecting; Escape restores button focus and Tab exits. Group choices reflect selected authors, and author choices reflect selected groups. Active filters appear as removable chips below, with Clear filters to remove group, author and bookmark selections while keeping the search and sort. Multiple choices within either filter match any selection; groups, authors, bookmarks and text search combine. Filters live in the URL. Me resolves to the connected account. |
| Agent | One private conversation per account at `/agent`, across all posts. Questions and messages carry optional post links; opening from a post adds context to the shared composer. The badge counts unread Amber messages. Send directly; AI changes include a diff. The latest diff is expanded and older updates stay collapsible. The header and composer remain visible while history scrolls. |
| Memory | The Memory button shows preferences shared across posts, with working Add, Edit and Forget controls. A saved-memory event acknowledges a preference; update messages can show the preference used at that time. Historical usage stays visible after forgetting, but forgotten preferences are excluded from new updates. |
| Browse | One compact dropdown: Newest, Most commented, Most bookmarked. Newest is the default; equal counts keep newest first. |
| Search | A stationary 200px field stays visible at the end of the desktop toolbar. Focus or `/` changes only its focus indicator. On mobile, search fills its own row above filters and sort. Clicking away or Escape preserves the query; Clear search remains available whenever the query is nonempty. |
| Open a post | Stay in the same column. Read context and comments; Back restores the previous view and position. |
| Bookmark | Keep a useful project. If login is needed, finish the original bookmark after signing in. |
| Visit a creator | Open a simple profile with their projects. |
| Own a post | Edit or remove it; message Amber and see what it changed. |

Use neutral descriptions for automatic summaries. First-person language belongs to original quotations or author edits. Source attribution stays available through View original message on the detail page. The feed starts with its controls, without a visible heading or caption. Show only the project count on profiles; omit generic group-origin captions.

The user selected a single sort dropdown in place of feed tabs. Bookmarks and the current author’s posts are filters on the feed, not navigation sections. Bookmark sorting uses sample aggregate counts plus the current preview's bookmarks. The app preserves this design and the prototype interactions: account switching, unread status, replies and edits use temporary sample state and reset on reload. Project/source links do not contact external services. Real login, storage, collection and AI processing remain in the implementation plan.

Use the bottom selector to switch between Visitor, Member and Author. The author example follows Noted and Tab tidy in the same chat; members without posts can still talk to Amber. Review feed density, text size and post hierarchy first.
