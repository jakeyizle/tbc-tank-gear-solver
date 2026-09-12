import { describe, expect, it } from "vitest";
import type {
	CharacterStatsSnapshot,
	UnitStatsView,
} from "#/types/CharacterStats";
import type { SolveResult } from "#/types/SolverConfig";
import {
	HOLY_SHIELD_BLOCK_PERCENT,
	LIBRAM_OF_REPENTANCE_ID,
	PSEUDO,
	STAT,
} from "./characterStatsDisplay";
import {
	damageTakenMultiplier,
	getHeadlineStats,
	viewForResult,
} from "./resultStats";

// The four numbers the compare view puts side by side.
//
// This file had ZERO coverage - not "covered but unasserted" like scores.ts, but genuinely never
// executed by any test. It is small, but it is the last hop between the simulator's output and
// what the user reads, and three of its behaviours are decisions rather than arithmetic:
// undefined-vs-zero for pre-sim results, debuffs belonging to the buffed view only, and the
// damage-multiplier fallback for results persisted before the field existed.

const view = (
	stats: Record<number, number> = {},
	pseudoStats: Record<number, number> = {},
): UnitStatsView => {
	const s: number[] = new Array(42).fill(0);
	const p: number[] = new Array(42).fill(0);
	for (const [i, v] of Object.entries(stats)) s[Number(i)] = v;
	for (const [i, v] of Object.entries(pseudoStats)) p[Number(i)] = v;
	return { stats: s, pseudoStats: p };
};

const breakdown = (v: UnitStatsView) => ({
	base: v,
	gear: v,
	talents: v,
	buffs: v,
	consumes: v,
	final: v,
});

const snapshot = (
	buffedView: UnitStatsView,
	unbuffedView: UnitStatsView,
): CharacterStatsSnapshot => ({
	buffed: breakdown(buffedView),
	unbuffed: breakdown(unbuffedView),
});

const result = (over: Partial<SolveResult> = {}): SolveResult =>
	({
		id: "r1",
		name: "Set",
		items: [],
		baseConfig: { classId: "2" },
		...over,
	}) as unknown as SolveResult;

describe("viewForResult", () => {
	it("picks the buffed or unbuffed final snapshot per the toggle", () => {
		const buffed = view({ [STAT.Health]: 20000 });
		const unbuffed = view({ [STAT.Health]: 15000 });
		const stats = snapshot(buffed, unbuffed);

		expect(viewForResult(stats, true)?.stats[STAT.Health]).toBe(20000);
		expect(viewForResult(stats, false)?.stats[STAT.Health]).toBe(15000);
	});

	// Deliberately undefined, not a zeroed view: callers use this to render a "re-solve to see
	// these" prompt. Returning zeroes would display a confidently wrong 0 Effective HP for every
	// result saved before the sim measured stats.
	it("returns undefined when the result predates measured stats", () => {
		expect(viewForResult(undefined, true)).toBeUndefined();
		expect(viewForResult(undefined, false)).toBeUndefined();
	});
});

describe("damageTakenMultiplier", () => {
	it("reads the multiplier the solver actually used", () => {
		expect(
			damageTakenMultiplier(result({ physicalDamageTakenMultiplier: 0.94 })),
		).toBe(0.94);
	});

	// 1 means "no reduction", which UNDER-reports Effective HP. That direction is deliberate:
	// inventing a reduction the solve may not have had would overstate survivability.
	it("falls back to 1 for a result saved before the field existed", () => {
		expect(damageTakenMultiplier(result())).toBe(1);
	});
});

describe("getHeadlineStats", () => {
	// Not four zeroes. An empty list is what lets the panel distinguish "nothing measured" from
	// "measured, and the answer is zero".
	it("returns an empty list when the result has no measured stats", () => {
		expect(getHeadlineStats(result(), true)).toEqual([]);
	});

	it("returns Avoidance, Shear Avoidance, Effective HP and Spell Power, in that order", () => {
		const v = view(
			{ [STAT.Health]: 10000, [STAT.Armor]: 0, [STAT.SpellDamage]: 123 },
			{},
		);
		const stats = getHeadlineStats(
			result({ characterStats: snapshot(v, v) }),
			true,
		);
		expect(stats.map((s) => s.name)).toEqual([
			"Avoidance",
			"Shear Avoidance",
			"Effective HP",
			"Spell Power",
		]);
		expect(stats[3].value).toBe(123);
	});

	// Holy Shield is an active aura, so it appears in no stat vector and has to be added by
	// hand - but only for a Protection Paladin. A non-paladin result must not get +30% block.
	it("adds Holy Shield's block only for a Paladin result", () => {
		const v = view({}, { [PSEUDO.DodgePercent]: 10 });

		const paladin = getHeadlineStats(
			result({
				characterStats: snapshot(v, v),
				baseConfig: { classId: "2" } as SolveResult["baseConfig"],
			}),
			true,
		);
		const warrior = getHeadlineStats(
			result({
				characterStats: snapshot(v, v),
				baseConfig: { classId: "1" } as SolveResult["baseConfig"],
			}),
			true,
		);

		const avoidance = (rows: { name: string; value: number }[]) =>
			rows.find((r) => r.name === "Avoidance")?.value ?? 0;
		expect(avoidance(paladin) - avoidance(warrior)).toBeCloseTo(
			HOLY_SHIELD_BLOCK_PERCENT,
			6,
		);
	});

	// The libram's +42 block rating only applies while Holy Shield is up, so it is conditional
	// on the item actually being in the set rather than on the class.
	it("adds the Libram of Repentance's block only when that item is equipped", () => {
		const v = view({}, { [PSEUDO.DodgePercent]: 10 });
		const withLibram = getHeadlineStats(
			result({
				characterStats: snapshot(v, v),
				items: [{ id: LIBRAM_OF_REPENTANCE_ID }] as SolveResult["items"],
			}),
			true,
		);
		const without = getHeadlineStats(
			result({
				characterStats: snapshot(v, v),
				items: [{ id: "12345" }] as SolveResult["items"],
			}),
			true,
		);
		const avoidance = (rows: { name: string; value: number }[]) =>
			rows.find((r) => r.name === "Avoidance")?.value ?? 0;
		expect(avoidance(withLibram)).toBeGreaterThan(avoidance(without));
	});

	// Debuffs are raid-supplied, so they are part of "include buffs & consumables" and must not
	// leak into the unbuffed view - which is meant to show gear and talents alone.
	it("applies debuffs to the buffed view only", () => {
		const v = view({}, {});
		const withDebuffs = result({
			characterStats: snapshot(v, v),
			baseConfig: {
				classId: "2",
				simCalibrationProfile: {
					// insectSwarm is one of only two debuffs that move miss chance (the other is
					// scorpidSting) - see debuffMissChance. It is worth exactly 2%.
					raidProfile: { debuffs: { insectSwarm: true } },
				},
			} as unknown as SolveResult["baseConfig"],
		});

		const avoidance = (rows: { name: string; value: number }[]) =>
			rows.find((r) => r.name === "Avoidance")?.value ?? 0;

		const buffed = avoidance(getHeadlineStats(withDebuffs, true));
		const unbuffed = avoidance(getHeadlineStats(withDebuffs, false));
		// Both views share the same stat vector here, so the whole difference can only come from
		// the debuff being applied to one and not the other.
		expect(buffed - unbuffed).toBeCloseTo(2, 6);
	});

	// Effective HP is health divided by the damage actually taken, so a multiplier below 1 must
	// RAISE it. Getting this backwards would be easy and would look plausible.
	it("raises Effective HP as the damage-taken multiplier drops", () => {
		const v = view({ [STAT.Health]: 10000 });
		const ehp = (multiplier?: number) =>
			getHeadlineStats(
				result({
					characterStats: snapshot(v, v),
					physicalDamageTakenMultiplier: multiplier,
				}),
				true,
			).find((r) => r.name === "Effective HP")?.value ?? 0;

		expect(ehp(0.94)).toBeGreaterThan(ehp(1));
		// With no armor and no reduction, EHP is just health.
		expect(ehp(1)).toBeCloseTo(10000, 6);
	});
});
