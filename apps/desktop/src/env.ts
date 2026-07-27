import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_APP_URL: z.string().min(1).default("http://localhost:3000"),
    VITE_API_URL: z.string().min(1).default("http://localhost:3001"),
    VITE_SUPABASE_URL: z.string().min(1).optional(),
    VITE_SUPABASE_ANON_KEY: z.string().min(1).optional(),
    VITE_PRO_PRODUCT_ID: z.string().min(1).optional(),
    // Unlock Meeki Pro UI without Stripe (off by default for Meeki).
    VITE_FORCE_PRO: z
      .enum(["true", "false", "1", "0"])
      .optional()
      .transform((value) => value === "true" || value === "1"),
    // Comma-separated emails that get Pro client-side (also seed private.pro_grants for API/RLS).
    VITE_PRO_GRANT_EMAILS: z.string().optional(),
    // Prefer AssemblyAI for cloud STT instead of Meeki Pro.
    VITE_ASSEMBLYAI_API_KEY: z.string().min(1).optional(),
    VITE_ASSEMBLYAI_BASE_URL: z.string().url().optional(),
    // Venice AI (OpenAI-compatible) for private LLM analysis / interpretation.
    VITE_VENICE_API_KEY: z.string().min(1).optional(),
    VITE_VENICE_BASE_URL: z.string().url().optional(),
    VITE_VENICE_MODEL: z.string().min(1).optional(),
    VITE_SENTRY_DSN: z.string().min(1).optional(),
    VITE_POSTHOG_API_KEY: z.string().min(1).optional(),
    VITE_POSTHOG_HOST: z.string().min(1).default("https://us.i.posthog.com"),
    // Optional base for template/resource suggestions (no default — avoids meeki.org).
    VITE_RESOURCE_SUGGESTIONS_URL: z.string().url().optional(),
    VITE_APP_VERSION: z.string().min(1).optional(),
  },
  runtimeEnv: import.meta.env,
  emptyStringAsUndefined: true,
});
