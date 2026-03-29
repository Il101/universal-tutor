"use client";

import { memo, useMemo } from "react";
import type { UIMessage } from "@ai-sdk/react";
import { ChatExercise } from "./chat-exercise";
import { ChatUnitCard } from "./unit-card";
import { ArticleCard } from "./article-card";
import { SearchResultsCard } from "./search-results-card";
import { ToolCall } from "./tool-call";
import { HoverableMarkdown } from "@/components/word/hoverable-markdown";
import { parseExercisesFromMarkdown } from "@/lib/content/parser";
import type { Exercise } from "@/lib/content/types";

/** Regex to detect raw exercise markdown that model outputted as text instead of tool call */
const EXERCISE_PATTERN = /\[(multiple-choice|fill-in-blank|matching-pairs|translation|listening|word-bank|speaking|free-text|flashcard-review)\]/;

/** Try to extract exercise blocks from text; returns { exercises, cleanText } */
function extractInlineExercises(text: string): { exercises: Exercise[]; cleanText: string } {
  if (!EXERCISE_PATTERN.test(text)) {
    return { exercises: [], cleanText: text };
  }
  try {
    // Find where exercises start
    const match = text.match(EXERCISE_PATTERN);
    if (!match || match.index === undefined) {
      return { exercises: [], cleanText: text };
    }
    const exerciseStart = match.index;
    const cleanText = text.slice(0, exerciseStart).trim();
    const exerciseText = text.slice(exerciseStart);
    const exercises = parseExercisesFromMarkdown(exerciseText);
    return { exercises, cleanText };
  } catch {
    return { exercises: [], cleanText: text };
  }
}

interface ChatMessageProps {
  message: UIMessage;
  language: string;
  isLoading: boolean;
  completedExercises: Record<string, { correct: boolean; answer: string }>;
  onExerciseComplete: (
    toolCallId: string,
    correct: boolean,
    userAnswer: string,
    exercise: import("@/lib/content/types").Exercise,
  ) => void;
  autoplayAudio?: boolean;
}

export const ChatMessage = memo(function ChatMessage({
  message,
  language,
  isLoading,
  completedExercises,
  onExerciseComplete,
  autoplayAudio = true,
}: ChatMessageProps) {
  const isUser = message.role === "user";

  // Skip auto-generated exercise result messages
  const firstText = message.parts.find((p) => p.type === "text");
  if (
    isUser &&
    firstText?.type === "text" &&
    firstText.text.startsWith("Exercise result:")
  ) {
    return null;
  }

  return (
    <div
      className="group/message w-full animate-in fade-in duration-200"
      data-role={message.role}
    >
      <div
        className={`flex w-full items-start gap-2 md:gap-3 ${
          isUser ? "justify-end" : "justify-start"
        }`}
      >
        {/* Assistant avatar */}
        {!isUser && (
          <div className="-mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lingo-green/10 ring-1 ring-lingo-green/20">
            <span className="text-sm">🤖</span>
          </div>
        )}

        {/* Message content */}
        <div
          className={`flex flex-col ${
            isUser
              ? "max-w-[calc(100%-2.5rem)] sm:max-w-[min(fit-content,80%)] items-end"
              : "w-full gap-2 md:gap-3"
          }`}
        >
          {message.parts.map((part, index) => {
            const key = `msg-${message.id}-part-${index}`;

            // Text parts
            if (part.type === "text" && part.text.trim()) {
              if (isUser) {
                return (
                  <div
                    key={key}
                    className="w-fit whitespace-pre-wrap break-words rounded-2xl bg-lingo-blue px-3 py-2 text-sm text-white"
                  >
                    {part.text}
                  </div>
                );
              }

              // FALLBACK: If model wrote raw exercise markdown instead of using tool,
              // extract and render exercises inline (only when streaming is done)
              const { exercises, cleanText } = isLoading 
                ? { exercises: [], cleanText: part.text }
                : extractInlineExercises(part.text);
              
              // If exercises found, only show clean text (hide raw markdown)
              const displayText = exercises.length > 0 ? cleanText : part.text;
              
              return (
                <div key={key} className="flex flex-col gap-2 md:gap-3">
                  {displayText && (
                    <div className="prose prose-sm max-w-none text-lingo-text [&_p]:my-1 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0 [&_code]:whitespace-pre-wrap [&_code]:break-words [&_pre]:max-w-full [&_pre]:overflow-x-auto [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                      <HoverableMarkdown text={displayText} language={language} isStreaming={isLoading} />
                    </div>
                  )}
                  {exercises.map((exercise, exIndex) => (
                    <ChatExercise
                      key={`${key}-ex-${exIndex}`}
                      exercise={exercise}
                      toolCallId={`inline-${message.id}-${index}-${exIndex}`}
                      language={language}
                      completed={completedExercises[`inline-${message.id}-${index}-${exIndex}`]}
                      onComplete={onExerciseComplete}
                      autoplayAudio={autoplayAudio}
                    />
                  ))}
                </div>
              );
            }

            // Tool parts (type is "tool-<toolName>")
            if (part.type.startsWith("tool-")) {
              const toolPart = part as {
                type: string;
                toolCallId: string;
                state: string;
                input?: Record<string, unknown>;
                output?: unknown;
              };
              const toolName = toolPart.type.slice(5);

              // Exercise tool: render inline interactive exercise from parsed output
              if (toolName === "presentExercise") {
                const output = toolPart.output as { success?: boolean; exercise?: import("@/lib/content/types").Exercise } | undefined;
                if (output?.success && output.exercise) {
                  const completed = completedExercises[toolPart.toolCallId];
                  return (
                    <ChatExercise
                      key={toolPart.toolCallId}
                      exercise={output.exercise}
                      toolCallId={toolPart.toolCallId}
                      language={language}
                      completed={completed}
                      onComplete={onExerciseComplete}
                      autoplayAudio={autoplayAudio}
                    />
                  );
                }
              }

              // Unit creation tool: render unit summary card
              if (toolName === "createUnit") {
                const output = toolPart.output as Record<string, unknown> | undefined;
                if (output?.success) {
                  return (
                    <ChatUnitCard
                      key={toolPart.toolCallId}
                      courseId={output.courseId as string | undefined}
                      unitId={output.unitId as string | undefined}
                      url={output.url as string | undefined}
                      title={output.title as string}
                      description={output.description as string}
                      icon={output.icon as string}
                      color={output.color as string}
                      level={output.level as string}
                      lessonCount={output.lessonCount as number}
                      exerciseCount={output.exerciseCount as number}
                      lessonTitles={output.lessonTitles as string[]}
                    />
                  );
                }
              }

              // Web search tool: render search results card
              if (toolName === "webSearch") {
                const output = toolPart.output as {
                  success?: boolean;
                  query?: string;
                  results?: Array<{
                    title: string;
                    url: string;
                    publishedDate: string | null;
                    author: string | null;
                    summary: string | null;
                    highlights: string[];
                  }>;
                } | undefined;
                if (output?.success && output.results) {
                  return (
                    <SearchResultsCard
                      key={toolPart.toolCallId}
                      query={output.query || (toolPart.input as Record<string, unknown>)?.query as string || "Search"}
                      results={output.results}
                    />
                  );
                }
              }

              // Article translation tool: render article card
              if (toolName === "readArticle") {
                const output = toolPart.output as Record<string, unknown> | undefined;
                if (output?.success) {
                  return (
                    <ArticleCard
                      key={toolPart.toolCallId}
                      articleId={output.articleId as string}
                      initialStatus={output.status as string}
                      initialTitle={output.title as string | undefined}
                      url={(toolPart.input as Record<string, unknown>)?.url as string || ""}
                    />
                  );
                }
              }

              // Other tools: collapsible tool call display
              return (
                <ToolCall
                  key={key}
                  toolName={toolName}
                  state={toolPart.state}
                  input={toolPart.input}
                  output={toolPart.output}
                />
              );
            }

            return null;
          })}
        </div>
      </div>
    </div>
  );
});
