import assert from "node:assert/strict";
import test from "node:test";
import {
  evidenceRecordSchema,
  serviceGraphSchema,
  serviceOfferingSchema,
} from "../dist/catalog/ontology.js";

const offering = {
  id: "aws-compute",
  providerId: "aws",
  providerNativeName: "Amazon EC2",
  category: "compute",
  lifecycle: "available",
  capabilities: ["virtual machines"],
  evidenceIds: ["aws-compute-evidence"],
  lastObservedAt: "2026-10-01T12:00:00.000Z",
};

const evidence = {
  id: "aws-compute-evidence",
  providerId: "aws",
  sourceUrl: "https://aws.amazon.com/ec2/",
  excerpt: "Resizable compute capacity.",
  capturedAt: "2026-10-01T12:00:00.000Z",
  extractionMethod: "public-page",
  reviewState: "approved",
  confidence: 0.9,
};

test("accepts a valid provider offering and attributed evidence graph", () => {
  assert.equal(serviceOfferingSchema.safeParse(offering).success, true);
  assert.equal(evidenceRecordSchema.safeParse(evidence).success, true);
  assert.equal(serviceGraphSchema.safeParse({
    offerings: [offering],
    evidence: [evidence],
    mappings: [{
      id: "aws-compute-mapping",
      serviceId: offering.id,
      canonicalCapabilityId: "virtual-machine-compute",
      relationship: "equivalent",
      rationale: "Both describe general-purpose virtual machine compute.",
      confidence: 0.8,
      evidenceIds: [evidence.id],
      reviewState: "approved",
    }],
  }).success, true);
});

test("rejects invalid provider ids, missing evidence links, and out-of-range confidence", () => {
  assert.equal(serviceOfferingSchema.safeParse({ ...offering, providerId: "unknown" }).success, false);
  assert.equal(serviceOfferingSchema.safeParse({ ...offering, evidenceIds: [] }).success, false);
  assert.equal(evidenceRecordSchema.safeParse({ ...evidence, confidence: 1.01 }).success, false);
  assert.equal(evidenceRecordSchema.safeParse({ ...evidence, capturedAt: "not-a-date" }).success, false);
});
