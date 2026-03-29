import { tool } from "ai";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db, client } from "@/lib/db";
import {
  userMemory,
  unit,
  userStats,
  userPreferences,
  dictionaryWord,
  srsCard,
  article,
} from "@/lib/db/schema";
import { and, eq, gte, lte } from "drizzle-orm";
import { parseExercise } from "@/lib/content/parser";
import { langCodeToName } from "@/lib/prompts";
import { supportedLanguages } from "@/lib/languages";
import { parseUnitMarkdown } from "@/lib/content/loader";

const ALLOWED_TABLE = /\bsrs_card\b/i;
const FORBIDDEN_TABLES =
  /\b(user|session|account|verification|user_stats|user_preferences|user_course_enrollment|lesson_completion|exercise_attempt|daily_activity|dictionary_word|word_cache|user_memory|course|unit|audio_cache|chat_conversation|article)\b/i;

export function createTools(userId: string, language?: string) {
  return {
    readMemory: tool({
      description:
        "Read everything stored in the user's memory. Returns free-text notes that accumulate over time.",
      inputSchema: z.object({}),
      execute: async () => {
        const [row] = await db
          .select()
          .from(userMemory)
          .where(
            and(eq(userMemory.userId, userId), eq(userMemory.key, "memory")),
          )
          .limit(1);
        return row
          ? { found: true, value: row.value }
          : { found: false, value: "" };
      },
    }),

    addMemory: tool({
      description:
        "Append a line to the user's memory. The text is added after a line break at the end of existing memory.",
      inputSchema: z.object({
        text: z.string().describe("The text to append to memory"),
      }),
      execute: async ({ text }) => {
        const [existing] = await db
          .select()
          .from(userMemory)
          .where(
            and(eq(userMemory.userId, userId), eq(userMemory.key, "memory")),
          )
          .limit(1);

        const newValue = existing ? existing.value + "\n" + text : text;

        await db
          .insert(userMemory)
          .values({ userId, key: "memory", value: newValue })
          .onConflictDoUpdate({
            target: [userMemory.userId, userMemory.key],
            set: { value: newValue, updatedAt: new Date() },
          });
        return { success: true };
      },
    }),

    rewriteAllMemory: tool({
      description:
        "Replace the user's entire memory with new content. Use when memory needs to be reorganized or cleaned up.",
      inputSchema: z.object({
        value: z
          .string()
          .describe("The new content to replace all existing memory"),
      }),
      execute: async ({ value }) => {
        await db
          .insert(userMemory)
          .values({ userId, key: "memory", value })
          .onConflictDoUpdate({
            target: [userMemory.userId, userMemory.key],
            set: { value, updatedAt: new Date() },
          });
        return { success: true };
      },
    }),

    srs: tool({
      description:
        "Execute SQL on the srs_card table. $1 is always bound to the current user's ID. Returns rows for SELECT, or affected row count for mutations. Only the srs_card table is accessible.",
      inputSchema: z.object({
        sql: z.string().describe("SQL query — use $1 for user_id"),
      }),
      execute: async ({ sql: query }) => {
        if (!ALLOWED_TABLE.test(query)) {
          return { error: "Query must reference the srs_card table." };
        }
        if (FORBIDDEN_TABLES.test(query)) {
          return {
            error: "Access denied: only the srs_card table is accessible.",
          };
        }

        try {
          const rows = await client.unsafe(query, [userId]);
          const isSelect = /^\s*select/i.test(query);
          if (isSelect) {
            return { rows: Array.from(rows), count: rows.length };
          }
          return { affected: rows.count ?? rows.length };
        } catch (e) {
          return { error: (e as Error).message };
        }
      },
    }),

    presentExercise: tool({
      description:
        "Present an interactive exercise to the user. Pass the exercise as a markdown block (starting with the [type] tag) using the exercise syntax from the system prompt. The tool parses and renders it as an interactive widget. Present ONE exercise at a time and wait for the user to complete it before presenting another.",
      inputSchema: z.object({
        markdown: z
          .string()
          .describe(
            'Exercise markdown block starting with [type-tag], e.g. \'[multiple-choice]\\ntext: "What does gato mean?"\\n- "Cat" (correct)\\n- "Dog"\'',
          ),
      }),
      execute: async ({ markdown }) => {
        try {
          const exercise = parseExercise(markdown);
          return { success: true, exercise };
        } catch (e) {
          return { success: false, error: (e as Error).message };
        }
      },
    }),

    createUnit: tool({
      description:
        "Create a learning unit from exercise markdown. The markdown MUST include ALL metadata in YAML frontmatter: title, description, icon, color, topic (required), and optionally targetLanguage, sourceLanguage, level. Then ## Lesson sections with exercises. This tool parses, validates, and inserts into the DB.",
      inputSchema: z.object({
        markdown: z
          .string()
          .describe(
            "Complete unit markdown with YAML frontmatter (title, description, icon, color, topic, optionally targetLanguage/sourceLanguage/level) and ## Lesson sections containing exercises",
          ),
        courseId: z
          .string()
          .uuid()
          .optional()
          .describe(
            "Optional course UUID to assign this unit to. Overrides courseId from frontmatter if provided.",
          ),
      }),
      execute: async ({ markdown, courseId: courseIdParam }) => {
        // Read fresh from DB — the user may have switched topics mid-conversation
        const [prefRow] = await db
          .select({ 
            targetLanguage: userPreferences.targetLanguage,
            currentTopic: userPreferences.currentTopic,
          })
          .from(userPreferences)
          .where(eq(userPreferences.userId, userId))
          .limit(1);
        const fallbackLang = prefRow?.targetLanguage ?? language ?? "de";
        const fallbackTopic = prefRow?.currentTopic ?? fallbackLang;

        const cleaned = markdown
          .replace(/^```(?:markdown|md)?\n/m, "")
          .replace(/\n```\s*$/, "")
          .trim();

        let parsedUnit;
        const unitId = crypto.randomUUID();
        try {
          parsedUnit = parseUnitMarkdown(cleaned);
        } catch (err) {
          return {
            success: false,
            error: `Failed to parse markdown: ${err instanceof Error ? err.message : String(err)}`,
          };
        }

        // topic is required — fall back to user preference or targetLanguage
        const topic = parsedUnit.topic ?? parsedUnit.targetLanguage ?? fallbackTopic;
        // targetLanguage is optional now
        const targetLanguage = parsedUnit.targetLanguage ?? (topic === fallbackLang ? fallbackLang : null);

        // Tool param overrides frontmatter courseId
        const courseId = courseIdParam ?? parsedUnit.courseId;

        await db.insert(unit).values({
          id: unitId,
          courseId,
          title: parsedUnit.title,
          description: parsedUnit.description,
          icon: parsedUnit.icon,
          color: parsedUnit.color,
          markdown: cleaned,
          topic,
          targetLanguage,
          sourceLanguage: parsedUnit.sourceLanguage,
          level: parsedUnit.level,
          createdBy: userId,
        });

        await db.insert(userStats).values({ userId }).onConflictDoNothing();

        const exerciseCount = parsedUnit.lessons.reduce(
          (sum, l) => sum + l.exercises.length,
          0,
        );

        revalidatePath("/units", "page");

        return {
          success: true,
          courseId: courseId ?? undefined,
          unitId,
          title: parsedUnit.title,
          description: parsedUnit.description,
          icon: parsedUnit.icon,
          color: parsedUnit.color,
          topic,
          level: parsedUnit.level,
          lessonCount: parsedUnit.lessons.length,
          exerciseCount,
          lessonTitles: parsedUnit.lessons.map((l) => l.title),
          url: `/unit/${unitId}`,
        };
      },
    }),

    addWordsToSrs: tool({
      description:
        "Bulk-add words from the dictionary to the user's SRS deck. Filters by language (required), and optionally by CEFR level and/or word frequency range. Only adds words marked as useful for flashcards that aren't already in the user's deck.",
      inputSchema: z.object({
        language: z.string().describe("Language code, e.g. 'de', 'fr', 'es'"),
        cefrLevel: z
          .enum(["A1", "A2", "B1", "B2", "C1", "C2"])
          .optional()
          .describe("Filter by CEFR level (exact match)"),
        minFrequency: z
          .number()
          .int()
          .optional()
          .describe("Minimum word frequency (inclusive)"),
        maxFrequency: z
          .number()
          .int()
          .optional()
          .describe("Maximum word frequency (inclusive)"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(5000)
          .default(500)
          .describe("Max words to add (default 500, max 5000)"),
      }),
      execute: async ({
        language: lang,
        cefrLevel,
        minFrequency,
        maxFrequency,
        limit: maxWords,
      }) => {
        const conditions = [
          eq(dictionaryWord.language, lang),
          eq(dictionaryWord.usefulForFlashcard, true),
        ];

        if (cefrLevel) {
          conditions.push(eq(dictionaryWord.cefrLevel, cefrLevel));
        }
        if (minFrequency !== undefined) {
          conditions.push(gte(dictionaryWord.wordFrequency, minFrequency));
        }
        if (maxFrequency !== undefined) {
          conditions.push(lte(dictionaryWord.wordFrequency, maxFrequency));
        }

        const words = await db
          .select({
            word: dictionaryWord.word,
            translation: dictionaryWord.englishTranslation,
            cefrLevel: dictionaryWord.cefrLevel,
            pos: dictionaryWord.pos,
            gender: dictionaryWord.gender,
            exampleNative: dictionaryWord.exampleSentenceNative,
            exampleEnglish: dictionaryWord.exampleSentenceEnglish,
          })
          .from(dictionaryWord)
          .where(and(...conditions))
          .orderBy(dictionaryWord.wordFrequency)
          .limit(maxWords);

        if (words.length === 0) {
          return {
            success: true,
            added: 0,
            message: "No matching words found in dictionary.",
          };
        }

        const BATCH_SIZE = 500;
        for (let i = 0; i < words.length; i += BATCH_SIZE) {
          const batch = words.slice(i, i + BATCH_SIZE);
          await db
            .insert(srsCard)
            .values(
              batch.map((w) => ({
                word: w.word.toLowerCase(),
                language: lang,
                userId,
                translation: w.translation,
                cefrLevel: w.cefrLevel,
                pos: w.pos,
                gender: w.gender,
                exampleNative: w.exampleNative,
                exampleEnglish: w.exampleEnglish,
                status: "new" as const,
                nextReviewAt: null,
              })),
            )
            .onConflictDoNothing();
        }

        return {
          success: true,
          totalMatched: words.length,
          message: `Matched ${words.length} words from dictionary and added to SRS (duplicates skipped).`,
        };
      },
    }),

    switchLanguage: tool({
      description:
        "Switch the user's target language and/or native language. At least one must be provided.",
      inputSchema: z.object({
        target_language: z
          .string()
          .optional()
          .describe(
            "Target language code (e.g. 'fr', 'es', 'de', 'it', 'pt', 'ru', 'ar', 'hi', 'ko', 'zh', 'ja')",
          ),
        native_language: z
          .string()
          .optional()
          .describe(
            "Native language code (e.g. 'en', 'fr', 'es', 'de')",
          ),
      }),
      execute: async ({ target_language, native_language }) => {
        if (!target_language && !native_language) {
          return { success: false, error: "Provide at least one of target_language or native_language." };
        }

        const allSupported = Object.keys(supportedLanguages);
        const supportedList = allSupported
          .map((k) => `${k} (${langCodeToName[k] || k})`)
          .join(", ");

        if (target_language && !supportedLanguages[target_language]) {
          return {
            success: false,
            error: `Unsupported target language "${target_language}". Supported: ${supportedList}`,
          };
        }

        if (native_language && !supportedLanguages[native_language]) {
          return {
            success: false,
            error: `Unsupported native language "${native_language}". Supported: ${supportedList}`,
          };
        }

        const changes: string[] = [];

        if (target_language) {
          await db
            .insert(userPreferences)
            .values({ userId, targetLanguage: target_language })
            .onConflictDoUpdate({
              target: userPreferences.userId,
              set: { targetLanguage: target_language, updatedAt: new Date() },
            });
          changes.push(`target language to ${langCodeToName[target_language] || target_language}`);
        }

        if (native_language) {
          await db
            .insert(userPreferences)
            .values({ userId, nativeLanguage: native_language, updatedAt: new Date() })
            .onConflictDoUpdate({
              target: userPreferences.userId,
              set: { nativeLanguage: native_language, updatedAt: new Date() },
            });
          changes.push(`native language to ${langCodeToName[native_language] || native_language}`);
        }

        revalidatePath("/");

        return {
          success: true,
          target_language: target_language ?? undefined,
          native_language: native_language ?? undefined,
          message: `Switched ${changes.join(" and ")}.`,
        };
      },
    }),

    webSearch: tool({
      description:
        "Search the web using Tavily to find articles, news, or information. Returns an AI-generated answer plus source URLs. Useful for researching topics, finding learning resources, or looking up current information.",
      inputSchema: z.object({
        query: z
          .string()
          .describe(
            "The search query. Be specific and descriptive for best results.",
          ),
        maxResults: z
          .number()
          .int()
          .min(1)
          .max(10)
          .default(5)
          .describe("Number of results to return (default 5, max 10)"),
        searchDepth: z
          .enum(["basic", "advanced"])
          .default("basic")
          .describe(
            "Search depth: 'basic' for quick searches, 'advanced' for more thorough research",
          ),
        topic: z
          .enum(["general", "news"])
          .default("general")
          .describe(
            "Topic type: 'general' for most searches, 'news' for recent news articles",
          ),
      }),
      execute: async ({ query, maxResults, searchDepth, topic }) => {
        const apiKey = process.env.TAVILY_API_KEY;
        if (!apiKey) {
          return {
            success: false,
            error:
              "Tavily API key is not configured. Web search is not available.",
          };
        }

        try {
          const response = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              api_key: apiKey,
              query,
              search_depth: searchDepth,
              topic,
              include_answer: true,
              max_results: maxResults,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            return {
              success: false,
              error: `Tavily API error (${response.status}): ${errorText}`,
            };
          }

          const data = await response.json();
          const results = (
            data.results as Array<{
              title?: string;
              url?: string;
              content?: string;
              score?: number;
            }>
          ).map((r) => ({
            title: r.title || "Untitled",
            url: r.url || "",
            content: r.content || null,
            score: r.score || 0,
          }));

          return {
            success: true,
            query,
            answer: data.answer || null,
            resultCount: results.length,
            results,
          };
        } catch (e) {
          return {
            success: false,
            error: `Web search failed: ${(e as Error).message}`,
          };
        }
      },
    }),

    readArticle: tool({
      description:
        "Read a web article and translate it to a target language at a CEFR level. Creates a saved article the user can read later. Returns immediately with article ID — translation happens in background.",
      inputSchema: z.object({
        url: z.string().url().describe("The URL of the article to translate"),
        cefrLevel: z
          .enum(["A1", "A2", "B1", "B2", "C1", "C2"])
          .default("B1")
          .describe("CEFR difficulty level for the translation"),
        targetLanguage: z
          .string()
          .optional()
          .describe(
            "Language code to translate into (e.g. 'de', 'fr', 'es'). Defaults to the user's current target language.",
          ),
      }),
      execute: async ({ url, cefrLevel, targetLanguage }) => {
        // Lazy-load article processing so /api/chat can boot without jsdom.
        const { processTranslation } = await import("@/lib/article/process");
        const lang = targetLanguage || language || "de";
        const langName = langCodeToName[lang] || lang;

        // Check for existing article with same URL + language + level
        const [existing] = await db
          .select()
          .from(article)
          .where(
            and(
              eq(article.userId, userId),
              eq(article.sourceUrl, url),
              eq(article.targetLanguage, langName),
              eq(article.cefrLevel, cefrLevel),
            ),
          )
          .limit(1);

        if (existing?.status === "completed") {
          return {
            success: true,
            articleId: existing.id,
            status: "completed",
            title: existing.title,
            url: `/read/${existing.id}`,
            message: "This article was already translated!",
          };
        }

        if (
          existing &&
          (existing.status === "fetching" || existing.status === "translating")
        ) {
          return {
            success: true,
            articleId: existing.id,
            status: existing.status,
            url: `/read/${existing.id}`,
            message: "This article is already being translated.",
          };
        }

        // Create new article record
        const articleId = crypto.randomUUID();
        await db.insert(article).values({
          id: articleId,
          userId,
          sourceUrl: url,
          targetLanguage: langName,
          cefrLevel,
          status: "fetching",
        });

        // Start background translation (fire-and-forget)
        processTranslation(articleId, url, langName, cefrLevel).catch(
          (error) => {
            console.error(
              `[${articleId}] Background processing error:`,
              error,
            );
          },
        );

        revalidatePath("/read", "page");

        return {
          success: true,
          articleId,
          status: "fetching",
          url: `/read/${articleId}`,
          message: `Started translating article to ${langName} at ${cefrLevel} level. The user can check progress at /read/${articleId}.`,
        };
      },
    }),

    // ─── Universal Tutor Tools ───

    createCurriculum: tool({
      description:
        "Create a structured learning curriculum for ANY topic. Analyzes the topic, creates a study plan with units and lessons. Use this when a user wants to learn something new - a language, exam prep, science, cooking, anything.",
      inputSchema: z.object({
        topic: z
          .string()
          .describe(
            "What the user wants to learn: 'German', 'MedAT exam', 'Quantum Physics', 'Italian cooking'",
          ),
        goal: z
          .string()
          .describe(
            "The user's learning goal: 'Pass MedAT exam', 'Reach B2 level', 'Understand basics'",
          ),
        duration: z
          .string()
          .optional()
          .describe("Available time: '3 months', '6 weeks', '1 year'"),
        priorKnowledge: z
          .string()
          .optional()
          .describe("What the user already knows about the topic"),
      }),
      execute: async ({ topic, goal, duration, priorKnowledge }) => {
        // Update user's current topic
        await db
          .insert(userPreferences)
          .values({ userId, currentTopic: topic })
          .onConflictDoUpdate({
            target: [userPreferences.userId],
            set: { currentTopic: topic, updatedAt: new Date() },
          });

        // Return curriculum structure for AI to expand into units
        return {
          success: true,
          topic,
          goal,
          duration: duration || "flexible",
          priorKnowledge: priorKnowledge || "none specified",
          nextStep:
            "Now create units using createUnit for each major topic area. Research the topic structure first if needed using webSearch.",
          suggestedWorkflow: [
            "1. Use webSearch to find topic structure/syllabus",
            "2. Create units for each major area",
            "3. Start with assessLevel to gauge user's current knowledge",
            "4. Begin teaching with presentExercise",
          ],
        };
      },
    }),

    assessLevel: tool({
      description:
        "Run a diagnostic assessment to determine the user's current level in any topic. Generates appropriate questions and analyzes results.",
      inputSchema: z.object({
        topic: z.string().describe("Topic to assess: 'German', 'Biology', 'MedAT BMS'"),
        questionCount: z
          .number()
          .optional()
          .default(5)
          .describe("Number of diagnostic questions (default: 5)"),
      }),
      execute: async ({ topic, questionCount }) => {
        // Get user's existing SRS data for this topic to understand their level
        const existingCards = await db
          .select({
            word: srsCard.word,
            status: srsCard.status,
            repetitions: srsCard.repetitions,
          })
          .from(srsCard)
          .where(
            and(
              eq(srsCard.userId, userId),
              eq(srsCard.topic, topic),
            ),
          )
          .limit(50);

        const masteredCount = existingCards.filter(
          (c) => c.status === "mastered" || c.repetitions >= 5,
        ).length;
        const learningCount = existingCards.filter(
          (c) => c.status === "learning",
        ).length;

        return {
          success: true,
          topic,
          questionCount,
          existingProgress: {
            totalTerms: existingCards.length,
            mastered: masteredCount,
            learning: learningCount,
          },
          instruction: `Generate ${questionCount} diagnostic questions for "${topic}" ranging from beginner to advanced. Present each using presentExercise. After all answers, summarize the user's level and weak areas.`,
        };
      },
    }),

    getProgress: tool({
      description:
        "Analyze user's learning progress across all topics or a specific topic. Returns statistics, weak areas, and recommendations.",
      inputSchema: z.object({
        topic: z
          .string()
          .optional()
          .describe("Filter by specific topic, or leave empty for all topics"),
      }),
      execute: async ({ topic }) => {
        // Build query conditions
        const conditions = [eq(srsCard.userId, userId)];
        if (topic) {
          conditions.push(eq(srsCard.topic, topic));
        }

        // Get SRS cards stats
        const cards = await db
          .select({
            word: srsCard.word,
            topic: srsCard.topic,
            status: srsCard.status,
            easeFactor: srsCard.easeFactor,
            interval: srsCard.interval,
            repetitions: srsCard.repetitions,
            nextReviewAt: srsCard.nextReviewAt,
          })
          .from(srsCard)
          .where(and(...conditions));

        // Group by topic
        const byTopic: Record<
          string,
          { total: number; mastered: number; struggling: number; dueForReview: number }
        > = {};

        const now = new Date();
        for (const card of cards) {
          const t = card.topic || "general";
          if (!byTopic[t]) {
            byTopic[t] = { total: 0, mastered: 0, struggling: 0, dueForReview: 0 };
          }
          byTopic[t].total++;
          if (card.status === "mastered" || card.repetitions >= 5) {
            byTopic[t].mastered++;
          }
          if (card.easeFactor < 2.0 || card.repetitions === 0) {
            byTopic[t].struggling++;
          }
          if (card.nextReviewAt && new Date(card.nextReviewAt) <= now) {
            byTopic[t].dueForReview++;
          }
        }

        // Find weak areas (topics with high struggling ratio)
        const weakAreas = Object.entries(byTopic)
          .filter(([, stats]) => stats.struggling / stats.total > 0.3)
          .map(([topicName]) => topicName);

        // Get user stats
        const [stats] = await db
          .select()
          .from(userStats)
          .where(eq(userStats.userId, userId))
          .limit(1);

        return {
          success: true,
          overall: {
            totalTerms: cards.length,
            streak: stats?.currentStreak ?? 0,
            lessonsCompleted: stats?.totalLessonsCompleted ?? 0,
          },
          byTopic,
          weakAreas,
          recommendations:
            weakAreas.length > 0
              ? `Focus on these areas: ${weakAreas.join(", ")}`
              : "Great progress! Keep reviewing to maintain retention.",
          dueForReview: Object.values(byTopic).reduce((sum, t) => sum + t.dueForReview, 0),
        };
      },
    }),

    setCurrentTopic: tool({
      description: "Set or change the user's current learning topic.",
      inputSchema: z.object({
        topic: z.string().describe("The topic to switch to"),
      }),
      execute: async ({ topic }) => {
        await db
          .insert(userPreferences)
          .values({ userId, currentTopic: topic })
          .onConflictDoUpdate({
            target: [userPreferences.userId],
            set: { currentTopic: topic, updatedAt: new Date() },
          });

        return {
          success: true,
          topic,
          message: `Now learning: ${topic}`,
        };
      },
    }),
  };
}
