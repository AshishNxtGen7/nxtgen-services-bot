import { z } from "zod";
import { providerIds } from "../domain/types.js";

export const comparisonRelationshipSchema = z.enum([
  "equivalent",
  "close",
  "adjacent",
  "no-public-match",
  "not-comparable",
]);

export const evidenceRecordSchema = z.object({
  id: z.string().min(1),
  providerId: z.enum(providerIds),
  sourceUrl: z.string().url().optional(),
  sourceFile: z.string().optional(),
  excerpt: z.string().min(1),
  capturedAt: z.string().datetime(),
  extractionMethod: z.enum(["manual", "pdf", "official-feed", "public-page"]),
  reviewState: z.enum(["unreviewed", "approved", "rejected"]),
  confidence: z.number().min(0).max(1),
});

export const serviceOfferingSchema = z.object({
  id: z.string().min(1),
  providerId: z.enum(providerIds),
  providerNativeName: z.string().min(1),
  productUrl: z.string().url().optional(),
  category: z.string().min(1),
  lifecycle: z.enum(["available", "preview", "deprecated", "unknown"]),
  capabilities: z.array(z.string()),
  evidenceIds: z.array(z.string()).min(1),
  lastObservedAt: z.string().datetime(),
});

export const capabilityMappingSchema = z.object({
  id: z.string().min(1),
  serviceId: z.string().min(1),
  canonicalCapabilityId: z.string().min(1),
  relationship: comparisonRelationshipSchema,
  rationale: z.string().min(1),
  confidence: z.number().min(0).max(1),
  evidenceIds: z.array(z.string()).min(1),
  reviewState: z.enum(["unreviewed", "approved", "rejected"]),
});

export const serviceGraphSchema = z.object({
  offerings: z.array(serviceOfferingSchema),
  evidence: z.array(evidenceRecordSchema),
  mappings: z.array(capabilityMappingSchema),
});

export type EvidenceRecord = z.infer<typeof evidenceRecordSchema>;
export type ServiceOffering = z.infer<typeof serviceOfferingSchema>;
export type CapabilityMapping = z.infer<typeof capabilityMappingSchema>;
export type ServiceGraph = z.infer<typeof serviceGraphSchema>;

export const emptyServiceGraph: ServiceGraph = {
  offerings: [],
  evidence: [],
  mappings: [],
};
