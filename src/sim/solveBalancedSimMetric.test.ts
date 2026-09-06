import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Stat } from "#/solver/types";
import { DEFAULT_SIM_CALIBRATION_PROFILE } from "#/types/SimCalibrationProfile";
import {
	interpolateEndpointCeiling,
	solveBalancedSimMetric,
} from "./solveBalancedSimMetric";
import { solveConfigForSimMetric } from "./solveSimMetric";

vi.mock("./solveSimMetric", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./solveSimMetric")>();
	return { ...actual, solveConfigForSimMetric: vi.fn() };
});

describe("interpolateEndpointCeiling", () => {
	it("returns the survival endpoint's own value at balance=0", () => {
		expect(interpolateEndpointCeiling(0, 10, 2)).toBe(2);
	});

	it("returns the threat endpoint's own value at balance=1", () => {
		expect(interpolateEndpointCeiling(1, 10, 2)).toBe(10);
	});

	it("linearly interpolates between the two endpoints", () => {
		expect(interpolateEndpointCeiling(0.5, 10, 2)).toBe(6);
		expect(interpolateEndpointCeiling(0.25, 10, 2)).toBe(4);
	});

	it("clamps balance outside [0, 1]", () => {
		expect(interpolateEndpointCeiling(-1, 10, 2)).toBe(2);
		expect(interpolateEndpointCeiling(2, 10, 2)).toBe(10);
	});
});

describe("solveBalancedSimMetric", () => {
	const baseOptions = {
		uncrushabilitySetting: 0,
		uncritabilitySetting: 0,
		resistanceFloors: [],
		areEnchantsGemsLocked: false,
		excludeUniqueGems: false,
		phase: 3,
		raceId: "1",
		classId: "2",
		talentSources: [],
		buffs: [],
		abilitySources: [],
		enabledConsumableIds: [],
	};

	const threatStats: Stat[] = [{ name: "AttackPower", value: 1, type: "flat" }];
	const survivalStats: Stat[] = [{ name: "Dodge", value: 1, type: "flat" }];

	const threatSolveResult = {
		items: [{ id: "threat-gear" }],
		iterations: 2,
		converged: true,
		simMetrics: { tps: 5000, dtps: 800, tmi5: 10 },
		finalStatWeights: threatStats,
		finalStatWeightStdevs: threatStats,
		round1StatWeights: { optimizeStats: threatStats, stdevStats: threatStats },
	};
	const survivalSolveResult = {
		items: [{ id: "survival-gear" }],
		iterations: 2,
		converged: true,
		simMetrics: { tps: 3000, dtps: 200, tmi5: 2 },
		finalStatWeights: survivalStats,
		finalStatWeightStdevs: survivalStats,
		round1StatWeights: {
			optimizeStats: survivalStats,
			stdevStats: survivalStats,
		},
	};
	const balancedSolveResult = {
		items: [{ id: "balanced-gear" }],
		iterations: 3,
		converged: true,
		simMetrics: { tps: 4200, dtps: 500, tmi5: 6 },
		finalStatWeights: threatStats,
		finalStatWeightStdevs: threatStats,
		round1StatWeights: { optimizeStats: threatStats, stdevStats: threatStats },
	};

	beforeEach(() => {
		vi.mocked(solveConfigForSimMetric).mockReset();
	});

	it("solves both endpoints, then the constrained solve, interpolating the TMI ceiling from the endpoints' own achieved values", async () => {
		vi.mocked(solveConfigForSimMetric)
			.mockResolvedValueOnce(threatSolveResult as never)
			.mockResolvedValueOnce(survivalSolveResult as never)
			.mockResolvedValueOnce(balancedSolveResult as never);

		const result = await solveBalancedSimMetric(
			[],
			baseOptions,
			[],
			{ items: [], enchants: [], gems: [] },
			0.5,
			"tmi",
			DEFAULT_SIM_CALIBRATION_PROFILE,
		);

		expect(solveConfigForSimMetric).toHaveBeenCalledTimes(3);
		// call 1: threat endpoint - pure tps
		expect(vi.mocked(solveConfigForSimMetric).mock.calls[0][4]).toEqual({
			tps: 1,
		});
		// call 2: survival endpoint - pure tmi
		expect(vi.mocked(solveConfigForSimMetric).mock.calls[1][4]).toEqual({
			tmi: 1,
		});
		// call 3: the balanced solve - maximize tps, with a secondary TMI ceiling interpolated
		// halfway between the two endpoints' own TMI-5 (10 and 2) => 6.
		const finalCall = vi.mocked(solveConfigForSimMetric).mock.calls[2];
		expect(finalCall[4]).toEqual({ tps: 1 });
		expect(finalCall[8]).toEqual({
			metric: "tmi",
			targetAbsolute: 6,
			kind: "ceiling",
		});

		expect(result.items).toEqual(balancedSolveResult.items);
		expect(result.threatEndpoint.simMetrics).toEqual(
			threatSolveResult.simMetrics,
		);
		expect(result.survivalEndpoint.simMetrics).toEqual(
			survivalSolveResult.simMetrics,
		);
	});

	it("skips both endpoint solves and goes straight to the constrained solve when cachedEndpoints is provided", async () => {
		vi.mocked(solveConfigForSimMetric).mockResolvedValueOnce(
			balancedSolveResult as never,
		);

		const cachedEndpoints = {
			threat: {
				items: [],
				simMetrics: threatSolveResult.simMetrics,
				finalStatWeights: threatStats,
				finalStatWeightStdevs: threatStats,
			},
			survival: {
				items: [],
				simMetrics: survivalSolveResult.simMetrics,
				finalStatWeights: survivalStats,
				finalStatWeightStdevs: survivalStats,
			},
		};

		const result = await solveBalancedSimMetric(
			[],
			baseOptions,
			[],
			{ items: [], enchants: [], gems: [] },
			1,
			"tmi",
			DEFAULT_SIM_CALIBRATION_PROFILE,
			undefined,
			cachedEndpoints,
		);

		expect(solveConfigForSimMetric).toHaveBeenCalledTimes(1);
		const finalCall = vi.mocked(solveConfigForSimMetric).mock.calls[0];
		// balance=1 => ceiling is exactly the threat endpoint's own TMI-5 (10).
		expect(finalCall[8]).toEqual({
			metric: "tmi",
			targetAbsolute: 10,
			kind: "ceiling",
		});
		expect(result.threatEndpoint).toEqual(cachedEndpoints.threat);
		expect(result.survivalEndpoint).toEqual(cachedEndpoints.survival);
	});

	it("uses DTPS for the survival endpoint and the balanced constraint when survivabilityMetric is 'dtps'", async () => {
		vi.mocked(solveConfigForSimMetric)
			.mockResolvedValueOnce(threatSolveResult as never)
			.mockResolvedValueOnce(survivalSolveResult as never)
			.mockResolvedValueOnce(balancedSolveResult as never);

		await solveBalancedSimMetric(
			[],
			baseOptions,
			[],
			{ items: [], enchants: [], gems: [] },
			0.5,
			"dtps",
			DEFAULT_SIM_CALIBRATION_PROFILE,
		);

		// call 2: survival endpoint - pure dtps, not tmi.
		expect(vi.mocked(solveConfigForSimMetric).mock.calls[1][4]).toEqual({
			dtps: 1,
		});
		// call 3: the balanced solve's constraint - interpolated halfway between the two
		// endpoints' own DTPS (800 and 200) => 500, constrained on dtps, not tmi.
		const finalCall = vi.mocked(solveConfigForSimMetric).mock.calls[2];
		expect(finalCall[8]).toEqual({
			metric: "dtps",
			targetAbsolute: 500,
			kind: "ceiling",
		});
	});
});
