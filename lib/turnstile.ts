const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

interface TurnstileResult {
  success: boolean;
  errorCodes?: string[];
}

/**
 * Verify a Cloudflare Turnstile token server-side.
 * If TURNSTILE_SECRET_KEY is not set, validation is skipped (for local dev).
 */
export async function verifyTurnstileToken(
  token: string
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    // Skip validation in development when no secret is configured
    return { success: true };
  }

  if (!token) {
    return { success: false, errorCodes: ["missing-input-response"] };
  }

  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token }),
    });

    const result = await response.json();

    return {
      success: result.success === true,
      errorCodes: result["error-codes"],
    };
  } catch {
    return { success: false, errorCodes: ["internal-error"] };
  }
}
