import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseTalentsString } from "./talentString";

// Decoding the WowSims talent export string.
//
// This had no tests at all, which was the riskiest gap the verification pass found: it is pure
// positional parsing against a table of indices copied by hand out of the vendored sim, it is
// load-bearing for every EHP solve (deriveLinearModel reads Improved Righteous Fury's rank from
// it to get the damage-taken multiplier), and every one of its failure modes is silent. A
// shifted index does not throw - it returns a plausible wrong rank.
//
// Coverage did not reveal this. talentString.ts sat at 100% statement coverage the whole time,
// because protPaladinSimpleRotation.test.ts and others call parseTalentsString constantly. What
// no test did was assert that the DECODED VALUES are right.

const PALADIN = "2";

// The app's talent keys, and the fieldName each one corresponds to in the vendored talent tree.
// Kept as an explicit literal rather than derived, because the mapping from this repo's
// kebab-case ids to the vendor's camelCase fieldNames IS the thing under test.
const PALADIN_TALENTS = [
	{ id: "toughness", tree: 1, fieldName: "toughness" },
	{ id: "anticipation", tree: 1, fieldName: "anticipation" },
	{ id: "sacred-duty", tree: 1, fieldName: "sacredDuty" },
	{ id: "holy-shield", tree: 1, fieldName: "holyShield" },
	{ id: "combat-expertise", tree: 1, fieldName: "combatExpertise" },
	{ id: "avengers-shield", tree: 1, fieldName: "avengersShield" },
	{
		id: "improved-righteous-fury",
		tree: 1,
		fieldName: "improvedRighteousFury",
	},
	{ id: "deflection", tree: 2, fieldName: "deflection" },
	{ id: "sanctity-aura", tree: 2, fieldName: "sanctityAura" },
] as const;

const treesPath = path.resolve(
	__dirname,
	"../../vendor/tbc-sim/ui/core/talents/trees/paladin.json",
);
const hasTrees = fs.existsSync(treesPath);

/** Builds a talent string whose only non-zero character is `rank`, at `index` of `segment`. */
const stringWithRankAt = (segment: number, index: number, rank: number) => {
	const segments = ["", "", ""];
	segments[segment] = "0".repeat(index) + String(rank);
	return segments.join("-");
};

// The drift guard. Every index in talentString.ts's position table was read off this file by
// hand; nothing but this test notices if a vendor submodule bump inserts a talent and shifts
// everything below it. Same idea as mechanicsEnums.test.ts, which pins data/mechanics.ts
// against the generated protos.
describe.skipIf(!hasTrees)(
	"talent positions still match the vendored paladin tree",
	() => {
		const trees = JSON.parse(fs.readFileSync(treesPath, "utf8")) as Array<{
			name: string;
			talents: Array<{ fieldName: string }>;
		}>;

		it.each(
			PALADIN_TALENTS,
		)("$id decodes from the position the vendor tree puts $fieldName at", ({
			id,
			tree,
			fieldName,
		}) => {
			const index = trees[tree].talents.findIndex(
				(t) => t.fieldName === fieldName,
			);
			// A -1 here means the vendor renamed or removed the talent outright.
			expect(
				index,
				`${fieldName} is no longer in tree ${tree} of paladin.json`,
			).toBeGreaterThanOrEqual(0);

			// Put a distinctive rank at exactly the vendor's index and check the decoder finds
			// it there. If talentString.ts's own index has drifted, this reads 0 instead.
			const ranks = parseTalentsString(
				PALADIN,
				stringWithRankAt(tree, index, 3),
			);
			expect(ranks[id]).toBe(3);
		});

		it("covers every talent the app reads, so this guard cannot silently shrink", () => {
			// parseTalentsString returns a key per mapped talent, so its key count is the table's
			// size. If someone adds a talent to the table without adding it here, this fails.
			const decoded = parseTalentsString(PALADIN, "-0-0");
			expect(Object.keys(decoded).sort()).toEqual(
				PALADIN_TALENTS.map((t) => t.id).sort(),
			);
		});
	},
);

describe("parseTalentsString", () => {
	// The profile's own default build, decoded. Anchors the whole table against one realistic
	// string rather than nine synthetic ones.
	it("decodes the shipped default Protection build", () => {
		const ranks = parseTalentsString(
			PALADIN,
			"-0530513050000142521051-052050003003",
		);
		// Segment 1 is "0530513050000142521051": index 4 -> 5, 6 -> 3, 8 -> 5, 15 -> 2,
		// 18 -> 1, 20 -> 5, 21 -> 1.
		expect(ranks.toughness).toBe(5);
		expect(ranks["improved-righteous-fury"]).toBe(3);
		expect(ranks.anticipation).toBe(5);
		expect(ranks["sacred-duty"]).toBe(2);
		expect(ranks["holy-shield"]).toBe(1);
		expect(ranks["combat-expertise"]).toBe(5);
		expect(ranks["avengers-shield"]).toBe(1);
		// Segment 2 is "052050003003": index 4 -> 5. Index 13 is past its end, because the
		// exporter trimmed the trailing zeros - so sanctity-aura reads as unspent.
		expect(ranks.deflection).toBe(5);
		expect(ranks["sanctity-aura"]).toBe(0);
	});

	// The exporter trims trailing zeros, so a segment is routinely SHORTER than its tree's
	// talent count. Indexing past the end must read as "no points spent", not undefined or NaN -
	// deriveLinearModel multiplies this rank into a damage multiplier, and a NaN there would
	// poison every EHP score silently.
	it("reads a talent past the end of a trimmed segment as 0, not NaN", () => {
		const ranks = parseTalentsString(PALADIN, "-05-0");
		expect(ranks["avengers-shield"]).toBe(0);
		expect(Number.isNaN(ranks["avengers-shield"])).toBe(false);
	});

	it("reads a missing segment entirely as 0", () => {
		const ranks = parseTalentsString(PALADIN, "0530513050000142521051");
		expect(ranks.deflection).toBe(0);
		expect(ranks.toughness).toBe(0);
	});

	it("treats a non-numeric character as 0 rather than NaN", () => {
		const ranks = parseTalentsString(PALADIN, "-0000x-0");
		expect(ranks.toughness).toBe(0);
	});

	it("handles an empty string without throwing", () => {
		const ranks = parseTalentsString(PALADIN, "");
		expect(ranks.toughness).toBe(0);
	});

	// Anything but Paladin has no position map, and must yield {} rather than a map of zeroes -
	// callers distinguish "no talent data" from "all talents at rank 0".
	it("returns an empty object for a class it has no positions for", () => {
		expect(
			parseTalentsString("1", "-0530513050000142521051-052050003003"),
		).toEqual({});
	});
});
