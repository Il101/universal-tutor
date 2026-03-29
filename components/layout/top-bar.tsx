"use client";

import { useRouter } from "next/navigation";
import { signOut, useSession } from "@/lib/auth-client";
import { FeedbackButton } from "@/components/feedback/feedback-button";

interface TopBarProps {
  stats?: {
    currentStreak: number;
    wordsLearned: number;
  } | null;
}

export function TopBar({ stats }: TopBarProps) {
  const router = useRouter();
  const { data: session } = useSession();

  async function handleSignOut() {
    await signOut();
    router.push("/");
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b-2 border-lingo-border bg-white px-4 md:px-6">
      <div className="md:hidden">
        <span className="text-xl font-black text-lingo-green">OpenLingo</span>
      </div>

      {/* Stats */}
      {stats && (
        <div className="flex items-center gap-4 ml-4">
          <div className="flex items-center gap-1">
            <span
              className={`text-base ${stats.wordsLearned > 0 ? "" : "grayscale opacity-40"}`}
            >
              📚
            </span>
            <span
              className={`text-sm font-bold ${stats.wordsLearned > 0 ? "text-lingo-blue" : "text-lingo-gray-dark"}`}
            >
              {stats.wordsLearned}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span
              className={`text-base ${stats.currentStreak > 0 ? "" : "grayscale opacity-40"}`}
            >
              🔥
            </span>
            <span
              className={`text-sm font-bold ${stats.currentStreak > 0 ? "text-lingo-orange" : "text-lingo-gray-dark"}`}
            >
              {stats.currentStreak}
            </span>
          </div>
        </div>
      )}

      <div className="flex-1" />

      {/* Feedback */}
      <FeedbackButton className="hidden sm:inline-flex items-center rounded-xl bg-lingo-blue px-4 py-1.5 text-sm font-bold text-white border-b-4 border-lingo-blue-dark hover:bg-lingo-blue/90 active:border-b-0 active:mt-1 transition-all duration-100 cursor-pointer mr-3" />

      <div className="flex items-center gap-4 ml-4">
        {session?.user && (
          <span className="text-sm font-bold text-lingo-text hidden sm:inline">
            {session.user.name}
          </span>
        )}
        <button
          onClick={handleSignOut}
          className="rounded-xl px-3 py-1.5 text-sm font-bold text-lingo-text-light hover:bg-lingo-gray/50 transition-colors"
        >
          Sign Out
        </button>
      </div>
    </header>
  );
}
