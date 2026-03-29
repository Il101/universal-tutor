"use server";

import { db } from "@/lib/db";
import { userStats, lessonCompletion, unit } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireSession } from "@/lib/auth-server";

export async function getUserProgress(courseId: string) {
  const session = await requireSession();
  const userId = session.user.id;

  // Get completions via unit join (lessonCompletion references unitId)
  const courseUnitIds = await db
    .select({ id: unit.id })
    .from(unit)
    .where(eq(unit.courseId, courseId));

  const unitIds = courseUnitIds.map((u) => u.id);

  const completions =
    unitIds.length > 0
      ? await db
          .select({
            id: lessonCompletion.id,
            unitId: lessonCompletion.unitId,
            lessonIndex: lessonCompletion.lessonIndex,
            perfectScore: lessonCompletion.perfectScore,
            completedAt: lessonCompletion.completedAt,
          })
          .from(lessonCompletion)
          .where(
            and(
              eq(lessonCompletion.userId, userId),
              sql`${lessonCompletion.unitId} IN ${unitIds}`
            )
          )
      : [];

  return { completions };
}

export async function getUnitProgress(unitId: string) {
  const session = await requireSession();
  const userId = session.user.id;

  const completions = await db
    .select({
      id: lessonCompletion.id,
      unitId: lessonCompletion.unitId,
      lessonIndex: lessonCompletion.lessonIndex,
      perfectScore: lessonCompletion.perfectScore,
      completedAt: lessonCompletion.completedAt,
    })
    .from(lessonCompletion)
    .where(
      and(
        eq(lessonCompletion.userId, userId),
        eq(lessonCompletion.unitId, unitId)
      )
    );

  return { completions };
}

export async function getUserStatsData() {
  const session = await requireSession();
  const userId = session.user.id;

  const [stats] = await db
    .select()
    .from(userStats)
    .where(eq(userStats.userId, userId));

  if (!stats) {
    const [newStats] = await db
      .insert(userStats)
      .values({ userId })
      .returning();
    return newStats;
  }

  return stats;
}
