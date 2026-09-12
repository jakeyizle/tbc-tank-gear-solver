import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SIM_CALIBRATION_PROFILE } from "#/types/SimCalibrationProfile";
import type { BaseConfig, SolverConfiguration } from "#/types/SolverConfig";
import { type solve, solveAll } from "./index";
import type { InputItem, LPItem } from "./types";

// solveAll's cross-config bookkeeping, driven by a FAKE solveFn.
//
// solveConfig.test.ts already covers the locking itself (scenarios 6, 6b and 11) through the real
// GLPK path. What it does not cover is what solveAll REPORTS about that locking:
// `inheritedItemIds`, and the `tracksInheritance` gate that decides whether to report at all.
//
// That reporting is worth its own tests because it exists to answer a question that previously
// cost days: a config scoring below its standalone optimum because an earlier config froze its
// gems looks exactly like a solver bug from the results panel. The whole point of the field is
// to say "this set inherited these items frozen" out loud, so it being subtly wrong would
// reintroduce the confusion it was added to remove.
//
// A fake solveFn is used rather than the real solver: this is orchestration, so making the
// "chosen" items an explicit input is both faster and far more precise than inferring intent
// from whatever GLPK happens to pick.

const HEAD = "100";
const NECK = "200";
const RING = "300";

const inputPool: InputItem[] = [HEAD, NECK, RING].map((id) => ({
	id,
	gems: [],
}));

/** The shape solveAll consumes from a solve: enough of an LPItem to be locked forward. */
const lpItem = (id: string, gemIds: string[] = [], enchantId = ""): LPItem =>
	({
		id,
		uniqueId: `${id}-0`,
		name: `item-${id}`,
		type: "Head",
		stats: [],
		sockets: [],
		socketBonus: [],
		gems: gemIds.map((gemId) => ({ id: gemId, stats: [] })),
		enchant: { id: enchantId, effectID: enchantId, name: "e", stats: [] },
	}) as unknown as LPItem;

const config = (id: string): SolverConfiguration =>
	({
		id,
		name: `Config ${id}`,
		uncritabilitySetting: 0,
		uncrushabilitySetting: 0,
		optimizeStats: [{ name: "Stamina", value: 1 }],
		objectiveMode: "stats",
		balance: 0.5,
		survivabilityMetric: "tmi",
		enabledCalibrationStats: [],
		resistanceFloors: [],
		enabledConsumableIds: [],
	}) as unknown as SolverConfiguration;

const baseConfig = (over: Partial<BaseConfig> = {}): BaseConfig =>
	({
		areEnchantsGemsLocked: false,
		excludeUniqueGems: false,
		excludeJewelcraftingItems: false,
		excludeEnchantingItems: false,
		independentConfigs: false,
		phase: 3,
		raceId: "1",
		classId: "2",
		simCalibrationProfile: DEFAULT_SIM_CALIBRATION_PROFILE,
		...over,
	}) as unknown as BaseConfig;

/** A solveFn that returns a scripted pick per call, and records the pool it was handed. */
const scriptedSolve = (picks: LPItem[][]) => {
	const poolsSeen: InputItem[][] = [];
	let call = 0;
	const fn = (async (items: InputItem[]) => {
		poolsSeen.push(items);
		return picks[call++] ?? [];
	}) as unknown as typeof solve;
	return { fn, poolsSeen };
};

describe("solveAll: inheritedItemIds", () => {
	it("reports nothing for the first config, which inherits from nobody", async () => {
		const { fn } = scriptedSolve([[lpItem(HEAD)], [lpItem(HEAD)]]);
		const results = await solveAll(
			inputPool,
			baseConfig(),
			[config("a"), config("b")],
			undefined,
			fn,
		);
		expect(results[0].inheritedItemIds).toEqual([]);
	});

	it("reports an item a later config reuses after an earlier one froze it", async () => {
		const { fn } = scriptedSolve([[lpItem(HEAD)], [lpItem(HEAD)]]);
		const results = await solveAll(
			inputPool,
			baseConfig(),
			[config("a"), config("b")],
			undefined,
			fn,
		);
		expect(results[1].inheritedItemIds).toEqual([HEAD]);
	});

	// The distinction the field exists to make. An item an earlier config froze but THIS config
	// did not take constrains this set not at all, so listing it would be actively misleading -
	// the panel would claim a set was compromised by something it never used.
	it("omits an item an earlier config froze but this config did not pick", async () => {
		const { fn } = scriptedSolve([[lpItem(HEAD)], [lpItem(NECK)]]);
		const results = await solveAll(
			inputPool,
			baseConfig(),
			[config("a"), config("b")],
			undefined,
			fn,
		);
		expect(results[1].inheritedItemIds).toEqual([]);
	});

	it("accumulates across more than two configs", async () => {
		const { fn } = scriptedSolve([
			[lpItem(HEAD)],
			[lpItem(NECK)],
			[lpItem(HEAD), lpItem(NECK), lpItem(RING)],
		]);
		const results = await solveAll(
			inputPool,
			baseConfig(),
			[config("a"), config("b"), config("c")],
			undefined,
			fn,
		);
		// Config 3 inherits from BOTH predecessors, but RING is its own first-time pick.
		expect(results[2].inheritedItemIds?.sort()).toEqual([HEAD, NECK]);
	});
});

describe("solveAll: the tracksInheritance gate", () => {
	// With independentConfigs every config solves from the original pool, so nothing is ever
	// inherited and reporting inheritance would be a lie.
	it("reports nothing when configs are independent", async () => {
		const { fn } = scriptedSolve([[lpItem(HEAD)], [lpItem(HEAD)]]);
		const results = await solveAll(
			inputPool,
			baseConfig({ independentConfigs: true }),
			[config("a"), config("b")],
			undefined,
			fn,
		);
		expect(results[1].inheritedItemIds).toEqual([]);
	});

	// When the user has ticked "lock enchants & gems" they fixed every item's gems themselves, so
	// an earlier config re-fixing them to the same thing constrains nothing new. Flagging it would
	// put a notice on essentially every row, which is noise rather than information.
	it("reports nothing when the user locked enchants and gems themselves", async () => {
		const { fn } = scriptedSolve([[lpItem(HEAD)], [lpItem(HEAD)]]);
		const results = await solveAll(
			inputPool,
			baseConfig({ areEnchantsGemsLocked: true }),
			[config("a"), config("b")],
			undefined,
			fn,
		);
		expect(results[1].inheritedItemIds).toEqual([]);
	});
});

describe("solveAll: what each config is handed", () => {
	// The behaviour that produced a multi-day false bug report: config 2 receives config 1's
	// picks already locked, WITH the gems config 1 chose. That is the intended business rule (an
	// item is one physical object, gemmed one way) and is exactly why a later config can score
	// below its standalone optimum.
	it("hands a later config the earlier config's picks, locked, with gems", async () => {
		const { fn, poolsSeen } = scriptedSolve([
			[lpItem(HEAD, ["gem-a"], "ench-a")],
			[],
		]);
		await solveAll(
			inputPool,
			baseConfig(),
			[config("a"), config("b")],
			undefined,
			fn,
		);

		const secondPool = poolsSeen[1];
		const head = secondPool.find((i) => i.id === HEAD);
		expect(head?.locked).toBe(true);
		expect(head?.gems).toEqual(["gem-a"]);
		expect(head?.enchant).toBe("ench-a");

		// Untouched slots stay unlocked and ungemmed, so a later config is still free there.
		expect(secondPool.find((i) => i.id === NECK)?.locked).toBeFalsy();
	});

	it("hands every config the original pool when configs are independent", async () => {
		const { fn, poolsSeen } = scriptedSolve([
			[lpItem(HEAD, ["gem-a"], "ench-a")],
			[],
		]);
		await solveAll(
			inputPool,
			baseConfig({ independentConfigs: true }),
			[config("a"), config("b")],
			undefined,
			fn,
		);
		expect(poolsSeen[1].find((i) => i.id === HEAD)?.locked).toBe(false);
		expect(poolsSeen[1].find((i) => i.id === HEAD)?.gems).toEqual([]);
	});

	// Pinning current behaviour rather than endorsing it: replaceInputItems matches by `find`, so
	// with two pool rows carrying the same base item id, BOTH are replaced by the same locked
	// record (the map below rewrites every row whose id matches). Worth having written down - a
	// pool can legitimately list one item twice, and this is what happens when it does.
	it("locks every pool row sharing a picked item's id", async () => {
		const duplicated: InputItem[] = [
			{ id: HEAD, gems: [] },
			{ id: HEAD, gems: [] },
			{ id: NECK, gems: [] },
		];
		const { fn, poolsSeen } = scriptedSolve([
			[lpItem(HEAD, ["gem-a"], "ench-a")],
			[],
		]);
		await solveAll(
			duplicated,
			baseConfig(),
			[config("a"), config("b")],
			undefined,
			fn,
		);
		const headRows = poolsSeen[1].filter((i) => i.id === HEAD);
		expect(headRows).toHaveLength(2);
		expect(headRows.every((r) => r.locked === true)).toBe(true);
	});
});

describe("solveAll: failure and progress", () => {
	// A failing config names itself in the error. Without this the user sees a bare solver
	// message with no indication which of several sets could not be built.
	it("names the offending config when one fails, and fails the whole batch", async () => {
		const fn = vi
			.fn()
			.mockResolvedValueOnce([lpItem(HEAD)])
			.mockRejectedValueOnce(
				new Error("No stats are weighted"),
			) as unknown as typeof solve;

		await expect(
			solveAll(
				inputPool,
				baseConfig(),
				[config("a"), config("second")],
				undefined,
				fn,
			),
		).rejects.toThrow(/Config second.*No stats are weighted/);
	});

	it("reports progress once per config before solving it", async () => {
		const { fn } = scriptedSolve([[lpItem(HEAD)], [lpItem(NECK)]]);
		const onProgress = vi.fn();
		await solveAll(
			inputPool,
			baseConfig(),
			[config("a"), config("b")],
			onProgress,
			fn,
		);
		const starts = onProgress.mock.calls
			.map(([p]) => p)
			.filter((p) => p.innerFraction === 0);
		expect(starts.map((p) => p.configIndex)).toEqual([0, 1]);
		expect(starts.every((p) => p.totalConfigs === 2)).toBe(true);
	});
});
