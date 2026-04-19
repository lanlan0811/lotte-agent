import { BaseChannel } from "../base.js";
import type {
  ChannelMessage,
  ChannelResponse,
  ChannelType,
  ProcessHandler,
  OnReplySent,
} from "../types.js";
import { MessageRenderer } from "../renderer.js";
import { logger } from "../../utils/logger.js";

export class ConsoleChannel extends BaseChannel {
  readonly channelType: ChannelType = "console";
  readonly channelName = "Console";

  private renderer: MessageRenderer;
  private readline: typeof import("readline") | null = null;
  private rl: import("readline").Interface | null = null;

  constructor(process: ProcessHandler, onReplySent: OnReplySent = null) {
    super(process, onReplySent);
    this.renderer = new MessageRenderer({
      supportsMarkdown: false,
      supportsCodeFence: true,
      useEmoji: false,
    });
  }

  async start(): Promise<void> {
    this._status = "starting";
    try {
      this.readline = await import("readline");
      this.rl = this.readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: "lotte> ",
      });

      this.rl.on("line", async (line: string) => {
        const text = line.trim();
        if (!text) return;

        const message: ChannelMessage = this.buildMessage({
          senderId: "console-user",
          content: [{ type: "text", text }],
        });

        if (this._enqueue) {
          this._enqueue(message);
        } else {
          await this.consumeOne(message);
        }
      });

      this.rl.on("close", () => {
        this._status = "stopped";
        logger.info("Console channel closed");
      });

      this.rl.prompt();
      this._status = "running";
      this._connectedAt = Date.now();
      logger.info("Console channel started");
    } catch (error) {
      this._status = "error";
      this._error = error instanceof Error ? error.message : String(error);
      logger.error(`Console channel start failed: ${this._error}`);
    }
  }

  async stop(): Promise<void> {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    this._status = "stopped";
    logger.info("Console channel stopped");
  }

  async sendResponse(response: ChannelResponse, _meta?: Record<string, unknown>): Promise<void> {
    const text = this.renderer.renderContent(response.content);
    if (text) {
      console.log(`\n${text}\n`);
    }
    if (this.rl) {
      this.rl.prompt();
    }
  }

  async sendText(_toHandle: string, text: string, _meta?: Record<string, unknown>): Promise<void> {
    console.log(`\n${text}\n`);
    if (this.rl) {
      this.rl.prompt();
    }
  }
}
