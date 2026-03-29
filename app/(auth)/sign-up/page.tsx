import { SignUpForm } from "@/components/auth/sign-up-form";

interface PageProps {
  searchParams: Promise<{ redirect?: string }>;
}

export default async function SignUpPage({ searchParams }: PageProps) {
  const { redirect } = await searchParams;

  return (
    <>
      <h2 className="mb-6 text-center text-2xl font-bold text-lingo-text">
        Start learning for free!
      </h2>
      <SignUpForm redirectUrl={redirect} />
    </>
  );
}
