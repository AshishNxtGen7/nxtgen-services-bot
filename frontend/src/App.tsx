import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  Activity,
  AlertCircle,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleHelp,
  Cloud,
  Cpu,
  Database,
  ExternalLink,
  FileCheck2,
  FileText,
  Globe2,
  LayoutDashboard,
  LoaderCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Waypoints,
} from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  ApiErrorSchema,
  RecommendationInputSchema,
  RecommendationReportSchema,
} from "./types.js";
import type { Claim, ProviderId, RecommendationReport } from "./types.js";
import { providers } from "./types.js";

const sampleRequirement = "We need GPU inference for a customer support model, with data stored in India, predictable monthly costs, Kubernetes support, and a team to help operate the platform.";

export default function App() {
  const [requirement, setRequirement] = useState("");
  const [report, setReport] = useState<RecommendationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reportSavedOpen, setReportSavedOpen] = useState(false);
  const reportDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = reportDialogRef.current;
    if (!dialog) return;
    if (reportSavedOpen && !dialog.open) dialog.showModal();
    if (!reportSavedOpen && dialog.open) dialog.close();
  }, [reportSavedOpen]);

  async function submitRequirement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = RecommendationInputSchema.safeParse({ requirement });
    if (!input.success) {
      setError(input.error.issues[0]?.message ?? "Check the requirement and try again.");
      return;
    }
    setLoading(true);
    setError("");
    setReport(null);
    try {
      const response = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input.data),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const parsedError = ApiErrorSchema.safeParse(payload);
        throw new Error(parsedError.success ? parsedError.data.error ?? "The research workflow could not be completed." : "The research workflow could not be completed.");
      }
      const result = RecommendationReportSchema.safeParse(payload);
      if (!result.success) {
        const details = result.error.issues.slice(0, 3).map((issue) => {
          const path = issue.path.length ? issue.path.join(".") : "response";
          return `${path}: ${issue.message}`;
        }).join("; ");
        throw new Error(`The API response did not match the report format${details ? ` (${details})` : "."}`);
      }
      setReport(result.data);
      setReportSavedOpen(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The research API is unavailable. Start the backend and retry.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-white/10 bg-slate-950 text-slate-100 md:flex">
        <div className="flex items-center gap-3 px-6 py-7">
          <div className="grid size-10 place-items-center rounded-xl bg-violet-500 text-white shadow-lg shadow-violet-950/40"><Cloud className="size-5" /></div>
          <div><p className="font-semibold tracking-tight text-white">SpeedCloud</p><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Advisor</p></div>
        </div>
        <div className="px-4">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Workspace</p>
          <nav aria-label="Workspace" className="grid gap-1">
            <a href="#workload" className="flex items-center gap-3 rounded-lg bg-white/10 px-3 py-2.5 text-sm font-medium text-white"><LayoutDashboard className="size-4 text-violet-300" />Workload fit<ArrowRight className="ml-auto size-3.5 text-slate-400" /></a>
            <a href="#comparison" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-400 transition hover:bg-white/5 hover:text-white"><Activity className="size-4" />Research report</a>
          </nav>
        </div>
        <Separator className="my-6 bg-white/10" />
        <div className="px-4">
          <p className="px-3 pb-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Research agents</p>
          <div className="grid gap-5">
            <PipelineItem icon={Globe2} title="Solution architect" detail="Plans the build-and-run components" state={loading ? "working" : "ready"} />
            <PipelineItem icon={Search} title="Four provider agents" detail="GCP · AWS · Azure · NxtGen" state={loading ? "working" : "ready"} />
            <PipelineItem icon={FileCheck2} title="Comparison + PDF" detail="Cited report saved to public" state={loading ? "working" : "ready"} />
          </div>
        </div>
        <div className="mt-auto border-t border-white/10 p-4">
          <div className="flex items-center gap-3 rounded-lg bg-white/5 p-3"><div className="grid size-9 place-items-center rounded-full bg-violet-400/15 text-xs font-semibold text-violet-200">SC</div><div className="min-w-0"><p className="truncate text-xs font-medium text-slate-100">Solution workspace</p><p className="mt-0.5 text-[10px] text-slate-400">MVP environment</p></div><CircleHelp className="ml-auto size-4 text-slate-500" /></div>
        </div>
      </aside>

      <main className="md:pl-64">
        <header className="no-print sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border/80 bg-background/90 px-4 backdrop-blur sm:px-8">
          <div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">Workspace</span><span className="text-border">/</span><span className="font-medium">Provider research</span></div>
          <div className="flex items-center gap-2 sm:gap-4"><Badge variant="outline" className="hidden sm:inline-flex">Requirement only · 4 provider agents</Badge><div aria-label="SpeedCloud workspace" className="grid size-9 place-items-center rounded-full bg-violet-100 text-xs font-semibold text-violet-800">S</div></div>
        </header>

        <div className="print-reset mx-auto max-w-[1600px] px-4 pb-8 pt-8 sm:px-8 lg:px-10">
          <section id="workload" className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div><div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.17em] text-violet-700"><Sparkles className="size-4" />Cloud service intelligence</div><h1 className="text-balance text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Find the right cloud fit</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">One requirement, four provider research agents, one cited comparison report.</p></div>
            <div className="flex flex-wrap gap-2"><Badge variant="secondary" className="bg-violet-100 text-violet-800"><span className="size-1.5 rounded-full bg-violet-600" />India-first</Badge><Badge variant="outline">SpeedCloud · GCP · AWS · Azure</Badge></div>
          </section>

          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px] xl:gap-7">
            <section className="grid min-w-0 gap-5">
              <Card className="overflow-hidden border-violet-100 shadow-md shadow-slate-900/[0.03]">
                <CardHeader className="flex-row items-start justify-between gap-4 border-b border-border/70 bg-gradient-to-r from-white to-violet-50/70 sm:px-6">
                  <div className="flex gap-3"><div className="grid size-9 shrink-0 place-items-center rounded-lg bg-violet-100 text-sm font-semibold text-violet-800">01</div><div><CardTitle className="text-base">Describe the client requirement</CardTitle><CardDescription className="mt-1">The analyst plans the application architecture and identifies its cloud service needs before provider research.</CardDescription></div></div>
                  <Badge variant="outline" className="hidden sm:inline-flex">No uploads or company profile needed</Badge>
                </CardHeader>
                <CardContent className="space-y-4 pt-5 sm:px-6">
                  <form className="space-y-4" onSubmit={submitRequirement}>
                    <div className="space-y-2"><Label htmlFor="requirement" className="sr-only">Describe the workload and priorities</Label><Textarea id="requirement" value={requirement} onChange={(event) => setRequirement(event.target.value)} placeholder="Tell us what the client needs, where it must run, expected scale, budget, and support requirements..." maxLength={4000} className="min-h-36 resize-y border-slate-200 bg-white text-sm leading-6 placeholder:text-slate-400 focus-visible:border-violet-400" /><div className="flex justify-between gap-3 text-xs text-muted-foreground"><span>Include regions, scale, service needs, security, and operating constraints.</span><span className="shrink-0 tabular-nums">{requirement.length}/4000</span></div></div>
                    <div className="flex flex-col justify-between gap-4 border-t border-border/70 pt-4 sm:flex-row sm:items-center">
                      <span className="text-xs text-muted-foreground">India-first comparison profile applied automatically.</span><Button type="submit" disabled={loading || requirement.trim().length < 8}>{loading ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />}{loading ? "Researching providers" : "Research and compare"}{!loading && <ArrowUpRight className="size-4" />}</Button>
                    </div>
                  </form>
                  <Separator />
                  <div className="flex flex-wrap items-center gap-2"><span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Try a scenario</span><Button type="button" variant="outline" size="sm" className="h-8 rounded-full" onClick={() => setRequirement(sampleRequirement)}><Cpu className="size-3.5 text-violet-600" />India GPU inference</Button><Button type="button" variant="outline" size="sm" className="h-8 rounded-full" onClick={() => setRequirement("We need a Kubernetes platform for a customer-facing application with predictable operating costs and local support in India.")}><Waypoints className="size-3.5 text-violet-600" />Managed Kubernetes</Button><Button type="button" variant="outline" size="sm" className="h-8 rounded-full" onClick={() => setRequirement("We need an HRMS application and a chatbot that answers employee questions using our HR data, with controlled access to sensitive records.")}><CircleHelp className="size-3.5 text-violet-600" />HRMS + knowledge chatbot</Button></div>
                </CardContent>
              </Card>

              {error && <Alert className="flex items-start gap-3 border-red-200 bg-red-50 text-red-900"><AlertCircle className="mt-0.5 size-4 shrink-0 text-red-600" /><p>{error}</p></Alert>}
              {report ? <ResearchReport report={report} /> : <GettingStarted />}
            </section>

            <aside className="no-print grid gap-5">
              <Card className="border-violet-200 bg-gradient-to-br from-violet-50 via-white to-white shadow-none"><CardContent className="space-y-4 pt-5"><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.13em] text-violet-700"><Sparkles className="size-4" />Comparison guardrails<Badge variant="outline" className="ml-auto border-violet-200 bg-white text-violet-700">v1.0</Badge></div><div><h2 className="font-semibold tracking-tight">Source before claims.</h2><p className="mt-1.5 text-xs leading-5 text-muted-foreground">Provider agents search official domains. Missing details stay unknown; prices keep their published region, units, and assumptions.</p></div><div className="flex flex-wrap gap-1.5"><Badge variant="outline" className="border-violet-200 bg-white text-violet-800">Official sources</Badge><Badge variant="outline" className="border-violet-200 bg-white text-violet-800">Visible citations</Badge><Badge variant="outline" className="border-violet-200 bg-white text-violet-800">No assumed parity</Badge></div><Separator className="bg-violet-100" /><p className="flex gap-2 text-[11px] leading-5 text-violet-900/70"><CircleHelp className="mt-0.5 size-4 shrink-0 text-violet-600" />SpeedCloud and SpeedCloud Supreme are researched as distinct products when source pages identify them separately.</p></CardContent></Card>
              <div className="flex gap-3 px-1 py-1 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-700" /><p><strong className="font-semibold text-slate-700">Evidence before claims.</strong><br />Generated research is provisional and needs analyst review before procurement.</p></div>
            </aside>
          </div>

          <footer className="no-print mt-10 flex flex-wrap justify-between gap-2 border-t border-border/80 py-5 text-[11px] text-muted-foreground"><span>SpeedCloud Advisor <span className="mx-1 text-slate-300">·</span> Early access</span><span>Live official-source research <span className="mx-1 text-slate-300">·</span> Analyst review required</span></footer>
        </div>
      </main>
      <dialog
        ref={reportDialogRef}
        aria-labelledby="report-saved-title"
        onClose={() => setReportSavedOpen(false)}
        onCancel={() => setReportSavedOpen(false)}
        className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-border bg-white p-0 text-foreground shadow-2xl backdrop:bg-slate-950/50"
      >
        {report && <div className="p-6 sm:p-7">
          <div className="mb-4 grid size-12 place-items-center rounded-full bg-emerald-100 text-emerald-700"><Check className="size-6" /></div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">Report stored</p>
          <h2 id="report-saved-title" className="mt-1 text-xl font-semibold tracking-tight">Your comparison report is ready</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">The PDF has been saved to <span className="font-medium text-foreground">frontend/public/reports</span>.</p>
          <p className="mt-3 break-all rounded-md bg-muted/60 px-3 py-2 font-mono text-xs text-muted-foreground">{report.pdfFileName}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <a className={buttonVariants({ variant: "default" })} href={report.reportUrl} target="_blank" rel="noreferrer"><FileText className="size-4" />View PDF<ExternalLink className="size-3.5" /></a>
            <Button variant="outline" onClick={() => { setReportSavedOpen(false); requestAnimationFrame(() => document.getElementById("comparison")?.scrollIntoView({ behavior: "smooth", block: "start" })); }}>View comparison</Button>
            <Button variant="ghost" className="ml-auto" onClick={() => setReportSavedOpen(false)}>Close</Button>
          </div>
        </div>}
      </dialog>
    </div>
  );
}

function PipelineItem({ icon: Icon, title, detail, state }: { icon: typeof Globe2; title: string; detail: string; state: "ready" | "working" }) {
  return <div className="flex items-center gap-3 px-3"><span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", state === "ready" ? "bg-emerald-400/10 text-emerald-300" : "bg-violet-400/10 text-violet-300")}><Icon className={cn("size-4", state === "working" && "animate-pulse")} /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-slate-200">{title}</span><span className="mt-1 block truncate text-[10px] text-slate-500">{detail}</span></span><span className={cn("size-1.5 rounded-full", state === "ready" ? "bg-emerald-400" : "animate-pulse bg-violet-400")} /></div>;
}

function ProviderMark({ providerId, mark }: { providerId: ProviderId; mark: string }) {
  const tone: Record<ProviderId, string> = {
    gcp: "bg-emerald-100 text-emerald-800",
    aws: "bg-amber-100 text-amber-800",
    azure: "bg-sky-100 text-sky-800",
    speedcloud: "bg-violet-100 text-violet-800",
  };
  return <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg text-xs font-bold", tone[providerId])}>{mark}</span>;
}

function GettingStarted() {
  return <Card className="overflow-hidden border-slate-200 shadow-sm"><CardContent className="relative grid gap-7 overflow-hidden p-6 sm:grid-cols-[160px_1fr] sm:items-center sm:p-8"><div aria-hidden="true" className="relative mx-auto grid size-36 place-items-center"><span className="absolute size-36 rounded-full border border-violet-100" /><span className="absolute size-24 rounded-full border border-violet-200" /><span className="relative grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-lg shadow-violet-500/25"><Waypoints className="size-7" /></span><span className="absolute left-3 top-6 grid size-8 place-items-center rounded-lg border border-slate-100 bg-white text-violet-700 shadow-sm"><Cpu className="size-4" /></span><span className="absolute right-1 top-16 grid size-8 place-items-center rounded-lg border border-slate-100 bg-white text-sky-700 shadow-sm"><Cloud className="size-4" /></span><span className="absolute bottom-2 left-12 grid size-8 place-items-center rounded-lg border border-slate-100 bg-white text-emerald-700 shadow-sm"><Database className="size-4" /></span></div><div><Badge variant="secondary" className="bg-violet-100 text-violet-800">Four provider research agents</Badge><h2 className="mt-3 max-w-lg text-xl font-semibold tracking-tight sm:text-2xl">Start with what the client needs.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Enter the client's requirement. The backend first plans how the software will be built, deployed, secured, and operated, then researches matching services from official provider sources and saves a cited PDF report.</p><div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1.5"><Check className="size-3.5 text-emerald-700" />One requirement field</span><span className="inline-flex items-center gap-1.5"><Check className="size-3.5 text-emerald-700" />Provider research in parallel</span><span className="inline-flex items-center gap-1.5"><Check className="size-3.5 text-emerald-700" />PDF saved for viewing</span></div></div></CardContent></Card>;
}

function ResearchReport({ report }: { report: RecommendationReport }) {
  const sourcesById = new Map(report.sources.map((source) => [source.id, source]));
  return <section className="grid gap-4 scroll-mt-20" id="comparison">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-violet-700">02 · Comparison agent</p><h2 className="mt-1 text-xl font-semibold tracking-tight">Provider research report</h2></div><div className="flex gap-2"><a className={buttonVariants({ variant: "outline", size: "sm" })} href={report.reportUrl} target="_blank" rel="noreferrer"><FileText className="size-4" />View PDF<ExternalLink className="size-3.5" /></a><a className={buttonVariants({ variant: "default", size: "sm" })} href={report.reportUrl} download={report.pdfFileName}><ArrowDownToLine className="size-4" />Download PDF</a></div></div>
    <Alert className="flex items-start gap-3 border-amber-200 bg-amber-50 text-amber-950"><AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-700" /><div className="min-w-0 flex-1"><p className="font-medium leading-5">{report.executiveSummary.statement}</p><ClaimSources claim={report.executiveSummary} sources={sourcesById} className="mt-2" /><p className="mt-2 text-xs leading-5 text-amber-900/70">{report.evidenceCoverage}</p></div><Badge variant="warning" className="hidden shrink-0 sm:inline-flex">Provisional</Badge></Alert>
    <Card><CardHeader className="pb-3"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-violet-700">Requirement analyst</p><CardTitle className="mt-1.5">What we understood</CardTitle></div><Badge variant="outline">{report.analysis.workloadType}</Badge></div><CardDescription>{report.analysis.problemSummary}</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><AnalysisList title="Requested business capabilities" items={report.analysis.requestedServices} icon={Cloud} /><AnalysisList title="Must-have constraints" items={report.analysis.mustHaveConstraints} icon={ShieldCheck} /><AnalysisList title="Evaluation criteria" items={report.analysis.evaluationCriteria} icon={Activity} /></CardContent></Card>
    <Card><CardHeader className="pb-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-violet-700">Pre-search solution architecture</p><CardTitle className="mt-1.5">Cloud components this application needs</CardTitle></div><CardDescription>The analyst first plans how the software would be built, deployed, secured, and operated. Provider agents search for services that fit these components; they do not search for HRMS or chatbot products.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{report.analysis.architectureComponents.map((component) => <article key={component.name} className="rounded-lg border border-border/80 bg-white p-3.5"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold text-slate-800">{component.name}</h3><Badge variant={component.priority === "core" ? "default" : component.priority === "recommended" ? "secondary" : "outline"}>{component.priority}</Badge></div><p className="text-xs leading-5 text-slate-700">{component.role}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{component.rationale}</p></article>)}</CardContent></Card>
    <Card>
      <CardHeader className="pb-3"><div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-violet-700">Structured comparison</p><CardTitle className="mt-1.5">Services, specifications, and pricing</CardTitle></div><p className="text-xs text-muted-foreground">Generated {new Date(report.generatedAt).toLocaleString()}</p></div><CardDescription>Each cell stays tied to its source IDs. Pricing is not normalized across unlike currencies, regions, or usage assumptions.</CardDescription></CardHeader>
      <CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[950px] border-collapse text-left text-xs"><thead className="bg-muted/60"><tr><th className="sticky left-0 z-10 w-48 border-y border-border bg-muted/95 px-4 py-3 font-semibold text-slate-700">Dimension</th>{providers.map((provider) => <th key={provider.id} className="min-w-48 border-y border-border px-4 py-3 font-semibold text-slate-700"><span className="flex items-center gap-2"><ProviderMark providerId={provider.id} mark={provider.mark} />{provider.shortName}</span></th>)}</tr></thead><tbody>{report.comparison.map((row) => <tr key={row.dimension} className="align-top odd:bg-white even:bg-slate-50/60"><th scope="row" className="sticky left-0 border-b border-border/70 bg-inherit px-4 py-3 font-medium text-slate-700">{row.dimension}</th>{providers.map((provider) => { const cell = row.values[provider.id]; return <td key={provider.id} className="border-b border-border/70 px-4 py-3 text-slate-600"><div className="grid gap-2">{cell.value.split("\n").filter(Boolean).map((line, index) => <p key={`${index}-${line}`} className="whitespace-pre-wrap leading-5">{line}</p>)}<ClaimSources claim={{ statement: "", sourceIds: cell.sourceIds }} sources={sourcesById} /></div></td>; })}</tr>)}</tbody></table></div></CardContent>
    </Card>
    <div className="grid gap-4">{report.providers.map((providerReport) => <ProviderAgentCard key={providerReport.providerId} result={providerReport} sourcesById={sourcesById} />)}</div>
    <Card><CardContent className="divide-y divide-border/70 p-0"><details className="group p-4 sm:p-5"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium marker:hidden">Recommendation and trade-offs<ChevronDown className="size-4 text-muted-foreground transition group-open:rotate-180" /></summary><div className="mt-4 grid gap-4"><div><p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-violet-700">Recommendation</p><p className="text-sm leading-6 text-slate-700">{report.recommendation.statement}</p><ClaimSources claim={report.recommendation} sources={sourcesById} className="mt-2" /></div>{report.tradeoffs.length > 0 && <div><p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-violet-700">Trade-offs to review</p><ul className="grid gap-3">{report.tradeoffs.map((claim, index) => <li key={`${index}-${claim.statement}`} className="text-sm leading-6 text-slate-700">{claim.statement}<ClaimSources claim={claim} sources={sourcesById} className="mt-1" /></li>)}</ul></div>}</div></details><details className="group p-4 sm:p-5"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium marker:hidden">Full report narrative<ChevronDown className="size-4 text-muted-foreground transition group-open:rotate-180" /></summary><pre className="mt-4 max-h-[36rem] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/70 p-4 font-sans text-xs leading-5 text-slate-700">{report.reportMarkdown}</pre></details></CardContent></Card>
    <p className="rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs leading-5 text-amber-950/80">This report is provisional. Provider pages can change and retrieved claims need analyst review. Confirm service scope, live capacity, exact configuration, current price, regional availability, support, and contract terms before making a decision.</p>
  </section>;
}

function AnalysisList({ title, items, icon: Icon }: { title: string; items: string[]; icon: typeof Cloud }) {
  return <div className="rounded-lg border border-border/80 bg-white p-3.5"><p className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-700"><Icon className="size-3.5 text-violet-600" />{title}</p>{items.length ? <ul className="grid gap-1.5">{items.map((item) => <li key={item} className="flex gap-2 text-xs leading-5 text-muted-foreground"><span className="mt-2 size-1 shrink-0 rounded-full bg-violet-400" />{item}</li>)}</ul> : <p className="text-xs text-muted-foreground">Not specified.</p>}</div>;
}

function ProviderAgentCard({ result, sourcesById }: { result: RecommendationReport["providers"][number]; sourcesById: Map<string, RecommendationReport["sources"][number]> }) {
  const status = {
    searched: { label: "Official pages searched", variant: "success" as const },
    no_results: { label: "No official pages matched", variant: "warning" as const },
    not_configured: { label: "Live search not configured", variant: "outline" as const },
    failed: { label: "Search failed", variant: "destructive" as const },
  }[result.status];
  const provider = providers.find((item) => item.id === result.providerId)!;
  return <Card className={cn("shadow-sm", result.providerId === "speedcloud" && "border-violet-200")}><CardContent className="p-4 sm:p-5">
    <div className="flex flex-wrap items-center gap-3"><ProviderMark providerId={provider.id} mark={provider.mark} /><div className="min-w-0 flex-1"><p className="font-semibold">{result.providerName}</p><p className="mt-0.5 text-xs text-muted-foreground">Dedicated provider research agent · {result.sources.length} sources</p></div><Badge variant={status.variant}>{status.label}</Badge></div>
    {result.note && <p className="mt-3 rounded-md bg-muted/60 px-3 py-2 text-xs leading-5 text-muted-foreground">{result.note}</p>}
    {result.services.length > 0 && <div className="mt-4 grid gap-3">{result.services.map((service, index) => <div key={`${service.serviceName}-${index}`} className="rounded-lg border border-border/80 bg-white p-4"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold text-slate-800">{service.serviceName}</h3><Badge variant="outline" className="rounded-md">{service.category}</Badge></div><div className="mt-3"><p className="text-xs leading-5 text-slate-700">{service.fit.statement}</p><ClaimSources claim={service.fit} sources={sourcesById} className="mt-1.5" /></div><div className="mt-3 grid gap-3 sm:grid-cols-2">{service.specifications.length > 0 && <ClaimGroup title="Specifications" claims={service.specifications} sourcesById={sourcesById} />}{service.pricing.length > 0 && <ClaimGroup title="Pricing" claims={service.pricing} sourcesById={sourcesById} />}{service.availability.length > 0 && <ClaimGroup title="Availability" claims={service.availability} sourcesById={sourcesById} />}{service.supportAndSla.length > 0 && <ClaimGroup title="Support and SLA" claims={service.supportAndSla} sourcesById={sourcesById} />}{service.limitations.length > 0 && <ClaimGroup title="Limitations" claims={service.limitations} sourcesById={sourcesById} />}</div></div>)}</div>}
    {result.services.length === 0 && <p className="mt-4 text-xs text-muted-foreground">No structured service facts were extracted. Inspect the source records and confirm details with the provider.</p>}
    {result.sources.length > 0 && <details className="group mt-4 border-t border-border/70 pt-3"><summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium text-slate-700">Source pages captured<ChevronDown className="size-4 text-muted-foreground transition group-open:rotate-180" /></summary><div className="mt-3 grid gap-2">{result.sources.map((source) => <div id={`source-${source.id}`} key={source.id} className="flex items-start gap-2 text-xs"><FileText className="mt-0.5 size-3.5 shrink-0 text-violet-600" /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="rounded px-1.5 py-0.5 text-[10px]">{source.id}</Badge>{source.url ? <a href={source.url} target="_blank" rel="noreferrer" className="font-medium text-violet-800 underline-offset-2 hover:underline">{source.title}<ExternalLink className="ml-1 inline size-3" /></a> : <span className="font-medium text-slate-700">{source.title}</span>}</div><p className="mt-1 line-clamp-3 leading-5 text-muted-foreground">{source.excerpt}</p></div></div>)}</div></details>}
  </CardContent></Card>;
}

function ClaimGroup({ title, claims, sourcesById }: { title: string; claims: Claim[]; sourcesById: Map<string, RecommendationReport["sources"][number]> }) {
  return <div className="rounded-md bg-slate-50 p-3"><p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</p><ul className="grid gap-3">{claims.map((claim, index) => <li key={`${index}-${claim.statement}`}><p className="text-xs leading-5 text-slate-700">{claim.statement}</p><ClaimSources claim={claim} sources={sourcesById} className="mt-1" /></li>)}</ul></div>;
}

function ClaimSources({ claim, sources, className }: { claim: Claim; sources: Map<string, RecommendationReport["sources"][number]>; className?: string }) {
  if (!claim.sourceIds.length) return null;
  return <div className={cn("flex flex-wrap gap-1.5", className)} aria-label="Cited sources">{claim.sourceIds.map((id) => {
    const source = sources.get(id);
    return source ? <a key={id} href={source.url ?? `#source-${id}`} target={source.url ? "_blank" : undefined} rel={source.url ? "noreferrer" : undefined} className="inline-flex items-center gap-1 rounded bg-violet-50 px-1.5 py-1 text-[10px] font-medium text-violet-800 hover:bg-violet-100"><FileText className="size-3" />{id}</a> : null;
  })}</div>;
}

