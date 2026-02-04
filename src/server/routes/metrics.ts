import { Hono } from "hono";

const metrics = new Hono();

// Simple metrics store (in production, use prom-client)
const metricsStore = {
  httpRequestsTotal: 0,
  httpRequestDuration: [] as number[],
  jobsProcessed: 0,
  jobsFailed: 0,
};

metrics.get("/", (c) => {
  const prometheusFormat = `
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total ${metricsStore.httpRequestsTotal}

# HELP http_request_duration_seconds HTTP request duration in seconds
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{le="0.1"} ${metricsStore.httpRequestDuration.filter((d) => d < 100).length}
http_request_duration_seconds_bucket{le="0.5"} ${metricsStore.httpRequestDuration.filter((d) => d < 500).length}
http_request_duration_seconds_bucket{le="1.0"} ${metricsStore.httpRequestDuration.filter((d) => d < 1000).length}
http_request_duration_seconds_bucket{le="+Inf"} ${metricsStore.httpRequestDuration.length}

# HELP jobs_processed_total Total number of jobs processed
# TYPE jobs_processed_total counter
jobs_processed_total ${metricsStore.jobsProcessed}

# HELP jobs_failed_total Total number of failed jobs
# TYPE jobs_failed_total counter
jobs_failed_total ${metricsStore.jobsFailed}
`.trim();

  return c.text(prometheusFormat, 200, {
    "Content-Type": "text/plain; version=0.0.4",
  });
});

export const incrementMetric = (
  metric: "httpRequestsTotal" | "jobsProcessed" | "jobsFailed",
): void => {
  metricsStore[metric]++;
};

export const recordDuration = (durationMs: number): void => {
  metricsStore.httpRequestDuration.push(durationMs);
  // Keep only last 1000 durations to prevent memory growth
  if (metricsStore.httpRequestDuration.length > 1000) {
    metricsStore.httpRequestDuration.shift();
  }
};

export { metrics };
