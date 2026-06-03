import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const clientDir = join(scriptDir, "..", "dist", "client");
const voiceDir = join(clientDir, "voice");

const entries = await readdir(clientDir, { withFileTypes: true });

await rm(voiceDir, { recursive: true, force: true });
await mkdir(voiceDir, { recursive: true });

for (const entry of entries) {
  if (entry.name === "voice") continue;
  await cp(join(clientDir, entry.name), join(voiceDir, entry.name), {
    recursive: true,
    force: true,
  });
}

console.log("Prepared /voice static asset mirror for Cloudflare path-routed assets.");
