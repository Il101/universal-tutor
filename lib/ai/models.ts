import { createProviderRegistry } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_AI_API_KEY,
});

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const anthropic = createAnthropic({
  baseURL: process.env.LLM_PROXY_URL,
  apiKey: process.env.LLM_PROXY_API_KEY,
});

const nvidia = createOpenAI({
  baseURL: "https://integrate.api.nvidia.com/v1",
  apiKey: process.env.NVIDIA_API_KEY,
});

const registry = createProviderRegistry({ google, openai, anthropic, nvidia });

export const AVAILABLE_MODELS: {
  id: string;
  label: string;
  provider: string;
}[] = [
  {
    id: "qwen/qwen3-next-80b-a3b-instruct",
    label: "NVIDIA Qwen3 Next 80B",
    provider: "nvidia",
  },
  {
    id: "openai/gpt-oss-120b",
    label: "NVIDIA GPT-OSS 120B",
    provider: "nvidia",
  },
  {
    id: "meta/llama-3.1-70b-instruct",
    label: "NVIDIA Llama 3.1 70B",
    provider: "nvidia",
  },
  {
    id: "z-ai/glm5",
    label: "NVIDIA GLM5",
    provider: "nvidia",
  },
  {
    id: "mistralai/mistral-small-4-119b-2603",
    label: "NVIDIA Mistral Small",
    provider: "nvidia",
  },
];

/** Models available to regular (non-admin) users in the chat UI. */
export const CHAT_AVAILABLE_MODELS = AVAILABLE_MODELS.filter(
  (m) => m.provider === "nvidia",
);

/** Comma-separated list of admin emails loaded from env. */
const ADMIN_EMAILS: string[] = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

/** Returns the model list appropriate for the given user email. */
export function getModelsForUser(email: string | null | undefined) {
  return isAdminEmail(email) ? AVAILABLE_MODELS : CHAT_AVAILABLE_MODELS;
}

export function getModel(id: string) {
  const model = AVAILABLE_MODELS.find((m) => m.id === id);
  if (model?.provider === "nvidia") {
    return nvidia.chat(id);
  }

  const resolved = `${model?.provider}:${id}`;
  return registry.languageModel(resolved as Parameters<typeof registry.languageModel>[0]);
}
