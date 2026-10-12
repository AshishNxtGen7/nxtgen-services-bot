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
- `GET /metrics` — Prometheus exposition endpoint with request totals by method, route, and status code, request duration histograms, and in-flight request counts. The scrape endpoint excludes its own traffic.
- `GET /api/knowledge/status` — indexed document counts and model readiness.
- `POST /api/knowledge/documents` — ingest a PDF with provider attribution (`speedcloud`, `aws`, `azure`, or `gcp`).

### Start Prometheus on macOS

The [Prometheus query UI](http://localhost:9090/graph?g0.expr=nxtgen_api_http_requests_total&g0.tab=1) is available after Prometheus starts. Install it with Homebrew (Apple Silicon is supported by the official formula):

If `brew` is also unavailable, install Homebrew using its [official macOS instructions](https://docs.brew.sh/Installation), then reopen the terminal.

```sh
brew install prometheus
```

Keep the API bound to localhost (`HOST=127.0.0.1` in `backend/.env`, which is also the default). Start the backend, then run Prometheus from another terminal at the repository root:

```sh
prometheus --config.file=monitoring/prometheus.yml --storage.tsdb.path=monitoring/data --web.listen-address=127.0.0.1:9090
```

If Prometheus is already listening on port 9090, use that instance instead of starting a duplicate. Open the [Prometheus query UI](http://localhost:9090/graph?g0.expr=nxtgen_api_http_requests_total&g0.tab=1) and check **Status → Targets**; `nxtgen-api` should show as **UP**. If you want to run this project config alongside an existing instance, change the listen address in the command to `127.0.0.1:9091` and use port 9091 in the UI link. It can take up to 15 seconds for the first scrape. Stop a foreground instance with Ctrl-C.

Docker is an optional alternative. Set `HOST=0.0.0.0` in `backend/.env` so its container can reach the API, restart the backend, then run `docker compose -f compose.prometheus.yml up -d`. The API is unauthenticated, so use this setting only on a trusted local network and restore `HOST=127.0.0.1` afterward. Stop the container with `docker compose -f compose.prometheus.yml down`.

Useful PromQL queries for dashboards:

```promql
# Requests per second, grouped by API route and method
sum by (route, method) (rate(nxtgen_api_http_requests_total[5m]))

# 5xx response rate, grouped by route
sum by (route) (rate(nxtgen_api_http_requests_total{status_code=~"5.."}[5m]))

# 95th percentile request duration, grouped by route
histogram_quantile(0.95, sum by (le, route) (rate(nxtgen_api_http_request_duration_seconds_bucket[5m])))
```

Failed API requests (HTTP 4xx and 5xx) are written as structured backend error logs with the route, method, status, duration, and sanitized request and response bodies. Common credential fields such as passwords, tokens, API keys, authorization, and cookies are redacted; body logs are limited to 8,000 characters. View these in the backend process output or your configured log collector.

### Send server errors to OpenClaw

The backend can notify a local OpenClaw Gateway when it returns a 5xx response. Notifications are limited to one per method, route, and status every five minutes. They include method, route, status, duration, time, and the failed request and response bodies after the same credential redaction and 8,000-character per-body limit used in the backend logs. These bodies can contain customer requirements and are sent to OpenAI through your configured API key. The Gateway must be running on the same computer; this does not forward errors from a deployed API server to your laptop.

1. Install OpenClaw using the [official instructions](https://docs.openclaw.ai/install/installer), then run `openclaw onboard` and set up your model provider. Keep the Gateway bound to loopback.
2. Enable authenticated inbound hooks for the intended agent using the [OpenClaw webhook guide](https://docs.openclaw.ai/automation/cron-jobs/webhooks). Webhooks are disabled by default; allow only the agent you intend to receive these reports.
3. Set these values in `backend/.env` (keep the token private and do not commit it):

   ```dotenv
   OPENCLAW_ERROR_HOOK_URL=http://127.0.0.1:18789/hooks/agent
   OPENCLAW_ERROR_HOOK_TOKEN=<same-long-random-hook-token-configured-in-openclaw>
   OPENCLAW_ERROR_AGENT_ID=nxtgen-error-reviewer
   ```

The local Gateway dashboard is at [http://127.0.0.1:18789/](http://127.0.0.1:18789/). The `nxtgen-error-reviewer` agent uses a separate clean worktree and can run only the guarded `nxtgen-pr` helper: it syncs from `origin/main`, builds the project, and opens a PR on a `fix/openclaw-*` branch. It cannot merge or push to `main`. The helper requires GitHub CLI authentication; from a new terminal, run `gh auth login --hostname github.com --git-protocol https --web` and complete GitHub’s sign-in flow. The GitHub Actions build workflow runs on PRs and pushes to `main`. Prometheus metrics remain useful for request rates and trends; this notification path is for local server-side errors while the Mac and Gateway are running.

OpenAI API usage by the error agent can incur usage charges. It receives the sanitized request and response content described above so it can use the failed requirement as diagnostic context.

Uploaded chunks are stored under ignored `backend/data/` for local development. Only upload material you are authorized to process. Uploaded catalog facts should be reviewed before being used for a procurement decision.

## Initial scope and limitations

The PRD defines an India-first MVP for cloud infrastructure and AI workloads. It does not contain provider catalogs or current prices. Live search depends on configured API keys and search results; source capture does not prove that a price or service term is current. PDF uploads are not OCR-processed, and scanned PDFs need text extraction before ingestion. Reports are provisional and require analyst validation.

The selected profile and its weights are shown in the report, but no provider score is produced from unreviewed or incomplete evidence. Price normalization, freshness policy, analyst review tooling, and durable production storage remain follow-on work.

## Technology versions

The root lockfile records the installed dependency versions. The package manifests use current versions checked on 11 October 2026; Node 24 is the supported runtime line.
