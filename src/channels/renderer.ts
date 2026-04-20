import type { MessageContent, ImageContent, VideoContent, AudioContent, FileContent } from "./types.js";

export interface RenderStyle {
  showToolDetails: boolean;
  supportsMarkdown: boolean;
  supportsCodeFence: boolean;
  useEmoji: boolean;
  filterToolMessages: boolean;
  filterThinking: boolean;
}

const DEFAULT_STYLE: RenderStyle = {
  showToolDetails: true,
  supportsMarkdown: true,
  supportsCodeFence: true,
  useEmoji: true,
  filterToolMessages: false,
  filterThinking: false,
};

export class MessageRenderer {
  style: RenderStyle;

  constructor(style?: Partial<RenderStyle>) {
    this.style = { ...DEFAULT_STYLE, ...style };
  }

  renderContent(content: MessageContent[]): string {
    const parts: string[] = [];
    for (const c of content) {
      switch (c.type) {
        case "text":
          parts.push(c.text);
          break;
        case "image":
          parts.push(this.renderImage(c));
          break;
        case "video":
          parts.push(this.renderVideo(c));
          break;
        case "audio":
          parts.push(this.renderAudio(c));
          break;
        case "file":
          parts.push(this.renderFile(c));
          break;
      }
    }
    return parts.join("\n");
  }

  renderImage(content: ImageContent): string {
    if (this.style.supportsMarkdown) {
      return `![Image](${content.url})`;
    }
    return `[Image: ${content.url}]`;
  }

  renderVideo(content: VideoContent): string {
    return `[Video: ${content.url}]`;
  }

  renderAudio(content: AudioContent): string {
    return `[Audio${content.duration ? ` (${content.duration}s)` : ""}]`;
  }

  renderFile(content: FileContent): string {
    return `[File: ${content.filename ?? content.url ?? "unknown"}]`;
  }

  renderToolCall(name: string, argsPreview: string): string {
    const s = this.style;
    if (s.supportsMarkdown && s.useEmoji) {
      return `🔧 **${name}**\n\`\`\`\n${argsPreview}\n\`\`\``;
    }
    if (s.supportsMarkdown) {
      return `**${name}**\n\`\`\`\n${argsPreview}\n\`\`\``;
    }
    return `${name}: ${argsPreview}`;
  }

  renderToolOutput(name: string, output: string): string {
    const s = this.style;
    const prefix = s.useEmoji ? `✅ **${name}**:` : `**${name}**:`;
    if (s.supportsCodeFence) {
      const preview = output.length > 500 ? output.slice(0, 500) + "..." : output;
      return `${prefix}\n\`\`\`\n${preview}\n\`\`\``;
    }
    return `${prefix} ${output.slice(0, 200)}`;
  }
}
