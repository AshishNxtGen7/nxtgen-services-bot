import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serviceGraphSchema, type ServiceGraph } from "./ontology.js";
import type { EvidenceChunk } from "../domain/types.js";

const catalogPath = join(dirname(fileURLToPath(import.meta.url)), "catalog.json");

export class CatalogStore {
  private graph: ServiceGraph = { offerings: [], evidence: [], mappings: [] };

  async init(): Promise<void> {
    const raw = JSON.parse(await readFile(catalogPath, "utf8")) as unknown;
    this.graph = serviceGraphSchema.parse(raw);
  }

  getGraph(): ServiceGraph {
    return this.graph;
  }

  getMatchingEvidence(query: string): EvidenceChunk[] {
    const terms = [...new Set(query.toLowerCase().match(/[a-z0-9]+/g) ?? [])].filter((term) => term.length > 2);
    const evidence: EvidenceChunk[] = [];

    for (const offering of this.graph.offerings) {
      const searchable = `${offering.providerNativeName} ${offering.category} ${offering.capabilities.join(" ")}`.toLowerCase();
      if (!terms.some((term) => searchable.includes(term))) continue;
      const mapping = this.graph.mappings.find((item) => item.serviceId === offering.id && item.reviewState !== "rejected");
      const details = [
        `${offering.providerNativeName} (${offering.category})`,
        `Capabilities: ${offering.capabilities.join(", ") || "not specified"}`,
        mapping ? `Capability mapping: ${mapping.canonicalCapabilityId} (${mapping.relationship}); ${mapping.rationale}` : "No reviewed cross-provider capability mapping is available.",
      ].join(". ");

      for (const id of offering.evidenceIds) {
        const source = this.graph.evidence.find((item) => item.id === id);
        if (!source || source.reviewState === "rejected") continue;
        evidence.push({
          text: `${details}. Source excerpt: ${source.excerpt}`,
          source: source.sourceUrl ?? source.sourceFile ?? source.id,
          providerId: offering.providerId,
          capturedAt: source.capturedAt,
          ingestedAt: source.capturedAt,
          state: source.reviewState === "approved" ? "reviewed" : "unreviewed",
        });
      }
    }

    return evidence;
  }

  getStatus() {
    return {
      serviceOfferings: this.graph.offerings.length,
      evidenceRecords: this.graph.evidence.length,
      capabilityMappings: this.graph.mappings.length,
      approvedServiceOfferings: this.graph.offerings.filter((offering) => {
        const evidence = offering.evidenceIds.map((id) => this.graph.evidence.find((item) => item.id === id));
        return evidence.length > 0 && evidence.every((item) => item?.reviewState === "approved");
      }).length,
    };
  }
}
