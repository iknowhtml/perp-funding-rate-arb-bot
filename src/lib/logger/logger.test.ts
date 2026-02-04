import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock config before importing logger
vi.mock("../config", () => ({
  config: {
    logging: {
      level: "debug",
    },
    server: {
      nodeEnv: "test",
    },
  },
}));

vi.mock("node:fs", () => ({
  createWriteStream: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock("node:path", () => ({
  join: vi.fn((...args) => args.join("/")),
}));

import { createRotatingLogStream, logger } from "./logger";

describe("logger", () => {
  it("should log info messages", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("test message");
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("should log error messages", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.error("test error", new Error("test"));
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it("should include context in logs", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("test message", { foo: "bar" });
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"foo":"bar"'));
    consoleSpy.mockRestore();
  });
});

describe("createRotatingLogStream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should create log directory if it does not exist", () => {
    vi.mocked(existsSync).mockReturnValue(false);

    createRotatingLogStream();

    expect(existsSync).toHaveBeenCalledWith("logs");
    expect(mkdirSync).toHaveBeenCalledWith("logs", { recursive: true });
  });

  it("should not create log directory if it exists", () => {
    vi.mocked(existsSync).mockReturnValue(true);

    createRotatingLogStream();

    expect(existsSync).toHaveBeenCalledWith("logs");
    expect(mkdirSync).not.toHaveBeenCalled();
  });

  it("should create a write stream with correct filename", () => {
    const mockDate = 1234567890000;
    vi.setSystemTime(mockDate);

    createRotatingLogStream();

    expect(createWriteStream).toHaveBeenCalledWith(`logs/app-${mockDate}.log`, { flags: "a" });
  });
});
