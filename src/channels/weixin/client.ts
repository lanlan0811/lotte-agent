import crypto from "node:crypto";
import {
  makeIlinkHeaders,
  aesEcbDecrypt,
  aesEcbEncrypt,
  generateAesKeyHex,
  encodeAesKeyForMsg,
  buildCdnDownloadUrl,
  buildCdnUploadUrl,
} from "./utils.js";

const DEFAULT_BASE_URL = "https://ilinkai.weixin.qq.com";
const CHANNEL_VERSION = "2.0.1";
const GETUPDATES_TIMEOUT = 45000;
const DEFAULT_TIMEOUT = 15000;

export interface ILinkClientOptions {
  botToken?: string;
  baseUrl?: string;
}

export interface CdnUploadResult {
  encryptQueryParam: string;
  aesKeyB64: string;
  aesKeyHex: string;
  fileSize: number;
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
    return makeIlinkHeaders(this.botToken);
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

  async downloadCdnMedia(
    url: string,
    aesKeyB64: string = "",
    encryptQueryParam: string = "",
  ): Promise<Buffer> {
    let downloadUrl: string;
    if (encryptQueryParam) {
      downloadUrl = buildCdnDownloadUrl(encryptQueryParam);
    } else if (url) {
      downloadUrl = url;
    } else {
      throw new Error("downloadCdnMedia: no URL or encrypt_query_param provided");
    }

    const response = await fetch(downloadUrl, {
      headers: { "User-Agent": "Lotte-WeixinBot/1.0" },
      signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) {
      throw new Error(`CDN download failed: ${response.status}`);
    }

    let data = Buffer.from(await response.arrayBuffer()) as Buffer;
    if (aesKeyB64) {
      data = aesEcbDecrypt(data, aesKeyB64) as Buffer;
    }
    return data;
  }

  async uploadCdnMedia(
    rawFileData: Buffer,
    aesKeyHex: string,
    _fileSize: number,
    uploadQueryParam: string,
  ): Promise<CdnUploadResult> {
    const aesKeyRawBytes = Buffer.from(aesKeyHex, "hex");
    const aesKeyB64ForEncrypt = aesKeyRawBytes.toString("base64");
    const encryptedData = aesEcbEncrypt(rawFileData, aesKeyB64ForEncrypt);

    const uploadUrl = buildCdnUploadUrl(uploadQueryParam);
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "User-Agent": "Lotte-WeixinBot/1.0",
      },
      body: encryptedData,
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      throw new Error(`CDN upload failed: ${response.status}`);
    }

    const encryptQueryParam =
      (response.headers.get("x-encrypted-param") as string) ?? "";

    return {
      encryptQueryParam,
      aesKeyB64: encodeAesKeyForMsg(aesKeyHex),
      aesKeyHex,
      fileSize: encryptedData.length,
    };
  }

  async prepareCdnUpload(): Promise<{
    aesKeyHex: string;
    aesKeyB64ForEncrypt: string;
    aesKeyB64ForMsg: string;
  }> {
    const aesKeyHex = generateAesKeyHex();
    const aesKeyRawBytes = Buffer.from(aesKeyHex, "hex");
    const aesKeyB64ForEncrypt = aesKeyRawBytes.toString("base64");
    const aesKeyB64ForMsg = encodeAesKeyForMsg(aesKeyHex);
    return { aesKeyHex, aesKeyB64ForEncrypt, aesKeyB64ForMsg };
  }

  async sendImageMessage(
    toUserId: string,
    contextToken: string,
    uploadResult: CdnUploadResult,
  ): Promise<Record<string, unknown>> {
    return this.sendmessage({
      from_user_id: "",
      to_user_id: toUserId,
      client_id: crypto.randomUUID(),
      message_type: 2,
      message_state: 2,
      context_token: contextToken,
      item_list: [
        {
          type: 2,
          image_item: {
            encrypt_query_param: uploadResult.encryptQueryParam,
            aes_key: uploadResult.aesKeyB64,
            encrypt_type: 1,
          },
        },
      ],
    });
  }

  async sendFileMessage(
    toUserId: string,
    contextToken: string,
    uploadResult: CdnUploadResult,
    fileName: string,
  ): Promise<Record<string, unknown>> {
    return this.sendmessage({
      from_user_id: "",
      to_user_id: toUserId,
      client_id: crypto.randomUUID(),
      message_type: 2,
      message_state: 2,
      context_token: contextToken,
      item_list: [
        {
          type: 4,
          file_item: {
            file_name: fileName,
            encrypt_query_param: uploadResult.encryptQueryParam,
            aes_key: uploadResult.aesKeyB64,
            encrypt_type: 1,
            file_size: uploadResult.fileSize,
          },
        },
      ],
    });
  }

  abort(): void {
    this._abortController?.abort();
  }
}

export { DEFAULT_BASE_URL, CHANNEL_VERSION };
