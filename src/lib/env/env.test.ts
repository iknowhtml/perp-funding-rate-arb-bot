import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset process.env before each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore original process.env after each test
    process.env = originalEnv;
  });

  const BASE_ENV = {
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/funding_rate_arb",
    PORT: "3000",
    NODE_ENV: "development" as const,
    ARBITRUM_RPC_URL: "https://arb1.arbitrum.io/rpc",
  };

  it("should parse valid environment variables", () => {
    process.env = {
      ...BASE_ENV,
      LOG_LEVEL: "debug",
    };

    const env = parseEnv();

    expect(env.DATABASE_URL).toBe("postgresql://postgres:postgres@localhost:5432/funding_rate_arb");
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe("development");
    expect(env.LOG_LEVEL).toBe("debug");
  });

  it("should parse environment variables without optional LOG_LEVEL", () => {
    process.env = {
      ...BASE_ENV,
      PORT: "8080",
      NODE_ENV: "production",
    };

    const env = parseEnv();

    expect(env.DATABASE_URL).toBe("postgresql://postgres:postgres@localhost:5432/funding_rate_arb");
    expect(env.PORT).toBe(8080);
    expect(env.NODE_ENV).toBe("production");
    expect(env.LOG_LEVEL).toBeUndefined();
  });

  it("should fail when DATABASE_URL is missing", () => {
    process.env = {
      PORT: "3000",
      NODE_ENV: "development",
      ARBITRUM_RPC_URL: "https://arb1.arbitrum.io/rpc",
    };

    expect(() => parseEnv()).toThrow();
  });

  it("should fail when DATABASE_URL is empty", () => {
    process.env = {
      ...BASE_ENV,
      DATABASE_URL: "",
    };

    expect(() => parseEnv()).toThrow();
  });

  it("should fail when PORT is missing", () => {
    const { PORT: _p, ...rest } = BASE_ENV;
    process.env = rest;

    expect(() => parseEnv()).toThrow();
  });

  it("should fail when PORT is not a number", () => {
    process.env = {
      ...BASE_ENV,
      PORT: "not-a-number",
    };

    expect(() => parseEnv()).toThrow();
  });

  it("should fail when PORT is less than 1", () => {
    process.env = {
      ...BASE_ENV,
      PORT: "0",
    };

    expect(() => parseEnv()).toThrow();
  });

  it("should fail when PORT is greater than 65535", () => {
    process.env = {
      ...BASE_ENV,
      PORT: "65536",
    };

    expect(() => parseEnv()).toThrow();
  });

  it("should fail when NODE_ENV is missing", () => {
    process.env = {
      DATABASE_URL: BASE_ENV.DATABASE_URL,
      PORT: BASE_ENV.PORT,
      ARBITRUM_RPC_URL: BASE_ENV.ARBITRUM_RPC_URL,
    };

    expect(() => parseEnv()).toThrow();
  });

  it("should fail when NODE_ENV is invalid", () => {
    process.env = {
      ...BASE_ENV,
      NODE_ENV: "invalid",
    };

    expect(() => parseEnv()).toThrow();
  });

  it("should fail when LOG_LEVEL is invalid", () => {
    process.env = {
      ...BASE_ENV,
      LOG_LEVEL: "invalid",
    };

    expect(() => parseEnv()).toThrow();
  });

  it("should accept valid LOG_LEVEL values", () => {
    const validLevels = ["debug", "info", "warn", "error"] as const;

    for (const level of validLevels) {
      process.env = {
        ...BASE_ENV,
        LOG_LEVEL: level,
      };

      const env = parseEnv();
      expect(env.LOG_LEVEL).toBe(level);
    }
  });

  it("should accept valid NODE_ENV values", () => {
    const validEnvs = ["development", "production", "test"] as const;

    for (const nodeEnv of validEnvs) {
      process.env = {
        ...BASE_ENV,
        NODE_ENV: nodeEnv,
      };

      const env = parseEnv();
      expect(env.NODE_ENV).toBe(nodeEnv);
    }
  });
});
