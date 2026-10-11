import type {
  PerformanceMeasurement,
  ProviderId,
  ProviderResearch,
  PublishedPriceObservation,
  ResearchClaim,
} from "../domain/types.js";
import type { PdfReportData } from "./pdf-report-html.js";

const providerColors: Record<ProviderId, string> = {
  speedcloud: "#6551c8",
  gcp: "#18856b",
  aws: "#d08a22",
  azure: "#2581a9",
};
const salesProviderOrder: ProviderId[] = ["speedcloud", "aws", "gcp", "azure"];

export function renderSalesReportHtml(report: PdfReportData): string {
  const sourceIds = new Set(report.sources.map((source) => source.id));
  const speedcloud = report.providers.find((provider) => provider.providerId === "speedcloud");
  const highlights = renderSpeedCloudHighlights(speedcloud, sourceIds);
  const pricingComparison = renderPricingComparison(report, sourceIds);
  const speedcloudServiceDetails = renderSpeedCloudServiceDetails(speedcloud, sourceIds);
  const performanceCharts = renderPerformanceCharts(report, sourceIds);
  const performanceSection = performanceCharts.length
    ? "<section class=\"performance-section\"><div class=\"eyebrow\">PERFORMANCE / COMPARABLE PUBLISHED DATA</div><h2>Service performance</h2><p class=\"subhead\">Only measurements with a shared workload, metric, units, and test load are compared. SpeedCloud is highlighted.</p>" + performanceCharts.join("") + "</section>"
    : "<aside class=\"benchmark-gap\"><div class=\"gap-icon\">—</div><div><h3>Performance benchmark data is not available yet</h3><p>No comparable numeric measurements were captured for the providers in this report. A controlled benchmark with the same workload, configuration, region, and test conditions is needed before ranking performance.</p></div></aside>";
  const sourceNotes = renderSpeedCloudSourceNotes(speedcloud, report.sources, sourceIds);
  const sourceAppendix = renderSourceAppendix(report);

  const styles = [
    "@page { size:A4 portrait; margin:13mm 13mm 17mm; }",
    "@page pricing { size:A4 landscape; margin:12mm 11mm 16mm; }",
    "* { box-sizing:border-box; }",
    "html { color:#17243b; font-family:Arial,Helvetica,sans-serif; font-size:9pt; }",
    "body { margin:0; line-height:1.42; -webkit-print-color-adjust:exact; print-color-adjust:exact; }",
    "h1,h2,h3,p { margin-top:0; }",
    "h1 { margin:2mm 0 2mm; font-size:27pt; line-height:1.06; letter-spacing:-.7pt; }",
    "h2 { margin:0 0 2mm; font-size:16pt; line-height:1.15; }",
    "h3 { margin:0; font-size:9.5pt; }",
    ".page { break-after:page; } .page:last-child { break-after:auto; }",
    ".topline { display:flex; justify-content:space-between; align-items:center; gap:4mm; margin-bottom:5mm; }",
    ".eyebrow { color:#6551c8; font-size:7.5pt; font-weight:700; letter-spacing:1.3pt; }",
    ".proposal-tag { padding:1.5mm 3mm; border-radius:12mm; background:#eeeaff; color:#5140ad; font-size:7pt; font-weight:700; text-transform:uppercase; }",
    ".hero { padding:7mm; border-radius:3mm; background:linear-gradient(115deg,#21174e,#6551c8); color:#fff; }",
    ".hero .eyebrow { color:#d5ccff; } .hero h1 { max-width:155mm; color:#fff; }",
    ".lead { margin:2mm 0 0; color:#eeeaff; font-size:11pt; line-height:1.4; }",
    ".hero-foot { display:flex; justify-content:space-between; align-items:flex-end; gap:5mm; margin-top:5mm; padding-top:3mm; border-top:1px solid #ffffff45; }",
    ".hero-foot strong { display:block; font-size:13pt; } .hero-foot span { display:block; color:#ddd8ff; font-size:7.5pt; }",
    ".meta { color:#66748a; font-size:7.5pt; } .section { margin-top:5mm; }",
    ".highlights { display:grid; grid-template-columns:repeat(3,1fr); gap:3mm; margin-top:3mm; }",
    ".highlight { min-height:34mm; padding:3.3mm; border:1px solid #dce3ed; border-radius:2.3mm; background:#fff; break-inside:avoid; }",
    ".highlight h3 { margin-bottom:2mm; color:#5140ad; } .highlight .product { margin:0 0 1.5mm; color:#66748a; font-size:6.8pt; font-weight:700; }",
    ".claim { margin:0; color:#36445a; font-size:7.7pt; line-height:1.4; }",
    ".refs { color:#6551c8; font-size:6.5pt; font-weight:700; }",
    ".chart-pair { display:grid; grid-template-columns:1fr 1fr; gap:3mm; margin:2.5mm 0; } .chart-pair.single-chart { grid-template-columns:1fr; }",
    ".chart { min-width:0; padding:3mm; border:1px solid #dce3ed; border-radius:2mm; background:#f5f7fb; break-inside:avoid; }",
    ".chart h3 { margin-bottom:1mm; font-size:8.5pt; } .chart-note { margin:1.5mm 0 0; color:#66748a; font-size:6.6pt; line-height:1.35; }",
    ".bar-svg, .line-chart svg { display:block; width:100%; height:auto; }",
    ".bar-svg text { font-family:Arial,Helvetica,sans-serif; }",
    ".benchmark-gap { display:flex; align-items:center; gap:4mm; margin-top:4mm; padding:3.5mm; border:1px solid #ecdcb7; border-radius:2mm; background:#fff9eb; }",
    ".gap-icon { display:grid; width:10mm; height:10mm; flex:0 0 auto; place-items:center; border-radius:50%; background:#fff0cd; color:#8b5a00; font-size:14pt; font-weight:700; }",
    ".benchmark-gap h3 { margin-bottom:1mm; color:#6f4b08; } .benchmark-gap p { margin:0; color:#6d5d3e; font-size:7pt; line-height:1.4; }",
    ".speed-note { margin-top:4mm; padding:3mm 3.5mm; border-left:1mm solid #6551c8; background:#f4f1ff; color:#3e347a; font-size:7.5pt; }",
    ".source-notes { display:flex; flex-wrap:wrap; gap:1.5mm 4mm; margin-top:3mm; padding-top:2.5mm; border-top:1px solid #dce3ed; }",
    ".source-notes a { color:#6551c8; font-size:6.4pt; text-decoration:none; }",
    ".performance-section { margin-top:5mm; } .performance-section .subhead { color:#66748a; font-size:7.5pt; margin-bottom:2mm; } .line-chart { margin:2mm 0; padding:3mm; border:1px solid #dce3ed; border-radius:2mm; break-inside:avoid; }",
    ".line-chart h3 { margin-bottom:1mm; font-size:9pt; } .line-context { margin:0 0 1mm; color:#66748a; font-size:6.8pt; }",
    ".legend { display:flex; flex-wrap:wrap; gap:1.5mm 4mm; margin-top:1mm; }",
    ".legend-item { display:flex; align-items:center; gap:1.5mm; color:#36445a; font-size:7pt; } .swatch { width:4mm; height:1mm; border-radius:1mm; }",
    ".fine { color:#66748a; font-size:6.8pt; }",
    ".pricing-page { page:pricing; }",
    ".price-intro { max-width:245mm; margin-bottom:3mm; color:#66748a; font-size:7.5pt; }",
    ".price-table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:7pt; }",
    ".price-table thead { display:table-header-group; } .price-table th,.price-table td { padding:2.2mm; border:.25mm solid #dce3ed; vertical-align:top; overflow-wrap:anywhere; line-height:1.35; }",
    ".price-table thead th { background:#21174e; color:#fff; text-align:left; font-size:7.5pt; } .price-table thead th:first-child { width:18%; }",
    ".price-table tbody th { background:#f3f1ff; color:#40337e; text-align:left; } .price-table tbody tr { break-inside:avoid; }",
    ".price-offer { margin:0 0 2mm; padding:0 0 1.7mm; border-bottom:.2mm solid #e5e9f0; break-inside:avoid; } .price-offer:last-child { margin:0; padding:0; border:0; }",
    ".price-offer strong { color:#25324a; font-size:6.6pt; } .price-offer p { margin:1mm 0 0; color:#445168; font-size:6.6pt; }",
    ".price-missing { color:#66748a; font-size:6.6pt; font-style:italic; }",
    ".price-cell.speedcloud { background:#faf8ff; } .price-cell.speedcloud .price-offer strong { color:#5140ad; }",
    ".service-detail { margin:4mm 0; padding:3.5mm; border:1px solid #dce3ed; border-radius:2mm; break-inside:auto; }",
    ".service-detail h3 { display:flex; justify-content:space-between; gap:4mm; margin-bottom:2.5mm; font-size:11pt; break-after:avoid-page; } .service-detail h3 span { color:#6551c8; font-size:7pt; font-weight:700; }",
    ".service-detail .fit { margin:0 0 2mm; padding:2.5mm; border-left:1mm solid #6551c8; background:#f4f1ff; }",
    ".detail-grid { display:grid; grid-template-columns:1fr 1fr; gap:2mm 4mm; } .detail-group { break-inside:auto; } .detail-group h4 { margin:0 0 1mm; color:#5140ad; font-size:7.3pt; text-transform:uppercase; letter-spacing:.3pt; break-after:avoid-page; }",
    ".detail-group ul { margin:0; padding-left:4mm; } .detail-group li { margin:0 0 1mm; color:#36445a; font-size:7pt; line-height:1.35; break-inside:avoid-page; }",
    ".source-provider { margin:4mm 0; } .source-provider h3 { margin-bottom:1.5mm; color:#5140ad; } .source-item { margin:0 0 1.5mm; font-size:6.8pt; line-height:1.35; break-inside:avoid; } .source-item a { color:#6551c8; text-decoration:none; }",
  ].join("");

  const content = [
    "<section class=\"proposal-page page\">",
    "<div class=\"topline\"><span class=\"eyebrow\">SPEEDCLOUD ADVISOR / CLIENT PROPOSAL</span><span class=\"proposal-tag\">Preferred proposal</span></div>",
    "<div class=\"hero\"><div class=\"eyebrow\">NXTGEN SPEEDCLOUD + SPEEDCLOUD SUPREME</div><h1>A cloud foundation for " + escapeHtml(report.analysis.workloadType) + "</h1>",
    "<p class=\"lead\">" + escapeHtml(shortText(report.analysis.problemSummary, 230)) + "</p>",
    "<div class=\"hero-foot\"><div><span>Proposed direction</span><strong>NxtGen SpeedCloud</strong></div><span>Sales proposal · " + escapeHtml(formatProposalDate(report.generatedAt)) + "</span></div></div>",
    "<section class=\"section\"><h2>Why SpeedCloud fits this proposal</h2><div class=\"highlights\">" + highlights + "</div></section>",
    performanceSection,
    "<div class=\"speed-note\"><strong>Preferred proposal: NxtGen SpeedCloud.</strong> Confirm final workload sizing and run a matched benchmark before making performance or savings commitments.</div>",
    sourceNotes,
    "</section>",
    "<section class=\"pricing-page page\"><div class=\"eyebrow\">COMMERCIAL VIEW / REQUIRED COMPONENTS</div><h2>Published price comparison</h2><p class=\"price-intro\">Prices below are provider-published notes for the inferred service components. They retain the source currency, unit, configuration and region. They are not a normalized monthly total: client usage, service sizing, egress, taxes and contract terms must be confirmed before a quote comparison.</p><table class=\"price-table\"><thead><tr><th>Required cloud component</th><th>NxtGen SpeedCloud</th><th>AWS</th><th>Google Cloud</th><th>Azure</th></tr></thead><tbody>" + pricingComparison + "</tbody></table></section>",
    "<section class=\"details-section page\"><div class=\"eyebrow\">PREFERRED PROPOSAL / SERVICE SCOPE</div><h2>NxtGen SpeedCloud service details</h2><p class=\"price-intro\">Source-backed service fit, published specifications, prices, regions, support terms, performance facts, and limitations captured for this workload.</p>" + speedcloudServiceDetails + "</section>",
    sourceAppendix,
  ].join("");

  return "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>NxtGen SpeedCloud Proposal</title><style>" + styles + "</style></head><body>" + content + "</body></html>";
}

function renderSpeedCloudHighlights(provider: ProviderResearch | undefined, validIds: Set<string>): string {
  const allClaims = provider?.services.flatMap((service) => [
    { serviceName: service.serviceName, claim: service.fit },
    ...service.specifications.map((claim) => ({ serviceName: service.serviceName, claim })),
    ...service.availability.map((claim) => ({ serviceName: service.serviceName, claim })),
    ...service.supportAndSla.map((claim) => ({ serviceName: service.serviceName, claim })),
  ]) ?? [];
  const picks = [
    { title: "India-based foundation", match: /India|Indian|residen|data cent/i },
    { title: "Managed cloud operations", match: /managed|24\s*\/\s*7|customer lifecycle|OpenStack|OpenShift|certified engineer/i },
    { title: "AI and GPU options", match: /GPU|H100|MI325X|Gaudi|LLM inference|accelerator/i },
  ];
  return picks.map((pick) => {
    const result = allClaims.find((item) => pick.match.test(item.claim.statement) && item.claim.sourceIds.some((id) => validIds.has(id)));
    const claim = result
      ? renderClaim(result.claim, validIds, 230)
      : "<p class=\"claim\">Confirm service fit and commercial scope for the client's workload before quotation.</p>";
    const product = result ? "<p class=\"product\">" + escapeHtml(result.serviceName) + "</p>" : "";
    return "<article class=\"highlight\"><h3>" + escapeHtml(pick.title) + "</h3>" + product + claim + "</article>";
  }).join("");
}

function renderPricingComparison(report: PdfReportData, validIds: Set<string>): string {
  const components = report.analysis.architectureComponents;
  if (!components.length) return "<tr><td colspan=\"5\" class=\"price-missing\">No inferred architecture components were available for a per-service price comparison.</td></tr>";
  return components.map((component) => {
    const priority = " <span class=\"meta\">(" + escapeHtml(component.priority) + ")</span>";
    const cells = salesProviderOrder.map((providerId) => {
      const provider = report.providers.find((item) => item.providerId === providerId);
      const className = providerId === "speedcloud" ? "price-cell speedcloud" : "price-cell";
      return "<td class=\"" + className + "\">" + renderPricingCell(provider, component, validIds) + "</td>";
    }).join("");
    return "<tr><th scope=\"row\">" + escapeHtml(component.name) + priority + "</th>" + cells + "</tr>";
  }).join("");
}

function renderPricingCell(
  provider: ProviderResearch | undefined,
  component: PdfReportData["analysis"]["architectureComponents"][number],
  validIds: Set<string>,
): string {
  if (!provider) return "<p class=\"price-missing\">Provider research did not complete.</p>";
  const services = servicesForComponent(provider, component);
  if (!services.length) return "<p class=\"price-missing\">No source-backed service match captured. This does not establish that the service is unavailable; confirm with the provider.</p>";
  const entries = services.map((service) => {
    const prices = service.pricing.filter((claim) => claim.sourceIds.some((id) => validIds.has(id)));
    const publishedPrices = service.publishedPrices.filter((price) => price.sourceIds.some((id) => validIds.has(id)));
    if (!prices.length && !publishedPrices.length) {
      return "<div class=\"price-offer\"><strong>" + escapeHtml(service.serviceName) + "</strong><p class=\"price-missing\">No published rate captured; request a quote or current rate card.</p></div>";
    }
    const numeric = publishedPrices.map((price) => "<p><strong>" + escapeHtml(formatPriceObservation(price)) + "</strong> " + renderSourceRefs(price.sourceIds, validIds) + "</p>").join("");
    const notes = prices.map((claim) => "<p>" + renderClaimFull(claim, validIds) + "</p>").join("");
    return "<div class=\"price-offer\"><strong>" + escapeHtml(service.serviceName) + "</strong>" + numeric + notes + "</div>";
  }).join("");
  return entries;
}

function servicesForComponent(
  provider: ProviderResearch,
  component: PdfReportData["analysis"]["architectureComponents"][number],
): ProviderResearch["services"] {
  const descriptors = [component.name, ...component.searchTerms].map(normalize).filter((value) => value.length >= 6);
  const exact = provider.services.filter((service) => normalize(service.category) === normalize(component.name));
  if (exact.length) return exact;
  return provider.services.filter((service) => {
    const category = normalize(service.category);
    return descriptors.some((descriptor) => descriptor === category || descriptor.includes(category) || category.includes(descriptor));
  });
}

function renderSpeedCloudServiceDetails(provider: ProviderResearch | undefined, validIds: Set<string>): string {
  if (!provider?.services.length) {
    return "<p class=\"benchmark-gap\">No structured SpeedCloud service facts were extracted in this research run. Confirm the relevant offer, configuration, price, regional availability, and support scope with NxtGen.</p>";
  }
  return provider.services.map((service) => {
    const metrics = service.performanceMetrics.map((metric) => ({
      statement: displayMetric(metric.metric) + ": " + formatNumber(metric.value) + " " + metric.unit + " at " + formatNumber(metric.loadValue) + " " + metric.loadUnit + ". Test context: " + metric.testContext,
      sourceIds: metric.sourceIds,
    }));
    return "<article class=\"service-detail\"><h3>" + escapeHtml(service.serviceName) + "<span>" + escapeHtml(service.category) + "</span></h3>" +
      renderDetailGroup("Workload fit", [service.fit], validIds, true) +
      "<div class=\"detail-grid\">" +
      renderDetailGroup("Specifications", service.specifications, validIds) +
      renderDetailGroup("Published pricing", [
        ...service.publishedPrices.map((price) => ({ statement: formatPriceObservation(price), sourceIds: price.sourceIds })),
        ...service.pricing,
      ], validIds) +
      renderDetailGroup("Regions and availability", service.availability, validIds) +
      renderDetailGroup("Support and SLA", service.supportAndSla, validIds) +
      renderDetailGroup("Performance data", metrics, validIds) +
      renderDetailGroup("Limitations and caveats", service.limitations, validIds) +
      "</div></article>";
  }).join("");
}

function renderDetailGroup(
  title: string,
  claims: ResearchClaim[],
  validIds: Set<string>,
  featured = false,
): string {
  const items = claims.length
    ? "<ul>" + claims.map((claim) => "<li>" + renderClaimFull(claim, validIds) + "</li>").join("") + "</ul>"
    : "<p class=\"price-missing\">No source-backed detail captured.</p>";
  return "<div class=\"detail-group" + (featured ? " fit" : "") + "\"><h4>" + escapeHtml(title) + "</h4>" + items + "</div>";
}

function renderSourceAppendix(report: PdfReportData): string {
  const referenced = new Set(report.providers.flatMap((provider) => provider.services.flatMap((service) => [
    service.fit,
    ...service.specifications,
    ...service.pricing,
    ...service.availability,
    ...service.supportAndSla,
    ...service.limitations,
  ].flatMap((claim) => claim.sourceIds)
    .concat(service.performanceMetrics.flatMap((metric) => metric.sourceIds))
    .concat(service.publishedPrices.flatMap((price) => price.sourceIds)))));
  const sections = salesProviderOrder.map((providerId) => {
    const provider = report.providers.find((item) => item.providerId === providerId);
    const sources = report.sources.filter((source) => source.providerId === providerId && referenced.has(source.id));
    if (!sources.length) return "";
    const entries = sources.map((source) => {
      const link = source.url
        ? "<a href=\"" + escapeHtml(source.url) + "\">" + escapeHtml(source.url) + "</a>"
        : "<span>Uploaded or catalog source</span>";
      return "<p class=\"source-item\"><strong>[" + escapeHtml(source.id) + "] " + escapeHtml(source.title) + "</strong><br>" + link + " · Captured " + escapeHtml(formatProposalDate(source.capturedAt)) + "</p>";
    }).join("");
    return "<section class=\"source-provider\"><h3>" + escapeHtml(provider?.providerName ?? displayProviderName(providerId)) + "</h3>" + entries + "</section>";
  }).join("");
  if (!sections) return "";
  return "<section class=\"source-appendix page\"><div class=\"eyebrow\">RESEARCH TRAIL</div><h2>Sources for cited facts</h2><p class=\"price-intro\">Only sources cited in the service details or price comparison are listed. Captured source material and price terms should be rechecked before quotation.</p>" + sections + "</section>";
}

function renderPerformanceCharts(report: PdfReportData, validIds: Set<string>): string[] {
  type MetricGroup = {
    category: string;
    metric: string;
    unit: string;
    loadUnit: string;
    testContext: string;
    byProvider: Map<ProviderId, Map<number, PerformanceMeasurement>>;
  };
  const groups = new Map<string, MetricGroup>();
  for (const provider of report.providers) {
    for (const service of provider.services) {
      for (const measurement of service.performanceMetrics ?? []) {
        if (!measurement.sourceIds.some((id) => validIds.has(id))) continue;
        const category = normalize(service.category);
        const metric = normalize(measurement.metric);
        const unit = normalize(measurement.unit);
        const loadUnit = normalize(measurement.loadUnit);
        const testContext = normalize(measurement.testContext);
        const key = [category, metric, unit, loadUnit, testContext].join("|");
        const group = groups.get(key) ?? {
          category: service.category,
          metric: measurement.metric,
          unit: measurement.unit,
          loadUnit: measurement.loadUnit,
          testContext: measurement.testContext,
          byProvider: new Map<ProviderId, Map<number, PerformanceMeasurement>>(),
        };
        const series = group.byProvider.get(provider.providerId) ?? new Map<number, PerformanceMeasurement>();
        series.set(measurement.loadValue, measurement);
        group.byProvider.set(provider.providerId, series);
        groups.set(key, group);
      }
    }
  }

  return [...groups.values()].flatMap((group) => {
    const candidates = [...group.byProvider.entries()].filter(([, values]) => values.size > 0);
    const shared = findLargestSharedCohort(candidates, 1);
    if (shared.providers.length < 2 || !shared.loads.length) return [];

    const barLoad = shared.loads[shared.loads.length - 1]!;
    const barPoints = shared.providers.map((providerId) => ({
      providerId,
      name: displayProviderName(providerId),
      measurement: group.byProvider.get(providerId)!.get(barLoad)!,
    }));
    const isLowerBetter = group.metric === "latency";
    const ranked = [...barPoints].sort((a, b) => isLowerBetter
      ? a.measurement.value - b.measurement.value
      : b.measurement.value - a.measurement.value);
    const provisionalWinner = ranked[0];
    const winner = provisionalWinner && ranked[1]?.measurement.value !== provisionalWinner.measurement.value ? provisionalWinner : undefined;
    const barRefs = uniqueIds(barPoints.flatMap((item) => item.measurement.sourceIds), validIds);
    const bar = renderPerformanceBarSvg(barPoints, group, barLoad, winner?.providerId);
    const barCard = "<article class=\"chart\"><h3>Same-load comparison</h3>" + bar + "<p class=\"chart-note\">" + escapeHtml(formatNumber(barLoad) + " " + group.loadUnit + " · " + (isLowerBetter ? "lower is better" : "higher is better")) + "</p></article>";

    const lineShared = findLargestSharedCohort(candidates, 2);
    let lineCard = "";
    if (lineShared.providers.length >= 2 && lineShared.loads.length >= 2) {
      const lineSeries = lineShared.providers.map((providerId) => ({
        providerId,
        name: displayProviderName(providerId),
        points: lineShared.loads.map((load) => group.byProvider.get(providerId)!.get(load)!),
      }));
      const lineRefs = uniqueIds(lineSeries.flatMap((item) => item.points.flatMap((point) => point.sourceIds)), validIds);
      const legend = lineSeries.map((item) => "<span class=\"legend-item\"><span class=\"swatch\" style=\"background:" + providerColors[item.providerId] + "\"></span>" + escapeHtml(item.name) + "</span>").join("");
      lineCard = "<article class=\"chart\"><h3>Performance as load increases</h3>" + renderLineSvg(lineSeries, group) + "<div class=\"legend\">" + legend + "</div><p class=\"chart-note\">Sources: [" + lineRefs.map(escapeHtml).join(", ") + "]</p></article>";
    }

    const speedCloudValue = barPoints.find((item) => item.providerId === "speedcloud")?.measurement.value;
    const speedCloudRank = speedCloudValue === undefined ? -1 : ranked.findIndex((item) => item.providerId === "speedcloud");
    const resultNote = winner?.providerId === "speedcloud"
      ? "SpeedCloud has the strongest published result in this matched measurement."
      : !winner
        ? "No unique leader in this matched measurement."
        : speedCloudRank < 0
          ? "No SpeedCloud value was captured for this matched measurement."
          : "Another provider has the strongest published result in this matched measurement.";
    const heading = displayMetric(group.metric) + " · " + group.category;
    const context = group.testContext;
    const refs = barRefs.length ? " · Evidence [" + barRefs.map(escapeHtml).join(", ") + "]" : "";
    return ["<article class=\"line-chart\"><h3>" + escapeHtml(heading) + "</h3><p class=\"line-context\">" + escapeHtml(context) + "</p><div class=\"chart-pair " + (lineCard ? "" : "single-chart") + "\">" + barCard + lineCard + "</div><p class=\"chart-note\">" + escapeHtml(resultNote) + refs + "</p></article>"];
  }).slice(0, 4);
}

function findLargestSharedCohort(
  candidates: Array<[ProviderId, Map<number, PerformanceMeasurement>]>,
  minimumLoads: number,
): { providers: ProviderId[]; loads: number[] } {
  let bestProviders: ProviderId[] = [];
  let bestLoads: number[] = [];
  for (let mask = 1; mask < 1 << candidates.length; mask += 1) {
    const subset = candidates.filter((_, index) => mask & (1 << index));
    if (subset.length < 2) continue;
    const commonLoads = [...subset[0]![1].keys()]
      .filter((load) => subset.every(([, values]) => values.has(load)))
      .sort((a, b) => a - b);
    if (commonLoads.length >= minimumLoads && (subset.length > bestProviders.length || (subset.length === bestProviders.length && commonLoads.length > bestLoads.length))) {
      bestProviders = subset.map(([providerId]) => providerId);
      bestLoads = commonLoads;
    }
  }
  return { providers: bestProviders, loads: bestLoads };
}

function renderPerformanceBarSvg(
  points: Array<{ providerId: ProviderId; name: string; measurement: PerformanceMeasurement }>,
  group: { metric: string; unit: string },
  load: number,
  winnerId: ProviderId | undefined,
): string {
  const width = 660;
  const labelWidth = 142;
  const valueWidth = 78;
  const top = 9;
  const rowHeight = 31;
  const height = top + points.length * rowHeight + 15;
  const plotWidth = width - labelWidth - valueWidth - 8;
  const maximum = Math.max(...points.map((item) => item.measurement.value));
  const rows = points.map((item, index) => {
    const y = top + index * rowHeight;
    const barWidth = maximum > 0 ? Math.max(2, item.measurement.value / maximum * plotWidth) : 2;
    const color = providerColors[item.providerId];
    const label = displayProviderName(item.providerId);
    const winnerLabel = item.providerId === winnerId ? " · best" : "";
    return "<text x=\"0\" y=\"" + (y + 12) + "\" fill=\"" + (item.providerId === "speedcloud" ? "#5140ad" : "#36445a") + "\" font-size=\"11\" font-weight=\"" + (item.providerId === "speedcloud" || item.providerId === winnerId ? "700" : "400") + "\">" + escapeHtml(label + winnerLabel) + "</text><rect x=\"" + labelWidth + "\" y=\"" + y + "\" width=\"" + plotWidth + "\" height=\"15\" rx=\"7.5\" fill=\"#e0e5ee\"/><rect x=\"" + labelWidth + "\" y=\"" + y + "\" width=\"" + barWidth + "\" height=\"15\" rx=\"7.5\" fill=\"" + color + "\"/><text x=\"" + (width - 2) + "\" y=\"" + (y + 12) + "\" text-anchor=\"end\" fill=\"#17243b\" font-size=\"11\" font-weight=\"700\">" + escapeHtml(formatNumber(item.measurement.value) + " " + group.unit) + "</text>";
  }).join("");
  return "<svg class=\"bar-svg\" role=\"img\" aria-label=\"" + escapeHtml(displayMetric(group.metric) + " comparison at " + formatNumber(load)) + "\" viewBox=\"0 0 " + width + " " + height + "\" xmlns=\"http://www.w3.org/2000/svg\">" + rows + "</svg>";
}

function renderLineSvg(
  series: Array<{ providerId: ProviderId; name: string; points: PerformanceMeasurement[] }>,
  group: { metric: string; unit: string; loadUnit: string },
): string {
  const width = 720;
  const height = 270;
  const left = 82;
  const right = 26;
  const top = 20;
  const bottom = 55;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const xValues = series[0]!.points.map((point) => point.loadValue);
  const allValues = series.flatMap((item) => item.points.map((point) => point.value));
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const rawMin = Math.min(...allValues);
  const rawMax = Math.max(...allValues);
  const yPadding = rawMax === rawMin ? Math.max(1, rawMax * 0.1) : (rawMax - rawMin) * 0.12;
  const yMin = Math.max(0, rawMin - yPadding);
  const yMax = rawMax + yPadding || 1;
  const x = (value: number) => left + (value - xMin) / (xMax - xMin || 1) * plotWidth;
  const y = (value: number) => top + (yMax - value) / (yMax - yMin || 1) * plotHeight;
  const grid = Array.from({ length: 5 }, (_, index) => {
    const value = yMin + (yMax - yMin) * index / 4;
    const yy = y(value);
    return "<line x1=\"" + left + "\" y1=\"" + yy + "\" x2=\"" + (width - right) + "\" y2=\"" + yy + "\" stroke=\"#dce3ed\"/><text x=\"" + (left - 8) + "\" y=\"" + (yy + 3) + "\" text-anchor=\"end\" fill=\"#66748a\" font-size=\"10\">" + escapeHtml(formatNumber(value)) + "</text>";
  }).join("");
  const seriesLines = series.map((item) => {
    const points = item.points.map((point) => x(point.loadValue) + "," + y(point.value)).join(" ");
    const line = "<polyline fill=\"none\" stroke=\"" + providerColors[item.providerId] + "\" stroke-width=\"" + (item.providerId === "speedcloud" ? "4" : "2.5") + "\" points=\"" + points + "\"/>";
    const dots = item.points.map((point) => "<circle cx=\"" + x(point.loadValue) + "\" cy=\"" + y(point.value) + "\" r=\"4.2\" fill=\"" + providerColors[item.providerId] + "\"/>").join("");
    return line + dots;
  }).join("");
  const xLabels = xValues.map((value) => "<text x=\"" + x(value) + "\" y=\"" + (height - 31) + "\" text-anchor=\"middle\" fill=\"#66748a\" font-size=\"10\">" + escapeHtml(formatNumber(value)) + "</text>").join("");
  return "<svg role=\"img\" aria-label=\"" + escapeHtml(displayMetric(group.metric) + " by " + group.loadUnit) + "\" viewBox=\"0 0 " + width + " " + height + "\" xmlns=\"http://www.w3.org/2000/svg\">" + grid + "<line x1=\"" + left + "\" y1=\"" + top + "\" x2=\"" + left + "\" y2=\"" + (height - bottom) + "\" stroke=\"#8490a3\"/><line x1=\"" + left + "\" y1=\"" + (height - bottom) + "\" x2=\"" + (width - right) + "\" y2=\"" + (height - bottom) + "\" stroke=\"#8490a3\"/>" + seriesLines + xLabels + "<text x=\"" + (left + plotWidth / 2) + "\" y=\"" + (height - 7) + "\" text-anchor=\"middle\" fill=\"#36445a\" font-size=\"11\">" + escapeHtml(group.loadUnit) + "</text><text transform=\"translate(17 " + (top + plotHeight / 2) + ") rotate(-90)\" text-anchor=\"middle\" fill=\"#36445a\" font-size=\"11\">" + escapeHtml(displayMetric(group.metric) + " (" + group.unit + ")") + "</text></svg>";
}

function renderSpeedCloudSourceNotes(provider: ProviderResearch | undefined, sources: PdfReportData["sources"], validIds: Set<string>): string {
  const cited = uniqueIds(provider?.services.flatMap((service) => [
    service.fit,
    ...service.specifications,
    ...service.pricing,
    ...service.availability,
    ...service.supportAndSla,
    ...service.limitations,
  ].flatMap((claim) => claim.sourceIds).concat(service.publishedPrices.flatMap((price) => price.sourceIds), service.performanceMetrics.flatMap((metric) => metric.sourceIds))) ?? [], validIds).slice(0, 6);
  const entries = cited.flatMap((id) => {
    const source = sources.find((item) => item.id === id);
    if (!source) return [];
    const href = source.url ? " href=\"" + escapeHtml(source.url) + "\"" : "";
    return ["<a" + href + ">" + escapeHtml(id + " · " + source.title) + "</a>"];
  });
  return entries.length ? "<div class=\"source-notes\"><span class=\"meta\">SpeedCloud source references:</span>" + entries.join("") + "</div>" : "";
}

function renderClaim(claim: ResearchClaim, validIds: Set<string>, maxLength: number): string {
  const refs = uniqueIds(claim.sourceIds, validIds);
  const citation = refs.length ? " <span class=\"refs\">[" + refs.map(escapeHtml).join(", ") + "]</span>" : "";
  return "<p class=\"claim\">" + escapeHtml(shortText(claim.statement, maxLength)) + citation + "</p>";
}

function renderClaimFull(claim: ResearchClaim, validIds: Set<string>): string {
  return escapeHtml(claim.statement) + renderSourceRefs(claim.sourceIds, validIds);
}

function renderSourceRefs(ids: string[], validIds: Set<string>): string {
  const refs = uniqueIds(ids, validIds);
  return refs.length ? " <span class=\"refs\">[" + refs.map(escapeHtml).join(", ") + "]</span>" : "";
}

function formatPriceObservation(price: PublishedPriceObservation): string {
  const priceType = ({
    public_list: "Published list rate",
    starting_at: "Starting price",
    calculator_estimate: "Calculator estimate",
    free_tier: "Free tier",
  })[price.priceType];
  const currency = /^[A-Za-z]{3}$/.test(price.currency) ? price.currency + " " : price.currency;
  const context = [price.publishedDate ? "Published " + price.publishedDate : "", price.configuration, price.region, price.assumptions].filter(Boolean).join(" · ");
  const amount = price.priceType === "free_tier" ? "free" : currency + formatPriceAmount(price.amount) + " / " + price.unit;
  return priceType + ": " + amount + (context ? " · " + context : "");
}

function formatPriceAmount(value: number): string {
  return value.toLocaleString("en-US", { maximumSignificantDigits: 12 });
}

function uniqueIds(ids: string[], validIds: Set<string>): string[] {
  return [...new Set(ids.filter((id) => validIds.has(id)))];
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function displayMetric(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function displayProviderName(value: ProviderId): string {
  return ({ speedcloud: "SpeedCloud", gcp: "Google Cloud", aws: "AWS", azure: "Azure" })[value];
}

function formatNumber(value: number): string {
  return Number(value.toPrecision(4)).toLocaleString("en-US");
}

function formatProposalDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? escapeHtml(value) : date.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
}

function shortText(value: string, maxLength: number): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  const boundary = cleaned.lastIndexOf(" ", maxLength - 1);
  return cleaned.slice(0, boundary > maxLength * 0.65 ? boundary : maxLength - 1).trimEnd() + "…";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character] ?? character);
}
