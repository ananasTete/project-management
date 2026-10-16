import { sharedServerSchema } from "@stack/shared";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    ...sharedServerSchema,
    // API 本地开发用 PGLite，不需要 DATABASE_URL
    DATABASE_URL: z.string().url().optional(),
    PORT: z.coerce.number().default(3000),
    BETTER_AUTH_SECRET: z.string().min(1),
    BETTER_AUTH_URL: z.string().url(),
  },
  clientPrefix: "PUBLIC_",
  client: {},
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    PORT: process.env.PORT,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  },
});
