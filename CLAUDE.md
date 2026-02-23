# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun run src/index.tsx   # Start the CLI app
bun test                # Run all tests
bun test src/lib/__tests__/tools.test.ts  # Run a single test file
```

## Architecture

Spark is a terminal-based stateful AI chat CLI built with React + Ink (TUI), Anthropic Claude, and SQLite. It is a local-first learning lab for understanding agentic system patterns.

**Entry point:** `src/index.tsx` (shebang: `#!/usr/bin/env bun`)

### Core layers

| Layer | Files | Purpose |
|-------|-------|---------|
| TUI | `src/components/` | React + Ink terminal rendering |
| LLM | `src/lib/anthropic.ts` | Anthropic API, agentic tool-use loop |
| Storage | `src/lib/db.ts` | SQLite via `bun:sqlite`, JSONL append log |
| Memory | `src/lib/memory.ts` | `[MEMORY]` tag extraction and persistence |
| Context | `src/lib/context.ts` | System prompt assembly |
| Tools | `src/lib/tools.ts` | read_file, write_file, run_command, read_skill |
| Vector | `src/lib/vector.ts` | Optional Upstash Vector semantic search |

### Data flow

1. `App.tsx` dispatches slash commands or calls `chatWithTools()` in `anthropic.ts`
2. `chatWithTools()` runs an agentic loop (max 10 rounds) feeding tool results back to Claude
3. Assistant responses are scanned for `[MEMORY]` tags by `memory.ts` and persisted
4. `buildSystemPrompt()` in `context.ts` assembles: `SYSTEM.md` + `USER.md` + skills + memories + recent session summaries

### Session lifecycle

- Sessions created via `initSession()` with IDs like `session_YYYYMMDD_NNN`
- Messages stored in SQLite `messages` table with append-only JSONL mirror in `workspace/sessions/`
- Empty sessions auto-cleaned on exit via `cleanupEmptySessions()`

### SQLite schema

- `sessions` — id, title, summary, created_at, updated_at, tags (JSON)
- `messages` — id, session_id (FK), role, content, timestamp, token_count
- `memories` — id, fact, category, source_session (FK), created_at, superseded_by
- FTS5 virtual tables: `messages_fts`, `memories_fts` with auto-sync triggers

### Memory extraction

Two `[MEMORY]` formats are supported in assistant responses:
```
[MEMORY] Single fact here
[MEMORY] Updated facts:
- fact one
- fact two
```
Facts are deduplicated before insert and synced to `workspace/context/MEMORY.md`.

### Workspace layout

```
workspace/
├── context/
│   ├── SYSTEM.md     # Base system instructions (editable)
│   ├── USER.md       # User profile
│   ├── MEMORY.md     # Auto-synced active memories
│   └── AGENTS.md     # Multi-agent context
├── sessions/         # Append-only JSONL session files
├── bin/              # Scripts accessible via run_command tool
├── skills/           # Installed skills (each has SKILL.md)
└── spark.db          # SQLite database (created on first run)
```

## Configuration

Config is loaded from `~/.config/spark/.env` (not from the project root `.env`):

```
ANTHROPIC_API_KEY=sk-ant-...          # Required
UPSTASH_VECTOR_REST_URL=https://...   # Optional — enables semantic search
UPSTASH_VECTOR_REST_TOKEN=...         # Optional
```

Model is hardcoded to `claude-sonnet-4-6` in `src/lib/anthropic.ts`.

## Testing

Tests use Bun's native test runner with in-memory SQLite isolation via `_resetForTesting()`. No external test infrastructure is needed.

Tool execution limits: 30s timeout, file reads truncated at 50KB, command output at 20KB.
