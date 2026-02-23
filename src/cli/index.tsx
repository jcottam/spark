#!/usr/bin/env bun
import React, { useState, useEffect } from "react";
import { render, Box, Text } from "ink";
import TextInput from "ink-text-input";

const SERVER_URL = "http://localhost:3737";

type Message = {
  role: "user" | "assistant" | "system";
  content: string;
};

function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentResponse, setCurrentResponse] = useState("");

  const sendMessage = async (userMessage: string) => {
    if (!userMessage.trim() || isStreaming) return;

    const newMessages: Message[] = [...messages, { role: "user", content: userMessage }];
    setMessages(newMessages);
    setInput("");
    setIsStreaming(true);
    setCurrentResponse("");

    try {
      const response = await fetch(`${SERVER_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.trim() || !line.startsWith("0:")) continue;

          try {
            // AI SDK data stream format: "0:{json}\n"
            const json = line.slice(2);
            const parsed = JSON.parse(json);

            if (parsed.type === "text-delta") {
              accumulated += parsed.textDelta;
              setCurrentResponse(accumulated);
            }
          } catch (e) {
            // Skip malformed lines
          }
        }
      }

      setMessages([...newMessages, { role: "assistant", content: accumulated }]);
      setCurrentResponse("");
    } catch (error) {
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ]);
    } finally {
      setIsStreaming(false);
    }
  };

  const handleSubmit = () => {
    sendMessage(input);
  };

  return (
    <Box flexDirection="column" padding={1}>
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="cyan">
          🔥 Spark Hono Client
        </Text>
        <Text dimColor>Connected to {SERVER_URL}</Text>
        <Text dimColor>─────────────────────────</Text>
      </Box>

      <Box flexDirection="column" marginBottom={1}>
        {messages.map((msg, i) => (
          <Box key={i} flexDirection="column" marginBottom={1}>
            <Text bold color={msg.role === "user" ? "green" : "blue"}>
              {msg.role === "user" ? "You" : "Assistant"}:
            </Text>
            <Text>{msg.content}</Text>
          </Box>
        ))}
        {currentResponse && (
          <Box flexDirection="column" marginBottom={1}>
            <Text bold color="blue">
              Assistant:
            </Text>
            <Text>{currentResponse}</Text>
          </Box>
        )}
      </Box>

      <Box>
        <Text bold>{isStreaming ? "⏳ " : "> "}</Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          placeholder="Type a message..."
          isDisabled={isStreaming}
        />
      </Box>
    </Box>
  );
}

render(<Chat />);
