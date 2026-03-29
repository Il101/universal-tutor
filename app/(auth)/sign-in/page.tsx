import { SignInForm } from "@/components/auth/sign-in-form";

interface PageProps {
  searchParams: Promise<{ redirect?: string }>;
}

export default async function SignInPage({ searchParams }: PageProps) {
  const { redirect } = await searchParams;

  return (
    <>
      <h2 className="mb-6 text-center text-2xl font-bold text-lingo-text">
        Welcome back!
      </h2>
      <SignInForm redirectUrl={redirect} />
    </>
  );
}
