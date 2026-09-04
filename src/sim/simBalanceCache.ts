// Persists solveBalancedSimMetric's two single-metric endpoint solves (the "100% Threat" and
// "100% Survivability" anchors - see solveBalancedSimMetric.ts) across solves and page reloads,
// keyed by everything that can change their outcome: the item pool, the full solver options (race/
// class/talents/buffs/consumables/resistance floors/etc - all of it affects the LP, not just the
// item pool), and the calibration profile. The balance slider's `t` value is deliberately NOT part
// of the key, since only the final constrained solve (cheap relative to the two endpoint SLP
// loops) depends on it - see stableHash.ts's own note on why this needs to be order-independent.
// Follows the same localStorage pattern as round1WeightsCache.ts.
import type { InputItem } from "#/solver/types";
import type { SimCalibrationProfile } from "#/types/SimCalibrationProfile";
import type { BalanceEndpoint } from "./solveBalancedSimMetric";
import { stableHash } from "./stableHash";

const STORAGE_KEY = "simBalanceCache";
// Bump whenever an endpoint solve's semantics change in a way that would make an old entry wrong
// without the keyed inputs themselves changing - e.g. the wasm sim build, or how endpoints are
// computed.
const CACHE_VERSION = 1;
// Bounds growth as a user experiments with different item pools/configs over a long session,
// without needing a TTL - oldest-savedAt entries are evicted first on write.
const MAX_ENTRIES = 20;

interface CacheEntry {
	threat: BalanceEndpoint;
	survival: BalanceEndpoint;
	savedAt: number;
}

interface CacheFile {
	version: typeof CACHE_VERSION;
	entries: Record<string, CacheEntry>;
}

function hashKey(
	items: InputItem[],
	options: Record<string, unknown>,
	profile: SimCalibrationProfile,
): string {
	return `${CACHE_VERSION}:${stableHash({ items, options, profile })}`;
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

export function getCachedBalanceEndpoints(
	items: InputItem[],
	options: Record<string, unknown>,
	profile: SimCalibrationProfile,
): { threat: BalanceEndpoint; survival: BalanceEndpoint } | undefined {
	const entry = readCacheFile().entries[hashKey(items, options, profile)];
	if (!entry) return undefined;
	return { threat: entry.threat, survival: entry.survival };
}

export function setCachedBalanceEndpoints(
	items: InputItem[],
	options: Record<string, unknown>,
	profile: SimCalibrationProfile,
	endpoints: { threat: BalanceEndpoint; survival: BalanceEndpoint },
): void {
	try {
		const file = readCacheFile();
		file.entries[hashKey(items, options, profile)] = {
			...endpoints,
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

export function clearSimBalanceCache(): void {
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// ignore
	}
}
