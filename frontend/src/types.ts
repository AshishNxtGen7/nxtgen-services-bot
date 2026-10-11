import { z } from "zod";

export const ProviderIdSchema = z.enum(["speedcloud", "aws", "azure", "gcp"]);
export const ProfileIdSchema = z.enum(["india-first", "ai-gpu"]);
export const EvidenceSourceSchema = z.object({
  id: z.string(),
  providerId: ProviderIdSchema,
  title: z.string(),
  url: z.string().url().optional(),
  excerpt: z.string(),
  capturedAt: z.string(),
  kind: z.enum(["official-web", "uploaded-pdf", "catalog"]),
});
export const ClaimSchema = z.object({ statement: z.string(), sourceIds: z.array(z.string()) });
export const PerformanceMeasurementSchema = z.object({
  metric: z.enum(["latency", "throughput", "iops", "tokens_per_second", "requests_per_second"]),
  value: z.number().nonnegative(),
  unit: z.string().min(1),
  loadValue: z.number().nonnegative(),
  loadUnit: z.string().min(1),
  testContext: z.string().min(1),
  sourceIds: z.array(z.string()),
});
export const PublishedPriceObservationSchema = z.object({
  amount: z.number().nonnegative(),
  currency: z.string().min(1),
  unit: z.string().min(1),
  priceType: z.enum(["public_list", "starting_at", "calculator_estimate", "free_tier"]),
  publishedDate: z.string(),
  configuration: z.string(),
  region: z.string(),
  assumptions: z.string(),
  sourceIds: z.array(z.string()),
});
export const ServiceResearchSchema = z.object({
  serviceName: z.string(),
  category: z.string(),
  fit: ClaimSchema,
  specifications: z.array(ClaimSchema),
  pricing: z.array(ClaimSchema),
  // Keep the UI compatible with API instances that have not yet been restarted
  // after published price observations were added to the response.
  publishedPrices: z.array(PublishedPriceObservationSchema).default([]),
  availability: z.array(ClaimSchema),
  supportAndSla: z.array(ClaimSchema),
  limitations: z.array(ClaimSchema),
  // Most provider pages don't publish comparable benchmarks, and older API
  // instances omit this field entirely. Treat either case as no measurements.
  performanceMetrics: z.array(PerformanceMeasurementSchema).default([]),
});
export const ProviderResearchSchema = z.object({
  providerId: ProviderIdSchema,
  providerName: z.string(),
  status: z.enum(["searched", "no_results", "not_configured", "failed"]),
  searchedAt: z.string(),
  searchQueries: z.array(z.string()),
  services: z.array(ServiceResearchSchema),
  sources: z.array(EvidenceSourceSchema),
  note: z.string().optional(),
});
export const ComparisonCellSchema = z.object({ value: z.string(), sourceIds: z.array(z.string()) });
export const ComparisonRowSchema = z.object({
  dimension: z.string(),
  values: z.object({
    speedcloud: ComparisonCellSchema,
    aws: ComparisonCellSchema,
    azure: ComparisonCellSchema,
    gcp: ComparisonCellSchema,
  }),
});
export const RecommendationInputSchema = z.object({
  requirement: z.string().trim().min(8, "Describe the workload in at least 8 characters.").max(4000, "Keep the requirement under 4,000 characters."),
});
export const RecommendationReportSchema = z.object({
  generatedAt: z.string(),
  requirement: z.string(),
  analysis: z.object({
    problemSummary: z.string(),
    workloadType: z.string(),
    requestedServices: z.array(z.string()),
    supportingServices: z.array(z.string()),
    architectureComponents: z.array(z.object({
      name: z.string(),
      role: z.string(),
      rationale: z.string(),
      priority: z.enum(["core", "recommended", "conditional"]),
      searchTerms: z.array(z.string()),
    })),
    mustHaveConstraints: z.array(z.string()),
    evaluationCriteria: z.array(z.string()),
  }),
  profile: z.object({
    id: ProfileIdSchema,
    name: z.string(),
    description: z.string(),
    weights: z.record(z.string(), z.number()),
    version: z.string(),
  }),
  executiveSummary: ClaimSchema,
  recommendation: ClaimSchema,
  tradeoffs: z.array(ClaimSchema),
  provisional: z.boolean(),
  evidenceCoverage: z.string(),
  providers: z.array(ProviderResearchSchema),
  comparison: z.array(ComparisonRowSchema),
  reportMarkdown: z.string(),
  sources: z.array(EvidenceSourceSchema),
  llmEnabled: z.boolean(),
  searchEnabled: z.boolean(),
  reportUrl: z.string().startsWith("/reports/"),
  pdfFileName: z.string().endsWith(".pdf"),
});
export const ApiErrorSchema = z.object({ error: z.string().optional() });

export type ProviderId = z.infer<typeof ProviderIdSchema>;
export type ProfileId = z.infer<typeof ProfileIdSchema>;
export type RecommendationReport = z.infer<typeof RecommendationReportSchema>;
export type ProviderResearch = z.infer<typeof ProviderResearchSchema>;
export type ComparisonRow = z.infer<typeof ComparisonRowSchema>;
export type EvidenceSource = z.infer<typeof EvidenceSourceSchema>;
export type Claim = z.infer<typeof ClaimSchema>;

export const providers = [
  { id: "speedcloud", name: "NxtGen SpeedCloud and SpeedCloud Supreme", shortName: "SpeedCloud + Supreme", mark: "N", tone: "violet" },
  { id: "gcp", name: "Google Cloud", shortName: "Google Cloud", mark: "G", tone: "emerald" },
  { id: "aws", name: "Amazon Web Services", shortName: "AWS", mark: "a", tone: "amber" },
  { id: "azure", name: "Microsoft Azure", shortName: "Azure", mark: "A", tone: "sky" },
] as const satisfies ReadonlyArray<{ id: ProviderId; name: string; shortName: string; mark: string; tone: string }>;
