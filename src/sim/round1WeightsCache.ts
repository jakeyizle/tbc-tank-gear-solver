// Persists "Weighted Sim Metrics" round 1's calibrated weights across solves and page reloads,
// keyed by exactly the inputs that affect them (the SimCalibrationProfile and the metric ratio
// blend) - round 1 always calibrates around the same fixed PROT_PALADIN_BASELINE_GEAR preset, so
// its result never depends on the item pool or previously-solved gear (see solveSimMetric.ts's
// solveConfigForSimMetric). Follows the same localStorage pattern as persistence.ts: one
// versioned JSON blob, try/catch-wrapped so quota errors or private browsing degrade to "no
// cache" instead of throwing.
import type { SimCalibrationProfile } from "#/types/SimCalibrationProfile";
import type { CalibratedWeights } from "./calibrateWeights";
import { stableHash } from "./stableHash";

const STORAGE_KEY = "round1WeightsCache";
// Bump whenever round 1's calibration semantics change in a way that would make an old entry
// wrong without the profile itself changing - e.g. PROT_PALADIN_BASELINE_GEAR, the wasm sim
// build, or buildStatWeightsRequest's request shape.
const CACHE_VERSION = 1;
// Bounds growth as a user experiments with different profiles/ratios over a long session,
// without needing a TTL - oldest-savedAt entries are evicted first on write.
const MAX_ENTRIES = 20;

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
	simMetricWeights: { tps: number; dtps: number; tmi5: number },
): string {
	return `${CACHE_VERSION}:${stableHash({ profile, simMetricWeights })}`;
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
	simMetricWeights: { tps: number; dtps: number; tmi5: number },
): CalibratedWeights | undefined {
	const entry = readCacheFile().entries[hashKey(profile, simMetricWeights)];
	if (!entry) return undefined;
	return { optimizeStats: entry.optimizeStats, stdevStats: entry.stdevStats };
}

export function setCachedRound1Weights(
	profile: SimCalibrationProfile,
	simMetricWeights: { tps: number; dtps: number; tmi5: number },
	weights: CalibratedWeights,
): void {
	try {
		const file = readCacheFile();
		file.entries[hashKey(profile, simMetricWeights)] = {
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
