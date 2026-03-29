"use server";

import { db } from "@/lib/db";
import { unit, userUnitLibrary } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { requireSession } from "@/lib/auth-server";
import { revalidatePath } from "next/cache";

export async function addUnitToLibrary(
  unitId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await requireSession();
  const userId = session.user.id;

  // Verify unit exists and is public
  const [existing] = await db
    .select({
      id: unit.id,
      visibility: unit.visibility,
      createdBy: unit.createdBy,
      courseId: unit.courseId,
    })
    .from(unit)
    .where(eq(unit.id, unitId));

  if (!existing) {
    return { success: false, error: "Unit not found" };
  }

  if (existing.visibility !== "public") {
    return { success: false, error: "Unit is not public" };
  }

  if (existing.createdBy === userId) {
    return { success: false, error: "You already own this unit" };
  }

  // Insert into library (ignore if already exists)
  await db
    .insert(userUnitLibrary)
    .values({ userId, unitId })
    .onConflictDoNothing();

  revalidatePath("/units", "page");
  return { success: true };
}

export async function removeUnitFromLibrary(
  unitId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await requireSession();
  const userId = session.user.id;

  await db
    .delete(userUnitLibrary)
    .where(
      and(
        eq(userUnitLibrary.userId, userId),
        eq(userUnitLibrary.unitId, unitId)
      )
    );

  revalidatePath("/units", "page");
  return { success: true };
}
