import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryMemory } from "./short-term.js";

describe("InMemoryMemory", () => {
  let memory: InMemoryMemory;

  beforeEach(() => {
    memory = new InMemoryMemory();
  });

  it("should add a message", () => {
    const msg = memory.addMessage({ role: "user", content: "Hello" });
    expect(msg.id).toBeDefined();
    expect(msg.role).toBe("user");
    expect(msg.content).toBe("Hello");
    expect(msg.timestamp).toBeGreaterThan(0);
  });

  it("should add multiple messages", () => {
    const msgs = memory.addMessages([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
    ]);
    expect(msgs).toHaveLength(2);
    expect(memory.size()).toBe(2);
  });

  it("should get all messages", () => {
    memory.addMessage({ role: "user", content: "Hello" });
    memory.addMessage({ role: "assistant", content: "Hi" });
    const messages = memory.getMessages();
    expect(messages).toHaveLength(2);
  });

  it("should get chat messages without metadata", () => {
    memory.addMessage({ role: "user", content: "Hello" });
    const chatMessages = memory.getChatMessages();
    expect(chatMessages).toHaveLength(1);
    expect(chatMessages[0]).not.toHaveProperty("id");
    expect(chatMessages[0]).not.toHaveProperty("timestamp");
  });

  it("should get message by id", () => {
    const msg = memory.addMessage({ role: "user", content: "Hello" });
    const found = memory.getMessage(msg.id);
    expect(found).toBeDefined();
    expect(found!.content).toBe("Hello");
  });

  it("should return undefined for non-existent message id", () => {
    const found = memory.getMessage("non_existent");
    expect(found).toBeUndefined();
  });

  it("should get last message", () => {
    memory.addMessage({ role: "user", content: "First" });
    memory.addMessage({ role: "assistant", content: "Second" });
    const last = memory.getLastMessage();
    expect(last!.content).toBe("Second");
  });

  it("should return undefined for last message when empty", () => {
    expect(memory.getLastMessage()).toBeUndefined();
  });

  it("should get messages since timestamp", () => {
    const msg1 = memory.addMessage({ role: "user", content: "First" });
    memory.addMessage({ role: "user", content: "Second" });
    const since = memory.getMessagesSince(msg1.timestamp);
    expect(since).toHaveLength(2);
  });

  it("should get messages range", () => {
    memory.addMessage({ role: "user", content: "A" });
    memory.addMessage({ role: "assistant", content: "B" });
    memory.addMessage({ role: "user", content: "C" });
    const range = memory.getMessagesRange(1, 3);
    expect(range).toHaveLength(2);
    expect(range[0]!.content).toBe("B");
    expect(range[1]!.content).toBe("C");
  });

  it("should remove a message", () => {
    const msg = memory.addMessage({ role: "user", content: "Hello" });
    expect(memory.size()).toBe(1);
    const removed = memory.removeMessage(msg.id);
    expect(removed).toBe(true);
    expect(memory.size()).toBe(0);
  });

  it("should return false when removing non-existent message", () => {
    const removed = memory.removeMessage("non_existent");
    expect(removed).toBe(false);
  });

  it("should update a message", () => {
    const msg = memory.addMessage({ role: "user", content: "Hello" });
    const updated = memory.updateMessage(msg.id, { content: "Updated" });
    expect(updated!.content).toBe("Updated");
  });

  it("should clear all messages", () => {
    memory.addMessage({ role: "user", content: "Hello" });
    memory.addMessage({ role: "assistant", content: "Hi" });
    memory.clear();
    expect(memory.size()).toBe(0);
  });

  it("should estimate tokens", () => {
    memory.addMessage({ role: "user", content: "Hello world" });
    const tokens = memory.estimateTokens();
    expect(tokens).toBeGreaterThan(0);
  });

  it("should get context window usage", () => {
    memory.addMessage({ role: "user", content: "Hello" });
    const usage = memory.getContextWindowUsage();
    expect(usage).toBeGreaterThanOrEqual(0);
    expect(usage).toBeLessThan(1);
  });

  it("should check if near limit", () => {
    const smallMemory = new InMemoryMemory({ maxTokens: 10 });
    smallMemory.addMessage({ role: "user", content: "Hello world this is a test message with enough content to exceed" });
    expect(smallMemory.isNearLimit(0.5)).toBe(true);
  });

  it("should get messages for context within token limit", () => {
    for (let i = 0; i < 10; i++) {
      memory.addMessage({ role: "user", content: `Message ${i}` });
    }
    const context = memory.getMessagesForContext(20);
    expect(context.length).toBeLessThan(10);
  });

  it("should get summary", () => {
    memory.addMessage({ role: "user", content: "Hello" });
    const summary = memory.getSummary();
    expect(summary.messageCount).toBe(1);
    expect(summary.estimatedTokens).toBeGreaterThan(0);
    expect(summary.oldestTimestamp).toBeDefined();
    expect(summary.newestTimestamp).toBeDefined();
  });

  it("should enforce max messages limit", () => {
    const limited = new InMemoryMemory({ maxMessages: 3 });
    for (let i = 0; i < 5; i++) {
      limited.addMessage({ role: "user", content: `Message ${i}` });
    }
    expect(limited.size()).toBe(3);
  });

  it("should handle tool calls in messages", () => {
    memory.addMessage({
      role: "assistant",
      content: "",
      tool_calls: [{
        id: "tc_1",
        type: "function",
        function: { name: "exec", arguments: '{"command":"ls"}' },
      }],
    });
    const chatMessages = memory.getChatMessages();
    expect(chatMessages[0]!.tool_calls).toBeDefined();
    expect(chatMessages[0]!.tool_calls).toHaveLength(1);
  });
});
