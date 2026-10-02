export type ModelSide = "edge" | "cloud";
export type ModelPurpose = "speech" | "task-planning" | "memory" | "vision";

export interface ModelRequest {
  purpose: ModelPurpose;
  prompt: string;
  system?: string;
  images?: Uint8Array[];
  private?: boolean;
  json?: boolean;
}

export interface ModelResponse {
  text: string;
  provider: string;
  model: string;
  side: ModelSide;
  latencyMs: number;
}

export interface ModelProvider {
  readonly id: string;
  readonly side: ModelSide;
  complete(request: ModelRequest): Promise<ModelResponse>;
}

export interface ModelSettings {
  edge: { name: string; stt: string; quantization: string };
  cloud: {
    provider: string;
    baseUrl: string;
    model: string;
    sttModel: string;
    hasApiKey: boolean;
  };
  routing: { privateOnEdge: boolean; complexOnCloud: boolean };
}

export interface NativeCloudResult {
  text: string;
  provider: string;
  model: string;
  side: "cloud";
  latency_ms: number;
}

export interface NativeCloudConfig {
  provider: string;
  base_url: string;
  model: string;
  stt_model: string;
  has_api_key: boolean;
}
