import * as v from "valibot";
import { type Env, envSchema } from "./schema";

export const parseEnv = (): Env => {
  try {
    return v.parse(envSchema, process.env);
  } catch (error) {
    if (v.isValiError(error)) {
      console.error("Environment variable validation failed:");
      for (const issue of error.issues) {
        const pathStr =
          issue.path?.map((p) => (typeof p === "string" ? p : String(p))).join(".") ?? "";
        const prefix = pathStr && !pathStr.includes("[object Object]") ? `${pathStr}: ` : "";
        console.error(`  - ${prefix}${issue.message}`);
      }
      process.exit(1);
    }
    throw error;
  }
};

// Lazy initialization to allow tests to set process.env before parsing
let cachedEnv: Env | undefined;

const isEnvKey = (key: string | symbol, env: Env): key is keyof Env => {
  return typeof key === "string" && key in env;
};

export const env: Env = new Proxy({} as Env, {
  get(_target, prop) {
    if (!cachedEnv) {
      cachedEnv = parseEnv();
    }
    if (isEnvKey(prop, cachedEnv)) {
      return cachedEnv[prop];
    }
    return undefined;
  },
});

// Export getEnv function for compatibility with existing code
export const getEnv = (): Env => {
  if (!cachedEnv) {
    cachedEnv = parseEnv();
  }
  return cachedEnv;
};

// Re-export types
export type { Env } from "./schema";
