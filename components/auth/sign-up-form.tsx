"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { signIn, signUp } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Turnstile, type TurnstileRef } from "@/components/auth/turnstile";
import Image from "next/image";
import Link from "next/link";

interface SignUpFormProps {
  redirectUrl?: string;
}

export function SignUpForm({ redirectUrl }: SignUpFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileRef>(null);

  const destination = redirectUrl || "/onboarding";

  const handleTurnstileVerify = useCallback((token: string) => {
    setTurnstileToken(token);
  }, []);

  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken(null);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signUp.email(
      { name, email, password },
      {
        headers: turnstileToken
          ? { "x-turnstile-token": turnstileToken }
          : undefined,
      }
    );
    setLoading(false);

    if (result.error) {
      setError(result.error.message || "Sign up failed");
      setTurnstileToken(null);
      turnstileRef.current?.reset();
    } else {
      router.push(destination);
    }
  }

  async function handleGoogleSignIn() {
    setError("");
    setGoogleLoading(true);
    await signIn.social({
      provider: "google",
      callbackURL: destination,
    });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Name"
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          label="Password"
          type="password"
          placeholder="Create a password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />
        <Turnstile
          ref={turnstileRef}
          onVerify={handleTurnstileVerify}
          onExpire={handleTurnstileExpire}
          onError={handleTurnstileExpire}
        />
        {error && (
          <p className="text-sm text-lingo-red font-medium">{error}</p>
        )}
        <Button
          type="submit"
          loading={loading}
          disabled={turnstileToken === null && !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
          className="w-full"
        >
          Create Account
        </Button>
      </form>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-lingo-border" />
        <span className="text-sm text-lingo-text-light uppercase tracking-wide">or</span>
        <div className="h-px flex-1 bg-lingo-border" />
      </div>

      <Button
        variant="outline"
        loading={googleLoading}
        onClick={handleGoogleSignIn}
        className="w-full"
      >
        <Image src="/google.svg" alt="" width={20} height={20} className="inline-block mr-2" />
        Sign up with Google
      </Button>

      <p className="text-center text-sm text-lingo-text-light">
        Already have an account?{" "}
        <Link
          href={redirectUrl ? `/sign-in?redirect=${encodeURIComponent(redirectUrl)}` : "/sign-in"}
          className="font-bold text-lingo-blue hover:underline"
        >
          Sign In
        </Link>
      </p>
    </div>
  );
}
