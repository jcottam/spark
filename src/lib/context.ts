import { join } from "path";
import { readdirSync, readFileSync, existsSync } from "fs";
import type { Session } from "../types";

const STORE_ROOT = join(import.meta.dir, "../../workspace/");

function readFile(filePath: string): string {
  if (!existsSync(filePath)) return "";
  return readFileSync(filePath, "utf-8").trim();
}

function parseJsonl(filePath: string): Session | null {
  try {
    const raw = readFileSync(filePath, "utf-8");
    let meta: Omit<Session, "messages"> | null = null;
    const messages: Session["messages"] = [];

    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      const obj = JSON.parse(line);
      if (obj.type === "meta") {
        meta = { id: obj.id, created_at: obj.created_at, updated_at: obj.updated_at, title: obj.title, tags: obj.tags };
      } else if (obj.type === "message") {
        messages.push({ role: obj.role, content: obj.content, timestamp: obj.timestamp });
      }
    }

    return meta ? { ...meta, messages } : null;
  } catch {
    return null;
  }
}

function getRecentSessions(n: number): Session[] {
  const sessionsDir = join(STORE_ROOT, "sessions");
  if (!existsSync(sessionsDir)) return [];

  const files = readdirSync(sessionsDir)
    .filter((f) => f.endsWith(".jsonl"))
    .sort()
    .reverse()
    .slice(0, n);

  return files.flatMap((file) => {
    const session = parseJsonl(join(sessionsDir, file));
    return session ? [session] : [];
  });
}

function summarizeSession(session: Session): string {
  const lines = [`## Past session: "${session.title}"`];
  for (const msg of session.messages) {
    const role = msg.role === "user" ? "User" : "Assistant";
    const excerpt = msg.content.slice(0, 200) + (msg.content.length > 200 ? "…" : "");
    lines.push(`${role}: ${excerpt}`);
  }
  return lines.join("\n");
}

export function buildSystemPrompt(nRecentSessions = 3): string {
  const parts: string[] = [];

  const systemPrompt = readFile(join(STORE_ROOT, "context/system_prompt.md"));
  if (systemPrompt) parts.push(systemPrompt);

  const memoriesDir = join(STORE_ROOT, "memories");
  if (existsSync(memoriesDir)) {
    const memFiles = readdirSync(memoriesDir)
      .filter((f) => f.endsWith(".md"))
      .sort();
    for (const file of memFiles) {
      const content = readFile(join(memoriesDir, file));
      if (content) parts.push(content);
    }
  }

  const sessions = getRecentSessions(nRecentSessions);
  for (const session of sessions) {
    parts.push(summarizeSession(session));
  }

  return parts.join("\n\n---\n\n");
}
