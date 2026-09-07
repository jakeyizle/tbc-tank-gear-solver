// Tests for statWeightsClient.ts's job-based calibration flow (see simJobQueue.ts): building a
// flat SimJob[] from a StatWeightRequestsData, and reassembling a StatWeightsCalcRequest from
// completed jobs' results keyed by job id, in original stat order - regardless of completion
// order, since runSimJobQueue no longer guarantees jobs finish in dispatch order the way the old
// strictly sequential runConcurrentSim loop did.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	RaidSimRequest,
	RaidSimResult,
	StatWeightRequestsData,
	StatWeightsCalcRequest,
	StatWeightsResult,
	StatWeightsStatRequestData,
} from "./proto/api.js";
import { Stat } from "./proto/common.js";
import { computeStatWeightsFromJobResults } from "./statWeightsClient";

function iterRequest(iterations: number): RaidSimRequest {
	return RaidSimRequest.create({ simOptions: { iterations } });
}

/** Regression coverage for the bug this session's investigation found in the old
 * runConcurrentSim: combining a result with `.error` set (unpopulated RaidMetrics) crashed the
 * Go-side combiner instead of surfacing a clear JS error - the new job-based flow checks
 * `.error` per job inside simJobQueue.ts's runSimJobQueue itself (see simJobQueue.test.ts), so
 * this file only needs to confirm reassembly/compute behavior on already-successful results. */
describe("computeStatWeightsFromJobResults", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	function stubStatWeightCompute() {
		const globals = globalThis as unknown as {
			statWeightCompute?: (bytes: Uint8Array) => Uint8Array;
		};
		const calls: unknown[] = [];
		globals.statWeightCompute = vi.fn((bytes: Uint8Array) => {
			// Round-trip through the real proto types so the spy can inspect exactly what was
			// assembled without depending on wasm internals.
			calls.push(StatWeightsCalcRequest.fromBinary(bytes));
			return StatWeightsResult.toBinary(StatWeightsResult.create({}));
		});
		return { calls };
	}

	it("reassembles results in original stat order regardless of insertion order into the map", () => {
		const { calls } = stubStatWeightCompute();

		const reqData = StatWeightRequestsData.create({
			baseRequest: iterRequest(100),
			epReferenceStat: Stat.StatSpellDamage,
			statSimRequests: [
				StatWeightsStatRequestData.create({
					statData: { unitStat: Stat.StatStamina },
					requestLow: iterRequest(50),
					requestHigh: iterRequest(50),
				}),
				StatWeightsStatRequestData.create({
					statData: { unitStat: Stat.StatArmor },
					requestLow: iterRequest(50),
					requestHigh: iterRequest(50),
				}),
			],
		});

		// Insert results in a deliberately scrambled (non-dispatch, non-stat-index) order, as a
		// real out-of-order-completing job queue would produce.
		const resultsById = new Map<string, RaidSimResult>();
		resultsById.set("stat:1:high", RaidSimResult.create({ iterationsDone: 4 }));
		resultsById.set("base", RaidSimResult.create({ iterationsDone: 1 }));
		resultsById.set("stat:0:low", RaidSimResult.create({ iterationsDone: 2 }));
		resultsById.set("stat:1:low", RaidSimResult.create({ iterationsDone: 3 }));
		resultsById.set("stat:0:high", RaidSimResult.create({ iterationsDone: 5 }));

		computeStatWeightsFromJobResults(reqData, resultsById);

		expect(calls).toHaveLength(1);
		const calcRequest = calls[0] as {
			baseResult?: RaidSimResult;
			statSimResults: {
				resultLow?: RaidSimResult;
				resultHigh?: RaidSimResult;
			}[];
		};
		expect(calcRequest.baseResult?.iterationsDone).toBe(1);
		// Stat index 0 (Stamina) must land in slot 0, stat index 1 (Armor) in slot 1 - not
		// swapped, even though "stat:1:*" entries were inserted into the map first.
		expect(calcRequest.statSimResults[0].resultLow?.iterationsDone).toBe(2);
		expect(calcRequest.statSimResults[0].resultHigh?.iterationsDone).toBe(5);
		expect(calcRequest.statSimResults[1].resultLow?.iterationsDone).toBe(3);
		expect(calcRequest.statSimResults[1].resultHigh?.iterationsDone).toBe(4);
	});

	it("omits resultLow for a one-sided stat with no requestLow, without requiring a job for it", () => {
		const { calls } = stubStatWeightCompute();

		const reqData = StatWeightRequestsData.create({
			baseRequest: iterRequest(100),
			epReferenceStat: Stat.StatSpellDamage,
			statSimRequests: [
				StatWeightsStatRequestData.create({
					statData: { unitStat: Stat.StatMeleeHitRating },
					// no requestLow - one-sided stat, mirrors statTranslation.ts's
					// ONE_SIDED_CALIBRATION_STATS
					requestHigh: iterRequest(50),
				}),
			],
		});

		const resultsById = new Map<string, RaidSimResult>([
			["base", RaidSimResult.create({})],
			["stat:0:high", RaidSimResult.create({})],
		]);

		expect(() =>
			computeStatWeightsFromJobResults(reqData, resultsById),
		).not.toThrow();
		const calcRequest = calls[0] as {
			statSimResults: { resultLow?: RaidSimResult }[];
		};
		expect(calcRequest.statSimResults[0].resultLow).toBeUndefined();
	});

	it("throws a clear error when a required job result is missing", () => {
		stubStatWeightCompute();

		const reqData = StatWeightRequestsData.create({
			baseRequest: iterRequest(100),
			epReferenceStat: Stat.StatSpellDamage,
			statSimRequests: [
				StatWeightsStatRequestData.create({
					statData: { unitStat: Stat.StatStamina },
					requestHigh: iterRequest(50),
				}),
			],
		});

		const resultsById = new Map<string, RaidSimResult>([
			["base", RaidSimResult.create({})],
			// "stat:0:high" deliberately missing
		]);

		expect(() =>
			computeStatWeightsFromJobResults(reqData, resultsById),
		).toThrow(/stat:0:high/);
	});
});
