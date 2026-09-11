// Calls the wasm sim's computeStats() export to get a character's real, final stats.
//
// This is the authoritative answer to "what are this gear set's stats" - the same code path
// wowsims' own character panel uses - and it replaces the hand-written formulas in
// helpers/stats.ts. It runs NO sim iterations, so unlike a raid sim it is fast enough to call
// interactively and is fully deterministic (no seed, no variance).
import { perfTrace } from "#/helpers/perfTrace";
import type {
	CharacterStatsBreakdown,
	UnitStatsView,
} from "#/types/CharacterStats";
import type { SimCalibrationProfile } from "#/types/SimCalibrationProfile";
import { buildComputeStatsRequest } from "./buildComputeStatsRequest";
import type { TbcUiDatabase } from "./buildStatWeightsRequest";
import { ComputeStatsRequest, ComputeStatsResult } from "./proto/api.js";
import { stableHash } from "./stableHash";
import type { GearPiece } from "./toTbcItemSpec";
import { loadWasm, wasmGlobals } from "./wasmCoordinator";

const EMPTY_VIEW: UnitStatsView = { stats: [], pseudoStats: [] };

function toView(
	unitStats: { stats: number[]; pseudoStats: number[] } | undefined,
) {
	if (!unitStats) return EMPTY_VIEW;
	return {
		stats: unitStats.stats ?? [],
		pseudoStats: unitStats.pseudoStats ?? [],
	};
}

// computeStats is cheap but not free (it builds the whole sim environment), and the
// convergence loop asks about the same gear repeatedly. A small LRU keyed on the request's
// content keeps that to one call each.
const CACHE_LIMIT = 64;
const cache = new Map<string, CharacterStatsBreakdown>();

function cacheGet(key: string): CharacterStatsBreakdown | undefined {
	const hit = cache.get(key);
	if (hit) {
		// refresh recency
		cache.delete(key);
		cache.set(key, hit);
	}
	return hit;
}

function cacheSet(key: string, value: CharacterStatsBreakdown): void {
	cache.set(key, value);
	if (cache.size > CACHE_LIMIT) {
		const oldest = cache.keys().next();
		if (!oldest.done) cache.delete(oldest.value);
	}
}

/** Drops the memoized results. Call when the underlying wasm instance is recycled. */
export function clearComputeStatsCache(): void {
	cache.clear();
}

/**
 * Builds `gear` under `profile` and returns its stats, with the per-build-phase breakdown.
 *
 * @param bonusStats Optional proto.Stat-indexed additions injected via Player.bonus_stats
 * (api.proto:38). Used to finite-difference the sim for LP coefficients - NOT for
 * DefenseRating, which floors internally and must be handled analytically.
 */
export async function computeCharacterStats(
	gear: GearPiece[],
	db: TbcUiDatabase,
	profile: SimCalibrationProfile,
	bonusStats?: Record<number, number>,
): Promise<CharacterStatsBreakdown> {
	const request = buildComputeStatsRequest(gear, db, profile);
	if (bonusStats && Object.keys(bonusStats).length > 0) {
		const player = request.raid.parties[0].players[0] as Record<
			string,
			unknown
		>;
		player.bonusStats = { stats: denseStatArray(bonusStats) };
	}

	const key = stableHash(request);
	const cached = cacheGet(key);
	if (cached) return cached;

	await loadWasm();
	if (!wasmGlobals.computeStats) {
		throw new Error(
			"computeStats global was not registered by the wasm module",
		);
	}

	const requestBytes = ComputeStatsRequest.toBinary(
		ComputeStatsRequest.fromJson(request as never, {
			ignoreUnknownFields: true,
		}),
	);

	const resultBytes = perfTrace.time("computeStatsWasmCall", () =>
		// biome-ignore lint/style/noNonNullAssertion: guarded above
		wasmGlobals.computeStats!(requestBytes),
	);
	const result = ComputeStatsResult.fromBinary(resultBytes);

	if (result.errorResult) {
		throw new Error(`computeStats failed: ${result.errorResult}`);
	}

	const playerStats = result.raidStats?.parties?.[0]?.players?.[0];
	if (!playerStats) {
		throw new Error("computeStats returned no player stats");
	}

	const breakdown: CharacterStatsBreakdown = {
		base: toView(playerStats.baseStats),
		gear: toView(playerStats.gearStats),
		talents: toView(playerStats.talentsStats),
		buffs: toView(playerStats.buffsStats),
		consumes: toView(playerStats.consumesStats),
		final: toView(playerStats.finalStats),
	};
	cacheSet(key, breakdown);
	return breakdown;
}

/**
 * proto.UnitStats.stats is a DENSE array covering every proto.Stat; bonusStats arrives here
 * as a sparse index->value map.
 *
 * The array must be full length even when only a low index is set. The Go side indexes it
 * positionally by stat ordinal, so a short array panics with "index out of range" the moment
 * it reads a stat beyond the last one written - it does not treat a short array as zeros.
 */
const PROTO_STAT_COUNT = 42;

function denseStatArray(sparse: Record<number, number>): number[] {
	const dense = new Array<number>(PROTO_STAT_COUNT).fill(0);
	for (const [index, value] of Object.entries(sparse)) {
		dense[Number(index)] = value;
	}
	return dense;
}
