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

  it("should parse valid environment variables", () => {
    process.env = {
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/funding_rate_arb",
      PORT: "3000",
      NODE_ENV: "development",
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
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/funding_rate_arb",
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
    };

    expect(() => parseEnv()).toThrow();
  });

  it("should fail when DATABASE_URL is empty", () => {
    process.env = {
      DATABASE_URL: "",
      PORT: "3000",
      NODE_ENV: "development",
    };

    expect(() => parseEnv()).toThrow();
  });

  it("should fail when PORT is missing", () => {
    process.env = {
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/funding_rate_arb",
      NODE_ENV: "development",
    };

    expect(() => parseEnv()).toThrow();
  });

  it("should fail when PORT is not a number", () => {
    process.env = {
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/funding_rate_arb",
      PORT: "not-a-number",
      NODE_ENV: "development",
    };

    expect(() => parseEnv()).toThrow();
  });

  it("should fail when PORT is less than 1", () => {
    process.env = {
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/funding_rate_arb",
      PORT: "0",
      NODE_ENV: "development",
    };

    expect(() => parseEnv()).toThrow();
  });

  it("should fail when PORT is greater than 65535", () => {
    process.env = {
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/funding_rate_arb",
      PORT: "65536",
      NODE_ENV: "development",
    };

    expect(() => parseEnv()).toThrow();
  });

  it("should fail when NODE_ENV is missing", () => {
    process.env = {
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/funding_rate_arb",
      PORT: "3000",
    };

    expect(() => parseEnv()).toThrow();
  });

  it("should fail when NODE_ENV is invalid", () => {
    process.env = {
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/funding_rate_arb",
      PORT: "3000",
      NODE_ENV: "invalid",
    };

    expect(() => parseEnv()).toThrow();
  });

  it("should fail when LOG_LEVEL is invalid", () => {
    process.env = {
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/funding_rate_arb",
      PORT: "3000",
      NODE_ENV: "development",
      LOG_LEVEL: "invalid",
    };

    expect(() => parseEnv()).toThrow();
  });

  it("should accept valid LOG_LEVEL values", () => {
    const validLevels = ["debug", "info", "warn", "error"] as const;

    for (const level of validLevels) {
      process.env = {
        DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/funding_rate_arb",
        PORT: "3000",
        NODE_ENV: "development",
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
        DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/funding_rate_arb",
        PORT: "3000",
        NODE_ENV: nodeEnv,
      };

      const env = parseEnv();
      expect(env.NODE_ENV).toBe(nodeEnv);
    }
  });
});
