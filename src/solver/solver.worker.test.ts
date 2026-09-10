import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SimMetricsSnapshot } from "#/types/SimCalibrationProfile";
import {
	TEST_CLASS_ID,
	TEST_RACE_ID,
	testItemPool,
} from "./__fixtures__/testItemPool";
import type { SolveOptions } from "./solveConfig";
import { solveGearSet } from "./solveEHP";
import type { InputItem, LPItem } from "./types";

// solver.worker.ts is a Web Worker module - it assigns to the `self` global at import time and
// dynamically import()s src/sim/* only for the branch under test, so those imports (and
// solveGearSet, the plain-LP path) are mocked the same way solveSimMetric.test.ts mocks
// calibrateWeights: replace just the functions this test drives, keep everything else real.
vi.mock("./solveEHP", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./solveEHP")>();
	return { ...actual, solveGearSet: vi.fn() };
});
vi.mock("#/sim/resolveGearAndConsumables", async (importOriginal) => {
	const actual = await importOriginal<
		typeof import("#/sim/resolveGearAndConsumables")
	>();
	return { ...actual, splitGearAndConsumables: vi.fn() };
});
vi.mock("#/sim/calibrateWeights", async (importOriginal) => {
	const actual = await importOriginal<typeof import("#/sim/calibrateWeights")>();
	return { ...actual, measureFinalSimMetrics: vi.fn() };
});
vi.mock("#/sim/simDatabaseClient", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("#/sim/simDatabaseClient")>();
	return { ...actual, loadTbcDatabase: vi.fn() };
});

const baseOptions: Omit<SolveOptions, "optimizeStats"> = {
	uncrushabilitySetting: 0,
	uncritabilitySetting: 0,
	resistanceFloors: [],
	areEnchantsGemsLocked: false,
	excludeUniqueGems: false,
	excludeJewelcraftingItems: false,
	excludeEnchantingItems: false,
	phase: 3,
	raceId: TEST_RACE_ID,
	classId: TEST_CLASS_ID,
	talentSources: [],
	buffs: [],
	abilitySources: [],
	enabledConsumableIds: [],
};

// Simulates the module's own `self.onmessage = ...` assignment landing somewhere this test can
// reach it (solver.worker.ts's Web Worker global), then drives it like the real Worker runtime
// would and collects every posted message.
async function runWorker(data: {
	items: InputItem[];
	options: SolveOptions;
}): Promise<unknown[]> {
	const posted: unknown[] = [];
	(globalThis as { self?: unknown }).self = globalThis;
	(globalThis as { postMessage?: unknown }).postMessage = (message: unknown) =>
		posted.push(message);

	vi.resetModules();
	await import("./solver.worker");
	const onmessage = (globalThis as { onmessage?: (e: unknown) => unknown })
		.onmessage;
	if (!onmessage) throw new Error("solver.worker did not register onmessage");
	await onmessage({ data });
	return posted;
}

describe("solver.worker plain-LP branch", () => {
	beforeEach(() => {
		vi.mocked(solveGearSet).mockReset();
	});

	it("measures TPS/DTPS/TMI-5 for a stats-mode solve and includes it in the result message", async () => {
		const { splitGearAndConsumables } = await import(
			"#/sim/resolveGearAndConsumables"
		);
		const { measureFinalSimMetrics } = await import("#/sim/calibrateWeights");
		const { loadTbcDatabase } = await import("#/sim/simDatabaseClient");

		const solvedItems = testItemPool.slice(0, 3) as unknown as LPItem[];
		vi.mocked(solveGearSet).mockResolvedValue(solvedItems);
		vi.mocked(splitGearAndConsumables).mockReturnValue({
			gear: [],
			consumables: { flaskId: 0, battleElixirId: 0, guardianElixirId: 0 },
		});
		const fakeDb = {} as Awaited<ReturnType<typeof loadTbcDatabase>>;
		vi.mocked(loadTbcDatabase).mockResolvedValue(fakeDb);
		const expectedMetrics: SimMetricsSnapshot = {
			tps: 1234,
			dtps: 567,
			tmi5: 89,
		};
		vi.mocked(measureFinalSimMetrics).mockResolvedValue(expectedMetrics);

		const options: SolveOptions = {
			...baseOptions,
			optimizeStats: [],
			objectiveMode: "stats",
		};
		const posted = await runWorker({ items: testItemPool, options });

		const resultMessage = posted.find(
			(m): m is { type: "result"; items: LPItem[]; simMetrics?: unknown } =>
				(m as { type?: string }).type === "result",
		);
		expect(resultMessage?.simMetrics).toEqual(expectedMetrics);
		expect(resultMessage?.items).toEqual(solvedItems);
		expect(splitGearAndConsumables).toHaveBeenCalledWith(solvedItems);
		expect(loadTbcDatabase).toHaveBeenCalled();
	});
});
