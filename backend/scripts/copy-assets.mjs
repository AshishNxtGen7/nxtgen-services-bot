import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
await mkdir(resolve(root, "dist/knowledge"), { recursive: true });
await mkdir(resolve(root, "dist/catalog"), { recursive: true });
await copyFile(resolve(root, "src/knowledge/prd-guidance.md"), resolve(root, "dist/knowledge/prd-guidance.md"));
await copyFile(resolve(root, "src/catalog/catalog.json"), resolve(root, "dist/catalog/catalog.json"));
