export interface GeminiModelConfig {
  id: string;
  displayName: string;
  description: string;
  available: boolean;
  thinking?: boolean;
}

export const SUPPORTED_MODELS: GeminiModelConfig[] = [
  {
    id: "gemini-3.7-flash",
    displayName: "Gemini 3.7 Flash",
    description: "High capability model with reasoning (default, recommended)",
    available: true,
    thinking: true,
  },
  {
    id: "gemini-3.8-flash",
    displayName: "Gemini 3.8 Flash",
    description: "Next-gen flash model (may experience temporary demand spikes)",
    available: true,
    thinking: true,
  },
  {
    id: "gemini-3.6-flash",
    displayName: "Gemini 3.6 Flash",
    description: "High efficiency flash model",
    available: true,
    thinking: false,
  },
  {
    id: "gemini-3.5-flash-lite",
    displayName: "Gemini 3.5 Flash-Lite",
    description: "Fastest, lightweight and cost-efficient fallback",
    available: true,
    thinking: false,
  },
];

export const DEFAULT_MODEL_ID = "gemini-3.7-flash";
export const FALLBACK_MODEL_ID = "gemini-3.5-flash-lite";

export function getModelById(id: string): GeminiModelConfig | undefined {
  return SUPPORTED_MODELS.find((m) => m.id === id);
}

export function isValidModelId(id: string): boolean {
  return SUPPORTED_MODELS.some((m) => m.id === id && m.available);
}

export function getModelDisplayName(id: string): string {
  const model = getModelById(id);
  return model ? model.displayName : id;
}

export function getFallbackModelId(modelId: string): string {
  if (modelId === "gemini-3.8-flash") {
    return "gemini-3.7-flash";
  }
  return FALLBACK_MODEL_ID;
}
