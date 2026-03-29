import Link from "next/link";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import {
  getStandaloneUnits,
  getUserOwnedCourses,
} from "@/lib/db/queries/courses";
import { isAdminEmail } from "@/lib/ai/models";
import { StandaloneUnits } from "./standalone-units";
import { MyCourses } from "./my-courses";

const NEW_UNIT_PROMPT = "I want to create a new personalised unit";


export default async function LearnPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;
  const isAdmin = isAdminEmail(session?.user?.email);

  const [standaloneUnits, ownedCourses] = await Promise.all([
    userId ? getStandaloneUnits(userId) : Promise.resolve([]),
    userId ? getUserOwnedCourses(userId) : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-black text-lingo-text">Learn</h1>
      </div>
      <div className="mb-6 flex gap-2 justify-center">
        <Link
          href={`/chat?prompt=${encodeURIComponent(NEW_UNIT_PROMPT)}`}
          className="rounded-xl border-2 border-lingo-border bg-white px-4 py-2.5 text-sm font-bold text-lingo-text shadow-[0_2px_0_0] shadow-lingo-border transition-all hover:border-lingo-green hover:bg-lingo-green/5 active:translate-y-[1px] active:shadow-none"
        >
          + New Unit
        </Link>
        <Link
          href="/units/browse"
          className="rounded-xl border-2 border-lingo-border bg-white px-4 py-2.5 text-sm font-bold text-lingo-text shadow-[0_2px_0_0] shadow-lingo-border transition-all hover:border-lingo-blue hover:bg-lingo-blue/5 active:translate-y-[1px] active:shadow-none"
        >
          Browse
        </Link>
      </div>
      <StandaloneUnits units={standaloneUnits} isAdmin={isAdmin} />
      <MyCourses courses={ownedCourses} isAdmin={isAdmin} />
    </div>
  );
}
