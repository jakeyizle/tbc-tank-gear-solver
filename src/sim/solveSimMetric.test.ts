import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	TEST_CLASS_ID,
	TEST_RACE_ID,
} from "#/solver/__fixtures__/testItemPool";
import { solveConfig } from "#/solver/solveConfig";
import type { InputItem, LPItem, StatName } from "#/solver/types";
import { DEFAULT_SIM_CALIBRATION_PROFILE } from "#/types/SimCalibrationProfile";
import type { TbcUiDatabase } from "./buildStatWeightsRequest";
import { calibrateWeights, measureFinalSimMetrics } from "./calibrateWeights";
import {
	absoluteValueForMetric,
	exceedsHysteresisThreshold,
	filterItemsForClass,
	isSignificantImprovement,
	SIM_CALIBRATION_STATS,
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
		const perMetricStatWeights = {
			tps: [{ name: "Stamina" as const, value: 5, type: "flat" as const }],
			dtps: [{ name: "Stamina" as const, value: 6, type: "flat" as const }],
			tmi: roundOneStats,
		};
		vi.mocked(calibrateWeights).mockResolvedValueOnce({
			optimizeStats: roundOneStats,
			stdevStats: roundOneStdev,
			perMetricStatWeights,
			perMetricStatWeightStdevs: perMetricStatWeights,
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
		expect(result.finalPerMetricStatWeights).toEqual(perMetricStatWeights);
		expect(result.finalPerMetricStatWeightStdevs).toEqual(perMetricStatWeights);
	});

	it("skips calibrating round 1 and uses precomputedRound1 instead when provided", async () => {
		const perMetricStatWeights = {
			tps: [{ name: "Stamina" as const, value: 7, type: "flat" as const }],
			dtps: [{ name: "Stamina" as const, value: 8, type: "flat" as const }],
			tmi: [{ name: "Stamina" as const, value: 9, type: "flat" as const }],
		};
		const precomputed = {
			optimizeStats: [
				{ name: "Stamina" as const, value: 3, type: "flat" as const },
			],
			stdevStats: [
				{ name: "Stamina" as const, value: 0.03, type: "flat" as const },
			],
			perMetricStatWeights,
			perMetricStatWeightStdevs: perMetricStatWeights,
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
		expect(result.round1StatWeights).toEqual({
			optimizeStats: precomputed.optimizeStats,
			stdevStats: precomputed.stdevStats,
		});
		expect(result.finalStatWeights).toEqual(precomputed.optimizeStats);
		expect(result.finalPerMetricStatWeights).toEqual(perMetricStatWeights);
		expect(result.finalPerMetricStatWeightStdevs).toEqual(perMetricStatWeights);
	});

	it("passes the full default stat list to calibrateWeights when enabledCalibrationStats is unset", async () => {
		vi.mocked(calibrateWeights).mockResolvedValueOnce({
			optimizeStats: [],
			stdevStats: [],
		});
		vi.mocked(solveConfig).mockResolvedValueOnce(roundOneProposal);

		await solveConfigForSimMetric(
			[],
			baseOptions,
			[],
			{ items: [], enchants: [], gems: [] },
			{ tmi: 1 },
			singleRoundProfile,
		);

		expect(calibrateWeights).toHaveBeenCalledWith(
			[],
			expect.anything(),
			SIM_CALIBRATION_STATS,
			expect.anything(),
			expect.anything(),
			expect.anything(),
		);
	});

	it("passes only the enabled subset to calibrateWeights when enabledCalibrationStats is set", async () => {
		vi.mocked(calibrateWeights).mockResolvedValueOnce({
			optimizeStats: [],
			stdevStats: [],
		});
		vi.mocked(solveConfig).mockResolvedValueOnce(roundOneProposal);

		await solveConfigForSimMetric(
			[],
			{ ...baseOptions, enabledCalibrationStats: ["Stamina", "Armor"] },
			[],
			{ items: [], enchants: [], gems: [] },
			{ tmi: 1 },
			singleRoundProfile,
		);

		expect(calibrateWeights).toHaveBeenCalledWith(
			[],
			expect.anything(),
			["Stamina", "Armor"],
			expect.anything(),
			expect.anything(),
			expect.anything(),
		);
	});

	it("falls back to the full default when every enabled entry is stale/invalid", async () => {
		vi.mocked(calibrateWeights).mockResolvedValueOnce({
			optimizeStats: [],
			stdevStats: [],
		});
		vi.mocked(solveConfig).mockResolvedValueOnce(roundOneProposal);

		await solveConfigForSimMetric(
			[],
			// "Mana" has no STAT_NAME_TO_TBC_STAT translation entry - simulates a stale config
			// saved before a stat was removed from the translation table.
			{ ...baseOptions, enabledCalibrationStats: ["Mana" as StatName] },
			[],
			{ items: [], enchants: [], gems: [] },
			{ tmi: 1 },
			singleRoundProfile,
		);

		expect(calibrateWeights).toHaveBeenCalledWith(
			[],
			expect.anything(),
			SIM_CALIBRATION_STATS,
			expect.anything(),
			expect.anything(),
			expect.anything(),
		);
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
