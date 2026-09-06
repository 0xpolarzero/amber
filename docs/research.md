# Telegram community showcase: architecture research

This is the initial research. The user's subsequent choices of GramJS, TanStack Start, Effect v4 and Google model access are recorded in [the current architecture](./architecture.md), which supersedes this document's stack and ingestion recommendation.

Researched 6 September 2026. This is a proposed architecture, not an implemented or live-tested integration. The repository was empty. Assumptions: one group, modest traffic, public access to approved posts, and comments open to anyone who signs in with Telegram or X.

Use Next.js and TypeScript, PostgreSQL, and pg-boss. Deploy the website and a persistent worker from one repository. Start with a consented one-time history import and a Bot API webhook for new messages. Use an MTProto user client only when automatic history recovery is a firm requirement.

## Access and consent determine the ingestion design

The ordinary Bot API has no group-history reader. Telegram's `messages.getHistory` method is restricted to authenticated user accounts, and returns only history that account can access. Making a bot an administrator does not turn it into a user account. [Telegram history method](https://core.telegram.org/method/messages.getHistory)

A group bot needs privacy mode disabled or administrator status to receive ordinary member messages. Obtain the administrator's agreement to install it, using only necessary privileges. [Telegram bot FAQ](https://core.telegram.org/bots/faq)

Telegram's content terms restrict using platform data for AI, with consent-dependent exceptions covering the specific content and context. Bot developer terms expressly allow direct voluntary submissions with informed, individual, active, revocable consent. My design conclusion: administrator approval alone is insufficient; use individual opt-in before AI processing. Direct submission to the bot is the clearest starting flow. Whole-group automatic scanning needs the relevant consent/exception established, including any surrounding messages used as context. An export or user client does not remove these restrictions. [Content terms](https://telegram.org/tos/content-licensing), [bot developer terms, section 4.3](https://telegram.org/tos/bot-developers#4-3-data-scraping), [API terms, section 1.5](https://core.telegram.org/api/terms)

Recommended product behavior: automatically create private drafts for eligible, consented content; obtain the author's approval before public publication. Keep raw group conversation private. Recheck consent before a queued job runs and provide deletion/revocation. Do not include messages from nonconsenting participants in an otherwise consenting author's context window.

## Backfill and ongoing ingestion

| Option | What it delivers | Decision |
| --- | --- | --- |
| Telegram Desktop JSON export plus Bot API | One-time history import and automatic future ingestion | Smallest operational footprint |
| MTProto user client plus Bot API | Automatic history backfill and later gap recovery; bot handles user-facing interactions | Use when automatic recovery is essential |
| Bot API alone | Future updates only | Cannot meet the historical backfill requirement |

For the first option, export this chat using Telegram Desktop, select JSON, and import only the agreed seven-day interval and consented content. Telegram documents both JSON and individual-chat exports. Start collecting live events before taking the export, so the two inputs overlap. [Telegram export documentation](https://telegram.org/blog/export-and-more)

For automatic history, GramJS is a TypeScript MTProto client with date/ID pagination. Authenticate a legitimate group-member user account using your own API ID/hash. Keep the resulting session secret server-side; website visitors never provide their Telegram login codes to this importer. A newly joined account may not see earlier history. [GramJS pagination](https://gram.js.org/beta/interfaces/client.message.IterMessagesParams.html), [Telegram API setup](https://core.telegram.org/api/obtaining_api_id)

Proposed cursor algorithm:

1. Record a fixed seven-day cutoff and snapshot upper message ID. Page backwards within that range, persisting each page and its resumable import position. Do not mark the range complete until every page is committed.
2. For incremental runs, snapshot a new upper ID, exhaust the interval above the previous completed cursor, and then advance that cursor. A descending first page must never move the cursor past older unprocessed pages. Maintain ingestion progress separately from AI job state.
3. Schedule a catch-up job every 1–5 minutes if polling is preferred. Permit only one collector per account/chat, honor Telegram flood waits, and replay overlapping ranges through the same deduplication path. Frequency is a starting configuration, not a Telegram guarantee.
4. If edits and deletions must synchronize, handle MTProto updates and gap recovery as well. Reading only higher message IDs misses changes to older messages. Telegram specifies persistent update sequences and difference recovery. [Update synchronization](https://core.telegram.org/api/updates)

Cross-import identity requires care: supergroup/channel message IDs are shared across accounts, whereas basic-group IDs can differ by account. Use `(chat_id, message_id)` across bot and export/MTProto only after confirming a supergroup and normalizing chat identifiers. Otherwise namespace by source/account and reconcile explicitly; never deduplicate unrelated basic-group messages on an assumed shared ID. [Telegram message ID sequences](https://core.telegram.org/api/updates#message-id-sequences)

For live ingestion, prefer webhooks. Telegram also supports long polling, but the transports are mutually exclusive. Undelivered updates expire after 24 hours; ordinary group deletion events are not exposed as a general Bot API update type. An expired update is outside the local queue's recovery guarantee. [Bot API](https://core.telegram.org/bots/api#getting-updates)

If pull delivery is preferred, run one long poller and advance `getUpdates`' offset only after committing the fetched batch and its jobs. Do not wait for AI completion before ingesting more messages. Persist the offset across restarts. Webhook mode instead acknowledges each update after durable storage; a maximum message ID is not a webhook acknowledgement mechanism.

## Reliable jobs with one database

The proposed path is:

```text
Telegram webhook / import
          |
          v
Postgres transaction: eligible message + processing job
          |
          v
pg-boss worker -> classify and draft -> author review -> public post
                                            |
                                      answers or edits
                                            |
                                      revision job
```

Validate webhook authentication and the configured chat before accepting content. Apply consent filtering, persist permitted content, and enqueue its job in one database transaction. Return success only after commit. pg-boss supports job operations inside the application's transaction, including through its Drizzle adapter. This removes the crash window between saving a message and scheduling processing. [Transaction adapters](https://pgboss.io/api/adapters)

Proposed database invariants:

- Unique delivery identity `(bot_id, update_id)` to absorb webhook retries.
- Stable source identity plus revision fingerprint to distinguish edits from duplicates.
- Unique processing identity `(source_bundle_id, revision, pipeline_version)`.
- Source-to-post relations, with one current result per bundle; author plus canonical project URL helps identify later updates to an existing project.
- Conditional post writes against the revision read by the job, preventing a slow AI response from replacing a newer author edit.

Set explicit retry limits, exponential backoff, timeouts, heartbeats, and retention. pg-boss implements these controls; defaults are not a reliability policy. [Job controls](https://pgboss.io/api/jobs)

Start with two concurrent AI jobs and serialize competing writes to a project. Configure a dead-letter queue for exhausted failures and expose replays to an administrator. pg-boss provides queue policies and worker concurrency controls. [Queues](https://pgboss.io/api/queues), [workers](https://pgboss.io/api/workers)

Design for repeated execution. A crash after an LLM request or Telegram notification can cause another attempt. Database uniqueness can prevent duplicate posts but cannot guarantee exactly one external API call. Record completed AI results before scheduling downstream work; use a separate notification outbox so a failed notification does not regenerate a post. An ambiguous Telegram send can still duplicate a notification.

Monitor collector health, time since last successful delivery/poll, oldest runnable job, retry counts, and dead-letter count. Alert before the Telegram retention window is at risk. Keep enough source and processing state to rebuild eligible unfinished jobs if queue retention expires. A queue protects committed work; it does not make missing source history recoverable or replace database backups.

## AI and author interaction

Define “worthwhile” as an original project, demonstration, workflow, or concrete result the member created, with enough evidence to explain it. Separate someone sharing their own work from forwarding somebody else's product, general AI news, or praise.

Proposed processing contract:

1. Combine related consented messages using reply/thread links, albums, author, project URL, and a short collection window, initially 60–120 seconds. Keep unrelated authors/projects separate.
2. Use one small model call returning a validated schema: decision, source IDs, title, short summary, evidence, project links, and up to three missing-information questions. A schema validates structure, not factual truth. [Structured output reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/output)
3. Preserve the supporting source IDs. Do not infer authorship, performance figures, or links from speculation. Messages and linked pages are untrusted data, never instructions to the worker. Initially avoid unrestricted link crawling.
4. Save a private draft, or an explicit ignored decision. The author can publish, edit, reject, or answer questions on the website. Answers enqueue another bounded job; no worker stays running while waiting for a human.
5. AI revisions remain suggestions once the author has edited a field. Store revisions and provide deletion. Comments require a signed-in user and simple rate limiting/reporting.

Start with text, links, and opted-in images only where needed to understand a project. Add video/audio processing after measuring how many useful posts text alone misses. Store approved media in object storage when required; do not expose token-bearing Telegram file URLs.

## Identity and login

Telegram now supports OIDC Authorization Code with PKCE. Request `openid profile`; the verified `id` claim is the Telegram user ID, while `sub` is the login subject and must be stored separately. Telegram provides neither an email claim nor a UserInfo endpoint. Optional bot-access consent allows follow-up DMs after login. [Telegram Login](https://core.telegram.org/bots/telegram-login)

Proposed ownership model: store an author record keyed by numeric Telegram user ID before first website login. Link it only when a verified Telegram login proves that same ID. Display names and usernames are mutable labels. Forwarded posts and anonymous/channel-authored messages need explicit attribution review; never automatically award ownership to the forwarder.

Use one internal user with multiple provider identities. Anyone can comment after either login; only the user linked to the Telegram author can edit that author's post. Linking X requires an existing authenticated session and successful X authorization. X-only login must not claim a Telegram post. Avoid automatic account merging by username or email.

Auth.js is the initial library candidate because its Postgres adapter permits missing email, and it supplies X plus configurable OAuth/OIDC providers. [Postgres adapter](https://authjs.dev/getting-started/adapters/pg), [X provider](https://authjs.dev/getting-started/providers/twitter), [custom providers](https://authjs.dev/guides/configuring-oauth-providers)

Two material tradeoffs need a small integration spike before fixing this dependency:

- Current Auth.js callback source assumes UserInfo exists in one discovery path. A custom Telegram provider must handle explicit endpoints and Telegram's token-verification requirements; issuer-only configuration is insufficient in that path. Prove real login, signature/claim verification, post claiming, logout, and explicit X linking with the exact pinned version. Source inspection is not a completed integration test. [Callback implementation](https://raw.githubusercontent.com/nextauthjs/next-auth/main/packages/core/src/lib/actions/callback/oauth/callback.ts)
- Auth.js receives security and urgent maintenance, and its maintainers recommend Better Auth for most new projects. This project's missing-email requirement is a specific reason to evaluate Auth.js anyway. Bare Better Auth generic OAuth rejects missing-email signup; account linking options do not solve initial Telegram-only registration. Do not invent a verified email to hide the mismatch. [Auth.js maintenance announcement](https://github.com/nextauthjs/next-auth/discussions/13252), [Better Auth missing-email behavior](https://better-auth.com/docs/reference/errors/email_not_found)

X needs developer application credentials and registered callbacks. Its API currently uses usage-based pricing, so budget for profile reads and verify app access before promising free X login. [X pricing](https://docs.x.com/x-api/getting-started/pricing)

## Hosting and alternatives

Use one Railway project with three services: Next.js web/API, persistent Node worker, and PostgreSQL. The app and worker share code and schema with different start commands; keep business data in the database, not the worker filesystem. [Railway shared repository deployment](https://docs.railway.com/deployments/monorepo)

Railway's PostgreSQL template is unmanaged. Enable scheduled backups and point-in-time recovery, and test a restore. Provisioning a database is not the same as maintaining it. [PostgreSQL service](https://docs.railway.com/databases/postgresql), [backup and restore guide](https://docs.railway.com/guides/postgres-backups-restores)

A planning allowance of $15–30/month for a small always-on deployment is an estimate, excluding model calls, media, domain, and X usage. Railway Hobby has a $5 monthly minimum credited toward usage; resource charges determine the bill. Group volume and media workload are still unknown. [Railway pricing](https://docs.railway.com/pricing/plans)

| Alternative | Assessment for this project |
| --- | --- |
| Supabase Postgres and Queues | Credible if already using Supabase. Its queue is Postgres-based, but workers still need an execution strategy; Edge background tasks have duration limits. [Queues](https://supabase.com/docs/guides/queues), [background tasks](https://supabase.com/docs/guides/functions/background-tasks) |
| BullMQ | Its current version also offers a PostgreSQL backend, so Redis is no longer an unavoidable dependency. Prefer pg-boss here for its documented application-transaction integration; BullMQ is a credible alternative when its API is already familiar. [BullMQ PostgreSQL backend](https://docs.bullmq.io/guide/postgresql) |
| VPS with app, worker, and Postgres | Fewer hosting accounts and potentially lower cash cost, but server maintenance and recovery become your work. |
| Managed workflow service | Useful when workflow operations become substantial. Current steps fit database jobs and ordinary application state. |

## First proof and remaining evidence

The unanswered product question is whether members return to retrieve useful work more effectively than with Telegram search or a pinned digest. There is no evidence yet that a larger social network is necessary.

Proposed first proof: five consenting members, 20 representative submissions, author-approved summaries, and a working Telegram login/ownership path. Record false positives, misattribution, substantive edits, useful missing-information answers, and real retrieval visits. Select the model on those examples instead of assuming one model's price or reputation determines quality.

Before building, settle whether the first import may be manual, whether the group is a supergroup, whether the account can see the required history, and whether every piece of model context has the necessary consent. During implementation, reproduce duplicate delivery, crash after database commit, LLM timeout, stale AI revision, rejected ownership, and recovery from a partially completed backfill. Those are the behavioral tests that establish the requested reliability.
