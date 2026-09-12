import { describe, expect, it } from "vitest";
import { canonicalStringify, stableHash } from "./stableHash";

// Order-independent hashing of cache-key inputs.
//
// Thirty lines, and the only thing standing between a calibration cache and a WRONG hit. Both
// failure directions are silent and neither throws: too-sensitive means a spurious miss and a
// wasted multi-minute calibration, too-insensitive means two genuinely different profiles share
// a key and one gets the other's stat weights.
//
// It sat at 100% statement coverage before this file existed, because round1WeightsCache.test.ts
// exercises it end to end - but nothing asserted the property the whole design rests on, which is
// that key ORDER must not matter while VALUES must.

describe("canonicalStringify", () => {
	// The reason this module exists: these objects are built by spreads in different orders at
	// different call sites, and a cosmetic shape difference must not look like a different input.
	it("is insensitive to key insertion order", () => {
		expect(canonicalStringify({ a: 1, b: 2 })).toBe(
			canonicalStringify({ b: 2, a: 1 }),
		);
	});

	// Two keys is not enough to pin the comparator: with {a, b} even a comparator that never
	// returns -1 sorts both insertion orders to the same result by luck. Mutation testing showed
	// four survivors on the comparator line until this existed.
	it("canonicalizes three keys from every insertion order", () => {
		const orders = [
			{ a: 1, b: 2, c: 3 },
			{ a: 1, c: 3, b: 2 },
			{ b: 2, a: 1, c: 3 },
			{ b: 2, c: 3, a: 1 },
			{ c: 3, a: 1, b: 2 },
			{ c: 3, b: 2, a: 1 },
		];
		const encodings = new Set(orders.map(canonicalStringify));
		expect(encodings.size).toBe(1);
	});

	// Pins the exact encoding, which the order-independence tests above cannot: they only compare
	// two encodings to each other, so a mutated separator or delimiter passes them both.
	it("encodes objects and arrays in an exact, stable format", () => {
		expect(canonicalStringify({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
		expect(canonicalStringify([1, 2])).toBe("[1,2]");
		expect(canonicalStringify({ a: [1, { c: 3, b: 2 }] })).toBe(
			'{"a":[1,{"b":2,"c":3}]}',
		);
	});

	it("sorts keys at every depth, not just the top level", () => {
		expect(canonicalStringify({ outer: { a: 1, b: 2 } })).toBe(
			canonicalStringify({ outer: { b: 2, a: 1 } }),
		);
	});

	it("sorts keys inside objects nested in arrays", () => {
		expect(canonicalStringify([{ a: 1, b: 2 }])).toBe(
			canonicalStringify([{ b: 2, a: 1 }]),
		);
	});

	// Arrays are ORDERED data, not bags. Sorting them would make two different gear sets or two
	// different stat-weight vectors collide.
	it("preserves array order", () => {
		expect(canonicalStringify([1, 2])).not.toBe(canonicalStringify([2, 1]));
	});

	it("distinguishes values, not just shapes", () => {
		expect(canonicalStringify({ a: 1 })).not.toBe(canonicalStringify({ a: 2 }));
		expect(canonicalStringify({ a: 1 })).not.toBe(canonicalStringify({ b: 1 }));
	});

	// A number and its string form must not collide - iterations: 200 and iterations: "200" are
	// different inputs to the sim.
	it("distinguishes a number from its string form", () => {
		expect(canonicalStringify({ a: 1 })).not.toBe(
			canonicalStringify({ a: "1" }),
		);
	});

	it("handles primitives and null", () => {
		expect(canonicalStringify(1)).toBe("1");
		expect(canonicalStringify("a")).toBe('"a"');
		expect(canonicalStringify(true)).toBe("true");
		expect(canonicalStringify(null)).toBe("null");
	});

	// Pinning current behaviour rather than endorsing it. JSON.stringify(undefined) returns the
	// UNDEFINED value, not a string, so an undefined leaf stringifies to the literal
	// "undefined" via template interpolation. That is fine for a cache key (it is stable and
	// distinct), but it means an explicitly-undefined field and an absent one differ. Worth
	// knowing if a caller ever starts spreading optional fields in conditionally.
	it("treats an explicitly-undefined field as different from an absent one", () => {
		expect(canonicalStringify({ a: undefined })).not.toBe(
			canonicalStringify({}),
		);
		expect(canonicalStringify({ a: undefined })).toBe('{"a":undefined}');
	});

	it("encodes an empty object and an empty array distinctly", () => {
		expect(canonicalStringify({})).toBe("{}");
		expect(canonicalStringify([])).toBe("[]");
	});
});

describe("stableHash", () => {
	it("agrees on inputs that differ only in key order", () => {
		expect(stableHash({ a: 1, b: [2, { c: 3, d: 4 }] })).toBe(
			stableHash({ b: [2, { d: 4, c: 3 }], a: 1 }),
		);
	});

	it("differs for realistically-similar calibration inputs", () => {
		const base = {
			objectiveMode: "tmi",
			calibration: { iterations: 200, maxRounds: 20 },
			raidProfile: { race: "RaceHuman" },
		};
		const seen = new Set(
			[
				base,
				{ ...base, objectiveMode: "dtps" },
				{ ...base, calibration: { iterations: 201, maxRounds: 20 } },
				{ ...base, calibration: { iterations: 200, maxRounds: 21 } },
				{ ...base, raidProfile: { race: "RaceDwarf" } },
			].map(stableHash),
		);
		// Five meaningfully different inputs must produce five different keys; a collision here
		// would hand one profile another's calibrated weights.
		expect(seen.size).toBe(5);
	});

	it("is deterministic across calls", () => {
		const value = { a: 1, b: { c: [1, 2, 3] } };
		expect(stableHash(value)).toBe(stableHash(value));
	});

	// The keys go into localStorage, so they have to be short and URL-safe-ish. `| 0` keeps the
	// djb2 accumulator in int32 and `>>> 0` makes it unsigned before base-36 encoding; without
	// the unsigned step a negative hash would stringify with a "-" in the key.
	it("produces a short, non-negative base-36 key", () => {
		for (const value of [{}, { a: 1 }, "x".repeat(5000), [1, 2, 3]]) {
			const key = stableHash(value);
			expect(key).toMatch(/^[0-9a-z]+$/);
			expect(key.length).toBeLessThanOrEqual(7);
		}
	});
});
