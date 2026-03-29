import Link from "next/link";
import { getSession } from "@/lib/auth-server";
import { DEFAULT_PATH } from "@/lib/constants";
import { FeedbackButton } from "@/components/feedback/feedback-button";

export default async function LandingPage() {
  const session = await getSession();

  return (
    <div className="flex min-h-screen flex-col items-center bg-lingo-bg px-4 py-16">
      <div className="max-w-2xl w-full text-center">
        {/* Header */}
        <h1 className="text-6xl font-black text-lingo-green mb-4">OpenLingo</h1>
        <p className="text-xl text-lingo-text-light mb-2">
          Your AI-powered universal tutor
        </p>
        <p className="text-base text-lingo-text-light mb-8">
          Learn languages, sciences, or any subject. Create personalized units, 
          read translated articles, and practice with AI guidance.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-6">
          {session ? (
            <Link
              href={DEFAULT_PATH}
              className="inline-flex items-center justify-center rounded-2xl bg-lingo-green px-8 py-3 text-lg font-bold uppercase text-white border-b-4 border-lingo-green-dark hover:bg-lingo-green/90 transition-colors"
            >
              Go to App
            </Link>
          ) : (
            <>
              <Link
                href="/sign-up"
                className="inline-flex items-center justify-center rounded-2xl bg-lingo-green px-8 py-3 text-lg font-bold uppercase text-white border-b-4 border-lingo-green-dark hover:bg-lingo-green/90 transition-colors"
              >
                Get Started
              </Link>
              <Link
                href="/sign-in"
                className="inline-flex items-center justify-center rounded-2xl bg-white px-8 py-3 text-lg font-bold uppercase text-lingo-green border-2 border-lingo-border hover:bg-lingo-gray/30 transition-colors"
              >
                I Already Have an Account
              </Link>
            </>
          )}
        </div>

        <div className="mb-12">
          <FeedbackButton />
        </div>

        {/* Demo Video */}
        <div className="w-full">
          <h2 className="text-2xl font-bold text-lingo-text mb-4">
            See it in action
          </h2>
          <div className="relative w-full aspect-video rounded-2xl overflow-hidden border-2 border-lingo-border bg-black/5">
            <iframe
              className="absolute inset-0 w-full h-full"
              src="https://www.youtube.com/embed/YEYLhulhFUc"
              title="OpenLingo Demo"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </div>
  );
}
