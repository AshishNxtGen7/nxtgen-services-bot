import assert from "node:assert/strict";
import test from "node:test";
import { cn } from "../src/lib/utils.ts";

test("combines conditional classes and resolves conflicting Tailwind utilities", () => {
  assert.equal(cn("px-2 text-red-600", false && "hidden", "px-4 text-white"), "px-4 text-white");
});
