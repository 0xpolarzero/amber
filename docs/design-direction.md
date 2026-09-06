# Feed design direction

[Open the interactive prototype](./feed-prototype.html). Open the file directly in Zen; it needs no server. “Field” is a working name, and all content is fictional sample data.

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

The user selected a single sort dropdown in place of feed tabs. Bookmark sorting uses sample aggregate counts plus the current preview's saved state. The prototype is a local visual experiment: account switching, replies and edits use temporary sample state and reset on reload. Project/source links do not contact external services. Real login, storage, collection and AI processing remain in the implementation plan.

Use the bottom selector to switch between Visitor, Member and Author. Review feed density, text size and post hierarchy first.
