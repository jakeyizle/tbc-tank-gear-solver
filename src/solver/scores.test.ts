import { describe, expect, it } from "vitest";
import type { LinearStatModel } from "#/types/LinearStatModel";
import {
	axisTotals,
	calculateScores,
	collectItemStats,
	scoreItemSet,
} from "./scores";
import type { LPItem, Stat } from "./types";

// Direct tests for the LP's scoring dot product.
//
// These did not exist until a verification pass went looking, and their absence was a real hole
// rather than an oversight: scores.ts showed 100% statement coverage the whole time, because
// every solver test runs through it. What no test did was ASSERT anything about it.
//
// The reason that matters is `__test-helpers__/validateSolution.ts`. It is what the solver
// suite checks its solutions against, and it computes "what this gear set actually achieves" by
// calling scoreItemSet - the very function under test. It is not circular in the way that first
// appears (the LP feeds GLPK per-item UNROUNDED coefficients and lets GLPK sum them, while the
// validator re-scores the assembled set with roundDefense: true, so the two aggregate
// differently and the helper does catch model and constraint bugs). But a bug INSIDE axisTotals
// - a wrong coefficient lookup, a sign flip, a dropped multiplier guard - moves both sides of
// every one of those assertions identically, and no solver test can see it.
//
// So this file is deliberately the one place that does NOT use the real model: every expected
// value below is hand-computed against a tiny literal model. Importing TEST_LINEAR_MODEL here
// would reintroduce exactly the coupling these tests exist to break.

// One point of Strength gives 2 AttackPower and 0.05 BlockValue; one point of Agility gives
// 0.5 Avoidance. Deliberately includes a cross-term (Strength -> two axes), because the real
// measured model has them and a diagonal-matrix bug would otherwise pass.
const MODEL: LinearStatModel = {
	base: { Avoidance: 10, Uncritability: 1 },
	coefficients: {
		Strength: { AttackPower: 2, BlockValue: 0.05 },
		Agility: { Avoidance: 0.5 },
		ShadowResistance: { ShadowResistance: 1 },
	},
	defense: {
		// Deliberately 10 rating per point, not the game's 2.365385, so the floor boundaries in
		// these tests are obvious by inspection rather than requiring a calculator.
		ratingPerPoint: 10,
		perPoint: { Avoidance: 0.12, Uncritability: 0.04 },
		baseRating: 25,
	},
	physicalDamageTakenMultiplier: 1,
} as unknown as LinearStatModel;

const flat = (name: string, value: number): Stat =>
	({ name, value, type: "flat" }) as Stat;

describe("axisTotals", () => {
	it("is a dot product of stats against the model's coefficients", () => {
		const totals = axisTotals(
			[flat("Strength", 10), flat("Agility", 4)],
			MODEL,
			["AttackPower", "BlockValue", "Avoidance"],
		);

		expect(totals.AttackPower).toBeCloseTo(20, 10); // 10 Str * 2
		expect(totals.BlockValue).toBeCloseTo(0.5, 10); // 10 Str * 0.05
		expect(totals.Avoidance).toBeCloseTo(2, 10); // 4 Agi * 0.5
	});

	it("returns 0, not undefined, for a requested axis nothing contributes to", () => {
		const totals = axisTotals([flat("Strength", 10)], MODEL, ["Avoidance"]);
		expect(totals.Avoidance).toBe(0);
	});

	// Multiplier-typed stats only ever came from buffs and talents, and those are already baked
	// into the measured coefficients - counting them again here would double-apply them.
	it("ignores multiplier-typed stats while counting an otherwise identical flat one", () => {
		const asMultiplier = axisTotals(
			[{ name: "Strength", value: 10, type: "multiplier" } as Stat],
			MODEL,
			["AttackPower"],
		);
		expect(asMultiplier.AttackPower).toBe(0);

		const asFlat = axisTotals([flat("Strength", 10)], MODEL, ["AttackPower"]);
		expect(asFlat.AttackPower).toBeCloseTo(20, 10);
	});

	// An item carrying a stat the model never measured must contribute nothing, rather than
	// poisoning the whole axis with NaN - which would make the LP's objective row meaningless
	// and is the kind of failure that surfaces as an inexplicable solve, not an error.
	it("skips a stat absent from the model instead of producing NaN", () => {
		const totals = axisTotals(
			[flat("ArcaneResistance", 25), flat("Strength", 10)],
			MODEL,
			["AttackPower"],
		);
		expect(totals.AttackPower).toBeCloseTo(20, 10);
		expect(Number.isNaN(totals.AttackPower)).toBe(false);
	});
});

describe("axisTotals: defense, the model's one quantized stat", () => {
	// The per-item default. 47 rating / 10 per point = 4.7 points, fraction kept.
	it("uses the unrounded linear rate by default", () => {
		const totals = axisTotals([flat("Defense", 47)], MODEL, ["Avoidance"]);
		expect(totals.Avoidance).toBeCloseTo(4.7 * 0.12, 10);
	});

	// The set-level treatment: floor(base + gear) minus the base's own points, so the score is
	// exactly the number of whole points the game grants for this gear.
	// base 25 + gear 47 = 72 -> 7 points; base alone 25 -> 2 points; so the gear is worth 5.
	it("floors base+gear and subtracts the base's own points when roundDefense is set", () => {
		const totals = axisTotals([flat("Defense", 47)], MODEL, ["Avoidance"], {
			roundDefense: true,
		});
		expect(totals.Avoidance).toBeCloseTo(5 * 0.12, 10);
	});

	// The Defense AXIS is raw rating: a stat weight on defense weighs rating, not the skill it
	// converts into. Easy to "fix" into flooring, which would be wrong.
	it("passes raw defense rating through to the Defense axis, unfloored, even when rounding", () => {
		const totals = axisTotals([flat("Defense", 47)], MODEL, ["Defense"], {
			roundDefense: true,
		});
		expect(totals.Defense).toBe(47);
	});

	// THE invariant the whole LP formulation rests on, stated as a test.
	//
	// scores.ts's header says rounding per item would "break the additivity the whole LP rests
	// on". This asserts both halves of that claim: unrounded scores are additive, so GLPK may
	// sum per-item scores freely; rounded ones are NOT, which is why the rounding is relocated
	// to runLPModelWithAvoidanceConvergence instead. If someone ever makes rounding the default,
	// this test is what should stop them.
	it("is additive when unrounded and NOT additive when rounded", () => {
		// base 25 rating = floor(25/10) = 2 whole points already.
		// +2 rating -> 27 -> still 2 points, so the gear is worth 0.
		// +3 rating -> 28 -> still 2 points, so the gear is worth 0.
		// +5 rating together -> 30 -> 3 points, so the gear is worth 1.
		// Each item alone rounds down to nothing; together they buy a point.
		const a = [flat("Defense", 2)];
		const b = [flat("Defense", 3)];
		const axes = ["Avoidance"] as const;

		const unroundedApart =
			(axisTotals(a, MODEL, axes).Avoidance ?? 0) +
			(axisTotals(b, MODEL, axes).Avoidance ?? 0);
		const unroundedTogether = axisTotals([...a, ...b], MODEL, axes).Avoidance;
		expect(unroundedApart).toBeCloseTo(unroundedTogether ?? 0, 10);

		const opts = { roundDefense: true };
		const roundedApart =
			(axisTotals(a, MODEL, axes, opts).Avoidance ?? 0) +
			(axisTotals(b, MODEL, axes, opts).Avoidance ?? 0);
		const roundedTogether = axisTotals(
			[...a, ...b],
			MODEL,
			axes,
			opts,
		).Avoidance;

		// Scored apart, both items round to nothing; scored together they pay a whole point.
		expect(roundedApart).toBeCloseTo(0, 10);
		expect(roundedTogether).toBeCloseTo(0.12, 10);
		expect(roundedApart).not.toBeCloseTo(roundedTogether ?? 0, 10);
	});

	it("applies defense to every requested axis its perPoint vector touches", () => {
		const totals = axisTotals([flat("Defense", 100)], MODEL, [
			"Avoidance",
			"Uncritability",
		]);
		expect(totals.Avoidance).toBeCloseTo(10 * 0.12, 10);
		expect(totals.Uncritability).toBeCloseTo(10 * 0.04, 10);
	});

	// Found by mutation testing: forcing `if (totals.Defense !== undefined)` to true survived,
	// because nothing checked that an axis nobody asked for stays OUT of the result. An extra key
	// here would be read as a real axis value by anything iterating the vector.
	it("does not invent a Defense axis when one was not requested", () => {
		const totals = axisTotals([flat("Defense", 47)], MODEL, ["Avoidance"]);
		expect(totals.Defense).toBeUndefined();
		expect(Object.keys(totals)).toEqual(["Avoidance"]);
	});

	it("contributes nothing when there is no defense on the set at all", () => {
		const totals = axisTotals([flat("Agility", 4)], MODEL, ["Uncritability"]);
		expect(totals.Uncritability).toBe(0);
	});
});

describe("calculateScores", () => {
	it("weights each objective stat by its value and sums them", () => {
		const scores = calculateScores(
			[flat("Strength", 10), flat("Agility", 4)],
			[
				{ name: "AttackPower", value: 2 } as unknown as Stat,
				{ name: "BlockValue", value: 10 } as unknown as Stat,
			],
			MODEL,
		);
		// AttackPower 20 * 2 + BlockValue 0.5 * 10 = 45
		expect(scores.objectiveScore).toBeCloseTo(45, 10);
	});

	// Exercises the DEFAULT parameters rather than passing them. Mutation testing showed the
	// defaults (`avoidanceStatName = "Avoidance"`, `resistanceStats = []`) could both be replaced
	// with garbage and every test still passed, because they were always supplied explicitly.
	it("defaults to the Avoidance axis and no resistances", () => {
		const scores = calculateScores([flat("Agility", 4)], [], MODEL);
		expect(scores.avoidanceScore).toBeCloseTo(2, 10);
		expect(scores.resistanceScores).toEqual({});
	});

	it("reports avoidance from the requested avoidance axis", () => {
		const scores = calculateScores(
			[flat("Agility", 4)],
			[],
			MODEL,
			"Avoidance",
		);
		expect(scores.avoidanceScore).toBeCloseTo(2, 10);

		// ShearAvoidance is a different axis the model says nothing about, so it must read 0
		// rather than silently falling back to Avoidance.
		const shear = calculateScores(
			[flat("Agility", 4)],
			[],
			MODEL,
			"ShearAvoidance",
		);
		expect(shear.avoidanceScore).toBe(0);
	});

	it("surfaces each requested resistance on its own axis", () => {
		const scores = calculateScores(
			[flat("ShadowResistance", 30)],
			[],
			MODEL,
			"Avoidance",
			["ShadowResistance"],
		);
		expect(scores.resistanceScores.ShadowResistance).toBeCloseTo(30, 10);
	});

	// The avoidance axis can also be an objective stat. The axis list is de-duplicated, so this
	// must not double-count.
	it("does not double-count an axis that is both the avoidance axis and an objective", () => {
		const scores = calculateScores(
			[flat("Agility", 4)],
			[{ name: "Avoidance", value: 1 } as unknown as Stat],
			MODEL,
			"Avoidance",
		);
		expect(scores.avoidanceScore).toBeCloseTo(2, 10);
		expect(scores.objectiveScore).toBeCloseTo(2, 10);
	});
});

const lpItem = (over: Partial<LPItem>): LPItem =>
	({
		id: "1",
		uniqueId: "1-0",
		name: "test",
		type: "Head",
		stats: [],
		gems: [],
		gemSlots: [],
		sockets: [],
		socketBonus: [],
		enchant: { id: "", effectID: "", name: "", stats: [] },
		...over,
	}) as unknown as LPItem;

describe("collectItemStats", () => {
	it("gathers stats from the item, its enchant and its gems", () => {
		const stats = collectItemStats([
			lpItem({
				stats: [flat("Strength", 10)],
				enchant: {
					id: "e",
					effectID: "e",
					name: "e",
					stats: [flat("Strength", 4)],
				} as LPItem["enchant"],
				gems: [
					{ id: "g", stats: [flat("Agility", 6)] },
				] as unknown as LPItem["gems"],
			}),
		]);
		const total = (name: string) =>
			stats.filter((s) => s.name === name).reduce((n, s) => n + s.value, 0);
		expect(total("Strength")).toBe(14);
		expect(total("Agility")).toBe(6);
	});

	// A socket bonus is only real if the gems actually satisfy its colour requirement - counting
	// it unconditionally would value every socketed item above what it is worth.
	it("includes a socket bonus only when the chosen gems satisfy it", () => {
		const unmet = collectItemStats([
			lpItem({
				sockets: [{ color: "Red" }] as unknown as LPItem["sockets"],
				gems: [
					{ id: "g", color: "Blue", stats: [] },
				] as unknown as LPItem["gems"],
				socketBonus: [flat("Stamina", 4)],
			}),
		]);
		// Asserted as exact emptiness, not just "no Stamina": the unmet branch returns [], and a
		// mutant replacing it with a junk array passes any weaker check.
		expect(unmet).toEqual([]);

		const met = collectItemStats([
			lpItem({
				sockets: [{ color: "Red" }] as unknown as LPItem["sockets"],
				gems: [
					{ id: "g", color: "Red", stats: [] },
				] as unknown as LPItem["gems"],
				socketBonus: [flat("Stamina", 4)],
			}),
		]);
		expect(met.some((s) => s.name === "Stamina")).toBe(true);
	});
});

describe("scoreItemSet", () => {
	// The default differs from axisTotals' on purpose: a whole set is exactly where the in-game
	// floor belongs. If this default ever flips, per-set validation silently starts disagreeing
	// with what the game grants.
	it("defaults to the ROUNDED defense treatment, unlike axisTotals", () => {
		const items = [lpItem({ stats: [flat("Defense", 47)] })];

		// base 25 + 47 = 72 -> 7 points, minus the base's 2 = 5 points.
		expect(scoreItemSet(items, MODEL, ["Avoidance"]).Avoidance).toBeCloseTo(
			5 * 0.12,
			10,
		);
		// Explicitly asking for unrounded gives the linear rate instead.
		expect(
			scoreItemSet(items, MODEL, ["Avoidance"], { roundDefense: false })
				.Avoidance,
		).toBeCloseTo(4.7 * 0.12, 10);
	});

	it("excludes the character's base, reporting only what the items supply", () => {
		const totals = scoreItemSet(
			[lpItem({ stats: [flat("Agility", 4)] })],
			MODEL,
			["Avoidance"],
		);
		// base.Avoidance is 10, and must NOT appear here.
		expect(totals.Avoidance).toBeCloseTo(2, 10);
	});
});
