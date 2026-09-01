// Lazily fetches and caches vendor/tbc-sim/assets/database/db.json, staged at build time by
// scripts/sim/buildWasm.mjs into public/sim/db.json (same lazy-load treatment as lib.wasm -
// only downloaded once a sim-backed objective is actually used, not part of the main bundle).
import type { TbcUiDatabase } from "./buildStatWeightsRequest";

let dbPromise: Promise<TbcUiDatabase> | undefined;

export function loadTbcDatabase(): Promise<TbcUiDatabase> {
	if (!dbPromise) {
		dbPromise = fetch("/sim/db.json").then((res) => res.json());
	}
	return dbPromise;
}
