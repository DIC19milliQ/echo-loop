import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createTerrainSnapshots } from "./terrain-snapshot-data.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baselinePath = path.resolve(__dirname, "../docs/terrain-snapshot-baseline.json");
const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
const current = createTerrainSnapshots();

const baselineComparable = JSON.stringify({ snapshots: baseline.snapshots });
const currentComparable = JSON.stringify({ snapshots: current.snapshots });

if (baselineComparable !== currentComparable) {
  console.error("Terrain snapshot mismatch");
  process.exit(1);
}

console.log("Terrain snapshot OK");
