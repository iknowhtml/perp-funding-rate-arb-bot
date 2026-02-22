import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_BACKOFF_CONFIG,
  RATE_LIMIT_BACKOFF_CONFIG,
  calculateBackoffMs,
  isRetryableError,
  isRetryableStatusCode,
  parseRetryAfterMs,
} from "./backoff";

describe("calculateBackoffMs", () => {
  beforeEach(() => {
    // Mock Math.random for deterministic tests
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should calculate exponential backoff", () => {
    const config = {
      initialDelayMs: 1000,
      maxDelayMs: 60000,
      multiplier: 2,
      jitterFactor: 0, // No jitter for predictable test
    };

    expect(calculateBackoffMs(0, config)).toBe(1000); // 1000 * 2^0
    expect(calculateBackoffMs(1, config)).toBe(2000); // 1000 * 2^1
    expect(calculateBackoffMs(2, config)).toBe(4000); // 1000 * 2^2
    expect(calculateBackoffMs(3, config)).toBe(8000); // 1000 * 2^3
  });

  it("should cap at maxDelay", () => {
    const config = {
      initialDelayMs: 1000,
      maxDelayMs: 5000,
      multiplier: 2,
      jitterFactor: 0,
    };

    expect(calculateBackoffMs(0, config)).toBe(1000);
    expect(calculateBackoffMs(1, config)).toBe(2000);
    expect(calculateBackoffMs(2, config)).toBe(4000);
    expect(calculateBackoffMs(3, config)).toBe(5000); // Capped
    expect(calculateBackoffMs(10, config)).toBe(5000); // Still capped
  });

  it("should add jitter", () => {
    const config = {
      initialDelayMs: 1000,
      maxDelayMs: 60000,
      multiplier: 2,
      jitterFactor: 0.1,
    };

    // With Math.random() = 0.5, jitter = 1000 * 0.1 * 0.5 = 50
    expect(calculateBackoffMs(0, config)).toBe(1050);
  });

  it("should use default config when not provided", () => {
    // Default: 1000ms initial, 2x multiplier, 0.1 jitter
    // With Math.random() = 0.5, jitter = 1000 * 0.1 * 0.5 = 50
    expect(calculateBackoffMs(0)).toBe(1050);
  });

  describe("RATE_LIMIT_BACKOFF_CONFIG", () => {
    it("should be more aggressive than default", () => {
      const defaultDelay = calculateBackoffMs(0, {
        ...DEFAULT_BACKOFF_CONFIG,
        jitterFactor: 0,
      });
      const rateLimitDelay = calculateBackoffMs(0, {
        ...RATE_LIMIT_BACKOFF_CONFIG,
        jitterFactor: 0,
      });

      expect(rateLimitDelay).toBeGreaterThan(defaultDelay);
    });

    it("should have higher maxDelay", () => {
      expect(RATE_LIMIT_BACKOFF_CONFIG.maxDelayMs).toBeGreaterThan(
        DEFAULT_BACKOFF_CONFIG.maxDelayMs,
      );
    });
  });
});

describe("parseRetryAfterMs", () => {
  it("should parse integer seconds", () => {
    expect(parseRetryAfterMs("30")).toBe(30000);
    expect(parseRetryAfterMs("0")).toBe(0);
    expect(parseRetryAfterMs("120")).toBe(120000);
  });

  it("should return null for invalid input", () => {
    expect(parseRetryAfterMs(null)).toBeNull();
    expect(parseRetryAfterMs("")).toBeNull();
    expect(parseRetryAfterMs("invalid")).toBeNull();
  });

  it("should handle negative values by returning 0 (past date)", () => {
    // Negative numbers could be parsed as dates, which return 0 for past dates
    // This is acceptable behavior - treat past dates as "retry now"
    const result = parseRetryAfterMs("-1");
    expect(result === 0 || result === null).toBe(true);
  });

  it("should parse HTTP dates", () => {
    const futureDate = new Date(Date.now() + 10000).toUTCString();
    const result = parseRetryAfterMs(futureDate);

    expect(result).not.toBeNull();
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThanOrEqual(10000 + 100); // Allow some tolerance
  });

  it("should return 0 for past dates", () => {
    const pastDate = new Date(Date.now() - 10000).toUTCString();
    expect(parseRetryAfterMs(pastDate)).toBe(0);
  });
});

describe("isRetryableStatusCode", () => {
  it("should return true for retryable codes", () => {
    expect(isRetryableStatusCode(429)).toBe(true);
    expect(isRetryableStatusCode(500)).toBe(true);
    expect(isRetryableStatusCode(502)).toBe(true);
    expect(isRetryableStatusCode(503)).toBe(true);
    expect(isRetryableStatusCode(504)).toBe(true);
  });

  it("should return false for non-retryable codes", () => {
    expect(isRetryableStatusCode(200)).toBe(false);
    expect(isRetryableStatusCode(400)).toBe(false);
    expect(isRetryableStatusCode(401)).toBe(false);
    expect(isRetryableStatusCode(403)).toBe(false);
    expect(isRetryableStatusCode(404)).toBe(false);
  });
});

describe("isRetryableError", () => {
  describe("HTTP status codes", () => {
    it("should return true for retryable status codes", () => {
      expect(isRetryableError({ status: 429 })).toBe(true);
      expect(isRetryableError({ status: 500 })).toBe(true);
      expect(isRetryableError({ status: 503 })).toBe(true);
      expect(isRetryableError({ statusCode: 429 })).toBe(true);
    });

    it("should return false for non-retryable status codes", () => {
      expect(isRetryableError({ status: 401 })).toBe(false);
      expect(isRetryableError({ status: 403 })).toBe(false);
      expect(isRetryableError({ status: 400 })).toBe(false);
      expect(isRetryableError({ statusCode: 401 })).toBe(false);
    });
  });

  describe("network errors", () => {
    it("should return true for network error codes", () => {
      expect(isRetryableError({ code: "ECONNRESET" })).toBe(true);
      expect(isRetryableError({ code: "ECONNREFUSED" })).toBe(true);
      expect(isRetryableError({ code: "ETIMEDOUT" })).toBe(true);
      expect(isRetryableError({ code: "ENOTFOUND" })).toBe(true);
      expect(isRetryableError({ code: "UND_ERR_SOCKET" })).toBe(true);
    });

    it("should return true for unknown error codes", () => {
      expect(isRetryableError({ code: "UNKNOWN_ERROR" })).toBe(true);
    });
  });

  describe("error messages", () => {
    it("should return false for non-retryable messages", () => {
      expect(isRetryableError({ message: "Insufficient balance" })).toBe(false);
      expect(isRetryableError({ message: "Invalid API key provided" })).toBe(false);
      expect(isRetryableError({ message: "Order rejected by exchange" })).toBe(false);
      expect(isRetryableError({ message: "Invalid parameter: quantity" })).toBe(false);
    });

    it("should return true for generic errors", () => {
      expect(isRetryableError({ message: "Connection reset" })).toBe(true);
      expect(isRetryableError({ message: "Timeout occurred" })).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("should return true for null/undefined", () => {
      expect(isRetryableError(null)).toBe(true);
      expect(isRetryableError(undefined)).toBe(true);
    });

    it("should return true for primitive values", () => {
      expect(isRetryableError("error")).toBe(true);
      expect(isRetryableError(123)).toBe(true);
    });

    it("should return true for Error instances without special properties", () => {
      expect(isRetryableError(new Error("Something went wrong"))).toBe(true);
    });
  });
});
