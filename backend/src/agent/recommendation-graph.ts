import { ChatPromptTemplate } from "@langchain/core/prompts";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { TavilySearch } from "@langchain/tavily";
import { z } from "zod";
import type {
  ComparisonCell,
  ComparisonRow,
  ArchitectureComponent,
  EvidenceChunk,
  ProfileId,
  ProviderId,
  ProviderResearch,
  PerformanceMeasurement,
  PublishedPriceObservation,
  RecommendationReport,
  ResearchClaim,
  ResearchSource,
  RequirementAnalysis,
  ServiceResearch,
  SynthesisClaim,
} from "../domain/types.js";
import { profiles, providerIds, providerNames } from "../domain/types.js";
import { CatalogStore } from "../catalog/catalog-store.js";
import { KnowledgeStore } from "../knowledge/store.js";
import { createPdfReport } from "../reports/pdf-report.js";
import {
  comparisonSynthesisSystemPrompt,
  providerResearchSystemPrompt,
  requirementAnalysisSystemPrompt,
} from "./prompts.js";

const inputSchema = z.object({
  requirement: z.string().trim().min(8).max(4000),
  profileId: z.enum(["india-first", "ai-gpu"]).default("india-first"),
});
const requirementAnalysisSchema = z.object({
  problemSummary: z.string().min(1),
  workloadType: z.string().min(1),
  requestedServices: z.array(z.string().min(1)).max(10),
  supportingServices: z.array(z.string().min(1)).max(10),
  architectureComponents: z.array(z.object({
    name: z.string().min(1),
    role: z.string().min(1),
    rationale: z.string().min(1),
    priority: z.enum(["core", "recommended", "conditional"]),
    searchTerms: z.array(z.string().min(1)).min(1).max(8),
  })).min(1).max(16),
  mustHaveConstraints: z.array(z.string().min(1)).max(15),
  evaluationCriteria: z.array(z.string().min(1)).max(12),
});
const researchClaimSchema = z.object({ statement: z.string().min(1), sourceIds: z.array(z.string()).min(1) });
const performanceMeasurementSchema = z.object({
  metric: z.enum(["latency", "throughput", "iops", "tokens_per_second", "requests_per_second"]),
  value: z.number().nonnegative(),
  unit: z.string().min(1),
  loadValue: z.number().nonnegative(),
  loadUnit: z.string().min(1),
  testContext: z.string().min(1),
  sourceIds: z.array(z.string()).min(1),
});
const publishedPriceSchema = z.object({
  amount: z.number().nonnegative(),
  currency: z.string().min(1),
  unit: z.string().min(1),
  priceType: z.enum(["public_list", "starting_at", "calculator_estimate", "free_tier"]),
  publishedDate: z.string(),
  configuration: z.string(),
  region: z.string(),
  assumptions: z.string(),
  sourceIds: z.array(z.string()).min(1),
});
const serviceResearchSchema = z.object({
  serviceName: z.string().min(1),
  category: z.string().min(1),
  fit: researchClaimSchema,
  specifications: z.array(researchClaimSchema).max(12),
  pricing: z.array(researchClaimSchema).max(16),
  publishedPrices: z.array(publishedPriceSchema).max(16).default([]),
  availability: z.array(researchClaimSchema).max(8),
  supportAndSla: z.array(researchClaimSchema).max(8),
  limitations: z.array(researchClaimSchema).max(8),
  performanceMetrics: z.array(performanceMeasurementSchema).max(12).default([]),
});
const providerAgentOutputSchema = z.object({
  services: z.array(serviceResearchSchema).max(16),
  notes: z.array(z.string()).max(8),
});
const synthesisClaimSchema = z.object({ statement: z.string().min(1), sourceIds: z.array(z.string()).max(12) });
const comparisonSynthesisSchema = z.object({
  executiveSummary: synthesisClaimSchema,
  recommendation: synthesisClaimSchema,
  tradeoffs: z.array(synthesisClaimSchema).max(8),
});

const providerOrder: ProviderId[] = ["speedcloud", "gcp", "aws", "azure"];
const providerSearchConfig: Record<ProviderId, { name: string; domains: string[] }> = {
  gcp: {
    name: "Google Cloud",
    domains: ["cloud.google.com", "docs.cloud.google.com"],
  },
  aws: {
    name: "Amazon Web Services",
    domains: ["aws.amazon.com", "docs.aws.amazon.com"],
  },
  azure: {
    name: "Microsoft Azure",
    domains: ["azure.microsoft.com", "learn.microsoft.com", "azuremarketplace.microsoft.com"],
  },
  speedcloud: {
    name: "NxtGen SpeedCloud and SpeedCloud Supreme",
    domains: ["speedcloud.nxtgen.com", "nxtgen.com"],
  },
};

const State = Annotation.Root({
  requirement: Annotation<string>(),
  profileId: Annotation<ProfileId>(),
  analysis: Annotation<RequirementAnalysis | undefined>({ reducer: (_, next) => next, default: () => undefined }),
  research: Annotation<ProviderResearch[]>({ reducer: (current, next) => current.concat(next), default: () => [] }),
  draft: Annotation<Omit<RecommendationReport, "reportUrl" | "pdfFileName"> | undefined>({ reducer: (_, next) => next, default: () => undefined }),
  report: Annotation<RecommendationReport | undefined>({ reducer: (_, next) => next, default: () => undefined }),
});

export type RecommendationInput = z.input<typeof inputSchema>;

export class RecommendationAgent {
  private readonly graph;

  constructor(private readonly knowledgeStore: KnowledgeStore, private readonly catalogStore: CatalogStore) {
    this.graph = new StateGraph(State)
      .addNode("analyzeRequirement", async (state) => ({
        analysis: await this.analyzeRequirement(state.requirement, state.profileId),
      }))
      .addNode("researchGcp", async (state) => ({ research: [await this.researchProvider("gcp", state.requirement, state.analysis!)] }))
      .addNode("researchAws", async (state) => ({ research: [await this.researchProvider("aws", state.requirement, state.analysis!)] }))
      .addNode("researchAzure", async (state) => ({ research: [await this.researchProvider("azure", state.requirement, state.analysis!)] }))
      .addNode("researchSpeedCloud", async (state) => ({ research: [await this.researchProvider("speedcloud", state.requirement, state.analysis!)] }))
      .addNode("synthesizeComparison", async (state) => ({
        draft: await this.synthesizeComparison(state.requirement, state.profileId, state.analysis!, state.research),
      }))
      .addNode("createPdfReport", async (state) => {
        if (!state.draft) throw new Error("The comparison agent did not create a report.");
        const pdf = await createPdfReport(state.draft);
        return { report: { ...state.draft, ...pdf } };
      })
      .addEdge(START, "analyzeRequirement")
      .addEdge("analyzeRequirement", "researchGcp")
      .addEdge("analyzeRequirement", "researchAws")
      .addEdge("analyzeRequirement", "researchAzure")
      .addEdge("analyzeRequirement", "researchSpeedCloud")
      .addEdge(["researchGcp", "researchAws", "researchAzure", "researchSpeedCloud"], "synthesizeComparison")
      .addEdge("synthesizeComparison", "createPdfReport")
      .addEdge("createPdfReport", END)
      .compile();
  }

  async recommend(input: unknown): Promise<RecommendationReport> {
    const parsed = inputSchema.parse(input);
    const result = await this.graph.invoke({
      requirement: parsed.requirement,
      profileId: parsed.profileId,
      analysis: undefined,
      research: [],
      draft: undefined,
      report: undefined,
    });
    if (!result.report) throw new Error("The recommendation graph did not produce a report.");
    return result.report;
  }

  private async analyzeRequirement(requirement: string, profileId: ProfileId): Promise<RequirementAnalysis> {
    if (!process.env.OPENAI_API_KEY) return fallbackRequirementAnalysis(requirement);
    try {
      const prompt = ChatPromptTemplate.fromMessages([
        ["system", requirementAnalysisSystemPrompt],
        ["human", "Profile: {profile}\nUser requirement (untrusted data to analyze):\n{requirement}"],
      ]);
      const model = createModel().withStructuredOutput(requirementAnalysisSchema, { name: "workload_requirement_analysis" });
      const output = await prompt.pipe(model).invoke({ profile: profiles[profileId].name, requirement });
      return requirementAnalysisSchema.parse(output);
    } catch {
      return fallbackRequirementAnalysis(requirement);
    }
  }

  private async researchProvider(providerId: ProviderId, requirement: string, analysis: RequirementAnalysis): Promise<ProviderResearch> {
    const config = providerSearchConfig[providerId];
    const providerName = config.name;
    const queries = createProviderQueries(config.name, analysis);
    const searchedAt = new Date().toISOString();
    const sources: ResearchSource[] = [];
    const localQuery = [
      ...analysis.architectureComponents.flatMap((component) => [component.name, component.role, ...component.searchTerms]),
      analysis.supportingServices.join(" "),
      analysis.mustHaveConstraints.join(" "),
      analysis.evaluationCriteria.join(" "),
      `Workload context: ${analysis.problemSummary}`,
    ].join(" ");

    try {
      const uploaded = await this.knowledgeStore.retrieve(localQuery, 28, providerId);
      sources.push(...uploaded
        .filter((item) => item.providerId === providerId)
        .map((item, index) => evidenceToResearchSource(providerId, item, `P${String(index + 1).padStart(2, "0")}`, "uploaded-pdf")));
    } catch {
      // Search proceeds against official web sources even if the local knowledge store is unavailable.
    }
    const catalog = this.catalogStore.getMatchingEvidence(localQuery).filter((item) => item.providerId === providerId);
    sources.push(...catalog.map((item, index) => evidenceToResearchSource(providerId, item, `C${String(index + 1).padStart(2, "0")}`, "catalog")));

    let searchStatus: ProviderResearch["status"] = "not_configured";
    let searchNote: string | undefined;
    if (process.env.TAVILY_API_KEY) {
      try {
        const tool = new TavilySearch({
          tavilyApiKey: process.env.TAVILY_API_KEY,
          maxResults: 4,
          topic: "general",
          searchDepth: "advanced",
          includeRawContent: "markdown",
          chunksPerSource: 4,
          includeDomains: config.domains,
          ...(analysis.mustHaveConstraints.some((item) => /\bindia\b/i.test(item)) ? { country: "india" } : {}),
        });
        // Keep each query focused on a few architecture components so provider search
        // APIs can return infrastructure evidence for the actual build plan.
        let failedQueries = 0;
        for (let offset = 0; offset < queries.length; offset += 2) {
          const batch = queries.slice(offset, offset + 2);
          const outcomes = await Promise.allSettled(batch.map(async (query) => {
            // Tavily's package currently exposes a Zod v3 tool schema while this
            // workspace uses Zod v4. The documented plain input is accepted at
            // runtime, but the interop type resolves the input to ToolCall only.
            const response: unknown = await tool.invoke({ query, includeDomains: config.domains, searchDepth: "advanced" } as never);
            if (isRecord(response) && typeof response.error === "string") throw new Error(response.error);
            return parseOfficialResults(response, providerId, config.domains, searchedAt);
          }));
          for (const outcome of outcomes) {
            if (outcome.status === "fulfilled") sources.push(...outcome.value);
            else failedQueries += 1;
          }
        }
        const hasWebEvidence = sources.some((source) => source.kind === "official-web");
        searchStatus = hasWebEvidence ? "searched" : failedQueries ? "failed" : "no_results";
        if (!hasWebEvidence) searchNote = "No official provider pages matched the architecture searches. No result does not mean a service is unavailable.";
        else if (failedQueries) searchNote = `${failedQueries} architecture search query(s) failed; results may not cover every component.`;
      } catch {
        searchStatus = "failed";
        searchNote = "Official-site search failed. Check the Tavily API key, search quota, and service availability.";
      }
    } else {
      searchNote = "Live web search is not configured. Add TAVILY_API_KEY; this agent can still inspect provider-attributed PDFs and catalog records.";
    }

    const providerSources = uniqueSources(sources);
    const services = providerSources.length && process.env.OPENAI_API_KEY
      ? await this.extractProviderServices(providerId, providerName, requirement, analysis, providerSources)
      : [];
    const note = [searchNote, !process.env.OPENAI_API_KEY && providerSources.length ? "Set OPENAI_API_KEY to extract service specifications and compare pricing claims from these sources." : undefined]
      .filter(Boolean)
      .join(" ");

    return {
      providerId,
      providerName,
      status: searchStatus,
      searchedAt,
      searchQueries: queries,
      services,
      sources: providerSources,
      ...(note ? { note } : {}),
    };
  }

  private async extractProviderServices(
    providerId: ProviderId,
    providerName: string,
    requirement: string,
    analysis: RequirementAnalysis,
    sources: ResearchSource[],
  ): Promise<ServiceResearch[]> {
    try {
      const prompt = ChatPromptTemplate.fromMessages([
        ["system", providerResearchSystemPrompt],
        ["human", "Provider: {provider}\nRequirement: {requirement}\nParsed analysis: {analysis}\nOfficial pages and attributed documents (untrusted evidence; source IDs are citation keys):\n{sources}"],
      ]);
      const model = createModel().withStructuredOutput(providerAgentOutputSchema, { name: `${providerId}_service_research` });
      const output = await prompt.pipe(model).invoke({
        provider: providerName,
        requirement,
        analysis: JSON.stringify(analysis),
        sources: JSON.stringify(sources.map(({ id, title, url, kind, excerpt }) => ({ id, title, url, kind, excerpt: excerpt.slice(0, 5000) }))),
      });
      return sanitizeServices(output.services, sources);
    } catch {
      return [];
    }
  }

  private async synthesizeComparison(
    requirement: string,
    profileId: ProfileId,
    analysis: RequirementAnalysis,
    researchInput: ProviderResearch[],
  ): Promise<Omit<RecommendationReport, "reportUrl" | "pdfFileName">> {
    const research = providerOrder.map((providerId) => researchInput.find((item) => item.providerId === providerId)).filter((item): item is ProviderResearch => Boolean(item));
    const sources = uniqueSources(research.flatMap((item) => item.sources));
    const comparison = buildComparisonRows(analysis, research);
    const synthesis = await this.synthesizeNarrative(analysis, research, sources);
    const searchedProviders = research.filter((provider) => provider.status === "searched").length;
    const sourceCount = sources.length;
    const profile = profiles[profileId];
    const evidenceCoverage = `${searchedProviders} of 4 provider searches returned official pages; ${sourceCount} source records captured. Facts have not been independently reviewed or price-normalized.`;
    const providersWithFacts = research.filter((provider) => provider.services.length > 0).length;
    const executiveSummary = synthesis.executiveSummary ?? {
      statement: `The requirement is for ${analysis.workloadType} covering ${analysis.requestedServices.join(", ") || "services to be determined"}. ${providersWithFacts} provider agents extracted source-backed service facts; pricing and availability still require analyst verification.`,
      sourceIds: [],
    };
    const recommendation = synthesis.recommendation ?? {
      statement: "Treat this comparison as a research shortlist. Confirm workload fit, region, configuration, current price, support scope, and contract terms with each provider before choosing.",
      sourceIds: [],
    };
    const provisional = true;
    const draft: Omit<RecommendationReport, "reportUrl" | "pdfFileName"> = {
      generatedAt: new Date().toISOString(),
      requirement,
      analysis,
      profile,
      executiveSummary,
      recommendation,
      tradeoffs: synthesis.tradeoffs,
      provisional,
      evidenceCoverage,
      providers: research,
      comparison,
      reportMarkdown: "",
      sources,
      llmEnabled: Boolean(process.env.OPENAI_API_KEY),
      searchEnabled: Boolean(process.env.TAVILY_API_KEY),
    };
    draft.reportMarkdown = renderReportMarkdown(draft);
    return draft;
  }

  private async synthesizeNarrative(
    analysis: RequirementAnalysis,
    providers: ProviderResearch[],
    sources: ResearchSource[],
  ): Promise<{ executiveSummary?: SynthesisClaim; recommendation?: SynthesisClaim; tradeoffs: SynthesisClaim[] }> {
    const empty = { tradeoffs: [] };
    if (!process.env.OPENAI_API_KEY || !providers.some((item) => item.services.length)) return empty;
    try {
      const prompt = ChatPromptTemplate.fromMessages([
        ["system", comparisonSynthesisSystemPrompt],
        ["human", "Analyzed requirement: {analysis}\nProvider research: {providers}\nSource-ID registry: {sources}"],
      ]);
      const model = createModel().withStructuredOutput(comparisonSynthesisSchema, { name: "cloud_provider_comparison_synthesis" });
      const output = comparisonSynthesisSchema.parse(await prompt.pipe(model).invoke({
        analysis: JSON.stringify(analysis),
        providers: JSON.stringify(providers.map(({ providerId, providerName, status, services, note }) => ({ providerId, providerName, status, services, note }))),
        sources: JSON.stringify(sources.map(({ id, providerId, title, url }) => ({ id, providerId, title, url }))),
      }));
      const validIds = new Set(sources.map((source) => source.id));
      const executiveSummary = sanitizeSynthesisClaim(output.executiveSummary, validIds);
      const recommendation = sanitizeSynthesisClaim(output.recommendation, validIds);
      return {
        ...(executiveSummary ? { executiveSummary } : {}),
        ...(recommendation ? { recommendation } : {}),
        tradeoffs: output.tradeoffs.map((claim) => sanitizeSynthesisClaim(claim, validIds)).filter((claim): claim is SynthesisClaim => Boolean(claim)),
      };
    } catch {
      return empty;
    }
  }
}

export function validateProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && providerIds.includes(value as ProviderId);
}

function createModel(): ChatOpenAI {
  return new ChatOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_CHAT_MODEL ?? "gpt-4.1-mini",
    temperature: 0,
  });
}

function fallbackRequirementAnalysis(requirement: string): RequirementAnalysis {
  const text = requirement.trim();
  const lower = text.toLowerCase();
  const serviceKeywords: Array<[string, RegExp]> = [
    ["GPU and AI compute", /\b(gpu|accelerator|ai|machine learning|inference|training|llm)\b/i],
    ["Virtual machines and compute", /\b(vm|virtual machine|compute|server|instance)\b/i],
    ["Kubernetes and containers", /\b(kubernetes|k8s|container|docker)\b/i],
    ["Object, block, or file storage", /\b(storage|object|block|file system|backup)\b/i],
    ["Networking", /\b(network|bandwidth|load balancer|cdn|connectivity|egress)\b/i],
    ["Managed databases and cache", /\b(database|sql|postgres|mysql|mongodb|cache|redis)\b/i],
    ["Security and identity", /\b(security|identity|iam|encryption|firewall|compliance)\b/i],
    ["Support and service levels", /\b(support|sla|service level|managed|operate|operations)\b/i],
  ];
  const requestedServices = serviceKeywords.filter(([, pattern]) => pattern.test(lower)).map(([name]) => name);
  const mustHaveConstraints = [
    /\bindia\b/i.test(text) ? "India region or data location requirement" : undefined,
    /\b(cost|price|budget|predictable|monthly|tco)\b/i.test(text) ? "Pricing and total cost" : undefined,
    /\b(secure|security|compliance|residency|sovereign)\b/i.test(text) ? "Security, compliance, or data residency" : undefined,
    /\b(sla|uptime|availability|reliability)\b/i.test(text) ? "Availability and service-level terms" : undefined,
    /\b(support|operate|operations|managed)\b/i.test(text) ? "Support and operating model" : undefined,
  ].filter((item): item is string => Boolean(item));
  const needsHrms = /\b(hrms|human resources|payroll|employee management|employee records)\b/i.test(lower);
  const needsChatbot = /\b(chatbot|chat bot|knowledge assistant|question answering|questions? based on data|answers? users?'? questions?)\b/i.test(lower);
  const needsApplication = needsHrms || needsChatbot || /\b(app|application|software|platform|website|portal|web service)\b/i.test(lower);
  const hasKnowledgeData = /\b(data|documents?|files?|policies|knowledge base)\b/i.test(lower);
  const needsKnowledgeRetrieval = needsChatbot && (hasKnowledgeData || /\b(knowledge assistant|knowledge chatbot|grounded answers|rag)\b/i.test(lower));
  const workloadType = needsHrms && needsChatbot
    ? "HRMS business application with a knowledge chatbot"
    : needsHrms
      ? "HRMS business application"
      : needsChatbot
        ? "Knowledge assistant / chatbot"
        : /\b(gpu|ai|machine learning|inference|training|llm)\b/i.test(lower)
          ? "AI / GPU workload"
          : /\b(kubernetes|k8s|container)\b/i.test(lower)
            ? "Containerized application"
            : requestedServices.length ? "Cloud infrastructure workload" : "Cloud workload (needs service clarification)";
  if (needsHrms) requestedServices.push("HRMS / employee-management software");
  if (needsChatbot) requestedServices.push("Knowledge chatbot / question-answering application");
  const architectureComponents: ArchitectureComponent[] = [];
  const add = (name: string, role: string, rationale: string, priority: ArchitectureComponent["priority"], searchTerms: string[]) => {
    architectureComponents.push({ name, role, rationale, priority, searchTerms });
  };
  const applicationLabel = needsHrms ? "HRMS" : needsChatbot ? "application and chatbot" : "application";
  const endUserLabel = needsHrms || needsChatbot ? "employees" : "users";

  if (needsApplication) {
    add("Web frontend delivery", `Serve the ${applicationLabel} interface to ${endUserLabel} over HTTPS.`, "The requested experience needs a browser-facing interface.", "core", ["static web hosting", "frontend hosting", "content delivery network", "TLS"]);
    add("API and application runtime", `Run the business logic${needsChatbot ? " and chatbot orchestration" : ""}.`, "The application needs an execution environment that can scale and be operated.", "core", ["managed application hosting", "virtual machines", "managed containers", "serverless compute", "autoscaling"]);
    add("Network edge and private connectivity", "Provide secure ingress, traffic routing, and isolation between public entry points and application/data services.", "Private access paths help protect application and data services from unnecessary public exposure.", "recommended", ["load balancer", "private network", "virtual network", "ingress", "DNS", "web application firewall"]);
    add("Build, image registry, and deployment", "Build and release application changes and store deployable artifacts.", "The service needs a repeatable path from code changes to production.", "recommended", ["CI/CD pipeline", "build service", "container registry", "application deployment", "release automation"]);
    add("Monitoring, logs, and alerting", "Collect application and infrastructure health, logs, metrics, traces, and actionable alerts.", "Operators need to detect failed releases, outages, and slow chatbot responses.", "recommended", ["cloud monitoring", "application logging", "metrics", "distributed tracing", "alerting"]);
    add("Secrets, encryption, and key management", "Protect database, application, and model credentials and manage encryption keys.", "Credentials and persisted application data need controlled access and encryption.", "core", ["secrets manager", "key management service", "encryption at rest", "TLS", "credential rotation"]);
    add("Backup and recovery", "Create recoverable copies of application data and content and support restore planning.", "Persisted business data should survive operational mistakes or service failures.", "core", ["database backup", "point in time recovery", "disaster recovery", "retention", "restore testing"]);
    add("Container runtime and artifact repository", "Package and run the application consistently across development and production.", "A portable runtime is a practical deployment option; Kubernetes is only needed if scale or operating requirements justify it.", "recommended", ["managed container service", "container registry", "container instances", "Kubernetes service", "virtual machine containers"]);
    add("Application cache", "Cache repeated lookups or short-lived session data near the application.", "Useful only if measured concurrency or latency requires it; the system can start without a cache.", "conditional", ["managed cache", "Redis", "in-memory cache", "session cache"]);
  }
  if (needsHrms || /\b(database|postgres|postgresql|mysql|mssql|sql server|relational)\b/i.test(lower)) {
    add("Relational database", "Store structured employee, organization, payroll, and HRMS records with transactional consistency.", "HR records have relationships and need reliable updates and access controls.", "core", ["managed relational database", "PostgreSQL", "MySQL", "SQL database", "automated backups", "high availability"]);
  }
  if ((needsChatbot && hasKnowledgeData) || /\b(object storage|document storage|file storage)\b/i.test(lower)) {
    add("Document and object storage", "Store source policies, employee handbooks, uploaded files, and versioned knowledge documents.", "A data-grounded assistant needs a durable place for its source documents.", "core", ["object storage", "document storage", "file storage", "lifecycle policy", "encryption"]);
  }
  if (needsChatbot) {
    add("LLM inference", "Generate conversational answers from the user's question and authorized context.", "The chatbot requires a language model endpoint or an approved self-hosted model runtime.", "core", ["managed language model", "LLM inference", "model serving", "generative AI", "GPU inference"]);
    if (needsKnowledgeRetrieval) add("Knowledge ingestion and retrieval", "Parse and chunk approved documents, create embeddings, and retrieve relevant passages for each question.", "Retrieval augmented generation keeps responses tied to company data instead of relying only on model memory.", "core", ["embedding model", "vector search", "vector database", "hybrid search", "RAG", "document ingestion"]);
    add(needsKnowledgeRetrieval ? "Identity-aware chatbot access" : "Chatbot identity and access", needsKnowledgeRetrieval ? "Authenticate employees and filter retrieval results using their roles and document permissions." : "Authenticate users and apply permissions to chatbot and application features.", needsKnowledgeRetrieval ? "The assistant must not disclose company content a user is not authorized to see." : "Only authenticated users should reach the assistant and its connected application data.", "core", ["identity and access management", "single sign-on", "role based access control", "document authorization", "audit logs"]);
  } else if (needsHrms) {
    add("Employee identity and access", "Authenticate employees and apply role-based access to HR functions and records.", "An HRMS needs controlled employee and administrator access.", "core", ["identity and access management", "single sign-on", "role based access control", "multi factor authentication", "audit logs"]);
  } else if (needsApplication) {
    add("Application identity and access", "Authenticate users and apply permissions to application features and data.", "Add it when the application has authenticated accounts or protected data.", "recommended", ["identity management", "single sign-on", "role based access control", "multi factor authentication", "audit logs"]);
  }
  if (!needsApplication) {
    for (const keyword of serviceKeywords.filter(([, pattern]) => pattern.test(lower))) {
      const [name] = keyword;
      if (/GPU|AI/i.test(name)) add(name, "Provide accelerator or model-serving capacity for AI workloads.", "AI or accelerator capacity is explicitly requested.", "core", ["GPU instances", "accelerated compute", "AI inference", "model serving"]);
      else if (/compute/i.test(name)) add(name, "Provide processing capacity for the explicitly requested workload.", "Compute is directly requested by the client.", "core", ["virtual machines", "compute instances", "managed compute", "autoscaling"]);
      else if (/Kubernetes/i.test(name)) add(name, "Schedule and operate the requested container workloads.", "The client explicitly mentioned Kubernetes or containers.", "core", ["Kubernetes service", "container orchestration", "managed containers", "container registry"]);
      else if (/storage/i.test(name)) add(name, "Store workload files and data durably.", "Storage is explicitly part of the request.", "core", ["object storage", "block storage", "file storage", "backup"]);
      else if (/cache|redis/i.test(lower)) add("Application cache", "Cache frequently accessed data close to the workload.", "A cache is explicitly requested; select capacity after estimating working set and traffic.", "core", ["managed cache", "Redis", "in-memory cache", "cache pricing"]);
      else if (/database/i.test(name) && /\b(database|sql|postgres|mysql|mongodb)\b/i.test(lower)) add("Managed database", "Persist structured application data with a provider-managed database service.", "A database is explicitly part of the request.", "core", ["managed database", "relational database", "database pricing", "backup"]);
      else if (/Networking/i.test(name)) add(name, "Connect workload services and route traffic.", "Networking is explicitly part of the request.", "core", ["virtual network", "load balancer", "bandwidth", "connectivity"]);
      else if (/Security/i.test(name)) add(name, "Control identities, encryption, and workload access.", "Security is explicitly part of the request.", "core", ["identity management", "encryption", "key management", "firewall"]);
    }
  }
  if (!architectureComponents.length) {
    add("Workload compute", "Provide the execution capacity for the service once its application and scale are clarified.", "The request does not identify enough workload detail to choose a specific runtime yet.", "conditional", ["cloud compute", "virtual machines", "managed application hosting", "compute pricing"]);
  }
  const supportingServices = architectureComponents.map((component) => component.name);
  return {
    problemSummary: text,
    workloadType,
    requestedServices: requestedServices.length ? requestedServices : ["Core compute and supporting services"],
    supportingServices: [...new Set(supportingServices)],
    architectureComponents,
    mustHaveConstraints,
    evaluationCriteria: [...new Set([...architectureComponents.map((component) => component.name), ...mustHaveConstraints, ...(needsKnowledgeRetrieval ? ["Data-source access permissions and grounded answers"] : []), "Published specifications", "Current pricing and price assumptions", "Regional availability", "Support and SLA scope"])],
  };
}

function createProviderQueries(providerName: string, analysis: RequirementAnalysis): string[] {
  const components = analysis.architectureComponents;
  const batches = components.length
    ? Array.from({ length: Math.ceil(components.length / 3) }, (_, index) => components.slice(index * 3, index * 3 + 3))
    : [[]];
  return batches.flatMap((batch) => {
    const categories = batch.length
      ? batch.map((component) => `${component.name}${component.priority === "conditional" ? " (optional)" : ""}: ${component.searchTerms.slice(0, 4).join(", ")}`).join("; ")
      : analysis.supportingServices.join("; ") || "application compute, data, security, and operations services";
    return [
      `Official ${providerName} product documentation for these cloud components: ${categories}. Find official service names, configuration/specifications, regional availability, support/SLA, performance results, limits, and material terms. Infrastructure building blocks only; conditional entries are optional.`,
      `Official ${providerName} pricing pages, price lists, and calculators for these exact components: ${categories}. Find published rates for each service, including currency, tier/configuration, region, billing unit, usage/commitment assumptions, taxes/egress/licensing where stated, and quote-only notices. Prefer current official pricing sources; do not estimate or compare unrelated units.`,
    ];
  });
}

function parseOfficialResults(response: unknown, providerId: ProviderId, domains: string[], capturedAt: string): ResearchSource[] {
  if (!isRecord(response) || !Array.isArray(response.results)) return [];
  const sources: ResearchSource[] = [];
  for (const result of response.results) {
    if (!isRecord(result) || typeof result.url !== "string" || !isOfficialUrl(result.url, domains)) continue;
    const excerpt = typeof result.raw_content === "string" && result.raw_content.trim()
      ? result.raw_content
      : typeof result.content === "string" ? result.content : "";
    if (!excerpt.trim()) continue;
    const prefix = providerId.toUpperCase();
    sources.push({
      id: `${prefix}-W${String(sources.length + 1).padStart(2, "0")}`,
      providerId,
      title: typeof result.title === "string" && result.title.trim() ? result.title.trim() : new URL(result.url).hostname,
      url: result.url,
      excerpt: excerpt.slice(0, 7000),
      capturedAt,
      kind: "official-web",
    });
  }
  return sources;
}

function isOfficialUrl(url: string, domains: string[]): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return domains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function evidenceToResearchSource(providerId: ProviderId, item: EvidenceChunk, suffix: string, kind: ResearchSource["kind"]): ResearchSource {
  const url = isWebUrl(item.source) ? item.source : undefined;
  return {
    id: `${providerId.toUpperCase()}-${suffix}`,
    providerId,
    title: item.source,
    ...(url ? { url } : {}),
    excerpt: item.page ? `Page ${item.page}: ${item.text}` : item.text,
    capturedAt: item.capturedAt ?? item.ingestedAt,
    kind,
  };
}

function isWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function uniqueSources(sources: ResearchSource[]): ResearchSource[] {
  const byKey = new Map<string, ResearchSource>();
  for (const source of sources) {
    const key = `${source.providerId}:${source.kind}:${source.url ?? source.title}`;
    if (!byKey.has(key)) byKey.set(key, { ...source, excerpt: source.excerpt.slice(0, 7000) });
  }
  const counts = new Map<string, number>();
  return [...byKey.values()].map((source) => {
    const prefix = `${source.providerId.toUpperCase()}-${source.kind === "official-web" ? "W" : source.kind === "uploaded-pdf" ? "P" : "C"}`;
    const index = (counts.get(prefix) ?? 0) + 1;
    counts.set(prefix, index);
    return { ...source, id: `${prefix}${String(index).padStart(2, "0")}` };
  });
}

function sanitizeServices(
  input: Array<Omit<ServiceResearch, "performanceMetrics" | "publishedPrices"> & {
    performanceMetrics?: PerformanceMeasurement[] | undefined;
    publishedPrices?: PublishedPriceObservation[] | undefined;
  }>,
  sources: ResearchSource[],
): ServiceResearch[] {
  const validIds = new Set(sources.map((source) => source.id));
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const sanitize = (claim: ResearchClaim): ResearchClaim | undefined => {
    const sourceIds = [...new Set(claim.sourceIds.filter((sourceId) => validIds.has(sourceId)))];
    return sourceIds.length ? { statement: claim.statement.trim(), sourceIds } : undefined;
  };
  return input.flatMap((service) => {
    const fit = sanitize(service.fit);
    if (!fit) return [];
    const cleanClaims = (claims: ResearchClaim[]) => claims.map(sanitize).filter((claim): claim is ResearchClaim => Boolean(claim));
    const performanceMetrics = (service.performanceMetrics ?? []).flatMap((metric) => {
      const sourceIds = [...new Set(metric.sourceIds.filter((sourceId) => validIds.has(sourceId)))];
      const citesPublishedMeasurements = sourceIds.some((sourceId) => {
        const excerpt = sourceById.get(sourceId)?.excerpt ?? "";
        return mentionsMeasurement(excerpt, metric.value, metric.unit) && mentionsMeasurement(excerpt, metric.loadValue, metric.loadUnit);
      });
      return sourceIds.length && citesPublishedMeasurements ? [{ ...metric, sourceIds }] : [];
    });
    const publishedPrices = (service.publishedPrices ?? []).flatMap((price) => {
      const sourceIds = [...new Set(price.sourceIds.filter((sourceId) => {
        const excerpt = sourceById.get(sourceId)?.excerpt ?? "";
        return supportsPublishedPrice(excerpt, price);
      }))];
      return sourceIds.length ? [{ ...price, sourceIds }] : [];
    });
    const pricing = cleanClaims(service.pricing).filter((claim) => !containsExplicitCurrencyAmount(claim.statement));
    return [{
      serviceName: service.serviceName.trim(),
      category: service.category.trim(),
      fit,
      specifications: cleanClaims(service.specifications),
      pricing,
      availability: cleanClaims(service.availability),
      supportAndSla: cleanClaims(service.supportAndSla),
      limitations: cleanClaims(service.limitations),
      performanceMetrics,
      publishedPrices,
    }];
  });
}

function mentionsMeasurement(text: string, value: number, unit: string): boolean {
  const numberPattern = exactNumberPattern(value);
  const unitPattern = unit.trim().replaceAll("/", "\\s*(?:/|per)\\s*").replaceAll(" ", "\\s+");
  return new RegExp("(?<![\\d.])" + numberPattern + "(?![\\d.])\\s*(?:" + unitPattern + ")", "i").test(text);
}

function supportsPublishedPrice(text: string, price: PublishedPriceObservation): boolean {
  const amountPattern = exactNumberPattern(price.amount);
  const currency = price.currency.trim();
  const currencyPattern = /^[A-Za-z]{3}$/.test(currency)
    ? "\\b" + escapeRegExp(currency) + "\\b"
    : escapeRegExp(currency);
  const hasExplicitCurrencyAmount = new RegExp("(?:" + currencyPattern + "\\s*" + amountPattern + "|" + amountPattern + "\\s*" + currencyPattern + ")", "i").test(text);
  const normalizedText = normalizePriceText(text);
  const normalizedUnit = normalizePriceText(price.unit);
  return hasExplicitCurrencyAmount && normalizedUnit.length > 1 && normalizedText.includes(normalizedUnit);
}

function containsExplicitCurrencyAmount(text: string): boolean {
  return /(?:[$€£₹]\s*[\d,]+(?:\.\d+)?|\b(?:USD|INR|EUR|GBP|AUD|CAD|SGD|JPY|CNY)\s*[\d,]+(?:\.\d+)?|[\d,]+(?:\.\d+)?\s*(?:USD|INR|EUR|GBP|AUD|CAD|SGD|JPY|CNY)\b)/i.test(text);
}

function normalizePriceText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function exactNumberPattern(value: number): string {
  const [integer, decimals] = String(value).split(".");
  const integerPattern = integer!.replace(/\B(?=(\d{3})+(?!\d))/g, ",?");
  return integerPattern + (decimals ? "\\." + decimals + "0*" : "(?:\\.0+)?");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizeSynthesisClaim(claim: SynthesisClaim, validIds: Set<string>): SynthesisClaim | undefined {
  const sourceIds = [...new Set(claim.sourceIds.filter((sourceId) => validIds.has(sourceId)))];
  if (!sourceIds.length) return undefined;
  return { statement: claim.statement.trim(), sourceIds };
}

function buildComparisonRows(analysis: RequirementAnalysis, research: ProviderResearch[]): ComparisonRow[] {
  const components = analysis.architectureComponents.length
    ? analysis.architectureComponents
    : analysis.supportingServices.map((name) => ({ name, role: name, rationale: "Inferred supporting cloud capability.", priority: "recommended" as const, searchTerms: [name] }));
  const rows: ComparisonRow[] = (components.length ? components : [{ name: "Application architecture", role: "Application architecture", rationale: "Core workload", priority: "core" as const, searchTerms: [analysis.workloadType] }]).map((component) => ({
    dimension: `${component.priority[0]!.toUpperCase()}${component.priority.slice(1)} component: ${component.name}`,
    values: providerCells(research, (provider) => {
      const relevant = provider.services.filter((service) => [component.name, component.role, ...component.searchTerms]
        .some((category) => categoryMatches(category, service.category)));
      if (!relevant.length) return { value: unknownCell(provider), sourceIds: [] };
      const claims = relevant.map((service) => ({ name: service.serviceName, fit: service.fit }));
      return {
        value: claims.map(({ name, fit }) => `${name}: ${fit.statement}`).join("\n"),
        sourceIds: claims.flatMap(({ fit }) => fit.sourceIds),
      };
    }),
  }));

  for (const component of components) {
    rows.push({
      dimension: `Published pricing: ${component.name}`,
      values: providerCells(research, (provider) => {
        const relevant = provider.services.filter((service) => [component.name, ...component.searchTerms]
          .some((category) => categoryMatches(category, service.category)));
        const observedPrices = relevant.flatMap((service) => service.publishedPrices.map((price) => ({
          serviceName: service.serviceName,
          statement: `${price.priceType.replaceAll("_", " ")}: ${price.currency} ${price.amount} / ${price.unit}${price.publishedDate ? ` · Published ${price.publishedDate}` : ""}${price.configuration ? ` · ${price.configuration}` : ""}${price.region ? ` · ${price.region}` : ""}${price.assumptions ? ` · ${price.assumptions}` : ""}`,
          sourceIds: price.sourceIds,
        })));
        const pricingNotes = relevant.flatMap((service) => service.pricing.map((claim) => ({ serviceName: service.serviceName, statement: claim.statement, sourceIds: claim.sourceIds })));
        const priceFacts = [...observedPrices, ...pricingNotes];
        if (!priceFacts.length) {
          return {
            value: relevant.length
              ? `${relevant.map((service) => service.serviceName).join(", ")}: no published rate was captured; request a quote or validate pricing with the provider.`
              : "No matching service or price was captured in the available sources; this does not mean the provider lacks the service.",
            sourceIds: [],
          };
        }
        return {
          value: priceFacts.map(({ serviceName, statement }) => `${serviceName}: ${statement}`).join("\n"),
          sourceIds: priceFacts.flatMap(({ sourceIds }) => sourceIds),
        };
      }),
    });
  }

  const dimensions: Array<{ label: string; select: (service: ServiceResearch) => ResearchClaim[] }> = [
    { label: "Specifications", select: (service) => service.specifications },
    { label: "Regional availability", select: (service) => service.availability },
    { label: "Support and SLA", select: (service) => service.supportAndSla },
    { label: "Limitations and caveats", select: (service) => service.limitations },
  ];
  for (const dimension of dimensions) {
    rows.push({
      dimension: dimension.label,
      values: providerCells(research, (provider) => {
        const facts = provider.services.flatMap((service) => dimension.select(service).map((claim) => ({ serviceName: service.serviceName, claim })));
        if (!facts.length) return { value: unknownCell(provider), sourceIds: [] };
        return {
          value: facts.slice(0, 8).map(({ serviceName, claim }) => `${serviceName}: ${claim.statement}`).join("\n"),
          sourceIds: facts.slice(0, 8).flatMap(({ claim }) => claim.sourceIds),
        };
      }),
    });
  }
  return rows;
}

function providerCells(research: ProviderResearch[], select: (provider: ProviderResearch) => ComparisonCell): Record<ProviderId, ComparisonCell> {
  const byId = new Map(research.map((provider) => [provider.providerId, provider]));
  return Object.fromEntries(providerIds.map((providerId) => {
    const provider = byId.get(providerId);
    return [providerId, provider ? select(provider) : { value: "Unknown — provider research did not complete.", sourceIds: [] }];
  })) as Record<ProviderId, ComparisonCell>;
}

function categoryMatches(requested: string, extracted: string): boolean {
  const a = requested.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const b = extracted.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return a === b || a.includes(b) || b.includes(a) || a.split(" ").some((word) => word.length > 3 && b.includes(word));
}

function unknownCell(provider: ProviderResearch): string {
  if (provider.status === "not_configured") return "Unknown — live web search is not configured.";
  if (provider.status === "failed") return "Unknown — provider search failed.";
  if (provider.status === "no_results") return "Unknown — no match in the official pages captured; this does not mean no service exists.";
  return "Unknown — no supported fact was extracted from the captured sources.";
}

function renderReportMarkdown(report: Omit<RecommendationReport, "reportUrl" | "pdfFileName">): string {
  const providers = providerOrder.map((id) => report.providers.find((item) => item.providerId === id)).filter((item): item is ProviderResearch => Boolean(item));
  const header = `| Dimension | ${providers.map((provider) => provider.providerName).join(" | ")} |`;
  const separator = `| --- | ${providers.map(() => "---").join(" | ")} |`;
  const table = report.comparison.map((row) => `| ${escapeMarkdown(row.dimension)} | ${providers.map((provider) => {
    const cell = row.values[provider.providerId];
    return escapeMarkdown(`${cell.value}${formatCitationIds(cell.sourceIds)}`);
  }).join(" | ")} |`);
  const sourceLines = report.sources.map((source) => `- [${source.id}] ${source.title}${source.url ? ` — ${source.url}` : ""} (${source.kind}; captured ${source.capturedAt})`);
  return [
    "# Cloud service comparison",
    "",
    "## Executive summary",
    formatSynthesisClaim(report.executiveSummary),
    "",
    "## Recommendation",
    formatSynthesisClaim(report.recommendation),
    "",
    "## Requirement analysis",
    `- Workload: ${report.analysis.workloadType}`,
    `- Requested business capabilities: ${report.analysis.requestedServices.join(", ")}`,
    `- Inferred architecture: ${report.analysis.architectureComponents.map((component) => `${component.name} (${component.priority}): ${component.role} Why: ${component.rationale}`).join("; ") || report.analysis.supportingServices.join(", ") || "None inferred"}`,
    `- Constraints: ${report.analysis.mustHaveConstraints.join("; ") || "None specified"}`,
    `- Evaluation criteria: ${report.analysis.evaluationCriteria.join(", ")}`,
    "",
    "## Comparison",
    header,
    separator,
    ...table,
    "",
    `**Evidence coverage:** ${report.evidenceCoverage}`,
    "",
    "## Provider research status",
    ...providers.map((provider) => `- ${provider.providerName}: ${provider.status}; ${provider.sources.length} sources; ${provider.services.length} service candidates${provider.note ? ` — ${provider.note}` : ""}`),
    "",
    "## Sources",
    ...(sourceLines.length ? sourceLines : ["No source pages were captured."]),
    "",
    "Pricing, capacity, regional availability, support scope, and SLA terms can vary by configuration and contract. Unknown means a fact was not found in the captured evidence; it does not mean the provider lacks that service.",
  ].join("\n");
}

function formatSynthesisClaim(claim: SynthesisClaim): string {
  return `${claim.statement}${formatCitationIds(claim.sourceIds)}`;
}

function formatCitationIds(ids: string[]): string {
  return ids.length ? ` [${ids.join(", ")}]` : "";
}

function escapeMarkdown(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
