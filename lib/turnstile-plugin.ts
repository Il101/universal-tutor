import type { BetterAuthPlugin } from "better-auth";
import { APIError } from "better-auth/api";
import { verifyTurnstileToken } from "./turnstile";

export const turnstilePlugin = () => {
  return {
    id: "turnstile",
    hooks: {
      before: [
        {
          matcher: (context) => {
            return (
              context.path === "/sign-in/email" ||
              context.path === "/sign-up/email"
            );
          },
          handler: async (ctx) => {
            const token = ctx.request 
              ? ctx.request.headers.get("x-turnstile-token") 
              : ctx.headers instanceof Headers 
                ? ctx.headers.get("x-turnstile-token")
                : Array.isArray(ctx.headers)
                  ? (ctx.headers.find(([k]) => k.toLowerCase() === "x-turnstile-token")?.[1] ?? "")
                  : (ctx.headers as Record<string, string>)["x-turnstile-token"] ?? "";

            const result = await verifyTurnstileToken(token ?? "");

            if (!result.success) {
              throw new APIError("BAD_REQUEST", {
                message: "Turnstile verification failed",
              });
            }
          },
        },
      ],
    },
  } satisfies BetterAuthPlugin;
};
