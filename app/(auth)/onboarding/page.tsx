import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth-server";
import { getTargetLanguage } from "@/lib/actions/preferences";
import { getNativeLanguage } from "@/lib/actions/profile";
import { DEFAULT_PATH } from "@/lib/constants";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) {
    redirect("/sign-in");
  }

  const userId = session.user.id;
  const [targetLanguage, nativeLanguage] = await Promise.all([
    getTargetLanguage(userId),
    getNativeLanguage(userId),
  ]);

  if (targetLanguage && nativeLanguage) {
    redirect(DEFAULT_PATH);
  }

  return <OnboardingForm nativeLanguage={nativeLanguage} />;
}
