import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? "";
}

function optional(name: string): string {
  return process.env[name] ?? "";
}

export const env = {
  // Only needed for the optional "Sign in with Kimi" OAuth flow.
  // The app works fully with the password gate without them.
  appId: optional("APP_ID"),
  appSecret: optional("APP_SECRET"),
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: required("DATABASE_URL"),
  kimiAuthUrl: optional("KIMI_AUTH_URL"),
  kimiOpenUrl: optional("KIMI_OPEN_URL"),
  ownerUnionId: optional("OWNER_UNION_ID"),
};
