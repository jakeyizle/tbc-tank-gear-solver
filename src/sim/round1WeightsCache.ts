// Persists "Weighted Sim Metrics" round 1's calibrated weights across solves and page reloads,
// keyed by exactly the inputs that affect them (the SimCalibrationProfile and which sim-backed
// objective is being solved) - round 1 always calibrates around the same fixed
// PROT_PALADIN_BASELINE_GEAR preset, so its result never depends on the item pool or
// previously-solved gear (see solveSimMetric.ts's solveConfigForSimMetric). Follows the same
// localStorage pattern as persistence.ts: one versioned JSON blob, try/catch-wrapped so quota
// errors or private browsing degrade to "no cache" instead of throwing.
//
// This module is called from src/solver/index.ts (the main thread, which alone has
// `localStorage` - a dedicated Worker's global scope doesn't carry the WindowLocalStorage mixin,
// which is why this cache must be orchestrated there rather than from inside
// solver.worker.ts itself). The `CalibratedWeights` import below is type-only (this repo's
// verbatimModuleSyntax guarantees it's fully erased at build) - it never pulls calibrateWeights.ts's
// runtime wasm/proto code along with it, so src/solver/index.ts can import this module statically
// with no risk to the main bundle's size.
import type { StatName } from "#/solver/types";
import type { SimCalibrationProfile } from "#/types/SimCalibrationProfile";
import type { CalibratedWeights } from "./calibrateWeights";
import { stableHash } from "./stableHash";

const STORAGE_KEY = "round1WeightsCache";
// Bump whenever round 1's calibration semantics change in a way that would make an old entry
// wrong without the profile itself changing - e.g. PROT_PALADIN_BASELINE_GEAR, the wasm sim
// build, or buildStatWeightsRequest's request shape.
//
// Bumped 1 -> 2: calibrateWeights.ts's multi-metric blending changed from a raw
// `ratio * epValue` sum (which let whichever metric had larger-magnitude EP values dominate
// regardless of the user's chosen balance - see blendNormalizedPerMetricWeights' doc comment)
// to normalizing each metric's vector to a common scale before applying the ratio. A cached
// "balanced"-mode entry from before that change holds `optimizeStats`/`stdevStats` computed
// under the old, biased blend - stale in a way the profile/balance/survivabilityMetric key
// alone wouldn't detect, so it must be invalidated here instead.
const CACHE_VERSION = 2;
// Bounds growth as a user experiments with different profiles/ratios over a long session,
// without needing a TTL - oldest-savedAt entries are evicted first on write.
const MAX_ENTRIES = 20;

/** Everything besides the profile that determines round 1's calibrated weights - see
 * calibrateWeights.ts's metricRatiosForBalance (for `balance`/`survivabilityMetric`, only
 * meaningful/included for `objectiveMode === "balanced"`) and solveSimMetric.ts's
 * calibrationStats resolution (which stats actually get calibrated). `calibrationStats` should
 * be passed in a stable (e.g. sorted) order - array element order affects the hash, unlike the
 * profile object's key order. */
export interface Round1CacheKey {
	objectiveMode: "tps" | "dtps" | "tmi" | "balanced";
	balance?: number;
	survivabilityMetric?: "tmi" | "dtps";
	calibrationStats?: StatName[];
}

interface CacheEntry extends CalibratedWeights {
	savedAt: number;
}

interface CacheFile {
	version: typeof CACHE_VERSION;
	entries: Record<string, CacheEntry>;
}

// See stableHash.ts's own comment on why this needs to be order-independent.
function hashKey(
	profile: SimCalibrationProfile,
	calibrationKey: Round1CacheKey,
): string {
	return `${CACHE_VERSION}:${stableHash({ profile, calibrationKey })}`;
}

function readCacheFile(): CacheFile {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return { version: CACHE_VERSION, entries: {} };
		const parsed = JSON.parse(raw) as CacheFile;
		if (parsed.version !== CACHE_VERSION || !parsed.entries) {
			return { version: CACHE_VERSION, entries: {} };
		}
		return parsed;
	} catch {
		return { version: CACHE_VERSION, entries: {} };
	}
}

export function getCachedRound1Weights(
	profile: SimCalibrationProfile,
	calibrationKey: Round1CacheKey,
): CalibratedWeights | undefined {
	const entry = readCacheFile().entries[hashKey(profile, calibrationKey)];
	if (!entry) return undefined;
	return {
		optimizeStats: entry.optimizeStats,
		stdevStats: entry.stdevStats,
		perMetricStatWeights: entry.perMetricStatWeights,
		perMetricStatWeightStdevs: entry.perMetricStatWeightStdevs,
	};
}

export function setCachedRound1Weights(
	profile: SimCalibrationProfile,
	calibrationKey: Round1CacheKey,
	weights: CalibratedWeights,
): void {
	try {
		const file = readCacheFile();
		file.entries[hashKey(profile, calibrationKey)] = {
			...weights,
			savedAt: Date.now(),
		};

		const keys = Object.keys(file.entries);
		if (keys.length > MAX_ENTRIES) {
			const toEvict = keys
				.sort((a, b) => file.entries[a].savedAt - file.entries[b].savedAt)
				.slice(0, keys.length - MAX_ENTRIES);
			for (const key of toEvict) {
				delete file.entries[key];
			}
		}

		localStorage.setItem(STORAGE_KEY, JSON.stringify(file));
	} catch {
		// quota exceeded or private browsing - best-effort cache, safe to drop
	}
}

export function clearRound1WeightsCache(): void {
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// ignore
	}
}
