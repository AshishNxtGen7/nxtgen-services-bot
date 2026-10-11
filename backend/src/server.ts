import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { ZodError } from "zod";
import { RecommendationAgent, validateProviderId } from "./agent/recommendation-graph.js";
import { KnowledgeStore } from "./knowledge/store.js";
import { sourceRegistry } from "./knowledge/sources.js";
import { CatalogStore } from "./catalog/catalog-store.js";

const server = Fastify({ logger: true, bodyLimit: 1024 * 1024 });
const knowledgeStore = new KnowledgeStore();
const catalogStore = new CatalogStore();
const agent = new RecommendationAgent(knowledgeStore, catalogStore);

await server.register(cors, {
  origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:5173",
});
await server.register(multipart, {
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
});
await knowledgeStore.init();
await catalogStore.init();

server.get("/api/health", async () => ({
  status: "ok",
  service: "nxtgen-cloud-knowledge-api",
  workflowVersion: "parallel-provider-research-v2",
  liveSearchConfigured: Boolean(process.env.TAVILY_API_KEY),
  languageModelConfigured: Boolean(process.env.OPENAI_API_KEY),
}));

server.get("/api/knowledge/status", async () => ({
  ...knowledgeStore.getStatus(),
  ...catalogStore.getStatus(),
  sources: sourceRegistry,
}));

server.post("/api/knowledge/documents", async (request, reply) => {
  const file = await request.file();
  if (!file) return reply.code(400).send({ error: "Upload a PDF file." });
  if (file.mimetype !== "application/pdf" || !file.filename.toLowerCase().endsWith(".pdf")) {
    return reply.code(415).send({ error: "Only PDF files are accepted." });
  }
  const fields = file.fields as Record<string, { value?: unknown } | undefined>;
  const providerId = fields.providerId?.value;
  if (!validateProviderId(providerId)) {
    return reply.code(400).send({ error: "Choose a provider attribution for this PDF." });
  }

  try {
    const bytes = await file.toBuffer();
    const chunkCount = await knowledgeStore.ingestPdf(bytes, file.filename, providerId);
    return reply.code(201).send({
      fileName: file.filename,
      providerId,
      chunkCount,
      reviewState: "unreviewed",
      message: "The PDF was indexed as unreviewed evidence. Validate its facts before treating it as a recommendation.",
    });
  } catch (error) {
    request.log.error(error);
    return reply.code(422).send({ error: error instanceof Error ? error.message : "Could not index this PDF." });
  }
});

server.post<{ Body: unknown }>("/api/recommendations", async (request, reply) => {
  try {
    const report = await agent.recommend(request.body);
    return reply.send(report);
  } catch (error) {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: "Enter a requirement between 8 and 4,000 characters.", details: error.issues });
    }
    request.log.error(error);
    return reply.code(500).send({ error: "The recommendation could not be generated. Check API and model configuration." });
  }
});

server.setErrorHandler((error, request, reply) => {
  request.log.error(error);
  const statusCode = isHttpError(error) && error.statusCode < 500 ? error.statusCode : 500;
  const message = error instanceof Error ? error.message : "An unexpected server error occurred.";
  reply.code(statusCode).send({ error: statusCode === 413 ? "PDF exceeds the 20 MB upload limit." : message });
});

const port = Number(process.env.PORT ?? 3001);
await server.listen({ port, host: "127.0.0.1" });

function isHttpError(error: unknown): error is Error & { statusCode: number } {
  return error instanceof Error && "statusCode" in error && typeof error.statusCode === "number";
}
