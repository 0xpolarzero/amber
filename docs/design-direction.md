# Feed design direction

The reviewed design now lives in the React app. Run `pnpm dev` and open [the app](http://127.0.0.1:3000). The original [standalone prototype](./feed-prototype.html) remains a visual reference and opens directly in Zen. The product is named Amber. All content is fictional sample data.

The feed is the home screen: one narrow column, white background, dark text, subtle dividers and generous spacing. Each post shows its creator, a short title and explanation, one project link, comments and a save action.

| Interaction | Proposed behavior |
| --- | --- |
| Browse | One compact dropdown: Newest, Most commented, Most bookmarked. Newest is the default; equal counts keep newest first. |
| Search | Reveal the search field with the search button or `/`. Filter by project or person. |
| Open a post | Stay in the same column. Read context and comments; Back restores the previous view and position. |
| Save | Bookmark a useful project. If login is needed, finish the original save after signing in. |
| Visit a creator | Open a simple profile with their projects. |
| Own a post | Edit or remove it; answer private questions and review additions. |

Use neutral descriptions for automatic summaries. First-person language belongs to original quotations or author edits. Source attribution stays available on the detail page.

The user selected a single sort dropdown in place of feed tabs. Bookmark sorting uses sample aggregate counts plus the current preview's saved state. The app preserves this design and the prototype interactions: account switching, replies and edits use temporary sample state and reset on reload. Project/source links do not contact external services. Real login, storage, collection and AI processing remain in the implementation plan.

Use the bottom selector to switch between Visitor, Member and Author. Review feed density, text size and post hierarchy first.
