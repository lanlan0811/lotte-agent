import crypto from "node:crypto";

const DEFAULT_BASE_URL = "https://ilinkai.weixin.qq.com";
const CHANNEL_VERSION = "2.0.1";
const GETUPDATES_TIMEOUT = 45000;
const DEFAULT_TIMEOUT = 15000;

export interface ILinkClientOptions {
  botToken?: string;
  baseUrl?: string;
}

export class ILinkClient {
  botToken: string;
  baseUrl: string;
  private _abortController: AbortController | null = null;

  constructor(options: ILinkClientOptions = {}) {
    this.botToken = options.botToken ?? "";
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  }

  private makeHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "Lotte-WeixinBot/1.0",
    };
    if (this.botToken) {
      headers["Authorization"] = `Bearer ${this.botToken}`;
    }
    return headers;
  }

  private async request(
    method: "GET" | "POST",
    path: string,
    options?: { body?: Record<string, unknown>; params?: Record<string, string>; timeout?: number },
  ): Promise<Record<string, unknown>> {
    const url = new URL(`${this.baseUrl}/${path.replace(/^\/+/, "")}`);
    if (options?.params) {
      for (const [k, v] of Object.entries(options.params)) {
        url.searchParams.set(k, v);
      }
    }

    this._abortController = new AbortController();
    const timeoutId = setTimeout(
      () => this._abortController?.abort(),
      options?.timeout ?? DEFAULT_TIMEOUT,
    );

    try {
      const fetchOptions: RequestInit = {
        method,
        headers: this.makeHeaders(),
        signal: this._abortController.signal,
      };

      if (method === "POST" && options?.body) {
        fetchOptions.body = JSON.stringify(options.body);
      }

      const response = await fetch(url.toString(), fetchOptions);

      if (!response.ok) {
        throw new Error(`ILink API error: ${response.status} ${response.statusText}`);
      }

      return (await response.json()) as Record<string, unknown>;
    } finally {
      clearTimeout(timeoutId);
      this._abortController = null;
    }
  }

  async getBotQrcode(): Promise<Record<string, unknown>> {
    return this.request("GET", "ilink/bot/get_bot_qrcode", {
      params: { bot_type: "3" },
    });
  }

  async getQrcodeStatus(qrcode: string): Promise<Record<string, unknown>> {
    return this.request("GET", "ilink/bot/get_qrcode_status", {
      params: { qrcode },
    });
  }

  async waitForLogin(qrcode: string, pollInterval = 1500, maxWait = 300000): Promise<{ token: string; baseUrl: string }> {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const data = await this.getQrcodeStatus(qrcode);
      const status = data.status as string;
      if (status === "confirmed") {
        return {
          token: (data.bot_token as string) ?? "",
          baseUrl: ((data.baseurl as string) ?? this.baseUrl).replace(/\/+$/, ""),
        };
      }
      if (status === "expired") {
        throw new Error("WeChat QR code expired, please retry login");
      }
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
    throw new Error(`WeChat QR code not scanned within ${maxWait / 1000}s`);
  }

  async getupdates(cursor = ""): Promise<Record<string, unknown>> {
    return this.request(
      "POST",
      "ilink/bot/getupdates",
      {
        body: {
          get_updates_buf: cursor,
          base_info: { channel_version: CHANNEL_VERSION },
        },
        timeout: GETUPDATES_TIMEOUT,
      },
    );
  }

  async sendmessage(msg: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.request("POST", "ilink/bot/sendmessage", {
      body: {
        msg,
        base_info: { channel_version: CHANNEL_VERSION },
      },
    });
  }

  async sendText(toUserId: string, text: string, contextToken: string): Promise<Record<string, unknown>> {
    return this.sendmessage({
      from_user_id: "",
      to_user_id: toUserId,
      client_id: crypto.randomUUID(),
      message_type: 2,
      message_state: 2,
      context_token: contextToken,
      item_list: [{ type: 1, text_item: { text } }],
    });
  }

  async getconfig(ilinkUserId?: string, contextToken?: string): Promise<Record<string, unknown>> {
    const body: Record<string, unknown> = {
      base_info: { channel_version: CHANNEL_VERSION },
    };
    if (ilinkUserId) body.ilink_user_id = ilinkUserId;
    if (contextToken) body.context_token = contextToken;
    return this.request("POST", "ilink/bot/getconfig", { body });
  }

  async sendtyping(toUserId: string, typingTicket: string, status = 1): Promise<Record<string, unknown>> {
    return this.request("POST", "ilink/bot/sendtyping", {
      body: {
        ilink_user_id: toUserId,
        typing_ticket: typingTicket,
        status,
        base_info: { channel_version: CHANNEL_VERSION },
      },
    });
  }

  async downloadMedia(url: string, aesKeyB64?: string): Promise<Buffer> {
    const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    let data = Buffer.from(await response.arrayBuffer());
    if (aesKeyB64) {
      data = Buffer.from(aesEcbDecrypt(data, aesKeyB64));
    }
    return data;
  }

  abort(): void {
    this._abortController?.abort();
  }
}

export function aesEcbDecrypt(data: Buffer, keyB64: string): Buffer {
  const key = Buffer.from(keyB64, "base64");
  const decipher = crypto.createDecipheriv("aes-128-ecb", key, null);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

export function aesEcbEncrypt(data: Buffer, keyB64: string): Buffer {
  const key = Buffer.from(keyB64, "base64");
  const cipher = crypto.createCipheriv("aes-128-ecb", key, null);
  return Buffer.concat([cipher.update(data), cipher.final()]);
}

export { DEFAULT_BASE_URL, CHANNEL_VERSION };
