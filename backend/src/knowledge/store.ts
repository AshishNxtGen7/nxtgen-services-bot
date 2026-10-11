import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Document } from "@langchain/core/documents";
import { OpenAIEmbeddings } from "@langchain/openai";
import { MemoryVectorStore } from "@langchain/classic/vectorstores/memory";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { PDFParse } from "pdf-parse";
import type { EvidenceChunk, ProviderId } from "../domain/types.js";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const dataDir = join(moduleDir, "../../data");
const chunksPath = join(dataDir, "knowledge-chunks.json");
const guidePath = join(moduleDir, "prd-guidance.md");
interface StoredChunk {
  pageContent: string;
  source: string;
  providerId?: ProviderId;
  page?: number;
  capturedAt?: string;
  ingestedAt: string;
  state: "unreviewed";
}

export class KnowledgeStore {
  private chunks: StoredChunk[] = [];
  private vectorStore: MemoryVectorStore | undefined;
  private vectorStorePromise: Promise<MemoryVectorStore | undefined> | undefined;
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    const guide = await readFile(guidePath, "utf8");
    const sourceChunks = await this.splitter().splitText(guide);
    const ingestedAt = new Date().toISOString();
    this.chunks = sourceChunks.map((pageContent) => ({
      pageContent,
      source: "cloud-service-knowledge-graph-prd.docx (product requirements summary)",
      ingestedAt,
      state: "unreviewed",
    }));

    try {
      const saved = JSON.parse(await readFile(chunksPath, "utf8")) as StoredChunk[];
      this.chunks.push(...saved);
    } catch {
      // The knowledge store starts with the PRD guidance until PDFs are uploaded.
    }

  }

  async ingestPdf(bytes: Buffer, fileName: string, providerId: ProviderId): Promise<number> {
    await this.init();
    const parser = new PDFParse({ data: new Uint8Array(bytes) });
    let pages: Document[];
    try {
      const extracted = await parser.getText();
      pages = extracted.pages.map((page) => new Document({ pageContent: page.text, metadata: { pageNumber: page.num } }));
    } finally {
      await parser.destroy();
    }
    if (pages.length === 0 || pages.every((page) => !page.pageContent.trim())) {
      throw new Error("No searchable text was found in this PDF. Scanned PDFs need OCR before ingestion.");
    }

    const splitPages = await this.splitter().splitDocuments(pages);
    const ingestedAt = new Date().toISOString();
    const additions: StoredChunk[] = splitPages.map((page) => {
      const pageNumber = getPdfPageNumber(page.metadata);
      return {
        pageContent: page.pageContent,
        source: fileName,
        providerId,
        ...(pageNumber === undefined ? {} : { page: pageNumber }),
        ingestedAt,
        state: "unreviewed",
      };
    });
    this.chunks.push(...additions);
    this.vectorStore = undefined;
    this.vectorStorePromise = undefined;
    await mkdir(dirname(chunksPath), { recursive: true });
    await writeFile(chunksPath, JSON.stringify(this.chunks.filter((chunk) => chunk.source !== "cloud-service-knowledge-graph-prd.docx (product requirements summary)"), null, 2));
    return additions.length;
  }

  async retrieve(query: string, limit = 10, providerId?: ProviderId): Promise<EvidenceChunk[]> {
    await this.init();
    const vectorStore = await this.getVectorStore();
    let matches: StoredChunk[];

    if (vectorStore) {
      const docs = await vectorStore.similaritySearch(query, limit, providerId ? (document) => document.metadata.providerId === providerId : undefined);
      matches = docs.map((doc) => ({
        pageContent: doc.pageContent,
        source: String(doc.metadata.source ?? "unknown source"),
        ...(isProviderId(doc.metadata.providerId) ? { providerId: doc.metadata.providerId } : {}),
        ...(typeof doc.metadata.page === "number" ? { page: doc.metadata.page } : {}),
        ...(typeof doc.metadata.capturedAt === "string" ? { capturedAt: doc.metadata.capturedAt } : {}),
        ingestedAt: String(doc.metadata.ingestedAt ?? new Date().toISOString()),
        state: "unreviewed",
      }));
    } else {
      matches = this.chunks
        .filter((chunk) => !providerId || chunk.providerId === providerId)
        .map((chunk) => ({ chunk, score: lexicalScore(query, chunk.pageContent) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ chunk }) => chunk);
    }

    return matches.map((chunk) => ({
      text: chunk.pageContent,
      source: chunk.source,
      ...(chunk.providerId ? { providerId: chunk.providerId } : {}),
      ...(chunk.page === undefined ? {} : { page: chunk.page }),
      ...(chunk.capturedAt ? { capturedAt: chunk.capturedAt } : {}),
      ingestedAt: chunk.ingestedAt,
      state: chunk.state,
    }));
  }

  getStatus() {
    const uploadedChunks = this.chunks.filter((chunk) => !chunk.source.startsWith("cloud-service-knowledge-graph-prd.docx")).length;
    const uploadedSources = new Set(this.chunks.filter((chunk) => !chunk.source.startsWith("cloud-service-knowledge-graph-prd.docx")).map((chunk) => chunk.source));
    return {
      sourceCount: uploadedSources.size,
      chunkCount: uploadedChunks,
      guidanceLoaded: this.initialized,
      semanticSearchEnabled: Boolean(process.env.OPENAI_API_KEY),
      reportDraftingEnabled: Boolean(process.env.OPENAI_API_KEY),
    };
  }

  private splitter() {
    return new RecursiveCharacterTextSplitter({ chunkSize: 1100, chunkOverlap: 180 });
  }

  private async getVectorStore(): Promise<MemoryVectorStore | undefined> {
    if (!process.env.OPENAI_API_KEY) return undefined;
    if (this.vectorStore) return this.vectorStore;
    if (!this.vectorStorePromise) this.vectorStorePromise = this.buildVectorStore();
    try {
      return await this.vectorStorePromise;
    } catch {
      this.vectorStorePromise = undefined;
      return undefined;
    }
  }

  private async buildVectorStore(): Promise<MemoryVectorStore | undefined> {
    if (!process.env.OPENAI_API_KEY || this.chunks.length === 0) return undefined;
    const embeddings = new OpenAIEmbeddings({
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
    });
    const documents = this.chunks.map((chunk) => new Document({
      pageContent: chunk.pageContent,
      metadata: {
        source: chunk.source,
        ...(chunk.providerId ? { providerId: chunk.providerId } : {}),
        ...(chunk.page === undefined ? {} : { page: chunk.page }),
        ingestedAt: chunk.ingestedAt,
      },
    }));
    this.vectorStore = await MemoryVectorStore.fromDocuments(documents, embeddings);
    return this.vectorStore;
  }
}

function getPdfPageNumber(metadata: Record<string, unknown>): number | undefined {
  if (typeof metadata.pageNumber === "number") return metadata.pageNumber;
  const loc = metadata.loc;
  if (loc && typeof loc === "object" && "pageNumber" in loc && typeof loc.pageNumber === "number") {
    return loc.pageNumber;
  }
  return undefined;
}

function lexicalScore(query: string, content: string): number {
  const terms = [...new Set(query.toLowerCase().match(/[a-z0-9]+/g) ?? [])].filter((term) => term.length > 2);
  const haystack = content.toLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}

function isProviderId(value: unknown): value is ProviderId {
  return value === "speedcloud" || value === "aws" || value === "azure" || value === "gcp";
}
