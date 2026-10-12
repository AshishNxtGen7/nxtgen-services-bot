import type { FastifyInstance, FastifyRequest } from "fastify";

const durationBucketsSeconds = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

type RequestObservation = {
  method: string;
  route: string;
  startedAt: number;
};

type RequestTotals = {
  count: number;
};

type DurationTotals = {
  buckets: number[];
  count: number;
  sum: number;
};

const requestTotals = new Map<string, RequestTotals>();
const durationTotals = new Map<string, DurationTotals>();
const inFlight = new Map<string, number>();
const requestObservations = new WeakMap<FastifyRequest, RequestObservation>();

export function registerPrometheusMetrics(server: FastifyInstance): void {
  server.addHook("onRequest", async (request) => {
    if (isMetricsRequest(request)) return;

    const observation = getRequestObservation(request);
    requestObservations.set(request, observation);
    const key = labelsKey(observation.method, observation.route);
    inFlight.set(key, (inFlight.get(key) ?? 0) + 1);
  });

  server.addHook("onResponse", async (request, reply) => {
    const observation = requestObservations.get(request);
    if (!observation) return;

    const elapsedSeconds = Math.max(0, (performance.now() - observation.startedAt) / 1000);
    const requestKey = labelsKey(observation.method, observation.route, String(reply.statusCode));
    const totals = requestTotals.get(requestKey) ?? { count: 0 };
    totals.count += 1;
    requestTotals.set(requestKey, totals);

    const durationKey = labelsKey(observation.method, observation.route);
    const duration = durationTotals.get(durationKey) ?? {
      buckets: durationBucketsSeconds.map(() => 0),
      count: 0,
      sum: 0,
    };
    duration.buckets = duration.buckets.map((value, index) =>
      elapsedSeconds <= durationBucketsSeconds[index]! ? value + 1 : value,
    );
    duration.count += 1;
    duration.sum += elapsedSeconds;
    durationTotals.set(durationKey, duration);

    const active = inFlight.get(durationKey) ?? 0;
    if (active <= 1) inFlight.delete(durationKey);
    else inFlight.set(durationKey, active - 1);
  });

  server.get("/metrics", async (_request, reply) => {
    reply.header("content-type", "text/plain; version=0.0.4; charset=utf-8");
    return renderMetrics();
  });
}

function getRequestObservation(request: FastifyRequest): RequestObservation {
  return {
    method: request.method,
    route: request.routeOptions.url ?? "unmatched",
    startedAt: performance.now(),
  };
}

function isMetricsRequest(request: FastifyRequest): boolean {
  return request.url.split("?", 1)[0] === "/metrics";
}

function labelsKey(...labels: string[]): string {
  return JSON.stringify(labels);
}

function escapeLabel(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll('"', '\\"');
}

function renderMetrics(): string {
  const lines = [
    "# HELP nxtgen_api_http_requests_total Total HTTP requests completed.",
    "# TYPE nxtgen_api_http_requests_total counter",
  ];

  for (const [key, totals] of requestTotals) {
    const [method, route, statusCode] = JSON.parse(key) as [string, string, string];
    lines.push(
      `nxtgen_api_http_requests_total{method="${escapeLabel(method)}",route="${escapeLabel(route)}",status_code="${escapeLabel(statusCode)}"} ${totals.count}`,
    );
  }

  lines.push(
    "# HELP nxtgen_api_http_request_duration_seconds HTTP request duration in seconds.",
    "# TYPE nxtgen_api_http_request_duration_seconds histogram",
  );
  for (const [key, totals] of durationTotals) {
    const [method, route] = JSON.parse(key) as [string, string];
    const labels = `method="${escapeLabel(method)}",route="${escapeLabel(route)}"`;
    durationBucketsSeconds.forEach((bucket, index) => {
      lines.push(
        `nxtgen_api_http_request_duration_seconds_bucket{${labels},le="${bucket}"} ${totals.buckets[index]}`,
      );
    });
    lines.push(
      `nxtgen_api_http_request_duration_seconds_bucket{${labels},le="+Inf"} ${totals.count}`,
      `nxtgen_api_http_request_duration_seconds_sum{${labels}} ${totals.sum}`,
      `nxtgen_api_http_request_duration_seconds_count{${labels}} ${totals.count}`,
    );
  }

  lines.push(
    "# HELP nxtgen_api_http_requests_in_flight HTTP requests currently being processed.",
    "# TYPE nxtgen_api_http_requests_in_flight gauge",
  );
  for (const [key, count] of inFlight) {
    const [method, route] = JSON.parse(key) as [string, string];
    lines.push(
      `nxtgen_api_http_requests_in_flight{method="${escapeLabel(method)}",route="${escapeLabel(route)}"} ${count}`,
    );
  }

  return `${lines.join("\n")}\n`;
}
