// Generated from poc/messaging/result.json by poc/project-historical-preview.ts.
export default {
  "version": 4,
  "mode": "recorded-real-model",
  "model": "gemini-3.8-flash-medium",
  "disclosure": "Historical Gemini messaging output replayed over invented in-memory records. Simulation timing is browser-only; no model runs in the preview.",
  "source": {
    "file": "poc/messaging/result.json",
    "turnId": "live-turn-2",
    "provenance": {
      "model": "gemini-3.8-flash-medium",
      "provider": "Google subscription through Antigravity CLI",
      "storage": "invented in-memory fixture; not deployed durability",
      "scripted": false
    },
    "sourceProvenance": {
      "workflow.ts": "sha256:d191f7a2d492a31871a788076916d4b0b21402d35205db90d1c2d167df39d359",
      "agents.ts": "sha256:daec6932bfce4adbfb863aad85a0be1556555bca32d0700f61ad9c4c4a8c31cb",
      "model.ts": "sha256:0676e9d7ab6e448131902a2c95425c8b409e38a36be8742062fccfb600f178d4",
      "schemas.ts": "sha256:726c83fd458fa7dbb7377421fc16b02f1ba4c57d1201315cf9cf69126334b86b",
      "testing/store.ts": "sha256:7856d72c8b8cf668dd0d3d010bdf00fe5072854fda17580d5010443c1475da24",
      "prompts/query-planner.mdx": "sha256:201b78adbe625d9298f3ad1799ed9d63b23c95f480420f78eec9d0bf3960e419",
      "prompts/responder.mdx": "sha256:53055be68e9acd0ad15dab2f12a7a172588b9d62acbeae39726d5682708eade7",
      "prompts/memory.mdx": "sha256:3592390702f1f0b30fc344393a5b087735e6c7149eba7f92d519676c290b8c95",
      "prompts/addressing.mdx": "sha256:4970f43ddd11df5e800b12154ee1217e885b40a2af94bb9524af5f4804858bdb"
    }
  },
  "input": {
    "turnId": "live-turn-2",
    "userId": "user-amber",
    "text": "Update Atlas to say it works offline and Noted to emphasize on-device transcription. PDF export is planned for the next release; defer the other export formats. Aurora should stay invite-only, as I said before. I no longer want detailed posts; keep them concise."
  },
  "assistant": {
    "id": "live-turn-2:assistant",
    "text": "Atlas has been updated to state that it works offline, Noted has been updated to emphasize on-device transcription with PDF export planned for the next release while deferring other formats, and Aurora has been updated to invite-only status. Understood regarding your preference for concise posts.",
    "intent": "informational",
    "linkedPostId": "atlas"
  },
  "posts": {
    "before": [
      {
        "id": "atlas",
        "authorId": "user-amber",
        "version": 4,
        "title": "Atlas",
        "summary": "A visual workspace for research.",
        "detail": "Atlas connects notes and sources.",
        "published": true
      },
      {
        "id": "noted",
        "authorId": "user-amber",
        "version": 3,
        "title": "Noted",
        "summary": "Offline voice transcription for macOS.",
        "detail": "Noted transcribes English and Mandarin voice notes on device.",
        "published": true
      },
      {
        "id": "aurora",
        "authorId": "user-amber",
        "version": 1,
        "title": "Aurora",
        "summary": "A collaborative planning tool in public beta.",
        "detail": "Aurora helps teams plan launches. Public beta access is available.",
        "published": true
      }
    ],
    "after": [
      {
        "id": "atlas",
        "authorId": "user-amber",
        "version": 5,
        "title": "Atlas",
        "summary": "An offline visual workspace for research.",
        "detail": "Atlas connects notes and sources and works offline.",
        "published": true
      },
      {
        "id": "noted",
        "authorId": "user-amber",
        "version": 4,
        "title": "Noted",
        "summary": "On-device voice transcription for macOS.",
        "detail": "Noted transcribes English and Mandarin voice notes on device. PDF export is planned for the next release.",
        "published": true
      },
      {
        "id": "aurora",
        "authorId": "user-amber",
        "version": 2,
        "title": "Aurora",
        "summary": "An invite-only collaborative planning tool.",
        "detail": "Aurora helps teams plan launches. Access is invite-only.",
        "published": true
      }
    ],
    "diffs": [
      {
        "postId": "atlas",
        "before": {
          "id": "atlas",
          "authorId": "user-amber",
          "version": 4,
          "title": "Atlas",
          "summary": "A visual workspace for research.",
          "detail": "Atlas connects notes and sources.",
          "published": true
        },
        "after": {
          "id": "atlas",
          "authorId": "user-amber",
          "version": 5,
          "title": "Atlas",
          "summary": "An offline visual workspace for research.",
          "detail": "Atlas connects notes and sources and works offline.",
          "published": true
        }
      },
      {
        "postId": "noted",
        "before": {
          "id": "noted",
          "authorId": "user-amber",
          "version": 3,
          "title": "Noted",
          "summary": "Offline voice transcription for macOS.",
          "detail": "Noted transcribes English and Mandarin voice notes on device.",
          "published": true
        },
        "after": {
          "id": "noted",
          "authorId": "user-amber",
          "version": 4,
          "title": "Noted",
          "summary": "On-device voice transcription for macOS.",
          "detail": "Noted transcribes English and Mandarin voice notes on device. PDF export is planned for the next release.",
          "published": true
        }
      },
      {
        "postId": "aurora",
        "before": {
          "id": "aurora",
          "authorId": "user-amber",
          "version": 1,
          "title": "Aurora",
          "summary": "A collaborative planning tool in public beta.",
          "detail": "Aurora helps teams plan launches. Public beta access is available.",
          "published": true
        },
        "after": {
          "id": "aurora",
          "authorId": "user-amber",
          "version": 2,
          "title": "Aurora",
          "summary": "An invite-only collaborative planning tool.",
          "detail": "Aurora helps teams plan launches. Access is invite-only.",
          "published": true
        }
      }
    ]
  },
  "memory": {
    "before": [
      {
        "id": "style",
        "userId": "user-amber",
        "text": "Prefer detailed factual posts.",
        "version": 2
      }
    ],
    "after": [
      {
        "id": "style",
        "userId": "user-amber",
        "text": "Prefer concise posts.",
        "version": 3
      }
    ]
  },
  "requests": {
    "before": [
      {
        "id": "live-request-exports",
        "text": "Which three export formats will Noted support?",
        "linkedPostId": "noted"
      }
    ],
    "after": [
      {
        "id": "live-request-exports",
        "text": "Which three export formats will Noted support?",
        "linkedPostId": "noted"
      }
    ]
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
      "pendingRequests": [
        {
          "id": "live-request-exports",
          "text": "Which three export formats will Noted support?",
          "linkedPostId": "noted"
        }
      ],
      "queries": [
        {
          "limit": 5,
          "resource": "posts",
          "terms": [
            "Atlas"
          ]
        },
        {
          "limit": 5,
          "resource": "posts",
          "terms": [
            "Aurora"
          ]
        },
        {
          "limit": 5,
          "resource": "user_messages",
          "terms": [
            "Aurora",
            "invite-only"
          ]
        }
      ]
    },
    "context": {
      "posts": [
        {
          "id": "noted",
          "version": 3,
          "title": "Noted",
          "summary": "Offline voice transcription for macOS.",
          "detail": "Noted transcribes English and Mandarin voice notes on device."
        },
        {
          "id": "atlas",
          "version": 4,
          "title": "Atlas",
          "summary": "A visual workspace for research.",
          "detail": "Atlas connects notes and sources."
        },
        {
          "id": "aurora",
          "version": 1,
          "title": "Aurora",
          "summary": "A collaborative planning tool in public beta.",
          "detail": "Aurora helps teams plan launches. Public beta access is available."
        }
      ],
      "userMessages": [
        {
          "id": "history-1:user",
          "text": "Aurora should remain invite-only.",
          "linkedPostId": null
        }
      ],
      "assistantMessages": [],
      "linkedRequestPostIds": [
        "noted"
      ],
      "memories": [
        {
          "id": "style",
          "text": "Prefer detailed factual posts.",
          "version": 2
        }
      ],
      "unaddressed": [
        {
          "id": "live-request-exports",
          "text": "Which three export formats will Noted support?",
          "linkedPostId": "noted"
        }
      ]
    },
    "response": {
      "classification": "answer",
      "intent": "informational",
      "text": "Atlas has been updated to state that it works offline, Noted has been updated to emphasize on-device transcription with PDF export planned for the next release while deferring other formats, and Aurora has been updated to invite-only status. Understood regarding your preference for concise posts.",
      "pendingOutcome": {
        "kind": "none"
      },
      "postChanges": [
        {
          "detail": "Atlas connects notes and sources and works offline.",
          "evidence": [
            {
              "id": "atlas",
              "kind": "post",
              "version": 4
            },
            {
              "id": "live-turn-2:user",
              "kind": "user_message"
            }
          ],
          "expectedVersion": 4,
          "postId": "atlas",
          "published": true,
          "summary": "An offline visual workspace for research.",
          "title": "Atlas"
        },
        {
          "detail": "Noted transcribes English and Mandarin voice notes on device. PDF export is planned for the next release.",
          "evidence": [
            {
              "id": "noted",
              "kind": "post",
              "version": 3
            },
            {
              "id": "live-turn-2:user",
              "kind": "user_message"
            },
            {
              "id": "live-request-exports",
              "kind": "request"
            }
          ],
          "expectedVersion": 3,
          "postId": "noted",
          "published": true,
          "summary": "On-device voice transcription for macOS.",
          "title": "Noted"
        },
        {
          "detail": "Aurora helps teams plan launches. Access is invite-only.",
          "evidence": [
            {
              "id": "aurora",
              "kind": "post",
              "version": 1
            },
            {
              "id": "live-turn-2:user",
              "kind": "user_message"
            },
            {
              "id": "history-1:user",
              "kind": "user_message"
            }
          ],
          "expectedVersion": 1,
          "postId": "aurora",
          "published": true,
          "summary": "An invite-only collaborative planning tool.",
          "title": "Aurora"
        }
      ]
    },
    "memory": {
      "existing": [
        {
          "id": "style",
          "text": "Prefer detailed factual posts.",
          "version": 2
        }
      ],
      "operations": [
        {
          "expectedVersion": 2,
          "id": "style",
          "kind": "update",
          "text": "Prefer concise posts."
        }
      ]
    },
    "addressing": {
      "requests": [
        {
          "id": "live-request-exports",
          "text": "Which three export formats will Noted support?",
          "linkedPostId": "noted"
        }
      ],
      "resolutions": []
    },
    "recording": {
      "model": "gemini-3.8-flash-medium",
      "source": "poc/messaging/result.json",
      "turnId": "live-turn-2",
      "scripted": false
    }
  }
} as const
