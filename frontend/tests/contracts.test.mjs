import assert from "node:assert/strict";
import test from "node:test";
import {
  RecommendationInputSchema,
  RecommendationReportSchema,
  ServiceResearchSchema,
} from "../src/types.ts";

test("frontend requirement validation trims input and enforces the backend limits", () => {
  assert.deepEqual(
    RecommendationInputSchema.parse({ requirement: "  Build a secure data platform  " }),
    { requirement: "Build a secure data platform" },
  );
  assert.equal(RecommendationInputSchema.safeParse({ requirement: "a".repeat(8) }).success, true);
  assert.equal(RecommendationInputSchema.safeParse({ requirement: "a".repeat(4000) }).success, true);
  assert.equal(RecommendationInputSchema.safeParse({ requirement: "short" }).success, false);
  assert.equal(RecommendationInputSchema.safeParse({ requirement: "a".repeat(4001) }).success, false);
});

test("service response contracts default optional observations for older API responses", () => {
  const parsed = ServiceResearchSchema.parse({
    serviceName: "Managed database",
    category: "database",
    fit: { statement: "Supports the workload", sourceIds: [] },
    specifications: [],
    pricing: [],
    availability: [],
    supportAndSla: [],
    limitations: [],
  });

  assert.deepEqual(parsed.publishedPrices, []);
  assert.deepEqual(parsed.performanceMetrics, []);
});

test("report contract accepts a minimal valid report and rejects an invalid report URL", () => {
  const report = {
    generatedAt: "2026-10-01T12:00:00.000Z",
    requirement: "Build a secure data platform",
    analysis: {
      problemSummary: "A secure platform is required.",
      workloadType: "data platform",
      requestedServices: [],
      supportingServices: [],
      architectureComponents: [],
      mustHaveConstraints: [],
      evaluationCriteria: [],
    },
    profile: {
      id: "india-first",
      name: "India-first enterprise",
      description: "Location and workload fit first.",
      weights: { location: 1 },
      version: "1.0.0",
    },
    executiveSummary: { statement: "Review the available evidence.", sourceIds: [] },
    recommendation: { statement: "Validate requirements with providers.", sourceIds: [] },
    tradeoffs: [],
    provisional: true,
    evidenceCoverage: "No provider evidence was retrieved.",
    providers: [],
    comparison: [],
    reportMarkdown: "No evidence yet.",
    sources: [],
    llmEnabled: false,
    searchEnabled: false,
    reportUrl: "/reports/report.pdf",
    pdfFileName: "report.pdf",
  };

  assert.equal(RecommendationReportSchema.safeParse(report).success, true);
  assert.equal(RecommendationReportSchema.safeParse({ ...report, reportUrl: "https://example.com/report.pdf" }).success, false);
});
