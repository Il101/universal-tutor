"use server";

import { db } from "@/lib/db";
import { userPreferences } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth-server";
import { revalidatePath } from "next/cache";
import { supportedLanguages } from "@/lib/languages";
import { getModelsForUser } from "@/lib/ai/models";
import { DEFAULT_AI_MODEL } from "../constants";

export async function getTargetLanguage(userId?: string): Promise<string | null> {
  const uid = userId ?? (await requireSession()).user.id;

  const [row] = await db
    .select({ targetLanguage: userPreferences.targetLanguage })
    .from(userPreferences)
    .where(eq(userPreferences.userId, uid))
    .limit(1);

  return row?.targetLanguage ?? null;
}

export async function updateTargetLanguage(language: string) {
  const session = await requireSession();
  const userId = session.user.id;

  if (!supportedLanguages[language]) {
    throw new Error(`Unsupported language: ${language}`);
  }

  await db
    .insert(userPreferences)
    .values({ userId, targetLanguage: language })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { targetLanguage: language, updatedAt: new Date() },
    });

  revalidatePath("/");
  revalidatePath("/settings");
}

export async function getPreferredModel(userId?: string): Promise<string> {
  const session = await requireSession();
  const uid = userId ?? session.user.id;
  const userModels = getModelsForUser(session.user.email);

  const [row] = await db
    .select({ preferredModel: userPreferences.preferredModel })
    .from(userPreferences)
    .where(eq(userPreferences.userId, uid))
    .limit(1);

  const preferredModel = row?.preferredModel;
  if (preferredModel && userModels.some((m) => m.id === preferredModel)) {
    return preferredModel;
  }

  return DEFAULT_AI_MODEL;
}

export async function updatePreferredModel(model: string) {
  const session = await requireSession();
  const userId = session.user.id;

  const userModels = getModelsForUser(session.user.email);
  const valid = userModels.some((m) => m.id === model);
  if (!valid) {
    throw new Error(`Unsupported model: ${model}`);
  }

  await db
    .insert(userPreferences)
    .values({ userId, preferredModel: model })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { preferredModel: model, updatedAt: new Date() },
    });

  revalidatePath("/");
}
