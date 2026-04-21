import { describe, it, expect, beforeEach, vi } from "vitest";
import { BaseChannel } from "../channels/base.js";
import { ChannelManager } from "../channels/manager.js";
import { UnifiedQueueManager } from "../channels/queue.js";
import type {
  ChannelMessage,
  ChannelResponse,
  ChannelType,
  ProcessHandler,
  OnReplySent,
  QueueKey,
} from "../channels/types.js";

class MockChannel extends BaseChannel {
  readonly channelType: ChannelType = "mock";
  readonly channelName = "Mock Channel";
  sentTexts: Array<{ toHandle: string; text: string }> = [];
  sentResponses: Array<{ response: ChannelResponse; meta?: Record<string, unknown> }> = [];

  constructor(process: ProcessHandler, onReplySent: OnReplySent = null) {
    super(process, onReplySent);
  }

  async start(): Promise<void> {
    this._status = "running";
    this._connectedAt = Date.now();
  }

  async stop(): Promise<void> {
    this._status = "stopped";
  }

  async sendResponse(response: ChannelResponse, meta?: Record<string, unknown>): Promise<void> {
    this.sentResponses.push({ response, meta });
  }

  async sendText(toHandle: string, text: string, _meta?: Record<string, unknown>): Promise<void> {
    this.sentTexts.push({ toHandle, text });
  }
}

function createTestMessage(overrides: Partial<ChannelMessage> = {}): ChannelMessage {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    channelType: "mock",
    senderId: "test-user",
    sessionId: "mock:test-user",
    content: [{ type: "text", text: "Hello" }],
    meta: {},
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("BaseChannel", () => {
  let channel: MockChannel;
  let processFn: ProcessHandler;

  beforeEach(() => {
    processFn = vi.fn(async (msg: ChannelMessage): Promise<ChannelResponse | null> => {
      return {
        toHandle: msg.sessionId,
        content: [{ type: "text", text: `Echo: ${msg.content[0] && "text" in msg.content[0] ? msg.content[0].text : ""}` }],
      };
    });
    channel = new MockChannel(processFn);
  });

  it("should have correct channel type and name", () => {
    expect(channel.channelType).toBe("mock");
    expect(channel.channelName).toBe("Mock Channel");
  });

  it("should start and stop correctly", async () => {
    expect(channel.status).toBe("stopped");
    await channel.start();
    expect(channel.status).toBe("running");
    await channel.stop();
    expect(channel.status).toBe("stopped");
  });

  it("should return channel info", async () => {
    await channel.start();
    const info = channel.getInfo();
    expect(info.type).toBe("mock");
    expect(info.name).toBe("Mock Channel");
    expect(info.status).toBe("running");
    expect(info.enabled).toBe(true);
    expect(info.connectedAt).toBeDefined();
  });

  it("should resolve session ID for DM", () => {
    const sessionId = channel.resolveSessionId("user-123");
    expect(sessionId).toBe("mock:user-123");
  });

  it("should allow all users with open DM policy", () => {
    channel.dmPolicy = "open";
    const result = channel.checkAllowlist("any-user", false);
    expect(result.allowed).toBe(true);
  });

  it("should allow whitelisted users with allowlist policy", () => {
    channel.dmPolicy = "allowlist";
    channel.allowFrom = new Set(["allowed-user"]);
    expect(channel.checkAllowlist("allowed-user", false).allowed).toBe(true);
    expect(channel.checkAllowlist("blocked-user", false).allowed).toBe(false);
  });

  it("should respect allowlist with denylist policy", () => {
    channel.dmPolicy = "denylist";
    channel.allowFrom = new Set(["special-user"]);
    expect(channel.checkAllowlist("special-user", false).allowed).toBe(true);
    expect(channel.checkAllowlist("other-user", false).allowed).toBe(false);
  });

  it("should process a message and send response", async () => {
    await channel.start();
    const msg = createTestMessage();
    await channel.consumeOne(msg);
    expect(processFn).toHaveBeenCalledWith(msg);
    expect(channel.sentResponses).toHaveLength(1);
    expect(channel.sentResponses[0]!.response.content[0]).toEqual(
      expect.objectContaining({ type: "text", text: "Echo: Hello" }),
    );
  });

  it("should increment message count after processing", async () => {
    await channel.start();
    const msg = createTestMessage();
    await channel.consumeOne(msg);
    expect(channel.getInfo().messageCount).toBe(1);
  });

  it("should strip bot prefix from message text", async () => {
    channel.botPrefix = "/lotte";
    await channel.start();
    const msg = createTestMessage({
      content: [{ type: "text", text: "/lotte hello world" }],
    });
    await channel.consumeOne(msg);
    expect(processFn).toHaveBeenCalledWith(
      expect.objectContaining({
        content: [expect.objectContaining({ type: "text", text: "hello world" })],
      }),
    );
  });

  it("should not strip prefix if text does not start with it", async () => {
    channel.botPrefix = "/lotte";
    await channel.start();
    const msg = createTestMessage({
      content: [{ type: "text", text: "hello /lotte world" }],
    });
    await channel.consumeOne(msg);
    expect(processFn).toHaveBeenCalledWith(
      expect.objectContaining({
        content: [expect.objectContaining({ type: "text", text: "hello /lotte world" })],
      }),
    );
  });

  it("should handle process error gracefully", async () => {
    const errorProcess = vi.fn(async () => {
      throw new Error("Process failed");
    });
    const errorChannel = new MockChannel(errorProcess);
    await errorChannel.start();
    const msg = createTestMessage();
    await errorChannel.consumeOne(msg);
    expect(errorChannel.sentTexts).toHaveLength(1);
    expect(errorChannel.sentTexts[0]!.text).toContain("internal error");
  });

  it("should handle null process response", async () => {
    const nullProcess = vi.fn(async () => null);
    const nullChannel = new MockChannel(nullProcess);
    await nullChannel.start();
    const msg = createTestMessage();
    await nullChannel.consumeOne(msg);
    expect(nullChannel.sentResponses).toHaveLength(0);
  });

  it("should call onReplySent callback after processing", async () => {
    const onReplySent = vi.fn();
    const replyChannel = new MockChannel(processFn, onReplySent);
    await replyChannel.start();
    const msg = createTestMessage();
    await replyChannel.consumeOne(msg);
    expect(onReplySent).toHaveBeenCalledWith("mock", "test-user", "mock:test-user");
  });

  it("should build message with correct fields", () => {
    const msg = channel["buildMessage"]({
      senderId: "user-1",
      content: [{ type: "text", text: "test" }],
    });
    expect(msg.channelType).toBe("mock");
    expect(msg.senderId).toBe("user-1");
    expect(msg.sessionId).toBe("mock:user-1");
    expect(msg.content).toEqual([{ type: "text", text: "test" }]);
    expect(msg.id).toBeDefined();
    expect(msg.timestamp).toBeDefined();
  });

  it("should split long text correctly", () => {
    const longText = "a".repeat(5000);
    const chunks = channel["splitText"](longText, 2000);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(2000);
    }
    expect(chunks.join("")).toContain("a");
  });

  it("should not split short text", () => {
    const shortText = "hello world";
    const chunks = channel["splitText"](shortText, 2000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe("hello world");
  });
});

describe("ChannelManager", () => {
  let manager: ChannelManager;
  let processFn: ProcessHandler;

  beforeEach(() => {
    processFn = vi.fn(async () => null);
    manager = new ChannelManager(processFn);
  });

  it("should register and retrieve channels", () => {
    const channel = new MockChannel(processFn);
    manager.register(channel);
    expect(manager.getChannel("mock")).toBe(channel);
  });

  it("should list all registered channels", () => {
    const channel = new MockChannel(processFn);
    manager.register(channel);
    const channels = manager.getAllChannels();
    expect(channels).toHaveLength(1);
    expect(channels[0]!.channelType).toBe("mock");
  });

  it("should return channel infos", () => {
    const channel = new MockChannel(processFn);
    manager.register(channel);
    const infos = manager.getChannelInfos();
    expect(infos).toHaveLength(1);
    expect(infos[0]!.type).toBe("mock");
  });

  it("should unregister a channel", () => {
    const channel = new MockChannel(processFn);
    manager.register(channel);
    manager.unregister("mock");
    expect(manager.getChannel("mock")).toBeUndefined();
  });

  it("should return undefined for non-existent channel", () => {
    expect(manager.getChannel("non-existent")).toBeUndefined();
  });
});

describe("UnifiedQueueManager", () => {
  let queueManager: UnifiedQueueManager;
  let processedItems: Array<{ key: string; item: unknown }>;

  beforeEach(() => {
    processedItems = [];
    queueManager = new UnifiedQueueManager({
      consumerFn: async (queue, channelId, sessionId, priority) => {
        for await (const item of queue) {
          processedItems.push({ key: `${channelId}::${sessionId}::${priority}`, item });
        }
      },
      queueMaxsize: 10,
      idleTimeout: 5000,
      cleanupInterval: 1000,
    });
  });

  it("should enqueue and process items", async () => {
    queueManager.startCleanupLoop();
    const key: QueueKey = { channelId: "test", sessionId: "session-1", priority: 20 };
    await queueManager.enqueue(key, { text: "hello" });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(processedItems.length).toBeGreaterThanOrEqual(1);
    expect(processedItems[0]!.item).toEqual({ text: "hello" });
    await queueManager.stopAll();
  });

  it("should handle multiple queue keys independently", async () => {
    queueManager.startCleanupLoop();
    const key1: QueueKey = { channelId: "ch1", sessionId: "s1", priority: 20 };
    const key2: QueueKey = { channelId: "ch2", sessionId: "s2", priority: 20 };
    await queueManager.enqueue(key1, { text: "msg1" });
    await queueManager.enqueue(key2, { text: "msg2" });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(processedItems.length).toBeGreaterThanOrEqual(2);
    await queueManager.stopAll();
  });

  it("should drop oldest when queue is full", async () => {
    const smallQueue = new UnifiedQueueManager({
      consumerFn: async () => {},
      queueMaxsize: 2,
      idleTimeout: 60000,
      cleanupInterval: 60000,
    });
    smallQueue.startCleanupLoop();
    const key: QueueKey = { channelId: "test", sessionId: "s1", priority: 20 };
    await smallQueue.enqueue(key, { text: "msg1" });
    await smallQueue.enqueue(key, { text: "msg2" });
    await smallQueue.enqueue(key, { text: "msg3" });
    await smallQueue.stopAll();
  });
});
