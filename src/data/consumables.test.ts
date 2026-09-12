import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { StatName } from "#/solver/types";
import { CONSUMABLES } from "./consumables";
import { STAT_INDEX_TO_NAME } from "./tbcDatabase";

// Drift guard for the last hand-written game data in the repo.
//
// Everything else the solver scores - items, gems, enchants - is read from db.json at runtime, so
// it cannot drift. These six consumables cannot be: db.consumables carries no icon, they are not
// in db.items, and db.itemIcons is empty, so the icon at least has to be held by hand (see
// consumables.ts). Since the file has to exist anyway, its stats stay here too - and this test is
// what stops them drifting from the simulator's own numbers.
//
// This is the same shape as mechanicsEnums.test.ts (constants vs generated protos) and
// talentString.test.ts (talent indices vs the vendored tree): pin the hand copy against the
// authority, so a vendor bump fails HERE rather than silently skewing a solve.
//
// Writing it found a real bug: Elixir of Major Agility was missing its +20 crit rating, so the LP
// undervalued it against the other battle elixirs. The sim was unaffected (it resolves
// consumables by id through the raid profile), but the solver's CHOICE between elixirs was made
// on wrong numbers.

const dbPath = path.resolve(
	__dirname,
	"../../vendor/tbc-sim/assets/database/db.json",
);
const hasDb = fs.existsSync(dbPath);

interface RawConsumable {
	id: number;
	name?: string;
	type?: number;
	stats?: number[];
}

/** db.consumables' dense stat array, as the {name, value} pairs consumables.ts uses. */
const statsFromDense = (dense: number[] | undefined) => {
	const out: { name: StatName; value: number }[] = [];
	for (const [index, value] of (dense ?? []).entries()) {
		if (!value) continue;
		const name = STAT_INDEX_TO_NAME[index];
		if (name) out.push({ name, value });
	}
	return out;
};

// Deliberate, documented departures from db.consumables. Anything NOT listed here must match
// exactly; the point of naming them is that a difference has to be argued for once, in writing,
// rather than accumulating silently.
const ACCEPTED_DIFFERENCES: Record<number, string> = {
	// db gives this as 80 Arcane + 80 Holy + 80 Nature spell power (it is a school-specific
	// flask); consumables.ts models it as 80 generic SpellPower.
	//
	// Left alone deliberately rather than "fixed": this flask is the default profile's own
	// flaskId, so deriveLinearModel's measured base ALREADY contains its 80/80/80 - the
	// TEST_LINEAR_MODEL fixture shows exactly that in base.ArcaneSpellPower/HolySpellPower/
	// NatureSpellPower. Changing the candidate's stats therefore interacts with a pre-existing
	// question about whether a consumable in the base should also be an LP candidate, which is a
	// real modelling decision and not a data fix. Flagged here so it is not mistaken for drift.
	22861: "modelled as generic SpellPower; db splits it across three schools",
};

describe.skipIf(!hasDb)("CONSUMABLES matches the vendored database", () => {
	const db = JSON.parse(fs.readFileSync(dbPath, "utf8")) as {
		consumables: RawConsumable[];
	};
	const byId = new Map(db.consumables.map((c) => [c.id, c]));

	it.each(
		CONSUMABLES.map((c) => ({ id: c.id, name: c.name })),
	)("$name ($id) exists in db.consumables", ({ id }) => {
		expect(byId.get(id)).toBeDefined();
	});

	it.each(
		CONSUMABLES.filter((c) => !ACCEPTED_DIFFERENCES[c.id]).map((c) => ({
			id: c.id,
			name: c.name,
		})),
	)("$name ($id) carries the database's stats", ({ id }) => {
		const raw = byId.get(id);
		const expected = statsFromDense(raw?.stats);
		const actual = (CONSUMABLES.find((c) => c.id === id)?.stats ?? []).map(
			(s) => ({ name: s.name, value: s.value }),
		);
		const sort = (rows: { name: string; value: number }[]) =>
			[...rows].sort((a, b) => a.name.localeCompare(b.name));
		expect(sort(actual)).toEqual(sort(expected));
	});

	it("names match the database's", () => {
		for (const consumable of CONSUMABLES) {
			const raw = byId.get(consumable.id);
			if (raw?.name) expect(consumable.name).toBe(raw.name);
		}
	});

	// The accepted-differences list must not rot into a blanket exemption: every id in it has to
	// still be a real consumable, or it is silently excusing nothing.
	it("only excuses consumables that are actually in the list", () => {
		for (const id of Object.keys(ACCEPTED_DIFFERENCES).map(Number)) {
			expect(
				CONSUMABLES.some((c) => c.id === id),
				`${id} is excused but no longer in CONSUMABLES`,
			).toBe(true);
		}
	});
});

describe("CONSUMABLES shape", () => {
	// Icons are the reason this file cannot be replaced by db.consumables outright, so a missing
	// one is the failure that would send someone back down that path.
	it("gives every consumable an icon", () => {
		for (const consumable of CONSUMABLES) {
			expect(consumable.icon, `${consumable.name} has no icon`).toMatch(
				/^[a-z0-9_]+$/,
			);
		}
	});

	it("uses real numeric game item ids", () => {
		for (const consumable of CONSUMABLES) {
			expect(Number.isInteger(consumable.id)).toBe(true);
			expect(consumable.id).toBeGreaterThan(0);
		}
	});

	it("has no duplicate ids", () => {
		const ids = CONSUMABLES.map((c) => c.id);
		expect(ids).toHaveLength(new Set(ids).size);
	});
});
