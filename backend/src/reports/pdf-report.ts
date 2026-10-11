import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";
import { PDFParse } from "pdf-parse";
import { reportFooterTemplate, reportHeaderTemplate, type PdfReportData } from "./pdf-report-html.js";
import { renderSalesReportHtml } from "./pdf-sales-report.js";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const reportsDir = process.env.REPORTS_DIR?.trim() || join(moduleDir, "../../../frontend/public/reports");

export async function createPdfReport(report: PdfReportData): Promise<{ reportUrl: string; pdfFileName: string }> {
  await mkdir(reportsDir, { recursive: true });
  const timestamp = report.generatedAt.replace(/[:.]/g, "-");
  const pdfFileName = `cloud-sales-proposal-${timestamp}-${randomUUID().slice(0, 8)}.pdf`;
  const outputPath = join(reportsDir, pdfFileName);
  const temporaryPath = `${outputPath}.tmp`;
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;

  try {
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: process.env.PUPPETEER_NO_SANDBOX === "true" ? ["--no-sandbox"] : [],
      });
    } catch (error) {
      throw new Error(
        "Puppeteer could not start Chrome. Install the bundled browser with `npx puppeteer browsers install chrome` and confirm this runtime supports headless Chrome.",
        { cause: error },
      );
    }

    const page = await browser.newPage();
    await page.setContent(renderSalesReportHtml(report), { waitUntil: "load", timeout: 30_000 });
    await page.emulateMediaType("print");
    await page.evaluate(() => document.fonts.ready);
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: reportHeaderTemplate,
      footerTemplate: reportFooterTemplate,
      margin: { top: "14mm", right: "12mm", bottom: "17mm", left: "12mm" },
      waitForFonts: true,
      timeout: 30_000,
    });

    const pdfBytes = Buffer.from(pdf);
    await validatePdf(pdfBytes);
    await writeFile(temporaryPath, pdfBytes);
    await rename(temporaryPath, outputPath);
    return { reportUrl: `/reports/${pdfFileName}`, pdfFileName };
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  } finally {
    if (browser) await browser.close();
  }
}

async function validatePdf(pdf: Uint8Array): Promise<void> {
  if (pdf.byteLength < 1_000 || new TextDecoder().decode(pdf.slice(0, 5)) !== "%PDF-") {
    throw new Error("Puppeteer returned an empty or invalid PDF.");
  }

  const parser = new PDFParse({ data: Buffer.from(pdf) });
  try {
    const info = await parser.getInfo();
    const text = await parser.getText();
    const pagesWithoutContent = text.pages
      .filter((page) => !hasReportContent(page.text))
      .map((page) => page.num);
    if (!info.total || text.pages.length !== info.total || pagesWithoutContent.length > 0) {
      const emptyPages = pagesWithoutContent.length ? ` Content-free pages: ${pagesWithoutContent.join(", ")}.` : "";
      throw new Error(`PDF validation failed: found ${info.total} pages but ${text.pages.length} were parsed.${emptyPages}`);
    }
  } finally {
    await parser.destroy();
  }
}

function hasReportContent(value: string): boolean {
  const text = value
    .replace(/SpeedCloud Advisor\s*[·•]\s*Evidence-backed comparison/gi, "")
    .replace(/\b\d+\s*\/\s*\d+\b/g, "")
    .replace(/[\s\u200b\u00a0]/g, "");
  return text.length >= 8;
}
