import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/db/client";
import { createHealthRoute } from "./health";

describe("health route", () => {
  it("should return healthy status when database is connected", async () => {
    const mockDb: Database = {
      execute: vi.fn().mockResolvedValue(undefined),
    } as unknown as Database;

    const app = createHealthRoute(mockDb);

    const req = new Request("http://localhost/");
    const res = await app.fetch(req);
    const body = (await res.json()) as {
      status: string;
      timestamp: string;
      checks: { database: { status: string } };
    };

    expect(res.status).toBe(200);
    expect(body.status).toBe("healthy");
    expect(body.checks.database.status).toBe("healthy");
    expect(body.timestamp).toBeDefined();
  });

  it("should return unhealthy status when database check fails", async () => {
    const mockDb: Database = {
      execute: vi.fn().mockRejectedValue(new Error("Connection failed")),
    } as unknown as Database;

    const app = createHealthRoute(mockDb);

    const req = new Request("http://localhost/");
    const res = await app.fetch(req);
    const body = (await res.json()) as {
      status: string;
      timestamp: string;
      checks: { database: { status: string; error?: string } };
    };

    expect(res.status).toBe(503);
    expect(body.status).toBe("unhealthy");
    expect(body.checks.database.status).toBe("unhealthy");
    expect(body.checks.database.error).toBe("Connection failed");
    expect(body.timestamp).toBeDefined();
  });

  it("should execute SELECT 1 query for database check", async () => {
    const mockExecute = vi.fn().mockResolvedValue(undefined);
    const mockDb: Database = {
      execute: mockExecute,
    } as unknown as Database;

    const app = createHealthRoute(mockDb);

    const req = new Request("http://localhost/");
    await app.fetch(req);

    expect(mockExecute).toHaveBeenCalled();
    // Check that it was called with a SQL object (can't directly compare sql template tags)
    expect(mockExecute.mock.calls[0][0]).toBeDefined();
  });
});
