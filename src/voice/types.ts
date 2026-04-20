export interface STTConfig {
  enabled: boolean;
  provider: "openai" | "custom";
  model: string;
  api_url: string;
  api_key: string;
  language: string;
  max_file_size: number;
}

export interface STTResult {
  text: string;
  language: string;
  duration: number;
  segments?: STTSegment[];
}

export interface STTSegment {
  start: number;
  end: number;
  text: string;
}
