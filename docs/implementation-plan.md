# Implementation plan

[Open the HTML review page](./implementation-plan.html) for screen sketches, task filters and review notes.

[Open the feed prototype](./feed-prototype.html) for the current visual direction ([design notes](./design-direction.md)).

Proposed for review. Each numbered task delivers one checkable result. Refer to its number when suggesting changes.

A searchable showcase of one Telegram group's projects. Authors control their posts; visitors discover projects and discuss them.

## What you will see

| Screen | Contents and actions |
| --- | --- |
| Feed `/` | Search; newest-first cards with author and date. |
| Post `/posts/:id` | Summary, project/source links, author, comments. Owners get Edit, Remove and private AI questions. |
| Author `/people/:id` | Name, linked X profile and projects. Exists before they join. |
| My space `/dashboard` | My posts, unanswered questions and suggested revisions. |
| Admin `/admin` | Submissions to review, reported comments and worker health. |

```text
PROJECTS FROM THE GROUP                  Search…    Sign in

Built a tool that turns meeting notes into tasks
Two plain sentences explaining what it does and the result.
Alex · 2 hours ago                            Open project →
```

Defaults to review: public reading; login to comment; automatic publication of clear original work; admin review for uncertainty. Text and links first; questions on the website. Media previews, direct messages, follows and likes can come later.

## The stack in plain language

| Part | Choice and job |
| --- | --- |
| Website | React screens; Vite builds; TanStack Start server/Router; Query caching; Form inputs. |
| Logic | Effect v4 handles operations, failures and resources; Schema validates data. |
| Storage | PostgreSQL stores everything; `@effect/sql-pg` runs queries. |
| Jobs | pg-boss persists work across restarts; Effect runs each attempt. |
| Telegram | GramJS reads through your account. Website login is separate. |
| Model | Gemini CLI with Google Pro login; verify 3.8 Flash in task 03. No API-credit fallback. |
| Login | Telegram and X. Auth.js remains provisional until task 04. |
| Hosting | Proposed Railway: web process, worker process, Postgres. One TypeScript repository. |

```text
Telegram → saved messages + queued work → Gemini CLI → posts → website
                                              ↑                 |
                                              └─ saved answers ─┘
```

Collection continues while model work waits. Answers persist immediately and queue a revision.

## Small deliveries

Build in order. Tasks 01–04 settle the main uncertainties; task 08 delivers the first sample message → visible post.

| # | Piece of work | Done when |
| --- | --- | --- |
| 01 | Clickable screen mock | Browse sample screens, including owner, signed-out, empty and waiting states. |
| 02 | Define “worthwhile” | Label 20 examples: publish, ignore or review. Include forwards and ambiguous authorship. |
| 03 | Prove model access | Google-login headless request uses the requested model; authentication survives restart. |
| 04 | Prove Telegram login | Verified numeric author ID, no email requirement, working logout. |
| 05 | App shell | Start/Vite/React builds; a page calls an Effect-backed server function. |
| 06 | One stored post | A migration creates its tables; a page reads it from Postgres after restart. |
| 07 | Durable queue | Message/job/progress commit or roll back together; pending work survives restart. Set bounded retries. |
| 08 | Sample message → post | Gemini runs with tools disabled; validated output becomes a post. Timeout, quota or invalid output waits/fails safely. |
| 09 | Telegram connection | Save one page from the configured group; preserve author IDs; replay without duplicates. |
| 10 | Seven-day backfill | Import a fixed range across pages; resume interruption without skips or duplicates. |
| 11 | Minute-by-minute collection | Advance progress after the entire range; recover multi-page gaps after downtime. |
| 12 | Source changes | Recover edits/deletions after downtime; flag affected posts and prevent publication from removed evidence. |
| 13 | Group related messages | Combine project replies/albums/follow-ups; keep unrelated authors and projects separate. |
| 14 | Publication decisions | Apply task 02 rules with verified evidence. Replays deduplicate; matched project updates target existing posts. |
| 15 | Real feed | Search, pagination and publication refresh work with stored posts. |
| 16 | Post page | Display summary, author and links; handle missing/removed posts. |
| 17 | Author pages | List each person's published projects, including before they join. |
| 18 | Login and ownership | Verified Telegram ID claims the author; other accounts cannot edit their posts. |
| 19 | Edit/remove posts | Save owner changes; prevent stale AI overwrites and reimport of removed posts. |
| 20 | Questions and answers | Show up to three private questions; save answers and enqueue revision together. |
| 21 | Suggested revisions | Owner accepts/dismisses visible changes; acceptance respects newer edits. |
| 22 | X login | X-only visitors sign in/out without claiming Telegram posts. |
| 23 | Account linking | Prove both identities; explain conflicts; never merge by username. |
| 24 | Comments | Signed-in posting, own-comment deletion, reporting and server-enforced rate limits work. |
| 25 | Editorial controls | Admin-only approval/rejection, source-change review and comment removal work. |
| 26 | Worker controls | Show sync/backlog/errors; replay failures. Quota pauses only model work. |
| 27 | Hosting | Run both processes with persistent protected sessions, HTTPS and scheduled backups. |
| 28 | Recovery proof | Restart interrupted jobs and restore a backup; verify replay and record recovery time/data-loss window. |
| 29 | Group pilot | Members find projects, correct a summary and answer a question; record and fix failures. |

## How we will build together

Each task ends with a demo and its completion check. Test ownership, transactions, pagination and recovery; inspect simple visual changes directly.

Failed model/auth proofs block dependent work. Discuss the exact failure and an alternative; continue independent tasks.

Details and primary sources: [architecture.md](./architecture.md) and [initial research](./research.md).

Start the review with the screen table, proposed defaults and tasks 01–04.
