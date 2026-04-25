import fs from "node:fs";
import path from "node:path";
import type { STTConfig, STTResult } from "./types.js";
import { AI_TIMEOUT_MS } from "../ai/types.js";
import { logger } from "../utils/logger.js";

export class SpeechToText {
  private config: STTConfig;

  constructor(config: STTConfig) {
    this.config = config;
  }

  async transcribe(audioPath: string, options?: { language?: string }): Promise<STTResult> {
    if (!this.config.enabled) {
      throw new Error("Speech-to-text is not enabled");
    }

    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    const stat = fs.statSync(audioPath);
    if (stat.size > this.config.max_file_size) {
      throw new Error(
        `Audio file too large: ${stat.size} bytes (max: ${this.config.max_file_size})`,
      );
    }

    const ext = path.extname(audioPath).toLowerCase();
    if (!this.isSupportedFormat(ext)) {
      throw new Error(`Unsupported audio format: ${ext}`);
    }

    switch (this.config.provider) {
      case "openai":
        return this.transcribeWithOpenAI(audioPath, options);
      case "custom":
        return this.transcribeWithCustom(audioPath, options);
      default:
        throw new Error(`Unknown STT provider: ${this.config.provider}`);
    }
  }

  async transcribeBuffer(
    buffer: Buffer,
    filename: string,
    options?: { language?: string },
  ): Promise<STTResult> {
    if (!this.config.enabled) {
      throw new Error("Speech-to-text is not enabled");
    }

    if (buffer.length > this.config.max_file_size) {
      throw new Error(
        `Audio data too large: ${buffer.length} bytes (max: ${this.config.max_file_size})`,
      );
    }

    const tmpDir = path.join(process.cwd(), ".lotte", "tmp");
    fs.mkdirSync(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, `stt_${Date.now()}_${filename}`);

    try {
      fs.writeFileSync(tmpPath, buffer);
      return await this.transcribe(tmpPath, options);
    } finally {
      try {
        fs.unlinkSync(tmpPath);
      } catch (e) {
        logger.debug(`STT: Failed to delete temp file ${tmpPath}: ${e}`);
      }
    }
  }

  private async transcribeWithOpenAI(
    audioPath: string,
    options?: { language?: string },
  ): Promise<STTResult> {
    try {
      const OpenAI = (await import("openai")).default;
      const client = new OpenAI({
        apiKey: this.config.api_key || undefined,
        baseURL: this.config.api_url || undefined,
      });

      const audioStream = fs.createReadStream(audioPath);
      const language = options?.language ?? this.config.language;

      const transcription = await client.audio.transcriptions.create({
        model: this.config.model,
        file: audioStream,
        language: language !== "auto" ? language : undefined,
        response_format: "verbose_json",
        timestamp_granularities: ["segment"],
      });

      const result = transcription as unknown as Record<string, unknown>;

      return {
        text: (result.text as string) ?? "",
        language: (result.language as string) ?? language,
        duration: (result.duration as number) ?? 0,
        segments: Array.isArray(result.segments)
          ? (result.segments as Array<Record<string, unknown>>).map((seg) => ({
              start: (seg.start as number) ?? 0,
              end: (seg.end as number) ?? 0,
              text: (seg.text as string) ?? "",
            }))
          : undefined,
      };
    } catch (error) {
      logger.error(`OpenAI STT error: ${error}`);
      throw error;
    }
  }

  private async transcribeWithCustom(
    audioPath: string,
    options?: { language?: string },
  ): Promise<STTResult> {
    if (!this.config.api_url) {
      throw new Error("Custom STT API URL not configured");
    }

    try {
      const audioBuffer = fs.readFileSync(audioPath);
      const filename = path.basename(audioPath);

      const formData = new FormData();
      formData.append("file", new Blob([audioBuffer]), filename);
      formData.append("model", this.config.model);

      const language = options?.language ?? this.config.language;
      if (language && language !== "auto") {
        formData.append("language", language);
      }

      const response = await fetch(this.config.api_url, {
        method: "POST",
        headers: this.config.api_key
          ? { Authorization: `Bearer ${this.config.api_key}` }
          : {},
        body: formData,
        signal: AbortSignal.timeout(AI_TIMEOUT_MS.STT),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Custom STT API error: ${response.status} - ${body}`);
      }

      const data = (await response.json()) as Record<string, unknown>;

      return {
        text: (data.text as string) ?? "",
        language: (data.language as string) ?? language,
        duration: (data.duration as number) ?? 0,
        segments: Array.isArray(data.segments)
          ? (data.segments as Array<Record<string, unknown>>).map((seg) => ({
              start: (seg.start as number) ?? 0,
              end: (seg.end as number) ?? 0,
              text: (seg.text as string) ?? "",
            }))
          : undefined,
      };
    } catch (error) {
      logger.error(`Custom STT error: ${error}`);
      throw error;
    }
  }

  private isSupportedFormat(ext: string): boolean {
    const supported = new Set([
      ".mp3",
      ".mp4",
      ".mpeg",
      ".mpga",
      ".m4a",
      ".wav",
      ".webm",
      ".ogg",
      ".flac",
    ]);
    return supported.has(ext);
  }
}
