import { GoogleGenAI } from "@google/genai";

let cachedClient: GoogleGenAI | null = null;
let cachedApiKey: string | null = null;

export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not configured");
  }

  // Reuse instance if API key hasn't changed (reduces cold start / instantiation overhead)
  if (!cachedClient || cachedApiKey !== apiKey) {
    cachedClient = new GoogleGenAI({ apiKey });
    cachedApiKey = apiKey;
  }

  return cachedClient;
}
