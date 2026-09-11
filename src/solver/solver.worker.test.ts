import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SimMetricsSnapshot } from "#/types/SimCalibrationProfile";
import { TEST_ITEM_DATABASE } from "./__fixtures__/testItemDatabase";
import { TEST_CLASS_ID, testItemPool } from "./__fixtures__/testItemPool";
import { TEST_LINEAR_MODEL } from "./__fixtures__/testLinearModel";
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
	const actual =
		await importOriginal<typeof import("#/sim/resolveGearAndConsumables")>();
	return { ...actual, splitGearAndConsumables: vi.fn() };
});
vi.mock("#/sim/calibrateWeights", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("#/sim/calibrateWeights")>();
	return { ...actual, measureFinalSimMetrics: vi.fn() };
});
// The plain-LP branch also measures character stats for the results panel (see
// measureCharacterStats.ts). Stubbed here so this test stays about the metrics plumbing;
// its own coverage is src/sim/computeStats.integration.test.ts.
vi.mock("#/sim/measureCharacterStats", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("#/sim/measureCharacterStats")>();
	return { ...actual, measureCharacterStats: vi.fn() };
});
// The worker derives the stat model from the sim before solving anything (see
// solver.worker.ts). This test is about the metrics plumbing, so it hands back the committed
// fixture instead of loading the wasm; deriveLinearModel's own coverage is
// src/sim/deriveLinearModel.test.ts.
vi.mock("#/sim/deriveLinearModel", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("#/sim/deriveLinearModel")>();
	return { ...actual, deriveLinearModel: vi.fn() };
});
// The worker also builds the solver's item pool from the fetched database (see
// solver.worker.ts). Stubbed to the on-disk fixture so this test needs no network.
vi.mock("#/data/tbcDatabase", async (importOriginal) => {
	const actual = await importOriginal<typeof import("#/data/tbcDatabase")>();
	return { ...actual, loadTbcDomainDatabase: vi.fn() };
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
	classId: TEST_CLASS_ID,
	linearModel: TEST_LINEAR_MODEL,
	itemDatabase: TEST_ITEM_DATABASE,
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
		const { measureCharacterStats } = await import(
			"#/sim/measureCharacterStats"
		);

		const solvedItems = testItemPool.slice(0, 3) as unknown as LPItem[];
		vi.mocked(solveGearSet).mockResolvedValue(solvedItems);
		vi.mocked(splitGearAndConsumables).mockReturnValue({
			gear: [],
			consumables: { flaskId: 0, battleElixirId: 0, guardianElixirId: 0 },
		});
		const fakeDb = {} as Awaited<ReturnType<typeof loadTbcDatabase>>;
		vi.mocked(loadTbcDatabase).mockResolvedValue(fakeDb);
		const { deriveLinearModel } = await import("#/sim/deriveLinearModel");
		vi.mocked(deriveLinearModel).mockResolvedValue(TEST_LINEAR_MODEL);
		const { loadTbcDomainDatabase } = await import("#/data/tbcDatabase");
		vi.mocked(loadTbcDomainDatabase).mockResolvedValue({
			items: TEST_ITEM_DATABASE.items,
			gems: TEST_ITEM_DATABASE.gems,
			enchants: TEST_ITEM_DATABASE.enchants,
		} as Awaited<ReturnType<typeof loadTbcDomainDatabase>>);
		const expectedMetrics: SimMetricsSnapshot = {
			tps: 1234,
			dtps: 567,
			tmi5: 89,
		};
		vi.mocked(measureFinalSimMetrics).mockResolvedValue(expectedMetrics);
		const expectedCharacterStats = { buffed: {}, unbuffed: {} } as Awaited<
			ReturnType<typeof measureCharacterStats>
		>;
		vi.mocked(measureCharacterStats).mockResolvedValue(expectedCharacterStats);

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
		expect(
			(resultMessage as { characterStats?: unknown } | undefined)
				?.characterStats,
		).toEqual(expectedCharacterStats);
		expect(resultMessage?.items).toEqual(solvedItems);
		expect(splitGearAndConsumables).toHaveBeenCalledWith(solvedItems);
		expect(loadTbcDatabase).toHaveBeenCalled();
	});
});
