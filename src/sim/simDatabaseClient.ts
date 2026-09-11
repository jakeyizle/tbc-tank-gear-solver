// Lazily fetches and caches vendor/tbc-sim/assets/database/db.json, staged at build time by
// scripts/sim/buildWasm.mjs into public/sim/db.json.
//
// The fetch + module-level cache now live in #/data/tbcDatabase, which also adapts the same
// records into this repo's solver domain types. This module stays as the sim-side view of
// that one shared promise, so the 3.1MB database is never fetched twice.
import { loadRawTbcDatabase } from "#/data/tbcDatabase";
import type { TbcUiDatabase } from "./buildStatWeightsRequest";

export function loadTbcDatabase(): Promise<TbcUiDatabase> {
	return loadRawTbcDatabase() as unknown as Promise<TbcUiDatabase>;
}
