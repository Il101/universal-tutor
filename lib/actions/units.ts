"use server";

import crypto from "crypto";
import { db } from "@/lib/db";
import { unit, course } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth-server";
import { parseUnitMarkdown } from "@/lib/content/unit-parser";
import { revalidatePath } from "next/cache";
import { isAdminEmail } from "@/lib/ai/models";

// ─── Helper ───

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

// ─── Unit actions ───

export async function updateUnitMarkdown(
  unitId: string,
  markdown: string
): Promise<
  | { success: true; title: string; lessonCount: number; exerciseCount: number }
  | { success: false; error: string }
> {
  const session = await requireSession();
  const userId = session.user.id;
  const admin = isAdminEmail(session.user.email);

  // Fetch unit and verify ownership
  const [existing] = await db
    .select({ id: unit.id, createdBy: unit.createdBy, visibility: unit.visibility })
    .from(unit)
    .where(eq(unit.id, unitId));

  if (!existing) {
    return { success: false, error: "Unit not found" };
  }

  if (existing.createdBy !== userId && !admin) {
    return { success: false, error: "You do not own this unit" };
  }

  // Edit-lock: public units can only be edited by admins
  if (existing.visibility === "public" && !admin) {
    return {
      success: false,
      error: "This unit is public and can no longer be edited. Only admins can make changes to public content.",
    };
  }

  // Strip code fences (same logic as createUnit tool)
  const cleaned = markdown
    .replace(/^```(?:markdown|md)?\n/m, "")
    .replace(/\n```\s*$/, "")
    .trim();

  // Parse and validate
  let parsedUnit;
  try {
    parsedUnit = parseUnitMarkdown(cleaned);
  } catch (err) {
    return {
      success: false,
      error: `Failed to parse markdown: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (parsedUnit.lessons.length === 0) {
    return {
      success: false,
      error: "No lessons found. Make sure your markdown contains at least one lesson block with --- delimiters.",
    };
  }

  // Update all denormalized fields + markdown
  await db
    .update(unit)
    .set({
      title: parsedUnit.title,
      description: parsedUnit.description,
      icon: parsedUnit.icon,
      color: parsedUnit.color,
      topic: parsedUnit.topic ?? parsedUnit.title,
      markdown: cleaned,
      targetLanguage: parsedUnit.targetLanguage ?? "de",
      sourceLanguage: parsedUnit.sourceLanguage,
      level: parsedUnit.level,
      updatedAt: new Date(),
    })
    .where(eq(unit.id, unitId));

  const exerciseCount = parsedUnit.lessons.reduce(
    (sum, l) => sum + l.exercises.length,
    0
  );

  revalidatePath("/units", "page");

  return {
    success: true,
    title: parsedUnit.title,
    lessonCount: parsedUnit.lessons.length,
    exerciseCount,
  };
}

export async function deleteUnit(
  unitId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await requireSession();
  const userId = session.user.id;
  const admin = isAdminEmail(session.user.email);

  // Fetch unit and verify ownership
  const [existing] = await db
    .select({ id: unit.id, createdBy: unit.createdBy, visibility: unit.visibility })
    .from(unit)
    .where(eq(unit.id, unitId));

  if (!existing) {
    return { success: false, error: "Unit not found" };
  }

  if (existing.createdBy !== userId && !admin) {
    return { success: false, error: "You do not own this unit" };
  }

  // Edit-lock: public units can only be deleted by admins
  if (existing.visibility === "public" && !admin) {
    return {
      success: false,
      error: "This unit is public and can no longer be deleted. Only admins can make changes to public content.",
    };
  }

  await db.delete(unit).where(eq(unit.id, unitId));

  revalidatePath("/units", "page");

  return { success: true };
}

// ─── Visibility actions ───

export async function makeUnitPublic(
  unitId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await requireSession();
  const userId = session.user.id;

  const [existing] = await db
    .select({ id: unit.id, createdBy: unit.createdBy, visibility: unit.visibility })
    .from(unit)
    .where(eq(unit.id, unitId));

  if (!existing) {
    return { success: false, error: "Unit not found" };
  }

  if (existing.createdBy !== userId) {
    return { success: false, error: "You do not own this unit" };
  }

  if (existing.visibility === "public") {
    return { success: false, error: "Unit is already public" };
  }

  await db
    .update(unit)
    .set({ visibility: "public", updatedAt: new Date() })
    .where(eq(unit.id, unitId));

  revalidatePath("/units", "page");
  return { success: true };
}

export async function makeUnitPrivate(
  unitId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await requireSession();

  if (!isAdminEmail(session.user.email)) {
    return { success: false, error: "Only admins can make units private" };
  }

  const [existing] = await db
    .select({ id: unit.id, visibility: unit.visibility })
    .from(unit)
    .where(eq(unit.id, unitId));

  if (!existing) {
    return { success: false, error: "Unit not found" };
  }

  if (existing.visibility !== "public") {
    return { success: false, error: "Unit is already private" };
  }

  await db
    .update(unit)
    .set({ visibility: null, updatedAt: new Date() })
    .where(eq(unit.id, unitId));

  revalidatePath("/units", "page");
  return { success: true };
}

export async function makeCoursePublic(
  courseId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await requireSession();
  const userId = session.user.id;

  const [existing] = await db
    .select({ id: course.id, createdBy: course.createdBy, visibility: course.visibility })
    .from(course)
    .where(eq(course.id, courseId));

  if (!existing) {
    return { success: false, error: "Course not found" };
  }

  if (existing.createdBy !== userId) {
    return { success: false, error: "You do not own this course" };
  }

  if (existing.visibility === "public") {
    return { success: false, error: "Course is already public" };
  }

  await db
    .update(course)
    .set({ visibility: "public", updatedAt: new Date() })
    .where(eq(course.id, courseId));

  revalidatePath("/units", "page");
  return { success: true };
}

export async function makeCoursePrivate(
  courseId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await requireSession();

  if (!isAdminEmail(session.user.email)) {
    return { success: false, error: "Only admins can make courses private" };
  }

  const [existing] = await db
    .select({ id: course.id, visibility: course.visibility })
    .from(course)
    .where(eq(course.id, courseId));

  if (!existing) {
    return { success: false, error: "Course not found" };
  }

  if (existing.visibility !== "public") {
    return { success: false, error: "Course is already private" };
  }

  await db
    .update(course)
    .set({ visibility: null, updatedAt: new Date() })
    .where(eq(course.id, courseId));

  revalidatePath("/units", "page");
  return { success: true };
}

// ─── Course CRUD actions ───

export async function createCourse(data: {
  title: string;
  sourceLanguage: string | null;
  targetLanguage: string | null;
  topic: string;
  level: string;
}): Promise<{ success: true; courseId: string } | { success: false; error: string }> {
  const session = await requireSession();
  const userId = session.user.id;

  if (!data.title.trim()) {
    return { success: false, error: "Title is required" };
  }
  if (!data.topic) {
    return { success: false, error: "Topic is required" };
  }
  if (!data.level) {
    return { success: false, error: "Level is required" };
  }

  const slug = slugify(data.title);
  const suffix = crypto.randomUUID().slice(0, 8);
  const courseId = `${slug}-${suffix}`;

  await db.insert(course).values({
    id: courseId,
    title: data.title.trim(),
    topic: data.topic,
    sourceLanguage: data.sourceLanguage,
    targetLanguage: data.targetLanguage,
    level: data.level,
    visibility: null,
    published: true,
    createdBy: userId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  revalidatePath("/units", "page");
  return { success: true, courseId };
}

export async function deleteCourse(
  courseId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await requireSession();
  const userId = session.user.id;
  const admin = isAdminEmail(session.user.email);

  const [existing] = await db
    .select({ id: course.id, createdBy: course.createdBy, visibility: course.visibility })
    .from(course)
    .where(eq(course.id, courseId));

  if (!existing) {
    return { success: false, error: "Course not found" };
  }

  if (existing.createdBy !== userId && !admin) {
    return { success: false, error: "You do not own this course" };
  }

  // Edit-lock: public courses can only be deleted by admins
  if (existing.visibility === "public" && !admin) {
    return {
      success: false,
      error: "This course is public and can no longer be deleted. Only admins can make changes to public content.",
    };
  }

  // Detach all units (set courseId to null) rather than deleting them
  await db
    .update(unit)
    .set({ courseId: null, updatedAt: new Date() })
    .where(eq(unit.courseId, courseId));

  await db.delete(course).where(eq(course.id, courseId));

  revalidatePath("/units", "page");
  return { success: true };
}

// ─── Unit-Course management actions ───

export async function addUnitToCourse(
  unitId: string,
  courseId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await requireSession();
  const userId = session.user.id;
  const admin = isAdminEmail(session.user.email);

  // Verify course exists and ownership
  const [existingCourse] = await db
    .select({ id: course.id, createdBy: course.createdBy, visibility: course.visibility })
    .from(course)
    .where(eq(course.id, courseId));

  if (!existingCourse) {
    return { success: false, error: "Course not found" };
  }

  if (existingCourse.createdBy !== userId && !admin) {
    return { success: false, error: "You do not own this course" };
  }

  // Edit-lock: public courses cannot be modified by non-admins
  if (existingCourse.visibility === "public" && !admin) {
    return {
      success: false,
      error: "This course is public and can no longer be modified. Only admins can make changes to public content.",
    };
  }

  // Verify unit exists and ownership
  const [existingUnit] = await db
    .select({ id: unit.id, createdBy: unit.createdBy, courseId: unit.courseId })
    .from(unit)
    .where(eq(unit.id, unitId));

  if (!existingUnit) {
    return { success: false, error: "Unit not found" };
  }

  if (existingUnit.createdBy !== userId && !admin) {
    return { success: false, error: "You do not own this unit" };
  }

  if (existingUnit.courseId) {
    return { success: false, error: "Unit is already assigned to a course. Remove it first." };
  }

  await db
    .update(unit)
    .set({ courseId, updatedAt: new Date() })
    .where(eq(unit.id, unitId));

  revalidatePath("/units", "page");
  return { success: true };
}

export async function removeUnitFromCourse(
  unitId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await requireSession();
  const userId = session.user.id;
  const admin = isAdminEmail(session.user.email);

  // Verify unit exists
  const [existingUnit] = await db
    .select({ id: unit.id, createdBy: unit.createdBy, courseId: unit.courseId })
    .from(unit)
    .where(eq(unit.id, unitId));

  if (!existingUnit) {
    return { success: false, error: "Unit not found" };
  }

  if (!existingUnit.courseId) {
    return { success: false, error: "Unit is not in a course" };
  }

  // Verify course ownership
  const [existingCourse] = await db
    .select({ id: course.id, createdBy: course.createdBy, visibility: course.visibility })
    .from(course)
    .where(eq(course.id, existingUnit.courseId));

  if (!existingCourse) {
    return { success: false, error: "Course not found" };
  }

  if (existingCourse.createdBy !== userId && !admin) {
    return { success: false, error: "You do not own this course" };
  }

  // Edit-lock: public courses cannot be modified by non-admins
  if (existingCourse.visibility === "public" && !admin) {
    return {
      success: false,
      error: "This course is public and can no longer be modified. Only admins can make changes to public content.",
    };
  }

  await db
    .update(unit)
    .set({ courseId: null, updatedAt: new Date() })
    .where(eq(unit.id, unitId));

  revalidatePath("/units", "page");
  return { success: true };
}

// ─── Management data fetching ───

import { getCourseForManagement, getUserOwnedStandaloneUnits } from "@/lib/db/queries/courses";
import type { CourseManagementInfo, AvailableUnitForCourse } from "@/lib/content/types";

export async function fetchCourseManagementData(
  courseId: string
): Promise<
  | { success: true; course: CourseManagementInfo; availableUnits: AvailableUnitForCourse[] }
  | { success: false; error: string }
> {
  const session = await requireSession();
  const userId = session.user.id;
  const admin = isAdminEmail(session.user.email);

  const courseData = await getCourseForManagement(courseId, userId, admin);
  if (!courseData) {
    return { success: false, error: "Course not found or access denied" };
  }

  const availableUnits = await getUserOwnedStandaloneUnits(userId);

  return { success: true, course: courseData, availableUnits };
}
