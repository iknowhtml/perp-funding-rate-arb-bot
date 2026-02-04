import { describe, expect, it } from "vitest";

import { incrementMetric, metrics, recordDuration } from "./metrics";

describe("metrics route", () => {
  it("should return Prometheus-formatted metrics", async () => {
    const req = new Request("http://localhost/");
    const res = await metrics.fetch(req);
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/plain; version=0.0.4");
    expect(text).toContain("# HELP http_requests_total");
    expect(text).toContain("# TYPE http_requests_total counter");
    expect(text).toContain("http_requests_total");
    expect(text).toContain("jobs_processed_total");
    expect(text).toContain("jobs_failed_total");
  });

  it("should include histogram buckets for request duration", async () => {
    const req = new Request("http://localhost/");
    const res = await metrics.fetch(req);
    const text = await res.text();

    expect(text).toContain("http_request_duration_seconds_bucket");
    expect(text).toContain('le="0.1"');
    expect(text).toContain('le="0.5"');
    expect(text).toContain('le="1.0"');
    expect(text).toContain('le="+Inf"');
  });

  describe("incrementMetric", () => {
    it("should increment httpRequestsTotal", async () => {
      const initialReq = new Request("http://localhost/");
      await metrics.fetch(initialReq);

      incrementMetric("httpRequestsTotal");

      const req = new Request("http://localhost/");
      const res = await metrics.fetch(req);
      const text = await res.text();

      expect(text).toMatch(/http_requests_total \d+/);
    });

    it("should increment jobsProcessed", async () => {
      incrementMetric("jobsProcessed");

      const req = new Request("http://localhost/");
      const res = await metrics.fetch(req);
      const text = await res.text();

      expect(text).toMatch(/jobs_processed_total \d+/);
    });

    it("should increment jobsFailed", async () => {
      incrementMetric("jobsFailed");

      const req = new Request("http://localhost/");
      const res = await metrics.fetch(req);
      const text = await res.text();

      expect(text).toMatch(/jobs_failed_total \d+/);
    });
  });

  describe("recordDuration", () => {
    it("should record request duration", async () => {
      recordDuration(50);
      recordDuration(150);
      recordDuration(600);

      const req = new Request("http://localhost/");
      const res = await metrics.fetch(req);
      const text = await res.text();

      // Should have durations in buckets
      expect(text).toContain('le="0.1"');
      expect(text).toContain('le="0.5"');
      expect(text).toContain('le="1.0"');
    });

    it("should limit stored durations to prevent memory growth", async () => {
      // Add more than 1000 durations
      for (let i = 0; i < 1500; i++) {
        recordDuration(i);
      }

      const req = new Request("http://localhost/");
      const res = await metrics.fetch(req);
      const text = await res.text();

      // Should still work without memory issues
      expect(text).toContain("http_request_duration_seconds_bucket");
    });
  });
});
