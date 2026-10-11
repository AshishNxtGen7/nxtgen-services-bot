import type { ComparisonCell, RecommendationReport, ResearchClaim, ResearchSource } from "../domain/types.js";

export type PdfReportData = Omit<RecommendationReport, "reportUrl" | "pdfFileName">;

const palette = {
  ink: "#17243b",
  body: "#36445a",
  muted: "#66748a",
  violet: "#6551c8",
  pale: "#f3f6fb",
  line: "#dce3ed",
  green: "#17856b",
};

export function renderReportHtml(report: PdfReportData): string {
  const validSourceIds = new Set(report.sources.map((source) => source.id));
  const citedPricingNotes = report.providers.reduce((total, provider) => total + provider.services.reduce((serviceTotal, service) => (
    serviceTotal + service.pricing.filter((claim) => claim.sourceIds.some((id) => validSourceIds.has(id))).length
  ), 0), 0);
  const comparisonCellCount = report.comparison.length * report.providers.length;
  const citedCellCount = report.comparison.reduce((total, row) => total + report.providers.filter((provider) => (
    row.values[provider.providerId]?.sourceIds.some((id) => validSourceIds.has(id))
  )).length, 0);
  const comparisonCoverage = comparisonCellCount ? Math.round(citedCellCount / comparisonCellCount * 100) : 0;

  const providerCoverage = report.providers.map((provider) => {
    const citedRows = report.comparison.filter((row) => row.values[provider.providerId]?.sourceIds.some((id) => validSourceIds.has(id))).length;
    const percentage = report.comparison.length ? Math.round(citedRows / report.comparison.length * 100) : 0;
    return `<div class="bar-row"><span class="bar-label">${escapeHtml(provider.providerName)}</span><span class="track"><span class="fill" style="width:${percentage}%"></span></span><strong>${percentage}%</strong></div>`;
  }).join("");

  const providerPricingEvidence = renderCountBars(report.providers.map((provider) => ({
    label: provider.providerName,
    count: countCitedClaims(provider.services.flatMap((service) => service.pricing), validSourceIds),
  })));

  const comparisonRows = report.comparison.map((row) => `
    <tr>
      <th scope="row">${escapeHtml(row.dimension)}</th>
      ${report.providers.map((provider) => `<td>${comparisonCell(row.values[provider.providerId], validSourceIds)}</td>`).join("")}
    </tr>`).join("");

  const providerPages = report.providers.map((provider) => {
    const averageServiceTextLength = provider.services.length
      ? provider.services.reduce((total, service) => total + service.fit.statement.length + [
        ...service.specifications,
        ...service.pricing,
        ...service.availability,
        ...service.supportAndSla,
        ...service.limitations,
      ].reduce((length, claim) => length + claim.statement.length, 0), 0) / provider.services.length
      : 0;
    const estimatedCardsOnResearchPage = Math.max(2, Math.min(4, Math.floor(1200 / Math.max(1, averageServiceTextLength))));
    const firstPageServiceCount = provider.services.length > 4
      ? Math.min(provider.services.length, estimatedCardsOnResearchPage)
      : provider.services.length;
    const firstPageServices = provider.services.slice(0, firstPageServiceCount);
    const continuationServices = provider.services.slice(firstPageServiceCount);
    const renderServices = (items: typeof provider.services) => items.map((service) => `
        <article class="service-card">
          <div class="service-heading"><h3>${escapeHtml(service.serviceName)}</h3><span>${escapeHtml(service.category)}</span></div>
          ${claimGroup("Fit", [service.fit], validSourceIds, 1, 260)}
          ${claimGroup("Specifications and availability", [...service.specifications, ...service.availability], validSourceIds, 3, 190)}
          ${claimGroup("Pricing and support", [...service.pricing, ...service.supportAndSla], validSourceIds, 3, 190)}
          ${claimGroup("Limitations", service.limitations, validSourceIds, 2, 170)}
        </article>`).join("");
    const services = provider.services.length
      ? renderServices(firstPageServices)
      : `<p class="empty">No structured service facts were extracted in this run. Review the cited material and verify the offering directly with the provider.</p>`;
    const note = provider.note ? `<p class="provider-note">${escapeHtml(shortText(provider.note, 420))}</p>` : "";
    return `
      <section class="provider-page page">
        <div class="eyebrow">PROVIDER RESEARCH</div>
        <h2>${escapeHtml(provider.providerName)}</h2>
        <p class="subhead">${escapeHtml(provider.status.replaceAll("_", " "))} · Researched ${escapeHtml(formatDate(provider.searchedAt))} · ${provider.services.length} service${provider.services.length === 1 ? "" : "s"} identified</p>
        ${note}
        ${renderProviderEvidence(provider, report, validSourceIds)}
        ${services}
      </section>
      ${continuationServices.length ? `<section class="provider-continuation page"><div class="eyebrow">PROVIDER RESEARCH / CONTINUED</div><h2>${escapeHtml(provider.providerName)}</h2><p class="subhead">Additional identified services</p>${renderServices(continuationServices)}</section>` : ""}`;
  }).join("");

  const sources = report.sources.length
    ? report.sources.map((source) => sourceEntry(source)).join("")
    : `<p class="empty">No sources were captured in this run.</p>`;
  const tradeoffs = report.tradeoffs.length
    ? `<section class="summary-block"><h2>Trade-offs to verify</h2><ul>${report.tradeoffs.slice(0, 4).map((claim) => `<li>${claimText(claim, validSourceIds, 210)}</li>`).join("")}</ul></section>`
    : "";
  const architectureComponents = report.analysis.architectureComponents.map((component) => `
    <article class="architecture-card">
      <div class="architecture-heading"><h3>${escapeHtml(component.name)}</h3><span class="priority ${component.priority}">${escapeHtml(component.priority)}</span></div>
      <p><strong>Role:</strong> ${escapeHtml(component.role)}</p>
      <p><strong>Why:</strong> ${escapeHtml(component.rationale)}</p>
    </article>`).join("");
  const requestScope = [
    `Workload: ${report.analysis.workloadType}`,
    `Inferred architecture components: ${report.analysis.architectureComponents.length}`,
    `Key constraints: ${report.analysis.mustHaveConstraints.join("; ") || "none stated"}`,
  ].join(" · ");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="Evidence-backed cloud service comparison for NxtGen SpeedCloud, AWS, Azure, and Google Cloud.">
  <title>NxtGen SpeedCloud Cloud Service Comparison</title>
  <style>
    @page { size: A4 portrait; margin: 14mm 13mm 18mm; }
    @page comparison { size: A4 landscape; margin: 13mm 12mm 18mm; }
    * { box-sizing: border-box; }
    html { color: ${palette.ink}; font-family: Arial, Helvetica, sans-serif; font-size: 9pt; }
    body { margin: 0; line-height: 1.48; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    h1,h2,h3,p,ul { margin-top: 0; }
    h1 { margin-bottom: 4mm; font-size: 27pt; line-height: 1.08; letter-spacing: -.7pt; }
    h2 { margin-bottom: 2mm; font-size: 18pt; line-height: 1.15; letter-spacing: -.25pt; }
    h3 { margin-bottom: 0; font-size: 11pt; }
    p { margin-bottom: 3mm; }
    .page { break-after: page; }
    .page:last-child { break-after: auto; }
    .eyebrow { margin-bottom: 3mm; color: ${palette.violet}; font-size: 8pt; font-weight: 700; letter-spacing: 1.2pt; }
    .meta,.subhead { color: ${palette.muted}; font-size: 8pt; }
    .requirement { margin: 5mm 0 2mm; padding: 4mm 5mm; border-radius: 2mm; background: ${palette.pale}; font-size: 11pt; line-height: 1.5; }
    .scope { color: ${palette.body}; font-size: 8pt; }
    .summary-block { margin-top: 4mm; break-inside: avoid; }
    .summary-block h2 { color: ${palette.violet}; font-size: 12pt; letter-spacing: 0; }
    .claim { margin: 0; color: ${palette.body}; }
    .refs { color: ${palette.violet}; font-size: 7.5pt; font-weight: 700; }
    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; margin: 5mm 0; }
    .kpi { min-height: 19mm; padding: 3mm; border-radius: 2mm; background: ${palette.pale}; }
    .kpi strong { display: block; margin-bottom: 1mm; color: ${palette.violet}; font-size: 18pt; line-height: 1.1; }
    .kpi span { color: ${palette.muted}; font-size: 7.5pt; }
    .charts { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; margin-top: 2mm; }
    .chart { padding: 4mm; border-radius: 2mm; background: ${palette.pale}; break-inside: avoid; }
    .chart h3 { margin-bottom: 3mm; font-size: 9pt; }
    .chart h4 { margin: 0 0 2mm; font-size: 8pt; }
    .bar-row { display: grid; grid-template-columns: minmax(27mm, 1fr) 1.2fr 9mm; align-items: center; gap: 2mm; margin: 2.4mm 0; font-size: 7.1pt; }
    .bar-label { overflow-wrap: anywhere; color: ${palette.body}; }
    .track { height: 2mm; overflow: hidden; border-radius: 3mm; background: ${palette.line}; }
    .fill { display: block; height: 100%; border-radius: inherit; background: ${palette.violet}; }
    .bar-row strong { text-align: right; font-size: 7.3pt; }
    .bar-row.selected .bar-label { color: ${palette.violet}; font-weight: 700; }
    .chart-note,.fine-print { color: ${palette.muted}; font-size: 7.4pt; }
    .provider-evidence { margin: 3mm 0 4mm; padding: 3mm; border: .25mm solid ${palette.line}; border-radius: 2mm; break-inside: avoid; }
    .provider-evidence > h3 { margin-bottom: 1mm; font-size: 9pt; }
    .provider-evidence .charts { gap: 3mm; }
    .provider-evidence .chart { padding: 2.5mm; }
    .provider-evidence .bar-row { grid-template-columns: minmax(24mm, 1fr) 1.2fr 8mm; margin: 1.5mm 0; font-size: 6.8pt; }
    .provider-kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2mm; margin: 2mm 0; }
    .provider-kpi { padding: 2mm; border-radius: 1.5mm; background: ${palette.pale}; }
    .provider-kpi strong { display: block; color: ${palette.violet}; font-size: 12pt; }
    .provider-kpi span { color: ${palette.muted}; font-size: 6.7pt; }
    .provider-evidence .chart-note { margin: 2mm 0 0; font-size: 6.8pt; }
    .notice { margin-top: 3mm; padding: 3mm 4mm; border-radius: 2mm; background: #e9f6f1; color: ${palette.body}; font-size: 8pt; }
    .architecture-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2.5mm; margin-top: 3mm; }
    .architecture-card { padding: 2.5mm 3mm; border: .25mm solid ${palette.line}; border-radius: 1.8mm; break-inside: avoid; }
    .architecture-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 2mm; margin-bottom: 1.5mm; }
    .architecture-heading h3 { font-size: 9pt; line-height: 1.25; }
    .priority { flex: 0 0 auto; padding: .5mm 1.4mm; border-radius: 2mm; font-size: 6.2pt; font-weight: 700; text-transform: uppercase; }
    .priority.core { background: #e7f5ef; color: #176c51; }
    .priority.recommended { background: #eeebff; color: ${palette.violet}; }
    .priority.conditional { background: #fff4df; color: #8b5a00; }
    .architecture-card p { margin: 1mm 0 0; color: ${palette.body}; font-size: 7.2pt; line-height: 1.3; }
    .architecture-card strong { color: ${palette.ink}; }
    .comparison-page { page: comparison; break-after: page; }
    .comparison-page h2 { margin-bottom: 2mm; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 6.8pt; }
    thead { display: table-header-group; }
    th,td { padding: 1.5mm 1.7mm; border: .25mm solid ${palette.line}; vertical-align: top; overflow-wrap: anywhere; line-height: 1.3; }
    thead th { background: ${palette.ink}; color: white; text-align: left; font-size: 7.5pt; }
    thead th:first-child { width: 19%; }
    tbody th { background: ${palette.pale}; text-align: left; font-weight: 700; }
    tbody tr { break-inside: avoid; }
    .cell-value { color: ${palette.body}; }
    .cell-refs { display: block; margin-top: .6mm; color: ${palette.violet}; font-size: 6.2pt; font-weight: 700; }
    .provider-page h2 { margin-bottom: 1.5mm; }
    .provider-continuation h2 { margin-bottom: 1mm; }
    .provider-note { margin: 2mm 0; padding: 2.5mm; border-left: 1mm solid ${palette.violet}; background: ${palette.pale}; }
    .service-card { margin: 3mm 0; padding: 2.5mm 0; border-bottom: .25mm solid ${palette.line}; break-inside: avoid; }
    .service-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 5mm; margin-bottom: 2mm; }
    .service-heading span { color: ${palette.violet}; font-size: 7.5pt; font-weight: 700; }
    .detail { margin: 1.5mm 0; color: ${palette.body}; font-size: 8pt; }
    .detail strong { color: ${palette.ink}; }
    .source-entry { margin: 0 0 3mm; padding-bottom: 2mm; border-bottom: .2mm solid ${palette.line}; }
    .source-title { margin-bottom: .5mm; font-size: 8.4pt; font-weight: 700; }
    .source-url { display: block; color: ${palette.violet}; font-size: 7.3pt; overflow-wrap: anywhere; text-decoration: none; }
    .source-meta { color: ${palette.muted}; font-size: 7pt; }
    .empty { padding: 4mm; border-radius: 2mm; background: ${palette.pale}; color: ${palette.muted}; }
    ul { margin-bottom: 0; padding-left: 5mm; }
    li { margin: 1.5mm 0; color: ${palette.body}; }
    a { color: ${palette.violet}; }
  </style>
</head>
<body>
  <section class="overview page">
    <div class="eyebrow">SPEEDCLOUD ADVISOR / CLOUD RESEARCH</div>
    <h1>Cloud service comparison</h1>
    <p class="meta">${escapeHtml(formatDate(report.generatedAt))} · ${escapeHtml(report.profile.name)} profile · ${report.provisional ? "Provisional research" : "Research report"} · version ${escapeHtml(report.profile.version)}</p>
    <h2 class="section-label">Your requirement</h2>
    <div class="requirement">${escapeHtml(shortText(report.requirement, 520))}</div>
    <p class="scope">${escapeHtml(shortText(requestScope, 560))}</p>
    <section class="summary-block"><h2>Executive summary</h2><p class="claim">${claimText(report.executiveSummary, validSourceIds, 360)}</p></section>
    <section class="summary-block"><h2>Recommended next step</h2><p class="claim">${claimText(report.recommendation, validSourceIds, 360)}</p></section>
    ${tradeoffs}
    <div class="kpis">
      <div class="kpi"><strong>${report.providers.length}</strong><span>Providers in comparison</span></div>
      <div class="kpi"><strong>${report.comparison.length}</strong><span>Comparison dimensions</span></div>
      <div class="kpi"><strong>${report.sources.length}</strong><span>Captured sources</span></div>
      <div class="kpi"><strong>${citedPricingNotes}</strong><span>Cited pricing notes</span></div>
    </div>
    <h2 class="section-label">Evidence coverage and decision priorities</h2>
    <div class="charts">
      <section class="chart"><h3>Cited comparison cells</h3>${providerCoverage}</section>
      <section class="chart"><h3>Pricing facts with sources</h3>${providerPricingEvidence}</section>
    </div>
    <p class="chart-note">Overall, ${comparisonCoverage}% of comparison cells link to a captured source. Coverage measures documentation, not service quality. Counts are captured facts, not provider scores. Evaluation priorities: ${escapeHtml(Object.entries(report.profile.weights).map(([label, weight]) => `${label} ${Math.round(weight * 100)}%`).join(" · "))}.</p>
  </section>
  <section class="architecture-page page">
    <div class="eyebrow">SOLUTION ARCHITECTURE / BEFORE PROVIDER SEARCH</div>
    <h2>What the application needs to run</h2>
    <p class="subhead">These vendor-neutral components translate the business requirement into services to research. Core components support the basic workload; recommended components improve delivery and operations; conditional components depend on measured scale or latency.</p>
    ${architectureComponents ? `<div class="architecture-grid">${architectureComponents}</div>` : `<p class="empty">No architecture components were inferred. Provider research is based on the supporting services listed in the requirement analysis.</p>`}
  </section>
  <section class="comparison-page page">
    <div class="eyebrow">PROVIDER COMPARISON</div>
    <h2>What each provider documents</h2>
    <p class="subhead">Cited matches for the inferred architecture components. Source IDs refer to the appendix; confirm current configuration and commercial terms.</p>
    <table aria-label="Cloud provider comparison"><thead><tr><th scope="col">Dimension</th>${report.providers.map((provider) => `<th scope="col">${escapeHtml(provider.providerName)}</th>`).join("")}</tr></thead><tbody>${comparisonRows}</tbody></table>
    <div class="notice">Savings or profit percentage is not calculated because this research does not contain normalized prices for equivalent workload, region, usage, and contract terms.</div>
    <p class="fine-print">Unknown means no supported fact was extracted in this research run; it does not mean a provider lacks the capability. This evidence-led matrix does not calculate a winner.</p>
  </section>
  ${providerPages}
  <section class="sources-page page">
    <div class="eyebrow">RESEARCH TRAIL</div>
    <h2>Sources and verification notes</h2>
    <p class="subhead">Sources captured during provider research. Retrieval time is not the same as the source page's publication or update date. Pricing and service terms may depend on region, configuration, usage, and contract.</p>
    ${sources}
    <p class="fine-print">Research is a shortlist, not a procurement quote or a legal or compliance determination. Validate service availability, data residency, SLA, support scope, and commercial terms with the provider before committing.</p>
  </section>
</body>
</html>`;
}

export const reportHeaderTemplate = `<div style="width:100%;height:1px"></div>`;
export const reportFooterTemplate = `<div style="width:100%;margin:0 12mm;padding-top:2mm;border-top:.25mm solid #dce3ed;color:#66748a;font-family:Arial,Helvetica,sans-serif;font-size:7pt;display:flex;justify-content:space-between"><span>NxtGen SpeedCloud · Client proposal</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;

function claimGroup(label: string, claims: ResearchClaim[], sourceIds: Set<string>, limit: number, maxLength: number): string {
  const selected = deduplicateClaims(claims).slice(0, limit);
  if (!selected.length) return "";
  return `<p class="detail"><strong>${escapeHtml(label)}:</strong> ${selected.map((claim) => claimText(claim, sourceIds, maxLength)).join("; ")}</p>`;
}

function renderProviderEvidence(provider: PdfReportData["providers"][number], report: PdfReportData, validSourceIds: Set<string>): string {
  const citedDimensions = report.comparison.filter((row) => row.values[provider.providerId]?.sourceIds.some((id) => validSourceIds.has(id))).length;
  const citedPricing = countCitedClaims(provider.services.flatMap((service) => service.pricing), validSourceIds);
  const categories = [
    ["Fit", provider.services.flatMap((service) => [service.fit])],
    ["Specifications", provider.services.flatMap((service) => service.specifications)],
    ["Pricing", provider.services.flatMap((service) => service.pricing)],
    ["Availability", provider.services.flatMap((service) => service.availability)],
    ["Support / SLA", provider.services.flatMap((service) => service.supportAndSla)],
    ["Limitations", provider.services.flatMap((service) => service.limitations)],
  ] as const;
  const breakdown = renderCountBars(categories.map(([label, claims]) => ({ label, count: countCitedClaims(claims, validSourceIds) })));
  const coverageBars = report.providers.map((item) => {
    const cited = report.comparison.filter((row) => row.values[item.providerId]?.sourceIds.some((id) => validSourceIds.has(id))).length;
    const percentage = report.comparison.length ? Math.round(cited / report.comparison.length * 100) : 0;
    const selected = item.providerId === provider.providerId ? " selected" : "";
    return `<div class="bar-row${selected}"><span class="bar-label">${escapeHtml(item.providerName)}</span><span class="track"><span class="fill" style="width:${percentage}%"></span></span><strong>${percentage}%</strong></div>`;
  }).join("");
  const servicesWithSourcedFacts = provider.services.filter((service) => countCitedClaims([
    service.fit, ...service.specifications, ...service.pricing, ...service.availability, ...service.supportAndSla, ...service.limitations,
  ], validSourceIds) > 0).length;

  return `<section class="provider-evidence">
    <h3>Evidence snapshot</h3>
    <p class="chart-note">This summarizes captured, cited facts; it is not a service quality or cost score.</p>
    <div class="provider-kpis">
      <div class="provider-kpi"><strong>${citedDimensions}/${report.comparison.length}</strong><span>comparison dimensions with citations</span></div>
      <div class="provider-kpi"><strong>${servicesWithSourcedFacts}/${provider.services.length}</strong><span>identified services with cited facts</span></div>
      <div class="provider-kpi"><strong>${citedPricing}</strong><span>cited pricing notes; no normalized quote</span></div>
    </div>
    <div class="charts">
      <section class="chart"><h4>Dimension evidence by provider</h4>${coverageBars}</section>
      <section class="chart"><h4>${escapeHtml(provider.providerName)}: sourced details by type</h4>${breakdown}</section>
    </div>
    <p class="chart-note">Bars count supported documentation in this run. Empty or unknown evidence means no supported fact was captured, not that the provider lacks the capability. Price counts are references, not amounts.</p>
  </section>`;
}

function countCitedClaims(claims: ResearchClaim[], validSourceIds: Set<string>): number {
  return deduplicateClaims(claims).filter((claim) => claim.sourceIds.some((id) => validSourceIds.has(id))).length;
}

function renderCountBars(items: Array<{ label: string; count: number }>): string {
  const maximum = Math.max(1, ...items.map((item) => item.count));
  return items.map(({ label, count }) => {
    const width = count ? Math.max(3, Math.round(count / maximum * 100)) : 0;
    return `<div class="bar-row"><span class="bar-label">${escapeHtml(label)}</span><span class="track"><span class="fill" style="width:${width}%"></span></span><strong>${count}</strong></div>`;
  }).join("");
}

function claimText(claim: ResearchClaim, sourceIds: Set<string>, maxLength: number): string {
  const references = [...new Set(claim.sourceIds.filter((id) => sourceIds.has(id)))];
  const refs = references.length ? ` <span class="refs">[${references.map(escapeHtml).join(", ")}]</span>` : "";
  return `${escapeHtml(shortText(claim.statement, maxLength))}${refs}`;
}

function comparisonCell(cell: ComparisonCell | undefined, sourceIds: Set<string>): string {
  if (!cell) return `<span class="cell-value">No comparison data captured.</span>`;
  const references = [...new Set(cell.sourceIds.filter((id) => sourceIds.has(id)))];
  const refs = references.length ? `<span class="cell-refs">[${references.map(escapeHtml).join(", ")}]</span>` : "";
  return `<span class="cell-value">${escapeHtml(shortText(cell.value, 220))}</span>${refs}`;
}

function sourceEntry(source: ResearchSource): string {
  const safeUrl = getSafeUrl(source.url);
  const url = safeUrl
    ? `<a class="source-url" href="${escapeHtml(safeUrl)}">${escapeHtml(safeUrl)}</a>`
    : `<span class="source-url">Uploaded file</span>`;
  return `<article class="source-entry"><div class="source-title">[${escapeHtml(source.id)}] ${escapeHtml(source.title)}</div>${url}<div class="source-meta">${escapeHtml(source.kind.replaceAll("-", " "))} · Retrieved ${escapeHtml(formatDate(source.capturedAt))}</div></article>`;
}

function getSafeUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function deduplicateClaims(claims: ResearchClaim[]): ResearchClaim[] {
  const found = new Set<string>();
  return claims.filter((claim) => {
    const statement = cleanText(claim.statement).toLocaleLowerCase();
    if (!statement || found.has(statement)) return false;
    found.add(statement);
    return true;
  });
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? cleanText(value) : date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
}

function shortText(value: string, maxLength: number): string {
  const cleaned = cleanText(value);
  if (cleaned.length <= maxLength) return cleaned;
  const boundary = cleaned.lastIndexOf(" ", maxLength - 1);
  return `${cleaned.slice(0, boundary > maxLength * 0.65 ? boundary : maxLength - 1).trimEnd()}…`;
}

function cleanText(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ").replace(/\s+/g, " ").trim();
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character] ?? character);
}
