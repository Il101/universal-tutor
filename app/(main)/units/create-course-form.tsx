"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getLanguageName } from "@/lib/languages";
import { createCourse } from "@/lib/actions/units";

const LANGUAGES = [
  "en", "es", "fr", "de", "pt", "it", "nl", "ru", "zh", "ja", "ko", "ar",
  "hi", "tr", "pl", "sv", "da", "no", "fi", "cs", "ro", "hu", "el", "he",
  "th", "vi", "id", "ms", "uk", "bg",
];

const LEVELS = [
  "A1", "A2", "B1", "B2", "C1", "C2",  // CEFR for languages
  "Beginner", "Intermediate", "Advanced",  // General levels
  "Basic", "Standard", "Expert",  // Alternative naming
];

export function CreateCourseForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [courseType, setCourseType] = useState<"language" | "topic">("language");
  const [sourceLanguage, setSourceLanguage] = useState("en");
  const [targetLanguage, setTargetLanguage] = useState("");
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState("A1");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    
    if (courseType === "language") {
      if (!targetLanguage) {
        setError("Target language is required");
        return;
      }
      if (sourceLanguage === targetLanguage) {
        setError("Source and target language must be different");
        return;
      }
    } else {
      if (!topic.trim()) {
        setError("Topic is required");
        return;
      }
    }

    startTransition(async () => {
      const result = await createCourse({
        title: title.trim(),
        sourceLanguage: courseType === "language" ? sourceLanguage : null,
        targetLanguage: courseType === "language" ? targetLanguage : null,
        topic: courseType === "topic" ? topic.trim() : targetLanguage,
        level,
      });
      if (result.success) {
        router.refresh();
        onClose();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border-2 border-lingo-border bg-white p-5 space-y-4"
    >
      <h3 className="text-lg font-bold text-lingo-text">New Course</h3>

      {error && (
        <div className="rounded-xl border-2 border-lingo-red/30 bg-lingo-red/5 px-4 py-2">
          <p className="text-sm font-medium text-lingo-red">{error}</p>
        </div>
      )}

      <Input
        label="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. German Basics or Biology 101"
        autoFocus
      />

      <div>
        <label className="mb-1.5 block text-sm font-bold text-lingo-text-light uppercase tracking-wide">
          Course Type
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setCourseType("language")}
            className={`flex-1 rounded-xl border-2 px-4 py-3 text-sm font-bold transition-colors ${
              courseType === "language"
                ? "border-lingo-green bg-lingo-green/10 text-lingo-green"
                : "border-lingo-border bg-white text-lingo-text-light hover:border-lingo-green/50"
            }`}
          >
            Language Course
          </button>
          <button
            type="button"
            onClick={() => setCourseType("topic")}
            className={`flex-1 rounded-xl border-2 px-4 py-3 text-sm font-bold transition-colors ${
              courseType === "topic"
                ? "border-lingo-blue bg-lingo-blue/10 text-lingo-blue"
                : "border-lingo-border bg-white text-lingo-text-light hover:border-lingo-blue/50"
            }`}
          >
            Subject/Topic Course
          </button>
        </div>
      </div>

      {courseType === "language" ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-bold text-lingo-text-light uppercase tracking-wide">
              Source Language
            </label>
            <select
              value={sourceLanguage}
              onChange={(e) => setSourceLanguage(e.target.value)}
              className="w-full rounded-xl border-2 border-lingo-border bg-white px-4 py-3 text-base text-lingo-text focus:border-lingo-blue focus:outline-none transition-colors"
            >
              {LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {getLanguageName(code)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-bold text-lingo-text-light uppercase tracking-wide">
              Target Language
            </label>
            <select
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.target.value)}
              className="w-full rounded-xl border-2 border-lingo-border bg-white px-4 py-3 text-base text-lingo-text focus:border-lingo-blue focus:outline-none transition-colors"
            >
              <option value="">Select...</option>
              {LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {getLanguageName(code)}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <Input
          label="Subject/Topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. Biology, MedAT, Cooking, Chemistry"
        />
      )}

      <div>
        <label className="mb-1.5 block text-sm font-bold text-lingo-text-light uppercase tracking-wide">
          Level
        </label>
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          className="w-full rounded-xl border-2 border-lingo-border bg-white px-4 py-3 text-base text-lingo-text focus:border-lingo-blue focus:outline-none transition-colors"
        >
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button type="submit" size="sm" loading={isPending}>
          Create
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onClose}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
