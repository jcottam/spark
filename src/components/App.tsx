import React, { useState, useCallback, useMemo } from "react";
import { Box, Text, useInput, useApp } from "ink";
import MessageList from "./MessageList";
import InputBox from "./InputBox";
import Header from "./Header";
import { chat } from "../lib/anthropic";
import { appendMessage } from "../lib/session";
import { extractAndSaveMemories, readMemoryFile } from "../lib/memory";
import type { Message } from "../types";

interface SlashCommand {
  name: string;
  description: string;
  handler: () => string;
}

const HELP_TEXT = `Available commands:
  /help         Show this help message
  /memories     Display saved facts and memories
  /preferences  Display user preferences
  /profile      Display user profile

Press Ctrl+C or Escape to quit.`;

const SLASH_COMMAND_LIST: SlashCommand[] = [
  // { name: "/help",        description: "Show available commands",       handler: () => HELP_TEXT },
  {
    name: "/memories",
    description: "Display saved facts",
    handler: () => readMemoryFile("MEMORY.md"),
  },
  {
    name: "/preferences",
    description: "Display user preferences",
    handler: () => readMemoryFile("PREFERENCES.md"),
  },
  {
    name: "/profile",
    description: "Display user profile",
    handler: () => readMemoryFile("USER.md"),
  },
  {
    name: "/cancel",
    description: "Dismiss this menu",
    handler: () => "",
  },
];

const SLASH_COMMANDS: Record<string, () => string> = Object.fromEntries(
  SLASH_COMMAND_LIST.map((c) => [c.name, c.handler]),
);

interface Props {
  systemPrompt: string;
  initialMessages: Message[];
}

export default function App({ systemPrompt, initialMessages }: Props) {
  const { exit } = useApp();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMemories, setSavedMemories] = useState<string[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);

  const suggestions = useMemo(() => {
    if (!input.startsWith("/")) return [];
    const lower = input.toLowerCase();
    return SLASH_COMMAND_LIST.filter((c) => c.name.startsWith(lower));
  }, [input]);

  const handleChange = useCallback((value: string) => {
    setInput(value);
    setSelectedSuggestion(0);
  }, []);

  useInput((ch, key) => {
    if (key.escape || (key.ctrl && ch.toLowerCase() === "c")) {
      exit();
      return;
    }

    if (suggestions.length === 0) return;

    if (key.upArrow) {
      setSelectedSuggestion((prev) =>
        prev === 0 ? suggestions.length - 1 : prev - 1,
      );
    } else if (key.downArrow) {
      setSelectedSuggestion((prev) =>
        prev === suggestions.length - 1 ? 0 : prev + 1,
      );
    } else if (key.tab) {
      setInput(suggestions[selectedSuggestion]?.name ?? input);
      setSelectedSuggestion(0);
    }
  });

  const handleSubmit = useCallback(
    async (value: string) => {
      const raw = value.trim();
      if (!raw || isLoading) return;

      // Any input beginning with "/" is treated exclusively as a slash command.
      // Resolve to the highlighted suggestion when the typed text isn't an exact
      // match, then hard-stop — never fall through to the LLM.
      if (raw.startsWith("/")) {
        const resolved =
          SLASH_COMMANDS[raw.toLowerCase()]
            ? raw
            : (suggestions[selectedSuggestion]?.name ?? raw);

        if (resolved.toLowerCase() === "/cancel") {
          setInput("");
          return;
        }

        setInput("");

        const slashHandler = SLASH_COMMANDS[resolved.toLowerCase()];
        const userMsg: Message = {
          role: "user",
          content: resolved,
          timestamp: new Date().toISOString(),
        };
        const responseText = slashHandler
          ? slashHandler()
          : `Unknown command: ${resolved}`;
        const cmdResponse: Message = {
          role: "assistant",
          content: responseText,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, userMsg, cmdResponse]);
        return;
      }

      const userMsg: Message = {
        role: "user",
        content: raw,
        timestamp: new Date().toISOString(),
      };
      const nextMessages = [...messages, userMsg];
      setInput("");
      setMessages(nextMessages);
      setIsLoading(true);
      setError(null);
      appendMessage(userMsg);

      try {
        const responseText = await chat(systemPrompt, nextMessages);
        const assistantMsg: Message = {
          role: "assistant",
          content: responseText,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
        appendMessage(assistantMsg);

        const memories = extractAndSaveMemories(responseText);
        if (memories.length > 0) setSavedMemories(memories);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [messages, isLoading, systemPrompt, suggestions, selectedSuggestion],
  );

  return (
    <Box flexDirection="column" padding={1}>
      <Header />

      <Box flexDirection="column" flexGrow={1} marginBottom={1}>
        <MessageList messages={messages} />
      </Box>

      {savedMemories.length > 0 && (
        <Box marginBottom={1} flexDirection="column">
          {savedMemories.map((m, i) => (
            <Text key={i} color="yellow">
              ✦ Memory saved: {m}
            </Text>
          ))}
        </Box>
      )}

      {error && (
        <Box marginBottom={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      {suggestions.length > 0 && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="cyan"
          paddingX={1}
          marginBottom={0}
        >
          {suggestions.map((cmd, i) => {
            const isSelected = i === selectedSuggestion;
            const isCancel = cmd.name === "/cancel";
            return (
              <Box key={cmd.name} gap={1}>
                <Text bold={isSelected} color={isSelected ? (isCancel ? "red" : "cyan") : undefined}>
                  {isSelected ? "›" : " "}
                </Text>
                <Text bold={isSelected} color={isSelected ? (isCancel ? "red" : "cyan") : undefined} dimColor={!isSelected && isCancel}>
                  {cmd.name}
                </Text>
                <Text dimColor>{cmd.description}</Text>
              </Box>
            );
          })}
          <Box marginTop={1}>
            <Text dimColor>↑↓ navigate • Tab complete • Enter run</Text>
          </Box>
        </Box>
      )}

      <InputBox
        value={input}
        isLoading={isLoading}
        onChange={handleChange}
        onSubmit={handleSubmit}
      />
    </Box>
  );
}
