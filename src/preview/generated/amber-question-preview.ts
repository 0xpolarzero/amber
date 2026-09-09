// Generated from poc/preview-result.json by poc/project-question-preview.ts.
export default {
  "question": {
    "id": "preview-extracted-question-1",
    "authorId": "alex",
    "postId": "batch-1:0",
    "text": "Does Noted support Mandarin transcription?",
    "needsReply": true
  },
  "source": {
    "disclosure": "Invented Telegram messages processed by the real Gemini extraction and messaging workflows. This preview is not connected to Telegram.",
    "batchId": "batch-1",
    "groupId": "ai-builders",
    "messages": [
      {
        "id": "90",
        "authorId": "dana",
        "text": "I released Clipbook last month. It saves copied links.",
        "replyToId": null,
        "albumId": null
      },
      {
        "id": "101",
        "authorId": "carl",
        "text": "The new Gemini announcement looks impressive!",
        "replyToId": null,
        "albumId": null
      },
      {
        "id": "102",
        "authorId": "alex",
        "text": "I built Noted: voice notes transcribed locally on a Mac. https://noted.example",
        "replyToId": null,
        "albumId": null
      },
      {
        "id": "103",
        "authorId": "bea",
        "text": "Tab tidy update: it now groups tabs by project, not just domain. GitHub, docs and issues can stay together.",
        "replyToId": null,
        "albumId": null
      },
      {
        "id": "104",
        "authorId": "alex",
        "text": "It uses Whisper on the device. It is free and works offline.",
        "replyToId": "102",
        "albumId": null
      },
      {
        "id": "105",
        "authorId": "carl",
        "text": "Does Noted understand Mandarin?",
        "replyToId": "102",
        "albumId": null
      }
    ],
    "outcomes": {
      "posts": [
        {
          "authorId": "alex",
          "title": "Noted: Local Voice Note Transcription for Mac",
          "outcome": "created",
          "questionCount": 1
        },
        {
          "authorId": "bea",
          "title": "Tab tidy",
          "outcome": "updated",
          "questionCount": 0
        }
      ],
      "ignored": [
        {
          "messageId": "101",
          "reason": "General AI news reaction rather than personal project work"
        }
      ]
    }
  },
  "trace": {
    "questionId": "preview-extracted-question-1",
    "authorId": "alex",
    "project": "Noted",
    "selectedMessageIds": [
      "102",
      "104",
      "105"
    ],
    "context": {
      "existingPosts": [],
      "memories": [
        {
          "id": "style",
          "text": "Keep my posts short and factual. No hype."
        }
      ],
      "outstandingRequests": [],
      "observedTools": [
        "amber/searchMessages",
        "amber/searchPosts",
        "amber/readMessages"
      ],
      "observationScope": "both recorded writer branches"
    },
    "publication": {
      "post": {
        "id": "batch-1:0",
        "title": "Noted: Local Voice Note Transcription for Mac",
        "summary": "A free Mac app for transcribing voice notes locally and offline using on-device Whisper.",
        "detail": "Noted transcribes voice notes locally on a Mac using on-device Whisper. It runs completely offline, is free to use, and is available at https://noted.example."
      },
      "output": {
        "existingPostId": null,
        "sources": [
          {
            "kind": "telegram",
            "messageId": "102"
          },
          {
            "kind": "telegram",
            "messageId": "104"
          },
          {
            "kind": "telegram",
            "messageId": "105"
          }
        ]
      }
    },
    "question": "Does Noted support Mandarin transcription?",
    "related": [
      {
        "authorId": "bea",
        "project": "Tab tidy",
        "messageIds": [
          "103"
        ],
        "existingPosts": [
          {
            "id": "tab-tidy",
            "title": "Tab tidy",
            "summary": "A Chrome extension that groups tabs by domain."
          }
        ],
        "resultPost": {
          "id": "tab-tidy",
          "title": "Tab tidy",
          "summary": "A Chrome extension that groups browser tabs by project rather than just by domain."
        },
        "outcome": "updated"
      }
    ],
    "recording": {
      "model": "gemini-3.8-flash-medium",
      "disclosure": "Invented Telegram messages processed by the real Gemini extraction and messaging workflows. This preview is not connected to Telegram."
    }
  },
  "replyTrace": {
    "planner": {
      "pendingRequests": [
        {
          "id": "preview-extracted-question-1",
          "text": "Does Noted support Mandarin transcription?",
          "linkedPostId": "batch-1:0"
        }
      ],
      "queries": []
    },
    "context": {
      "posts": [
        {
          "id": "batch-1:0",
          "version": 1,
          "title": "Noted: Local Voice Note Transcription for Mac",
          "summary": "A free Mac app for transcribing voice notes locally and offline using on-device Whisper.",
          "detail": "Noted transcribes voice notes locally on a Mac using on-device Whisper. It runs completely offline, is free to use, and is available at https://noted.example."
        }
      ],
      "userMessages": [],
      "assistantMessages": [],
      "linkedRequestPostIds": [
        "batch-1:0"
      ],
      "memories": [
        {
          "id": "style",
          "text": "Keep my posts short and factual. No hype.",
          "version": 1
        }
      ],
      "unaddressed": [
        {
          "id": "preview-extracted-question-1",
          "text": "Does Noted support Mandarin transcription?",
          "linkedPostId": "batch-1:0"
        }
      ]
    },
    "response": {
      "classification": "answer",
      "intent": "informational",
      "text": "I have updated the post for Noted to reflect that it supports Mandarin transcription. I also acknowledge your preference to keep your posts concise and factual.",
      "pendingOutcome": {
        "kind": "none"
      },
      "postChanges": [
        {
          "detail": "Noted transcribes voice notes locally on a Mac using on-device Whisper and supports Mandarin transcription. It runs completely offline, is free to use, and is available at https://noted.example.",
          "evidence": [
            {
              "id": "batch-1:0",
              "kind": "post",
              "version": 1
            },
            {
              "id": "preview-turn-1:user",
              "kind": "user_message"
            },
            {
              "id": "preview-extracted-question-1",
              "kind": "request"
            }
          ],
          "expectedVersion": 1,
          "postId": "batch-1:0",
          "published": true,
          "summary": "A free Mac app for transcribing voice notes locally and offline using on-device Whisper, with support for Mandarin.",
          "title": "Noted: Local Voice Note Transcription for Mac"
        }
      ]
    },
    "memory": {
      "existing": [
        {
          "id": "style",
          "text": "Keep my posts short and factual. No hype.",
          "version": 1
        }
      ],
      "operations": []
    },
    "addressing": {
      "requests": [
        {
          "id": "preview-extracted-question-1",
          "text": "Does Noted support Mandarin transcription?",
          "linkedPostId": "batch-1:0"
        }
      ],
      "resolutions": [
        {
          "outcome": "answered",
          "reason": "The user directly confirmed that Noted supports Mandarin.",
          "requestMessageId": "preview-extracted-question-1"
        }
      ]
    }
  },
  "messaging": {
    "input": {
      "turnId": "preview-turn-1",
      "userId": "alex",
      "text": "Noted supports Mandarin. Keep my posts concise and factual."
    },
    "assistant": {
      "id": "preview-turn-1:assistant",
      "userId": "alex",
      "conversationId": "conversation:alex",
      "role": "assistant",
      "text": "I have updated the post for Noted to reflect that it supports Mandarin transcription. I also acknowledge your preference to keep your posts concise and factual.",
      "sequence": 3,
      "turnId": "preview-turn-1",
      "intent": "informational",
      "linkedPostId": "batch-1:0",
      "pendingCandidateId": null,
      "addressed": true
    },
    "diffs": [
      {
        "postId": "batch-1:0",
        "before": {
          "id": "batch-1:0",
          "authorId": "alex",
          "version": 1,
          "title": "Noted: Local Voice Note Transcription for Mac",
          "summary": "A free Mac app for transcribing voice notes locally and offline using on-device Whisper.",
          "detail": "Noted transcribes voice notes locally on a Mac using on-device Whisper. It runs completely offline, is free to use, and is available at https://noted.example.",
          "published": true
        },
        "after": {
          "id": "batch-1:0",
          "authorId": "alex",
          "version": 2,
          "title": "Noted: Local Voice Note Transcription for Mac",
          "summary": "A free Mac app for transcribing voice notes locally and offline using on-device Whisper, with support for Mandarin.",
          "detail": "Noted transcribes voice notes locally on a Mac using on-device Whisper and supports Mandarin transcription. It runs completely offline, is free to use, and is available at https://noted.example.",
          "published": true
        }
      }
    ],
    "memoryOperations": [],
    "finalMemories": [
      {
        "id": "style",
        "text": "Keep my posts short and factual. No hype.",
        "userId": "alex",
        "version": 1
      }
    ],
    "addressing": [
      {
        "outcome": "answered",
        "reason": "The user directly confirmed that Noted supports Mandarin.",
        "requestMessageId": "preview-extracted-question-1"
      }
    ],
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
    ]
  }
} as const
