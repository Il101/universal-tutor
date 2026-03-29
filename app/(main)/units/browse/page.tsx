import Link from "next/link";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  listCoursesWithLessonCounts,
  getAvailableFilters,
  getBrowsableUnits,
} from "@/lib/db/queries/courses";
import { getNativeLanguage } from "@/lib/actions/profile";
import { getTargetLanguage } from "@/lib/actions/preferences";
import { CourseBrowser } from "../course-browser";
import { BrowseUnits } from "../browse-units";

export default async function BrowsePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;

  const nativeLanguage = userId ? await getNativeLanguage(userId) : null;
  const targetLanguage = userId ? await getTargetLanguage(userId) : null;

  const [courses, filters, browsableUnits] = await Promise.all([
    listCoursesWithLessonCounts(
      nativeLanguage ? { sourceLanguage: nativeLanguage } : undefined,
      userId,
    ),
    getAvailableFilters(userId),
    userId ? getBrowsableUnits(userId) : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/units"
          className="shrink-0 text-sm font-bold text-lingo-text-light hover:text-lingo-text transition-colors"
        >
          &larr; Back
        </Link>
        <h1 className="text-2xl font-black text-lingo-text">Browse</h1>
      </div>

      <BrowseUnits units={browsableUnits} initialTargetLanguage={targetLanguage} />

      {courses.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-lg text-lingo-text-light mb-2">
            No courses available for your language yet.
          </p>
          <p className="text-sm text-lingo-text-light">
            Change your native language in{" "}
            <a href="/settings" className="font-bold text-lingo-blue underline">
              settings
            </a>{" "}
            to see more courses.
          </p>
        </div>
      ) : (
        <CourseBrowser
          courses={courses}
          filters={filters}
          initialSourceLanguage={nativeLanguage ?? ""}
          initialTargetLanguage={targetLanguage ?? ""}
        />
      )}
    </div>
  );
}
