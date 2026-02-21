import { join } from "path";
import { readdirSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import type { Message, Session } from "../types";

const STORE_ROOT = join(import.meta.dir, "../../workspace/");
const SESSIONS_DIR = join(STORE_ROOT, "sessions");

function todayPrefix(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `session_${y}${m}${d}`;
}

function nextSessionId(): string {
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }
  const prefix = todayPrefix();
  const existing = readdirSync(SESSIONS_DIR)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".jsonl"));

  const next = String(existing.length + 1).padStart(3, "0");
  return `${prefix}_${next}`;
}

let currentSession: Session;
let sessionFile: string;

function metaLine() {
  const { id, created_at, updated_at, title, tags } = currentSession;
  return { type: "meta", id, created_at, updated_at, title, tags };
}

function writeLine(obj: object): void {
  if (!existsSync(SESSIONS_DIR)) mkdirSync(SESSIONS_DIR, { recursive: true });
  appendFileSync(sessionFile, JSON.stringify(obj) + "\n", "utf-8");
}

export function initSession(): Session {
  const id = nextSessionId();
  const now = new Date().toISOString();
  currentSession = {
    id,
    created_at: now,
    updated_at: now,
    title: "New session",
    tags: [],
    messages: [],
  };
  sessionFile = join(SESSIONS_DIR, `${id}.jsonl`);
  // Write initial meta line (creates the file)
  writeFileSync(sessionFile, JSON.stringify(metaLine()) + "\n", "utf-8");
  return currentSession;
}

export function appendMessage(msg: Message): void {
  const wasUntitled = currentSession.title === "New session";
  currentSession.messages.push(msg);
  currentSession.updated_at = new Date().toISOString();

  if (wasUntitled && msg.role === "user") {
    currentSession.title = msg.content.slice(0, 60);
    // Re-emit meta line so the latest title is always readable from the last meta entry
    writeLine(metaLine());
  }

  writeLine({ type: "message", ...msg });
}
