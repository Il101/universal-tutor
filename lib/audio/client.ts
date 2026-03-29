import OpenAI from "openai";

export function getAudioClient() {
  const provider = (process.env.AUDIO_PROVIDER || "openai").trim();

  if (provider === "nvidia") {
    return new OpenAI({
      baseURL: "https://integrate.api.nvidia.com/v1",
      apiKey: process.env.NVIDIA_API_KEY,
    });
  }

  // Default to OpenAI
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

export function getSTTClient() {
  const groqApiKey = process.env.GROQ_API_KEY?.trim();
  if (groqApiKey) {
    return new OpenAI({
      baseURL: "https://api.groq.com/openai/v1",
      apiKey: groqApiKey,
    });
  }

  return getAudioClient();
}

export function getTTSModel() {
  const provider = (process.env.AUDIO_PROVIDER || "openai").trim();
  if (provider === "nvidia") {
    return (
      process.env.NVIDIA_TTS_MODEL?.trim() || "nvidia/magpie-tts-multilingual"
    );
  }
  return "gpt-4o-mini-tts";
}

export function getSTTModel() {
  if (process.env.GROQ_API_KEY?.trim()) {
    return process.env.GROQ_STT_MODEL?.trim() || "whisper-large-v3-turbo";
  }

  const provider = (process.env.AUDIO_PROVIDER || "openai").trim();
  if (provider === "nvidia") {
    return (
      process.env.NVIDIA_STT_MODEL?.trim() ||
      "nvidia/parakeet-1.1b-rnnt-multilingual-asr"
    );
  }
  return "whisper-1";
}
