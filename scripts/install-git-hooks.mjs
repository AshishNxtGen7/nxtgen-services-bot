import { chmodSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

try {
  const gitRoot = resolve(execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: projectRoot,
    encoding: "utf8",
  }).trim());

  if (gitRoot !== projectRoot) {
    throw new Error(`Refusing to configure hooks outside the project root: ${gitRoot}`);
  }

  const hookPath = resolve(projectRoot, ".githooks", "pre-commit");
  chmodSync(hookPath, 0o755);
  execFileSync("git", ["config", "core.hooksPath", resolve(projectRoot, ".githooks")], {
    cwd: projectRoot,
    stdio: "inherit",
  });
} catch (error) {
  if (error && typeof error === "object" && "status" in error && error.status === 128) {
    console.info("Skipping Git hook setup because this is not a Git checkout.");
  } else {
    throw error;
  }
}
