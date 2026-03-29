import { db } from "@/lib/db";
import {
  course,
  unit,
  user,
  lessonCompletion,
  userUnitLibrary,
} from "@/lib/db/schema";
import {
  eq,
  and,
  or,
  ne,
  sql,
  isNull,
  count,
  countDistinct,
  inArray,
} from "drizzle-orm";
import type {
  Course,
  CourseListItem,
  StandaloneUnitInfo,
  UnitWithContent,
  OwnedCourseInfo,
  CourseManagementInfo,
  AvailableUnitForCourse,
} from "@/lib/content/types";
import { getUnitLessons, getUnitLessonsSafe } from "@/lib/content/loader";

interface CourseFilters {
  sourceLanguage?: string;
  targetLanguage?: string;
  level?: string;
}

export async function listCourses(
  filters?: CourseFilters,
  userId?: string
): Promise<CourseListItem[]> {
  const conditions = [eq(course.published, true)];

  // Course-level visibility: public OR owned by the current user
  if (userId) {
    conditions.push(
      or(eq(course.visibility, "public"), eq(course.createdBy, userId))!
    );
  } else {
    conditions.push(eq(course.visibility, "public"));
  }

  if (filters?.sourceLanguage) {
    conditions.push(eq(course.sourceLanguage, filters.sourceLanguage));
  }
  if (filters?.targetLanguage) {
    conditions.push(eq(course.targetLanguage, filters.targetLanguage));
  }
  if (filters?.level) {
    conditions.push(eq(course.level, filters.level));
  }

  // Only count visible units (public OR owned by the current user)
  const unitJoinCondition = userId
    ? and(
        eq(unit.courseId, course.id),
        or(eq(unit.visibility, "public"), eq(unit.createdBy, userId))
      )
    : and(eq(unit.courseId, course.id), eq(unit.visibility, "public"));

  const rows = await db
    .select({
      id: course.id,
      title: course.title,
      topic: course.topic,
      sourceLanguage: course.sourceLanguage,
      targetLanguage: course.targetLanguage,
      level: course.level,
      unitCount: countDistinct(unit.id),
    })
    .from(course)
    .leftJoin(unit, unitJoinCondition)
    .where(and(...conditions))
    .groupBy(course.id)
    .orderBy(course.title);

  return rows.map((r) => ({
    ...r,
    unitCount: Number(r.unitCount),
    // Sum lesson counts from each unit's JSONB exercises array
    lessonCount: 0, // filled below
  }));
}

// Separate query for accurate lesson counts
export async function listCoursesWithLessonCounts(
  filters?: CourseFilters,
  userId?: string
): Promise<CourseListItem[]> {
  const courses = await listCourses(filters, userId);
  if (courses.length === 0) return courses;

  const courseIds = courses.map((c) => c.id);

  // Only count lessons from visible units
  const unitVisibilityCondition = userId
    ? and(
        sql`${unit.courseId} IN ${courseIds}`,
        or(eq(unit.visibility, "public"), eq(unit.createdBy, userId))
      )
    : and(
        sql`${unit.courseId} IN ${courseIds}`,
        eq(unit.visibility, "public")
      );

  const units = await db
    .select({ id: unit.id, courseId: unit.courseId, markdown: unit.markdown })
    .from(unit)
    .where(unitVisibilityCondition);

  const lessonCountByCourse = new Map<string, number>();
  for (const u of units) {
    if (!u.courseId) continue;
    const { lessons } = getUnitLessonsSafe(u.markdown);
    const prev = lessonCountByCourse.get(u.courseId) ?? 0;
    lessonCountByCourse.set(u.courseId, prev + lessons.length);
  }

  return courses.map((c) => ({
    ...c,
    lessonCount: lessonCountByCourse.get(c.id) ?? 0,
  }));
}

export async function getCourseWithContent(
  courseId: string,
  userId?: string
): Promise<Course | null> {
  // Course-level visibility: public OR owned by the current user
  const courseConditions = [eq(course.id, courseId)];
  if (userId) {
    courseConditions.push(
      or(eq(course.visibility, "public"), eq(course.createdBy, userId))!
    );
  } else {
    courseConditions.push(eq(course.visibility, "public"));
  }

  const [courseRow] = await db
    .select()
    .from(course)
    .where(and(...courseConditions));

  if (!courseRow) return null;

  // Unit-level visibility: public OR owned by the current user
  const unitConditions = [eq(unit.courseId, courseId)];
  if (userId) {
    unitConditions.push(
      or(eq(unit.visibility, "public"), eq(unit.createdBy, userId))!
    );
  } else {
    unitConditions.push(eq(unit.visibility, "public"));
  }

  const units = await db
    .select()
    .from(unit)
    .where(and(...unitConditions));

  return {
    id: courseRow.id,
    title: courseRow.title,
    topic: courseRow.topic,
    sourceLanguage: courseRow.sourceLanguage,
    targetLanguage: courseRow.targetLanguage,
    level: courseRow.level,
    visibility: courseRow.visibility,
    createdBy: courseRow.createdBy,
    units: units.map((u) => {
      const { lessons, parseError } = getUnitLessonsSafe(u.markdown);
      return {
        id: u.id,
        title: u.title,
        description: u.description,
        icon: u.icon,
        color: u.color,
        topic: u.topic,
        lessons,
        parseError,
      };
    }),
  };
}

export async function getAvailableFilters(userId?: string) {
  const conditions = [eq(course.published, true)];
  if (userId) {
    conditions.push(
      or(eq(course.visibility, "public"), eq(course.createdBy, userId))!
    );
  } else {
    conditions.push(eq(course.visibility, "public"));
  }

  const rows = await db
    .select({
      sourceLanguage: course.sourceLanguage,
      targetLanguage: course.targetLanguage,
      level: course.level,
    })
    .from(course)
    .where(and(...conditions));

  const sourceLanguages = [...new Set(rows.map((r) => r.sourceLanguage))].filter((l) => l != null).sort();
  const targetLanguages = [...new Set(rows.map((r) => r.targetLanguage))].filter((l) => l != null).sort();
  const levels = [...new Set(rows.map((r) => r.level))].sort();

  return { sourceLanguages, targetLanguages, levels };
}

export async function getStandaloneUnits(
  userId: string
): Promise<StandaloneUnitInfo[]> {
  // Get unit IDs the user has in their library
  const libraryRows = await db
    .select({ unitId: userUnitLibrary.unitId })
    .from(userUnitLibrary)
    .where(eq(userUnitLibrary.userId, userId));

  const libraryUnitIds = new Set(libraryRows.map((r) => r.unitId));

  // "My Units" = units I created (any visibility) + units in my library
  // Build the WHERE: courseId IS NULL AND (createdBy = userId OR id IN libraryUnitIds)
  const libraryCondition =
    libraryUnitIds.size > 0
      ? or(
          eq(unit.createdBy, userId),
          inArray(unit.id, [...libraryUnitIds])
        )
      : eq(unit.createdBy, userId);

  const rows = await db
    .select({
      id: unit.id,
      title: unit.title,
      description: unit.description,
      icon: unit.icon,
      color: unit.color,
      topic: unit.topic,
      targetLanguage: unit.targetLanguage,
      sourceLanguage: unit.sourceLanguage,
      level: unit.level,
      markdown: unit.markdown,
      visibility: unit.visibility,
      createdBy: unit.createdBy,
      creatorName: user.name,
    })
    .from(unit)
    .leftJoin(user, eq(unit.createdBy, user.id))
    .where(and(isNull(unit.courseId), libraryCondition));

  if (rows.length === 0) return [];

  // Fetch completion counts for the current user across these units
  const unitIds = rows.map((r) => r.id);
  const completionCounts = await db
    .select({
      unitId: lessonCompletion.unitId,
      count: count(),
    })
    .from(lessonCompletion)
    .where(
      and(
        eq(lessonCompletion.userId, userId),
        inArray(lessonCompletion.unitId, unitIds)
      )
    )
    .groupBy(lessonCompletion.unitId);

  const completionMap = new Map(
    completionCounts.map((c) => [c.unitId, Number(c.count)])
  );

  return rows.map((u) => {
    const { lessons, parseError } = getUnitLessonsSafe(u.markdown);
    return {
      id: u.id,
      title: u.title,
      description: u.description,
      icon: u.icon,
      color: u.color,
      topic: u.topic,
      targetLanguage: u.targetLanguage,
      sourceLanguage: u.sourceLanguage,
      level: u.level,
      lessonCount: lessons.length,
      completedLessons: completionMap.get(u.id) ?? 0,
      visibility: u.visibility,
      creatorName: u.creatorName,
      isOwner: u.createdBy === userId,
      isInLibrary: libraryUnitIds.has(u.id),
      parseError,
    };
  });
}

/** Public standalone units that the user hasn't added to their library and doesn't own. */
export async function getBrowsableUnits(
  userId: string
): Promise<StandaloneUnitInfo[]> {
  // Get unit IDs the user has in their library
  const libraryRows = await db
    .select({ unitId: userUnitLibrary.unitId })
    .from(userUnitLibrary)
    .where(eq(userUnitLibrary.userId, userId));

  const libraryUnitIds = libraryRows.map((r) => r.unitId);

  // Public standalone units that user doesn't own and hasn't added to library
  const conditions = [
    isNull(unit.courseId),
    eq(unit.visibility, "public"),
    or(ne(unit.createdBy, userId), isNull(unit.createdBy)),
  ];

  // Exclude units already in library
  if (libraryUnitIds.length > 0) {
    conditions.push(sql`${unit.id} NOT IN ${libraryUnitIds}`);
  }

  const rows = await db
    .select({
      id: unit.id,
      title: unit.title,
      description: unit.description,
      icon: unit.icon,
      color: unit.color,
      topic: unit.topic,
      targetLanguage: unit.targetLanguage,
      sourceLanguage: unit.sourceLanguage,
      level: unit.level,
      markdown: unit.markdown,
      visibility: unit.visibility,
      createdBy: unit.createdBy,
      creatorName: user.name,
    })
    .from(unit)
    .leftJoin(user, eq(unit.createdBy, user.id))
    .where(and(...conditions));

  if (rows.length === 0) return [];

  return rows.map((u) => {
    const { lessons, parseError } = getUnitLessonsSafe(u.markdown);
    return {
      id: u.id,
      title: u.title,
      description: u.description,
      icon: u.icon,
      color: u.color,
      topic: u.topic,
      targetLanguage: u.targetLanguage,
      sourceLanguage: u.sourceLanguage,
      level: u.level,
      lessonCount: lessons.length,
      completedLessons: 0,
      visibility: u.visibility,
      creatorName: u.creatorName,
      isOwner: false,
      isInLibrary: false,
      parseError,
    };
  });
}

export async function getUnitForEdit(
  unitId: string,
  userId: string,
  isAdmin: boolean = false
): Promise<{ id: string; title: string; markdown: string; visibility: string | null } | null> {
  const [u] = await db
    .select({
      id: unit.id,
      title: unit.title,
      markdown: unit.markdown,
      createdBy: unit.createdBy,
      visibility: unit.visibility,
    })
    .from(unit)
    .where(eq(unit.id, unitId));

  if (!u) return null;

  // Admin can edit anything
  if (isAdmin) {
    return {
      id: u.id,
      title: u.title,
      markdown: u.markdown,
      visibility: u.visibility,
    };
  }

  // Non-owner cannot edit
  if (u.createdBy !== userId) return null;

  // Public units cannot be edited by non-admins
  if (u.visibility === "public") return null;

  return {
    id: u.id,
    title: u.title,
    markdown: u.markdown,
    visibility: u.visibility,
  };
}

export async function getUnitWithContent(
  unitId: string
): Promise<UnitWithContent | null> {
  const [u] = await db.select().from(unit).where(eq(unit.id, unitId));
  if (!u) return null;

  const { lessons, parseError } = getUnitLessonsSafe(u.markdown);
  return {
    id: u.id,
    title: u.title,
    description: u.description,
    icon: u.icon,
    color: u.color,
    topic: u.topic,
    targetLanguage: u.targetLanguage,
    sourceLanguage: u.sourceLanguage,
    level: u.level,
    courseId: u.courseId,
    visibility: u.visibility,
    createdBy: u.createdBy,
    lessons,
    parseError,
  };
}

// ─── Course management queries ───

export async function getUserOwnedCourses(
  userId: string
): Promise<OwnedCourseInfo[]> {
  const rows = await db
    .select({
      id: course.id,
      title: course.title,
      topic: course.topic,
      sourceLanguage: course.sourceLanguage,
      targetLanguage: course.targetLanguage,
      level: course.level,
      visibility: course.visibility,
      createdAt: course.createdAt,
      unitCount: countDistinct(unit.id),
    })
    .from(course)
    .leftJoin(unit, eq(unit.courseId, course.id))
    .where(eq(course.createdBy, userId))
    .groupBy(course.id)
    .orderBy(course.createdAt);

  if (rows.length === 0) return [];

  const courseIds = rows.map((r) => r.id);

  // Count completed lessons per course via unit join
  const completionCounts = await db
    .select({
      courseId: unit.courseId,
      count: count(),
    })
    .from(lessonCompletion)
    .innerJoin(unit, eq(unit.id, lessonCompletion.unitId))
    .where(
      and(
        eq(lessonCompletion.userId, userId),
        sql`${unit.courseId} IN ${courseIds}`
      )
    )
    .groupBy(unit.courseId);

  const completionMap = new Map(
    completionCounts.map((c) => [c.courseId, Number(c.count)])
  );

  // Get lesson counts from markdown
  const allUnits = await db
    .select({ id: unit.id, courseId: unit.courseId, markdown: unit.markdown })
    .from(unit)
    .where(sql`${unit.courseId} IN ${courseIds}`);

  const lessonCountMap = new Map<string, number>();
  for (const u of allUnits) {
    if (!u.courseId) continue;
    const { lessons } = getUnitLessonsSafe(u.markdown);
    lessonCountMap.set(u.courseId, (lessonCountMap.get(u.courseId) ?? 0) + lessons.length);
  }

  return rows.map((r) => ({
    ...r,
    unitCount: Number(r.unitCount),
    lessonCount: lessonCountMap.get(r.id) ?? 0,
    completedLessons: completionMap.get(r.id) ?? 0,
  }));
}

export async function getCourseForManagement(
  courseId: string,
  userId: string,
  isAdmin: boolean
): Promise<CourseManagementInfo | null> {
  const [courseRow] = await db
    .select({
      id: course.id,
      title: course.title,
      topic: course.topic,
      sourceLanguage: course.sourceLanguage,
      targetLanguage: course.targetLanguage,
      level: course.level,
      visibility: course.visibility,
      createdBy: course.createdBy,
    })
    .from(course)
    .where(eq(course.id, courseId));

  if (!courseRow) return null;

  // Only owner or admin can manage
  if (courseRow.createdBy !== userId && !isAdmin) return null;

  const units = await db
    .select({
      id: unit.id,
      title: unit.title,
      icon: unit.icon,
      visibility: unit.visibility,
      markdown: unit.markdown,
    })
    .from(unit)
    .where(eq(unit.courseId, courseId));

  return {
    id: courseRow.id,
    title: courseRow.title,
    topic: courseRow.topic,
    sourceLanguage: courseRow.sourceLanguage,
    targetLanguage: courseRow.targetLanguage,
    level: courseRow.level,
    visibility: courseRow.visibility,
    createdBy: courseRow.createdBy,
    units: units.map((u) => {
      const { lessons } = getUnitLessonsSafe(u.markdown);
      return {
        id: u.id,
        title: u.title,
        icon: u.icon,
        visibility: u.visibility,
        lessonCount: lessons.length,
      };
    }),
  };
}

/** Units owned by user that are NOT assigned to any course (available to add). */
export async function getUserOwnedStandaloneUnits(
  userId: string
): Promise<AvailableUnitForCourse[]> {
  const rows = await db
    .select({
      id: unit.id,
      title: unit.title,
      icon: unit.icon,
      topic: unit.topic,
      level: unit.level,
      markdown: unit.markdown,
    })
    .from(unit)
    .where(and(eq(unit.createdBy, userId), isNull(unit.courseId)));

  return rows.map((u) => {
    const { lessons } = getUnitLessonsSafe(u.markdown);
    return {
      id: u.id,
      title: u.title,
      icon: u.icon,
      topic: u.topic,
      level: u.level,
      lessonCount: lessons.length,
    };
  });
}
