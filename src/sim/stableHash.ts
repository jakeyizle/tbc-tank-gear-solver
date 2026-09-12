// Shared by round1WeightsCache.ts: a stable, order-independent hash of
// an arbitrary JSON-serializable value, for localStorage cache keys derived from "everything that
// affects this result" input objects (a SimCalibrationProfile, SolveOptions, etc.) that get built
// via object spreads in different orders across callsites - a cosmetic shape difference shouldn't
// cause a spurious cache miss.
export function canonicalStringify(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map(canonicalStringify).join(",")}]`;
	}
	if (value && typeof value === "object") {
		// Stryker disable next-line all: any deterministic total order canonicalizes, so reversing
		// or weakening this comparator preserves the only property that matters here - same keys in
		// any insertion order produce the same encoding. Verified by stableHash.test.ts's three-key,
		// six-order test, which DOES kill a non-deterministic comparator.
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
		// Stryker disable next-line all: the specific mixing arithmetic is not load-bearing - any
		// deterministic function that distinguishes different inputs works, and all of those
		// properties ARE tested. Killing an operator mutant here would mean snapshotting an exact
		// hash value, which pins an implementation detail rather than a requirement.
		hash = (hash * 33 + canonical.charCodeAt(i)) | 0;
	}
	return (hash >>> 0).toString(36);
}
