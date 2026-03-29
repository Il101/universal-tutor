"use client";

import { useRef, useCallback, useState } from "react";

// In-memory URL cache to avoid redundant API calls
const urlCache = new Map<string, string>();

export function useAudio() {
  const currentAudio = useRef<HTMLAudioElement | null>(null);
  const currentUtterance = useRef<SpeechSynthesisUtterance | null>(null);
  const nonceRef = useRef(0);
  const [loading, setLoading] = useState(false);

  const stop = useCallback(() => {
    nonceRef.current++;
    setLoading(false);
    if (currentAudio.current) {
      currentAudio.current.pause();
      currentAudio.current = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      currentUtterance.current = null;
    }
  }, []);

  const fetchUrl = useCallback(async (text: string, language: string) => {
    const key = `${language}:${text.toLowerCase()}`;
    const cached = urlCache.get(key);
    if (cached) return cached;

    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || "TTS request failed");
    }
    if (!data?.url || typeof data.url !== "string") {
      throw new Error("TTS returned an invalid audio URL");
    }
    urlCache.set(key, data.url);
    return data.url;
  }, []);

  const fallbackSpeechSynthesis = useCallback(
    (text: string, language: string) => {
      if (typeof window === "undefined" || !window.speechSynthesis) {
        return false;
      }

      const locale = language.includes("-") ? language : `${language}-${language.toUpperCase()}`;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = locale;
      utterance.rate = 0.95;
      utterance.pitch = 1;
      currentUtterance.current = utterance;
      window.speechSynthesis.speak(utterance);
      return true;
    },
    []
  );

  const play = useCallback(async (text: string, language: string) => {
    stop();
    const nonce = nonceRef.current;

    setLoading(true);
    let url: string | null = null;
    try {
      url = await fetchUrl(text, language);
    } catch {
      const spoken = fallbackSpeechSynthesis(text, language);
      if (!spoken) {
        throw new Error("Could not play audio.");
      }
    } finally {
      if (nonce === nonceRef.current) setLoading(false);
    }

    // Stale — a newer play() or stop() was called while we were fetching
    if (nonce !== nonceRef.current) return;
    if (!url) return;

    const audio = new Audio(url);
    currentAudio.current = audio;
    audio.play();
  }, [stop, fetchUrl, fallbackSpeechSynthesis]);

  const prefetch = useCallback((texts: string[], language: string) => {
    texts.forEach((text) => fetchUrl(text, language));
  }, [fetchUrl]);

  return { play, stop, prefetch, loading };
}
