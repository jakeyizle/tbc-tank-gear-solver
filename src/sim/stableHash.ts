// Shared by round1WeightsCache.ts and simBalanceCache.ts: a stable, order-independent hash of
// an arbitrary JSON-serializable value, for localStorage cache keys derived from "everything that
// affects this result" input objects (a SimCalibrationProfile, SolveOptions, etc.) that get built
// via object spreads in different orders across callsites - a cosmetic shape difference shouldn't
// cause a spurious cache miss.
export function canonicalStringify(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map(canonicalStringify).join(",")}]`;
	}
	if (value && typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>).sort(
			([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
		);
		return `{${entries
			.map(([k, v]) => `${JSON.stringify(k)}:${canonicalStringify(v)}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
}

// djb2 string hash - not cryptographic, just a short, stable key derived from the canonical
// encoding above so localStorage keys stay small.
export function stableHash(value: unknown): string {
	const canonical = canonicalStringify(value);
	let hash = 5381;
	for (let i = 0; i < canonical.length; i++) {
		hash = (hash * 33 + canonical.charCodeAt(i)) | 0;
	}
	return (hash >>> 0).toString(36);
}
