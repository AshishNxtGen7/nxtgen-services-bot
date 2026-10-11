# NxtGen Cloud Knowledge Agent

A React and TypeScript workspace backed by a Node.js, LangChain.js, and LangGraph research workflow. A solution architect translates the client's business requirement into a vendor-neutral build-and-run plan before four provider agents research Google Cloud, AWS, Azure, and NxtGen SpeedCloud / SpeedCloud Supreme in parallel. A comparison agent prepares a source-cited report and creates a PDF.

SpeedCloud is presented first in the commercial view, as specified in the supplied PRD. The product does not invent discounts, performance, service parity, availability, or SLAs: unsupported details remain unknown, and reports are marked provisional until an analyst reviews the captured evidence.

## Workspace

- `frontend/` — React, TypeScript, Vite, Tailwind CSS, shadcn/ui components, and Zod validation.
- `backend/` — Node.js, TypeScript, Fastify, LangChain.js, LangGraph.js, Tavily search, PDF ingestion, and PDF report generation.
- `backend/src/knowledge/prd-guidance.md` — comparison and recommendation rules extracted from the supplied PRD. It contains product guidance, not cloud service catalog facts.
- `backend/src/catalog/ontology.ts` — typed catalog schema for provider offerings, mappings, and attributed evidence.

## Requirements

- Node.js 24 or later.
- `TAVILY_API_KEY` enables live web searches restricted to official provider domains.
- `OPENAI_API_KEY` enables requirement analysis, source-grounded extraction and synthesis, and semantic search over uploaded PDFs. Without it, workload parsing uses local heuristics and captured sources are shown without generated service facts.

## Run locally

```bash
npm install
cp backend/.env.example backend/.env
npm run dev:backend
npm run dev:frontend
```

The frontend runs at `http://localhost:5173`; the API listens at `http://localhost:3001`. Set `TAVILY_API_KEY` and `OPENAI_API_KEY` in `backend/.env` to enable the full workflow. `OPENAI_CHAT_MODEL` defaults to `gpt-4.1-mini`; `OPENAI_EMBEDDING_MODEL` defaults to `text-embedding-3-small`.

Each generated PDF is saved in `frontend/public/reports/` and can be opened or downloaded from the report view. Generated PDFs are ignored by Git because reports can contain client requirements. Set `REPORTS_DIR` to change the output folder.

PDFs are rendered with Puppeteer and its matching Chrome for Testing browser. If `npm install` skips Puppeteer's browser download or the backend reports that Chrome is missing, run `npx puppeteer browsers install chrome` once from the repository root.

## Workflow and API

1. `POST /api/recommendations` receives only `{ "requirement": "..." }`; the backend applies the default comparison profile.
2. The solution architect separates the business application from its cloud architecture, then lists components such as frontend delivery, application runtime, databases, identity, networking, deployment, monitoring, backup/recovery, and AI or retrieval services when relevant. Each component includes its role, rationale, priority, and provider-search terms. Cache, Kubernetes, and other scale choices are conditional unless the requirement supports them.
3. Four provider agents search official provider domains for services that implement those components. For example, an HRMS chatbot grounded in company data is researched as application hosting, relational data, protected document storage, identity-aware retrieval, LLM inference, networking, deployment, operations, and recovery needs—not as an HRMS or chatbot product search. Agents also retrieve PDFs attributed to their provider; uploaded PDFs remain marked unreviewed.
4. The comparison agent assembles service fit, specifications, pricing, regional availability, support/SLA, limitations, and source IDs. Unsupported facts stay unknown; prices retain their source units and assumptions.
5. The PDF includes the inferred architecture before its provider comparison, then is saved under the frontend public reports directory. The API response includes its URL and file name.

The frontend does not request company profiles or catalog PDFs. Provider material is managed on the backend; the document ingestion endpoint below remains available for backend-side catalog setup.

Other endpoints:

- `GET /api/health` — API status.
- `GET /api/knowledge/status` — indexed document counts and model readiness.
- `POST /api/knowledge/documents` — ingest a PDF with provider attribution (`speedcloud`, `aws`, `azure`, or `gcp`).

Uploaded chunks are stored under ignored `backend/data/` for local development. Only upload material you are authorized to process. Uploaded catalog facts should be reviewed before being used for a procurement decision.

## Initial scope and limitations

The PRD defines an India-first MVP for cloud infrastructure and AI workloads. It does not contain provider catalogs or current prices. Live search depends on configured API keys and search results; source capture does not prove that a price or service term is current. PDF uploads are not OCR-processed, and scanned PDFs need text extraction before ingestion. Reports are provisional and require analyst validation.

The selected profile and its weights are shown in the report, but no provider score is produced from unreviewed or incomplete evidence. Price normalization, freshness policy, analyst review tooling, and durable production storage remain follow-on work.

## Technology versions

The root lockfile records the installed dependency versions. The package manifests use current versions checked on 11 October 2026; Node 24 is the supported runtime line.
