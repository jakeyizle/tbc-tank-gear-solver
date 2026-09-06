import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	TEST_CLASS_ID,
	TEST_RACE_ID,
} from "#/solver/__fixtures__/testItemPool";
import { solveConfig } from "#/solver/solveConfig";
import type { InputItem, LPItem } from "#/solver/types";
import { DEFAULT_SIM_CALIBRATION_PROFILE } from "#/types/SimCalibrationProfile";
import type { TbcUiDatabase } from "./buildStatWeightsRequest";
import {
	calibrateWeights,
	measureFinalSimMetrics,
	runCalibrationBatches,
} from "./calibrateWeights";
import {
	absoluteValueForMetric,
	deriveSecondaryConstraintBound,
	exceedsHysteresisThreshold,
	filterItemsForClass,
	isSignificantImprovement,
	solveConfigForSimMetric,
} from "./solveSimMetric";

vi.mock("#/solver/solveConfig", async (importOriginal) => {
	const actual = await importOriginal<typeof import("#/solver/solveConfig")>();
	return { ...actual, solveConfig: vi.fn() };
});
vi.mock("./calibrateWeights", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./calibrateWeights")>();
	return {
		...actual,
		calibrateWeights: vi.fn(),
		measureFinalSimMetrics: vi.fn(),
		runCalibrationBatches: vi.fn(),
	};
});

// classAllowlist values are tbc-new's proto.Class ordinals (common.proto): Warrior=1, Paladin=2.
const fakeDb: TbcUiDatabase = {
	items: [
		{ id: 1, name: "Onslaught Shoulderguards", classAllowlist: [1] },
		{ id: 2, name: "Lightbringer Chestguard", classAllowlist: [2] },
		{ id: 3, name: "Generic Plate Belt" }, // no allowlist - usable by anyone
		{ id: 4, name: "Empty Allowlist Item", classAllowlist: [] },
	],
	enchants: [],
	gems: [],
};

const item = (id: string): InputItem => ({ id, gems: [] });

describe("filterItemsForClass", () => {
	it("drops items restricted to a different class", () => {
		const items = [item("1"), item("2"), item("3"), item("4")];
		const result = filterItemsForClass(items, fakeDb, "2");
		expect(result.map((i) => i.id)).toEqual(["2", "3", "4"]);
	});

	it("keeps items with no allowlist or an empty allowlist for any class", () => {
		const items = [item("3"), item("4")];
		expect(filterItemsForClass(items, fakeDb, "1")).toEqual(items);
	});

	it("keeps items missing from the database entirely (nothing to validate against)", () => {
		const items = [item("999")];
		expect(filterItemsForClass(items, fakeDb, "2")).toEqual(items);
	});

	it("returns an empty pool unchanged", () => {
		expect(filterItemsForClass([], fakeDb, "2")).toEqual([]);
	});
});

describe("exceedsHysteresisThreshold", () => {
	it("accepts a delta that comfortably clears the noise band", () => {
		expect(exceedsHysteresisThreshold(10, 2)).toBe(true);
	});

	it("rejects a delta smaller than the noise band", () => {
		expect(exceedsHysteresisThreshold(1, 2)).toBe(false);
	});

	it("rejects a delta exactly equal to the noise band (must strictly exceed it)", () => {
		expect(exceedsHysteresisThreshold(2, 2)).toBe(false);
	});

	it("treats stdevDelta's sign as irrelevant (only magnitude matters)", () => {
		expect(exceedsHysteresisThreshold(10, -2)).toBe(true);
		expect(exceedsHysteresisThreshold(1, -2)).toBe(false);
	});

	it("rejects a non-positive delta regardless of how small the noise band is", () => {
		expect(exceedsHysteresisThreshold(0, 0)).toBe(false);
		expect(exceedsHysteresisThreshold(-5, 0.001)).toBe(false);
	});

	it("a higher confidence k requires a proportionally larger delta", () => {
		expect(exceedsHysteresisThreshold(5, 2, 1)).toBe(true);
		expect(exceedsHysteresisThreshold(5, 2, 3)).toBe(false);
	});
});

describe("isSignificantImprovement", () => {
	// Real fixture items (src/data/items.json) - id 34400 (Crown of Dath'Remar) carries 91
	// Stamina, id 30007 (The Darkener's Grasp) carries 40 - a real, known-nonzero gap so the
	// test doesn't need to hand-construct fake item data, only real.ish weight vectors.
	const previous = [{ id: "30007", enchant: { id: "" }, gemSlots: [] }];
	const proposed = [{ id: "34400", enchant: { id: "" }, gemSlots: [] }];
	const optimizeStats = [
		{ name: "Stamina" as const, value: 1, type: "flat" as const },
	];
	const proposedScore = 91; // 34400's Stamina under the weight-1 config above

	const baseOptions = {
		uncrushabilitySetting: 0,
		uncritabilitySetting: 0,
		resistanceFloors: [],
		areEnchantsGemsLocked: false,
		excludeUniqueGems: false,
		phase: 3,
		raceId: TEST_RACE_ID,
		classId: TEST_CLASS_ID,
		talentSources: [],
		buffs: [],
		abilitySources: [],
		enabledConsumableIds: [],
	};

	it("accepts the swap when the calibrated stdev is small relative to the real stat gap", () => {
		const stdevStats = [
			{ name: "Stamina" as const, value: 0.01, type: "flat" as const },
		];
		expect(
			isSignificantImprovement(
				previous,
				proposed,
				proposedScore,
				optimizeStats,
				stdevStats,
				baseOptions,
			),
		).toBe(true);
	});

	it("rejects the swap when the calibrated stdev swamps the real stat gap", () => {
		const stdevStats = [
			{ name: "Stamina" as const, value: 1000, type: "flat" as const },
		];
		expect(
			isSignificantImprovement(
				previous,
				proposed,
				proposedScore,
				optimizeStats,
				stdevStats,
				baseOptions,
			),
		).toBe(false);
	});
});

describe("solveConfigForSimMetric", () => {
	const gearItem = (overrides: Partial<LPItem>): LPItem =>
		({
			name: "Test Item",
			stats: [],
			sockets: [],
			socketBonus: [],
			enchant: { name: "", id: "", effectID: "", type: "Chest", stats: [] },
			gems: [],
			gemSlots: [],
			locked: false,
			avoidanceScore: 0,
			objectiveScore: 0,
			uncritabilityScore: 0,
			resistanceScores: {},
			...overrides,
		}) as LPItem;

	// Round 1's accepted proposal (id 30007 - "The Darkener's Grasp", real 40 Stamina - see
	// isSignificantImprovement's own tests above) and round 2's rejected one (id 34400 -
	// "Crown of Dath'Remar", real 91 Stamina) - reusing the same real fixture ids so the (real,
	// unmocked) isSignificantImprovement/scoreGearSet call inside solveConfigForSimMetric has
	// genuine item data to score against.
	const roundOneProposal = [
		gearItem({ id: "30007", type: "Neck", uniqueId: "neck" }),
	];
	const roundTwoProposal = [
		gearItem({
			id: "34400",
			type: "Head",
			uniqueId: "head",
			objectiveScore: 91,
		}),
	];

	const baseOptions = {
		uncrushabilitySetting: 0,
		uncritabilitySetting: 0,
		resistanceFloors: [],
		areEnchantsGemsLocked: false,
		excludeUniqueGems: false,
		phase: 3,
		raceId: TEST_RACE_ID,
		classId: TEST_CLASS_ID,
		talentSources: [],
		buffs: [],
		abilitySources: [],
		enabledConsumableIds: [],
	};

	const profile = {
		...DEFAULT_SIM_CALIBRATION_PROFILE,
		calibration: {
			...DEFAULT_SIM_CALIBRATION_PROFILE.calibration,
			maxRounds: 3,
		},
	};

	beforeEach(() => {
		vi.mocked(solveConfig).mockReset();
		vi.mocked(calibrateWeights).mockReset();
		vi.mocked(measureFinalSimMetrics)
			.mockReset()
			.mockResolvedValue({ tps: 0, dtps: 0, tmi5: 0 });
	});

	it("returns the accepted round's stat weights, not a later rejected round's", async () => {
		const roundOneStats = [
			{ name: "Stamina" as const, value: 1, type: "flat" as const },
		];
		const roundOneStdev = [
			{ name: "Stamina" as const, value: 0.01, type: "flat" as const },
		];
		const roundTwoStats = [
			{ name: "Stamina" as const, value: 1, type: "flat" as const },
		];
		const roundTwoStdev = [
			{ name: "Stamina" as const, value: 1000, type: "flat" as const },
		];

		vi.mocked(calibrateWeights)
			.mockResolvedValueOnce({
				optimizeStats: roundOneStats,
				stdevStats: roundOneStdev,
			})
			.mockResolvedValueOnce({
				optimizeStats: roundTwoStats,
				stdevStats: roundTwoStdev,
			})
			// A single noisy rejection is inconclusive (see CONVERGENCE_CONFIRMATION_ROUNDS) -
			// this third round is rejected the same way, confirming convergence only after 2
			// consecutive non-significant rounds.
			.mockResolvedValueOnce({
				optimizeStats: roundTwoStats,
				stdevStats: roundTwoStdev,
			});
		vi.mocked(solveConfig)
			.mockResolvedValueOnce(roundOneProposal)
			.mockResolvedValueOnce(roundTwoProposal)
			.mockResolvedValueOnce(roundTwoProposal);

		const result = await solveConfigForSimMetric(
			[],
			baseOptions,
			[],
			{ items: [], enchants: [], gems: [] },
			{ tmi: 1 },
			profile,
		);

		// Rounds 2 and 3's swaps aren't distinguishable from calibration noise (huge stdev) -
		// only after both reject does the loop stop, reporting round 1's stats/gear as final.
		expect(calibrateWeights).toHaveBeenCalledTimes(3);
		expect(result.converged).toBe(true);
		expect(result.items).toEqual(roundOneProposal);
		expect(result.finalStatWeights).toEqual(roundOneStats);
	});

	it("a single noisy rejected round doesn't end convergence on its own", async () => {
		const roundOneStats = [
			{ name: "Stamina" as const, value: 1, type: "flat" as const },
		];
		const roundOneStdev = [
			{ name: "Stamina" as const, value: 0.01, type: "flat" as const },
		];
		const roundTwoStats = [
			{ name: "Stamina" as const, value: 1, type: "flat" as const },
		];
		const roundTwoStdev = [
			{ name: "Stamina" as const, value: 1000, type: "flat" as const },
		];
		const twoRoundProfile = {
			...profile,
			calibration: { ...profile.calibration, maxRounds: 2 },
		};

		vi.mocked(calibrateWeights)
			.mockResolvedValueOnce({
				optimizeStats: roundOneStats,
				stdevStats: roundOneStdev,
			})
			.mockResolvedValueOnce({
				optimizeStats: roundTwoStats,
				stdevStats: roundTwoStdev,
			});
		vi.mocked(solveConfig)
			.mockResolvedValueOnce(roundOneProposal)
			.mockResolvedValueOnce(roundTwoProposal);

		const result = await solveConfigForSimMetric(
			[],
			baseOptions,
			[],
			{ items: [], enchants: [], gems: [] },
			{ tmi: 1 },
			twoRoundProfile,
		);

		// Only 1 rejection happened before the round budget ran out - not enough to confirm
		// convergence, but the last accepted gear is still what's returned.
		expect(result.converged).toBe(false);
		expect(result.items).toEqual(roundOneProposal);
	});

	it("a real improvement found during a confirmation retry resets the streak and is accepted", async () => {
		const roundOneStats = [
			{ name: "Stamina" as const, value: 1, type: "flat" as const },
		];
		const roundOneStdev = [
			{ name: "Stamina" as const, value: 0.01, type: "flat" as const },
		];
		const roundTwoStats = [
			{ name: "Stamina" as const, value: 1, type: "flat" as const },
		];
		const roundTwoStdev = [
			{ name: "Stamina" as const, value: 1000, type: "flat" as const },
		];

		vi.mocked(calibrateWeights)
			.mockResolvedValueOnce({
				optimizeStats: roundOneStats,
				stdevStats: roundOneStdev,
			})
			// Round 2: rejected, same as the tests above - streak becomes 1.
			.mockResolvedValueOnce({
				optimizeStats: roundTwoStats,
				stdevStats: roundTwoStdev,
			})
			// Round 3: a real, low-noise improvement over round 1's gear (same numbers as
			// isSignificantImprovement's own "accepts the swap" test above) - should be accepted,
			// resetting the streak rather than requiring a 3rd rejection to have mattered.
			.mockResolvedValueOnce({
				optimizeStats: roundOneStats,
				stdevStats: roundOneStdev,
			});
		vi.mocked(solveConfig)
			.mockResolvedValueOnce(roundOneProposal)
			.mockResolvedValueOnce(roundTwoProposal)
			.mockResolvedValueOnce(roundTwoProposal);

		const result = await solveConfigForSimMetric(
			[],
			baseOptions,
			[],
			{ items: [], enchants: [], gems: [] },
			{ tmi: 1 },
			profile,
		);

		// Round 3 was accepted (the loop simply ran out of its 3-round budget right after),
		// never confirming non-improvement - confirms the streak reset, not just the count.
		expect(result.converged).toBe(false);
		expect(result.items).toEqual(roundTwoProposal);
	});

	const singleRoundProfile = {
		...DEFAULT_SIM_CALIBRATION_PROFILE,
		calibration: {
			...DEFAULT_SIM_CALIBRATION_PROFILE.calibration,
			maxRounds: 1,
		},
	};

	it("calibrates round 1 for real and reports it as round1StatWeights when nothing is precomputed", async () => {
		const roundOneStats = [
			{ name: "Stamina" as const, value: 2, type: "flat" as const },
		];
		const roundOneStdev = [
			{ name: "Stamina" as const, value: 0.02, type: "flat" as const },
		];
		vi.mocked(calibrateWeights).mockResolvedValueOnce({
			optimizeStats: roundOneStats,
			stdevStats: roundOneStdev,
		});
		vi.mocked(solveConfig).mockResolvedValueOnce(roundOneProposal);

		const result = await solveConfigForSimMetric(
			[],
			baseOptions,
			[],
			{ items: [], enchants: [], gems: [] },
			{ tmi: 1 },
			singleRoundProfile,
		);

		expect(calibrateWeights).toHaveBeenCalledTimes(1);
		expect(result.round1StatWeights).toEqual({
			optimizeStats: roundOneStats,
			stdevStats: roundOneStdev,
		});
	});

	it("skips calibrating round 1 and uses precomputedRound1 instead when provided", async () => {
		const precomputed = {
			optimizeStats: [
				{ name: "Stamina" as const, value: 3, type: "flat" as const },
			],
			stdevStats: [
				{ name: "Stamina" as const, value: 0.03, type: "flat" as const },
			],
		};
		vi.mocked(solveConfig).mockResolvedValueOnce(roundOneProposal);

		const result = await solveConfigForSimMetric(
			[],
			baseOptions,
			[],
			{ items: [], enchants: [], gems: [] },
			{ tmi: 1 },
			singleRoundProfile,
			undefined,
			precomputed,
		);

		expect(calibrateWeights).not.toHaveBeenCalled();
		expect(result.round1StatWeights).toEqual(precomputed);
		expect(result.finalStatWeights).toEqual(precomputed.optimizeStats);
	});

	it("derives a per-round secondary constraint from one shared calibration batch (no extra sim call) and passes it to solveConfig", async () => {
		// STAMINA = proto.Stat.StatStamina ordinal (common.proto) - matches calibrateWeights.test.ts's
		// own constant. tps' epValue is unsigned/higher-is-better (stays +5); tmi's is unsigned but
		// lower-is-better, so blendMetricEpValues flips it to -2 for the constraint vector.
		const STAMINA = 2;
		const tpsStats: number[] = [];
		tpsStats[STAMINA] = 5;
		const tmiStats: number[] = [];
		tmiStats[STAMINA] = 2;
		const fakeResult = {
			tps: { epValues: { apiVersion: 0, stats: tpsStats, pseudoStats: [] } },
			tmi: { epValues: { apiVersion: 0, stats: tmiStats, pseudoStats: [] } },
			// biome-ignore lint/suspicious/noExplicitAny: partial fake, only the fields blendMetricEpValues reads matter
		} as any;

		vi.mocked(runCalibrationBatches).mockResolvedValueOnce([
			{
				result: fakeResult,
				// current TMI-5 (8) is above the desired ceiling (5) - constraint should tighten.
				baselineMetrics: { tps: 0, dtps: 0, tmi5: 8 },
			},
		]);
		// Persistent (not Once) - the bootstrap step below now calls solveConfig a second time per
		// round whenever a secondary constraint is active (see solveConfigForSimMetric's own
		// comment on this), and this test only cares about the *first* call's bound.
		vi.mocked(solveConfig).mockResolvedValue(roundOneProposal);

		await solveConfigForSimMetric(
			[],
			baseOptions,
			[], // empty baseline gear - scoreGearSet's constraintScoreAtBaseline is trivially 0
			{ items: [], enchants: [], gems: [] },
			{ tps: 1 },
			singleRoundProfile,
			undefined,
			undefined,
			{ metric: "tmi", targetAbsolute: 5, kind: "ceiling" },
		);

		expect(runCalibrationBatches).toHaveBeenCalledTimes(1);
		expect(calibrateWeights).not.toHaveBeenCalled();

		const passedOptions = vi.mocked(solveConfig).mock.calls[0][1];
		// bound = constraintScoreAtBaseline(0) + sign(-1 for tmi) * (target(5) - current(8)) = 3;
		// a real-world ceiling on a lower-is-better metric becomes a floor on the (already sign-
		// flipped) constraintScore - see deriveSecondaryConstraintBound's own doc comment. This is
		// the first (unmargined) call - since the fixture's baseline gear is empty and the round's
		// own proposal (`roundOneProposal`, mocked identically every call above) never changes
		// Stamina relative to that baseline, the bootstrap margin computed from that (non-)delta is
		// exactly 0 too, so the second call ends up with this same bound - see the dedicated
		// bootstrap tests below for a case where the delta (and therefore the margin) is nonzero.
		expect(passedOptions.secondaryConstraint).toEqual({
			statWeights: expect.arrayContaining([
				{ name: "Stamina", value: -2, type: "flat" },
			]),
			bound: 3,
			kind: "floor",
		});
	});

	it("bootstraps a margin from the round's real proposal and re-solves once with a tighter bound", async () => {
		const STAMINA = 2;
		const tpsStats: number[] = [];
		tpsStats[STAMINA] = 5;
		const tmiStats: number[] = [];
		tmiStats[STAMINA] = 2;
		const tmiStdevStats: number[] = [];
		tmiStdevStats[STAMINA] = 0.5;
		const fakeResult = {
			tps: { epValues: { apiVersion: 0, stats: tpsStats, pseudoStats: [] } },
			tmi: {
				epValues: { apiVersion: 0, stats: tmiStats, pseudoStats: [] },
				epValuesStdev: {
					apiVersion: 0,
					stats: tmiStdevStats,
					pseudoStats: [],
				},
			},
			// biome-ignore lint/suspicious/noExplicitAny: partial fake, only the fields blendMetricEpValues/Stdevs read matter
		} as any;

		vi.mocked(runCalibrationBatches).mockResolvedValueOnce([
			{
				result: fakeResult,
				baselineMetrics: { tps: 0, dtps: 0, tmi5: 8 },
			},
		]);
		// First call proposes real item "34400" (91 Stamina - see isSignificantImprovement's own
		// fixtures above), a genuine ~51-point jump from the 40-Stamina baseline gear below - a
		// real, nonzero delta the bootstrap step should pick up. The second call's own return
		// value doesn't matter for this test beyond confirming it's what the function reports.
		vi.mocked(solveConfig)
			.mockResolvedValueOnce(roundTwoProposal)
			.mockResolvedValueOnce(roundOneProposal);

		const result = await solveConfigForSimMetric(
			[],
			baseOptions,
			[{ id: "30007", enchant: { id: "" }, gemSlots: [] }], // 40 Stamina baseline
			{ items: [], enchants: [], gems: [] },
			{ tps: 1 },
			singleRoundProfile,
			undefined,
			undefined,
			{ metric: "tmi", targetAbsolute: 5, kind: "ceiling" },
		);

		expect(solveConfig).toHaveBeenCalledTimes(2);
		const firstBound =
			vi.mocked(solveConfig).mock.calls[0][1].secondaryConstraint?.bound;
		const secondBound =
			vi.mocked(solveConfig).mock.calls[1][1].secondaryConstraint?.bound;
		expect(firstBound).toBeDefined();
		// LP-facing kind here is "floor" (see the test above) - a nonzero margin makes a floor
		// stricter by moving it up.
		expect(secondBound).toBeGreaterThan(firstBound as number);
		// The function's result reflects the second (margined) solveConfig call, not the first.
		expect(result.items).toEqual(roundOneProposal);
	});

	it("falls back to the unmargined proposal if the margined re-solve is infeasible", async () => {
		const STAMINA = 2;
		const tpsStats: number[] = [];
		tpsStats[STAMINA] = 5;
		const tmiStats: number[] = [];
		tmiStats[STAMINA] = 2;
		const tmiStdevStats: number[] = [];
		tmiStdevStats[STAMINA] = 0.5;
		const fakeResult = {
			tps: { epValues: { apiVersion: 0, stats: tpsStats, pseudoStats: [] } },
			tmi: {
				epValues: { apiVersion: 0, stats: tmiStats, pseudoStats: [] },
				epValuesStdev: {
					apiVersion: 0,
					stats: tmiStdevStats,
					pseudoStats: [],
				},
			},
			// biome-ignore lint/suspicious/noExplicitAny: partial fake, only the fields blendMetricEpValues/Stdevs read matter
		} as any;

		vi.mocked(runCalibrationBatches).mockResolvedValueOnce([
			{
				result: fakeResult,
				baselineMetrics: { tps: 0, dtps: 0, tmi5: 8 },
			},
		]);
		vi.mocked(solveConfig)
			.mockResolvedValueOnce(roundTwoProposal)
			.mockRejectedValueOnce(
				new Error("No gear combination satisfies: secondary floor of 999."),
			);

		const result = await solveConfigForSimMetric(
			[],
			baseOptions,
			[{ id: "30007", enchant: { id: "" }, gemSlots: [] }],
			{ items: [], enchants: [], gems: [] },
			{ tps: 1 },
			singleRoundProfile,
			undefined,
			undefined,
			{ metric: "tmi", targetAbsolute: 5, kind: "ceiling" },
		);

		expect(solveConfig).toHaveBeenCalledTimes(2);
		// The margined re-solve rejected - the round keeps the first (unmargined) proposal rather
		// than the whole solve throwing.
		expect(result.items).toEqual(roundTwoProposal);
	});
});

describe("absoluteValueForMetric", () => {
	const snapshot = { tps: 100, dtps: 50, tmi5: 12.5 };

	it("reads tps/dtps directly by name", () => {
		expect(absoluteValueForMetric(snapshot, "tps")).toBe(100);
		expect(absoluteValueForMetric(snapshot, "dtps")).toBe(50);
	});

	it("maps SimMetric's 'tmi' to the snapshot's 'tmi5' field", () => {
		expect(absoluteValueForMetric(snapshot, "tmi")).toBe(12.5);
	});
});

describe("deriveSecondaryConstraintBound", () => {
	const stats = [{ name: "Stamina" as const, value: 4, type: "flat" as const }];

	it("keeps the user-facing kind unchanged for a higher-is-better metric (tps)", () => {
		// ceiling: tps(gear) <= target => constraintScore(gear) <= target - current + baseline
		const result = deriveSecondaryConstraintBound(
			{ metric: "tps", targetAbsolute: 100, kind: "ceiling" },
			stats,
			/* currentAbsolute */ 80,
			/* constraintScoreAtBaseline */ 10,
		);
		expect(result).toEqual({
			statWeights: stats,
			bound: 10 + (100 - 80),
			kind: "ceiling",
		});
	});

	it("flips the LP-facing kind for a lower-is-better metric (tmi), since its vector's sign is already inverted", () => {
		// user wants a ceiling on real TMI - that's a floor on the sign-flipped constraintScore.
		const result = deriveSecondaryConstraintBound(
			{ metric: "tmi", targetAbsolute: 5, kind: "ceiling" },
			stats,
			/* currentAbsolute */ 8,
			/* constraintScoreAtBaseline */ 0,
		);
		expect(result).toEqual({
			statWeights: stats,
			bound: 0 + -1 * (5 - 8),
			kind: "floor",
		});
	});

	it("flips the LP-facing kind the other way for a floor on a lower-is-better metric", () => {
		const result = deriveSecondaryConstraintBound(
			{ metric: "dtps", targetAbsolute: 200, kind: "floor" },
			stats,
			/* currentAbsolute */ 150,
			/* constraintScoreAtBaseline */ 20,
		);
		expect(result).toEqual({
			statWeights: stats,
			bound: 20 + -1 * (200 - 150),
			kind: "ceiling",
		});
	});

	it("defaults to no margin when constraintMarginScore is omitted (old, unmargined behavior)", () => {
		const withDefault = deriveSecondaryConstraintBound(
			{ metric: "tps", targetAbsolute: 100, kind: "ceiling" },
			stats,
			80,
			10,
		);
		const withExplicitZero = deriveSecondaryConstraintBound(
			{ metric: "tps", targetAbsolute: 100, kind: "ceiling" },
			stats,
			80,
			10,
			0,
		);
		expect(withDefault).toEqual(withExplicitZero);
		expect(withDefault.bound).toBe(10 + (100 - 80));
	});

	it("tightens a ceiling's bound downward by k * constraintMarginScore", () => {
		const result = deriveSecondaryConstraintBound(
			{ metric: "tps", targetAbsolute: 100, kind: "ceiling" },
			stats,
			80,
			10,
			/* constraintMarginScore */ 5,
			/* k */ 2,
		);
		// rawBound = 10 + (100 - 80) = 30; ceiling moves down by k * margin = 2 * 5 = 10.
		expect(result.bound).toBe(30 - 10);
		expect(result.kind).toBe("ceiling");
	});

	it("tightens a floor's bound upward by k * constraintMarginScore", () => {
		const result = deriveSecondaryConstraintBound(
			{ metric: "dtps", targetAbsolute: 200, kind: "floor" },
			stats,
			150,
			20,
			/* constraintMarginScore */ 5,
			/* k */ 2,
		);
		// rawBound = 20 + -1 * (200 - 150) = -30; the metric's lower-is-better sign flips this to
		// an LP-facing "ceiling" (see the test above), so it's the ceiling branch that fires here
		// too - moving the bound down, i.e. tightening the user-facing floor on dtps.
		expect(result.kind).toBe("ceiling");
		expect(result.bound).toBe(-30 - 10);
	});

	it("a zero k reproduces the unmargined bound even with a nonzero constraintMarginScore", () => {
		const result = deriveSecondaryConstraintBound(
			{ metric: "tps", targetAbsolute: 100, kind: "ceiling" },
			stats,
			80,
			10,
			/* constraintMarginScore */ 1000,
			/* k */ 0,
		);
		expect(result.bound).toBe(30);
	});
});
