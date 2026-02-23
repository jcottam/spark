#!/usr/bin/env bun
import { Hono } from "hono";
import { streamText, tool, createGateway } from "ai";
import { z } from "zod";
import { loadConfig } from "../lib/config";
import { executeTool } from "../lib/tools";

// Load API keys from ~/.config/spark/.env
loadConfig();

const gateway = createGateway({
  apiKey: process.env.AI_GATEWAY_API_KEY ?? "",
});

const app = new Hono();

// AI SDK tool definitions
const tools = {
  read_file: tool({
    description:
      "Read the contents of a file at the given path. Returns the file content as a string.",
    parameters: z.object({
      path: z.string().describe("Absolute or relative file path to read"),
    }),
    execute: async ({ path }) => executeTool("read_file", { path }),
  }),
  write_file: tool({
    description:
      "Write content to a file at the given path. Creates parent directories if needed.",
    parameters: z.object({
      path: z.string().describe("File path to write to"),
      content: z.string().describe("Content to write"),
    }),
    execute: async ({ path, content }) =>
      executeTool("write_file", { path, content }),
  }),
  run_command: tool({
    description:
      "Run a script from workspace/bin/. Times out after 30 seconds.",
    parameters: z.object({
      command: z.string().describe("Script name and arguments"),
    }),
    execute: async ({ command }) => executeTool("run_command", { command }),
  }),
};

const DEFAULT_MODEL = "anthropic/claude-sonnet-4-20250514";

app.post("/api/chat", async (c) => {
  const { messages, model = DEFAULT_MODEL } = await c.req.json();

  const result = streamText({
    model: gateway(model),
    messages,
    tools,
    maxSteps: 10,
  });

  return c.body(result.toDataStream(), {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});

const port = 3737;
console.log(`🔥 Spark server running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
