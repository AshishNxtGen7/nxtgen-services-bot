import assert from "node:assert/strict";
import test from "node:test";
import { recommendationInputSchema } from "../dist/agent/recommendation-graph.js";

test("trims a valid requirement and applies the default profile", () => {
  assert.deepEqual(
    recommendationInputSchema.parse({ requirement: "  Build a secure data platform  " }),
    { requirement: "Build a secure data platform", profileId: "india-first" },
  );
});

test("accepts the minimum and maximum requirement lengths", () => {
  assert.equal(recommendationInputSchema.safeParse({ requirement: "a".repeat(8) }).success, true);
  assert.equal(recommendationInputSchema.safeParse({ requirement: "a".repeat(4000) }).success, true);
});

test("rejects short, overlong, and unknown-profile inputs", () => {
  assert.equal(recommendationInputSchema.safeParse({ requirement: "short" }).success, false);
  assert.equal(recommendationInputSchema.safeParse({ requirement: "a".repeat(4001) }).success, false);
  assert.equal(
    recommendationInputSchema.safeParse({ requirement: "A valid requirement", profileId: "unknown" }).success,
    false,
  );
});
