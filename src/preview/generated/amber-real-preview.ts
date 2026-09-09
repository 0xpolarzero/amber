// Generated from poc/amber-lifecycle-runs/20260909T172000Z-gemini-complete.json by poc/project-lifecycle-preview.ts.
export default {
  "version": 5,
  "mode": "recorded-real-model",
  "model": "gemini-3.8-flash-medium",
  "disclosure": "Synthetic Telegram and private messages processed by the real Gemini workflows. Replay timing is browser-only.",
  "source": {
    "file": "poc/amber-lifecycle-runs/20260909T172000Z-gemini-complete.json",
    "runId": "20260909T172000Z-gemini-complete",
    "provenance": {
      "model": "gemini-3.8-flash-medium",
      "provider": "Google subscription through Antigravity CLI",
      "scripted": false,
      "storage": "shared synchronized in-memory PoC; no process-restart or database durability claim",
      "recordedAt": "2026-09-09T15:18:29.095Z",
      "runId": "20260909T172000Z-gemini-complete",
      "runFile": "poc/amber-lifecycle-runs/20260909T172000Z-gemini-complete.json",
      "resumedFrom": "poc/amber-lifecycle-runs/20260909T170500Z-gemini-stress-split.json",
      "reusedStages": [
        "telegramCreate",
        "telegramEvidence",
        "privateReply",
        "telegramStress",
        "heldOutSelection"
      ]
    },
    "sourceHashes": {
      "../telegram/schemas.ts": "sha256:0ba51cd5fb10921353ce49f0ffc52fb47b2522546bfc9944fd41ba7c77bd36cf",
      "../telegram/guards.ts": "sha256:896682bff9c53b45af7014fa9fed4d06ee92702173efc3e71b4ba2b10ca131f8",
      "../telegram/agents.ts": "sha256:81dab404f72c8b47ff74ab7b3270d1ba2fb13c52166da7648a62af3d3f0d6824",
      "../telegram/testing/store.ts": "sha256:5ef4fdb7071e2f5270f07bf2009aa358b85ff7c5f5a17c14d5cb1e00bde46b24",
      "../telegram/testing/long-conversations.ts": "sha256:e87fbb1f0fc79c9e1aaacca105269a1a9ce2884866c9f22b29b5b87ed9db26fb",
      "../telegram/prompts/selection.mdx": "sha256:db6846f682dfdb7c56cf915fa15301440fc925c53b1e2dfbb902e381ce53c85d",
      "../telegram/prompts/post.mdx": "sha256:7091ecd44eec7f630c7291a78c8b30a027374d88c2066acbdb49fd18abad4822",
      "./schemas.ts": "sha256:726c83fd458fa7dbb7377421fc16b02f1ba4c57d1201315cf9cf69126334b86b",
      "./guards.ts": "sha256:0ceb15c1d02c18d036bb798e5f80c7a91e130229b42e0c0a542a96acb54b2200",
      "./agents.ts": "sha256:daec6932bfce4adbfb863aad85a0be1556555bca32d0700f61ad9c4c4a8c31cb",
      "./testing/store.ts": "sha256:e15fccef54bb541105958284f6db20671b23c09e7e074be851d844efc37b0233",
      "./prompts/query-planner.mdx": "sha256:201b78adbe625d9298f3ad1799ed9d63b23c95f480420f78eec9d0bf3960e419",
      "./prompts/responder.mdx": "sha256:4c823c94420995907bd511ef60b8a301d91fd91acf58bd8da5146f60bd1d190d",
      "./prompts/memory.mdx": "sha256:3592390702f1f0b30fc344393a5b087735e6c7149eba7f92d519676c290b8c95",
      "./prompts/addressing.mdx": "sha256:4970f43ddd11df5e800b12154ee1217e885b40a2af94bb9524af5f4804858bdb"
    }
  },
  "input": {
    "turnId": "maya-private-final",
    "userId": "maya",
    "text": "For Orbit 0.4, patch export also records assignee changes. Attachments remain excluded and direct push is unavailable. Replace my detailed-writing preference: keep posts concise and factual."
  },
  "assistant": {
    "id": "maya-private-final:assistant",
    "userId": "maya",
    "conversationId": "conversation:maya",
    "role": "assistant",
    "text": "I have updated the Orbit post to reflect that version 0.4 patch exports record assignee changes, while attachments remain excluded and direct push is unavailable. I also acknowledge your preference to keep posts concise and factual.",
    "sequence": 13,
    "turnId": "maya-private-final",
    "intent": "informational",
    "linkedPostId": "north-1:0",
    "pendingCandidateId": null,
    "addressed": true
  },
  "posts": {
    "before": [
      {
        "id": "north-1:0",
        "authorId": "maya",
        "version": 2,
        "title": "Orbit",
        "summary": "Orbit is a local-first issue tracker for small hardware teams that imports GitHub issues from explicitly connected repositories and supports offline edits. Version 0.4 adds patch export for titles and labels (excluding attachments), while direct push remains unavailable. Desktop builds support macOS 14 and Windows 11 (Linux untested). Beta access is invite-only.",
        "detail": "Orbit is a local-first issue tracker designed for small hardware teams.\n\n### Key Features\n- **Offline Editing & GitHub Import**: Imports GitHub issues from explicitly connected repositories and keeps edits offline. It never auto-syncs every repository.\n- **Patch Export**: Version 0.4 adds patch export for edited issues. Exported patch files include issue titles and labels, but exclude attachments. Direct push remains unavailable.\n- **Platform Support**: Desktop builds support macOS 14 and Windows 11; Linux is untested.\n\n### Access\n- The public beta is currently invite-only.",
        "published": true
      }
    ],
    "after": [
      {
        "id": "north-1:0",
        "authorId": "maya",
        "version": 3,
        "title": "Orbit",
        "summary": "Orbit is a local-first issue tracker for small hardware teams that imports GitHub issues from explicitly connected repositories and supports offline edits. Version 0.4 adds patch export for titles, labels, and assignee changes (excluding attachments), while direct push remains unavailable. Desktop builds support macOS 14 and Windows 11 (Linux untested). Beta access is invite-only.",
        "detail": "Orbit is a local-first issue tracker designed for small hardware teams.\n\n### Key Features\n- **Offline Editing & GitHub Import**: Imports GitHub issues from explicitly connected repositories and keeps edits offline. It never auto-syncs every repository.\n- **Patch Export**: Version 0.4 adds patch export for edited issues. Exported patch files include issue titles, labels, and assignee changes, but exclude attachments. Direct push remains unavailable.\n- **Platform Support**: Desktop builds support macOS 14 and Windows 11; Linux is untested.\n\n### Access\n- The public beta is currently invite-only.",
        "published": true
      }
    ],
    "diffs": [
      {
        "postId": "north-1:0",
        "before": {
          "id": "north-1:0",
          "authorId": "maya",
          "version": 2,
          "title": "Orbit",
          "summary": "Orbit is a local-first issue tracker for small hardware teams that imports GitHub issues from explicitly connected repositories and supports offline edits. Version 0.4 adds patch export for titles and labels (excluding attachments), while direct push remains unavailable. Desktop builds support macOS 14 and Windows 11 (Linux untested). Beta access is invite-only.",
          "detail": "Orbit is a local-first issue tracker designed for small hardware teams.\n\n### Key Features\n- **Offline Editing & GitHub Import**: Imports GitHub issues from explicitly connected repositories and keeps edits offline. It never auto-syncs every repository.\n- **Patch Export**: Version 0.4 adds patch export for edited issues. Exported patch files include issue titles and labels, but exclude attachments. Direct push remains unavailable.\n- **Platform Support**: Desktop builds support macOS 14 and Windows 11; Linux is untested.\n\n### Access\n- The public beta is currently invite-only.",
          "published": true
        },
        "after": {
          "id": "north-1:0",
          "authorId": "maya",
          "version": 3,
          "title": "Orbit",
          "summary": "Orbit is a local-first issue tracker for small hardware teams that imports GitHub issues from explicitly connected repositories and supports offline edits. Version 0.4 adds patch export for titles, labels, and assignee changes (excluding attachments), while direct push remains unavailable. Desktop builds support macOS 14 and Windows 11 (Linux untested). Beta access is invite-only.",
          "detail": "Orbit is a local-first issue tracker designed for small hardware teams.\n\n### Key Features\n- **Offline Editing & GitHub Import**: Imports GitHub issues from explicitly connected repositories and keeps edits offline. It never auto-syncs every repository.\n- **Patch Export**: Version 0.4 adds patch export for edited issues. Exported patch files include issue titles, labels, and assignee changes, but exclude attachments. Direct push remains unavailable.\n- **Platform Support**: Desktop builds support macOS 14 and Windows 11; Linux is untested.\n\n### Access\n- The public beta is currently invite-only.",
          "published": true
        }
      }
    ]
  },
  "memory": {
    "before": [
      {
        "id": "scope",
        "userId": "maya",
        "text": "Never imply imports sync automatically.",
        "version": 1
      },
      {
        "id": "style",
        "userId": "maya",
        "text": "Prefer detailed explanations.",
        "version": 1
      }
    ],
    "after": [
      {
        "id": "scope",
        "userId": "maya",
        "text": "Never imply imports sync automatically.",
        "version": 1
      },
      {
        "id": "style",
        "userId": "maya",
        "text": "Keep posts concise and factual.",
        "version": 2
      }
    ]
  },
  "requests": {
    "before": [
      {
        "id": "north-1:0@0:question",
        "text": "Which desktop operating systems does the tracker build support?",
        "intent": "question",
        "linkedPostId": "north-1:0",
        "role": "assistant"
      }
    ],
    "after": []
  },
  "background": [
    {
      "task": "memory",
      "status": "done",
      "reason": null
    },
    {
      "task": "addressing",
      "status": "done",
      "reason": null
    }
  ],
  "trace": {
    "planner": {
      "pendingRequests": [],
      "queries": [
        {
          "limit": 5,
          "resource": "posts",
          "terms": [
            "Orbit",
            "0.4"
          ]
        }
      ]
    },
    "context": {
      "posts": [
        {
          "id": "north-1:0",
          "version": 2,
          "title": "Orbit",
          "summary": "Orbit is a local-first issue tracker for small hardware teams that imports GitHub issues from explicitly connected repositories and supports offline edits. Version 0.4 adds patch export for titles and labels (excluding attachments), while direct push remains unavailable. Desktop builds support macOS 14 and Windows 11 (Linux untested). Beta access is invite-only.",
          "detail": "Orbit is a local-first issue tracker designed for small hardware teams.\n\n### Key Features\n- **Offline Editing & GitHub Import**: Imports GitHub issues from explicitly connected repositories and keeps edits offline. It never auto-syncs every repository.\n- **Patch Export**: Version 0.4 adds patch export for edited issues. Exported patch files include issue titles and labels, but exclude attachments. Direct push remains unavailable.\n- **Platform Support**: Desktop builds support macOS 14 and Windows 11; Linux is untested.\n\n### Access\n- The public beta is currently invite-only."
        }
      ],
      "userMessages": [],
      "assistantMessages": [],
      "linkedRequestPostIds": [],
      "memories": [
        {
          "id": "style",
          "text": "Prefer detailed explanations.",
          "version": 1
        },
        {
          "id": "scope",
          "text": "Never imply imports sync automatically.",
          "version": 1
        }
      ],
      "unaddressed": []
    },
    "response": {
      "classification": "answer",
      "intent": "informational",
      "text": "I have updated the Orbit post to reflect that version 0.4 patch exports record assignee changes, while attachments remain excluded and direct push is unavailable. I also acknowledge your preference to keep posts concise and factual.",
      "pendingOutcome": {
        "kind": "none"
      },
      "postChanges": [
        {
          "detail": "Orbit is a local-first issue tracker designed for small hardware teams.\n\n### Key Features\n- **Offline Editing & GitHub Import**: Imports GitHub issues from explicitly connected repositories and keeps edits offline. It never auto-syncs every repository.\n- **Patch Export**: Version 0.4 adds patch export for edited issues. Exported patch files include issue titles, labels, and assignee changes, but exclude attachments. Direct push remains unavailable.\n- **Platform Support**: Desktop builds support macOS 14 and Windows 11; Linux is untested.\n\n### Access\n- The public beta is currently invite-only.",
          "evidence": [
            {
              "id": "north-1:0",
              "kind": "post",
              "version": 2
            },
            {
              "id": "maya-private-final:user",
              "kind": "user_message"
            }
          ],
          "expectedVersion": 2,
          "postId": "north-1:0",
          "published": true,
          "summary": "Orbit is a local-first issue tracker for small hardware teams that imports GitHub issues from explicitly connected repositories and supports offline edits. Version 0.4 adds patch export for titles, labels, and assignee changes (excluding attachments), while direct push remains unavailable. Desktop builds support macOS 14 and Windows 11 (Linux untested). Beta access is invite-only.",
          "title": "Orbit"
        }
      ]
    },
    "memory": {
      "existing": [
        {
          "id": "style",
          "text": "Prefer detailed explanations.",
          "version": 1
        },
        {
          "id": "scope",
          "text": "Never imply imports sync automatically.",
          "version": 1
        }
      ],
      "operations": [
        {
          "expectedVersion": 1,
          "id": "style",
          "kind": "update",
          "text": "Keep posts concise and factual."
        }
      ]
    },
    "addressing": {
      "requests": [],
      "resolutions": []
    }
  }
} as const
