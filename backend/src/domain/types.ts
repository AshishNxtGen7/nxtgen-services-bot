export const providerIds = ["speedcloud", "aws", "azure", "gcp"] as const;

export type ProviderId = (typeof providerIds)[number];
export type ProfileId = "india-first" | "ai-gpu";
export type EvidenceState = "reviewed" | "unreviewed" | "unknown";

export interface PriorityProfile {
  id: ProfileId;
  name: string;
  description: string;
  weights: Record<string, number>;
  version: string;
}

export interface EvidenceChunk {
  text: string;
  source: string;
  providerId?: ProviderId;
  page?: number;
  capturedAt?: string;
  ingestedAt: string;
  state: EvidenceState;
}

export interface ProviderFinding {
  providerId: ProviderId;
  providerName: string;
  status: "evidence found" | "needs verification" | "no retrieved evidence";
  summary: string;
  evidence: EvidenceChunk[];
}

export interface RequirementAnalysis {
  problemSummary: string;
  workloadType: string;
  /** Business capability the client wants to build or run, not a cloud SKU. */
  requestedServices: string[];
  supportingServices: string[];
  architectureComponents: ArchitectureComponent[];
  mustHaveConstraints: string[];
  evaluationCriteria: string[];
}

export interface ArchitectureComponent {
  name: string;
  role: string;
  rationale: string;
  priority: "core" | "recommended" | "conditional";
  searchTerms: string[];
}

export interface ResearchSource {
  id: string;
  providerId: ProviderId;
  title: string;
  url?: string;
  excerpt: string;
  capturedAt: string;
  kind: "official-web" | "uploaded-pdf" | "catalog";
}

export interface ResearchClaim {
  statement: string;
  sourceIds: string[];
}

export type PerformanceMetricName = "latency" | "throughput" | "iops" | "tokens_per_second" | "requests_per_second";

export interface PerformanceMeasurement {
  metric: PerformanceMetricName;
  value: number;
  unit: string;
  loadValue: number;
  loadUnit: string;
  testContext: string;
  sourceIds: string[];
}

export interface PublishedPriceObservation {
  amount: number;
  currency: string;
  unit: string;
  priceType: "public_list" | "starting_at" | "calculator_estimate" | "free_tier";
  publishedDate: string;
  configuration: string;
  region: string;
  assumptions: string;
  sourceIds: string[];
}

export interface ServiceResearch {
  serviceName: string;
  category: string;
  fit: ResearchClaim;
  specifications: ResearchClaim[];
  pricing: ResearchClaim[];
  publishedPrices: PublishedPriceObservation[];
  availability: ResearchClaim[];
  supportAndSla: ResearchClaim[];
  limitations: ResearchClaim[];
  performanceMetrics: PerformanceMeasurement[];
}

export interface ProviderResearch {
  providerId: ProviderId;
  providerName: string;
  status: "searched" | "no_results" | "not_configured" | "failed";
  searchedAt: string;
  searchQueries: string[];
  services: ServiceResearch[];
  sources: ResearchSource[];
  note?: string;
}

export interface ComparisonCell {
  value: string;
  sourceIds: string[];
}

export interface SynthesisClaim {
  statement: string;
  sourceIds: string[];
}

export interface ComparisonRow {
  dimension: string;
  values: Record<ProviderId, ComparisonCell>;
}

export interface RecommendationReport {
  generatedAt: string;
  requirement: string;
  analysis: RequirementAnalysis;
  profile: PriorityProfile;
  executiveSummary: SynthesisClaim;
  recommendation: SynthesisClaim;
  tradeoffs: SynthesisClaim[];
  provisional: boolean;
  evidenceCoverage: string;
  providers: ProviderResearch[];
  comparison: ComparisonRow[];
  reportMarkdown: string;
  sources: ResearchSource[];
  llmEnabled: boolean;
  searchEnabled: boolean;
  reportUrl: string;
  pdfFileName: string;
}

export const providerNames: Record<ProviderId, string> = {
  speedcloud: "NxtGen SpeedCloud",
  aws: "Amazon Web Services",
  azure: "Microsoft Azure",
  gcp: "Google Cloud",
};

export const profiles: Record<ProfileId, PriorityProfile> = {
  "india-first": {
    id: "india-first",
    name: "India-first enterprise",
    description: "Location, workload fit, cost, support, and portability priorities from the PRD.",
    version: "1.0.0",
    weights: {
      "Sovereignty / location": 0.3,
      "Workload fit": 0.25,
      TCO: 0.2,
      Support: 0.15,
      "Open-source / portability": 0.1,
    },
  },
  "ai-gpu": {
    id: "ai-gpu",
    name: "AI and GPU workloads",
    description: "Accelerator fit, location, cost, portability, and support priorities from the PRD.",
    version: "1.0.0",
    weights: {
      "Accelerator / workload fit": 0.35,
      "Sovereignty / location": 0.2,
      TCO: 0.2,
      "Open-source / portability": 0.15,
      Support: 0.1,
    },
  },
};
