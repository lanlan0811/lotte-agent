export interface ImageContent {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
}

export interface VideoContent {
  type: "video_url";
  video_url: {
    url: string;
  };
}

export interface ScreenshotResult {
  data: Buffer;
  mimeType: string;
  width: number;
  height: number;
}

export interface MediaFile {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: number;
  ttl: number;
}

export interface VisionConfig {
  enabled: boolean;
  follow_primary_model: boolean;
  max_image_bytes: number;
  max_images_per_message: number;
}

export interface VideoConfig {
  enabled: boolean;
  max_video_bytes: number;
  max_duration_seconds: number;
}

export interface ScreenshotConfig {
  browser_enabled: boolean;
  screen_enabled: boolean;
}

export interface MediaConfig {
  storage_dir: string;
  ttl_seconds: number;
  http_port: number;
}
