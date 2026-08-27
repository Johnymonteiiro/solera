import type { Config } from "drizzle-kit";

// drizzle-kit não carrega .env.local sozinho — rode via dotenv-cli:
//   pnpm db:push   (ver scripts no package.json)
export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
} satisfies Config;
