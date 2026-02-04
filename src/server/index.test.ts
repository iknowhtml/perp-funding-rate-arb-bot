import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "../lib/db/client";
import type { Logger } from "../lib/logger/logger";
import { startHttpServer } from "./index";

// Mock @hono/node-server
const mockServer = {
  close: vi.fn((callback: () => void) => {
    callback();
  }),
};

vi.mock("@hono/node-server", () => ({
  serve: vi.fn((_options: unknown, callback: (info: { port: number }) => void) => {
    callback({ port: 8080 });
    return mockServer;
  }),
}));

describe("startHttpServer", () => {
  const mockLogger: Logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const mockDb: Database = {
    execute: vi.fn(),
  } as unknown as Database;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Cleanup if needed
  });

  it("should start server and return server instance", async () => {
    const server = await startHttpServer({
      port: 8080,
      logger: mockLogger,
      db: mockDb,
    });

    expect(server).toBeDefined();
    expect(server.port).toBe(8080);
    expect(typeof server.close).toBe("function");
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("HTTP server listening"));
  });

  it("should close server gracefully", async () => {
    const server = await startHttpServer({
      port: 8080,
      logger: mockLogger,
      db: mockDb,
    });

    await server.close();

    expect(mockServer.close).toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith("HTTP server closed");
  });
});
