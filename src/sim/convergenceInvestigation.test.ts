// Empirical investigation into how many calibration rounds solveConfigForSimMetric actually
// needs to reach a stable, near-optimal gear set, and whether isSignificantImprovement's
// round-over-round comparison measures real progress or an artifact of scoring gear under a
// freshly-recalibrated (and therefore potentially scale-drifting) weight vector each round.
//
// Runs the REAL calibration/solve pipeline - real vendored wasm sim, real LP solver - entirely
// in Node, no browser/Worker/Playwright involved, using the same wasm-from-disk technique
// statWeights.integration.test.ts already established:
//   - public/sim/lib.wasm.gz is read straight off disk and instantiated by hand, replacing
//     statWeightsClient.ts's normal fetch("/sim/lib.wasm.gz") (mocked via
//     vi.mock("./fetchWasmModule") below) - that relative fetch has no base URL to resolve
//     against under plain Node/vitest.
//   - SimWorkerPool (src/sim/simWorkerPool.ts) spawns real Web Workers, unavailable in Node.
//     runSimJobQueue (src/sim/simJobQueue.ts) only ever touches `pool.size`/`pool.run()` on it
//     (confirmed by reading that function and its own test, which already substitutes a plain
//     `{size, run}` object for a real SimWorkerPool) - so `vi.mock("./simWorkerPool")` swaps in
//     a fake whose run() calls the SAME coordinator wasm instance's raidSim() export directly,
//     in-process, instead of posting to a Worker.
// db.json is a plain parameter to solveConfigForSimMetric, so it's just read off disk too - no
// fetch involved there at all.
//
// Skipped automatically if the submodule/wasm artifact aren't present (mirrors
// statWeights.integration.test.ts). The one-round-trip sanity check always runs when they are
// present (fast, and guards this file's mocking setup against silently rotting); the full
// multi-round investigation matrix is opt-in only (RUN_CONVERGENCE_INVESTIGATION=1), since a
// single combination can take several minutes and this file runs a whole matrix of them - not
// something every `npm test` run should pay for.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { getBuffs } from "#/data/buffs";
import { CONSUMABLES } from "#/data/consumables";
import { parseItemInput } from "#/helpers/parseItemInput";
import type { SolveOptions } from "#/solver/solveConfig";
import { DEFAULT_SIM_CALIBRATION_PROFILE } from "#/types/SimCalibrationProfile";

const root = path.resolve(__dirname, "../..");
const wasmGzPath = path.join(root, "public/sim/lib.wasm.gz");
const wasmExecPath = path.join(root, "src/sim/wasm_exec.js");
const dbPath = path.join(root, "vendor/tbc-sim/assets/database/db.json");
const gearPath = path.join(
	root,
	"vendor/tbc-sim/ui/paladin/protection/gear_sets/p3.gear.json",
);
const multiAltPoolPath = path.join(
	root,
	"src/sim/testFixtures/convergenceGearPool.json",
);

const canRun = [
	wasmGzPath,
	wasmExecPath,
	dbPath,
	gearPath,
	multiAltPoolPath,
].every(fs.existsSync);

vi.mock("./fetchWasmModule", () => ({
	fetchWasmModule: async (_url: string, importObject: WebAssembly.Imports) =>
		WebAssembly.instantiate(
			zlib.gunzipSync(fs.readFileSync(wasmGzPath)),
			importObject,
		),
}));

// A "slot" here is a purely logical dispatch lane inside runSimJobQueue - it doesn't correspond
// to a real thread. Every slot's run() reaches the same single coordinator wasm instance's
// raidSim() export, so size MUST stay 1: a real SimWorkerPool guarantees at most one in-flight
// sim per Go instance (see simJobQueue.ts's own header comment on why two concurrent calls into
// one single-threaded Go instance corrupts timing/memory), and faking a larger pool here would
// silently violate that guarantee since there's genuinely only one Go instance to share.
vi.mock("./simWorkerPool", () => {
	class FakeSimWorkerPool {
		readonly size = 1;
		async run(
			_slot: number,
			requestBytes: Uint8Array,
			onProgress: (completedIterations: number) => void,
		): Promise<Uint8Array> {
			const raidSim = (
				globalThis as unknown as {
					raidSim?: (bytes: Uint8Array) => Uint8Array;
				}
			).raidSim;
			if (!raidSim) {
				throw new Error(
					"convergenceInvestigation harness: wasm raidSim global wasn't registered yet - " +
						"buildStatWeightJobs should have loaded the coordinator wasm before any pool.run() call.",
				);
			}
			const resultBytes = raidSim(requestBytes);
			onProgress(1);
			return resultBytes;
		}
		recycle(): void {}
		terminate(): void {}
	}
	return { SimWorkerPool: FakeSimWorkerPool, resolveWorkerCount: () => 1 };
});

// Imported after the mocks above (vi.mock calls are hoisted by vitest regardless of position,
// but writing it this way keeps the intent readable).
const { solveConfigForSimMetric } = await import("./solveSimMetric");
const { metricRatiosForBalance } = await import("./calibrateWeights");
const { PROT_PALADIN_BASELINE_GEAR } = await import(
	"./protPaladinBaselineGear"
);

const db = canRun ? JSON.parse(fs.readFileSync(dbPath, "utf8")) : undefined;

// Pool A: single candidate item per slot (the same P3 preset used as the fixed round-1 baseline
// everywhere else in this repo) - the LP's only freedom here is enchant/gem choice, never which
// item occupies a slot.
const singleAltPool = canRun
	? parseItemInput(fs.readFileSync(gearPath, "utf8"))
	: [];
// Pool B: several candidate items per slot (user-supplied, representative of a real WowSims
// export) - lets the LP actually choose between competing items, not just enchants/gems.
const multiAltPool = canRun
	? parseItemInput(fs.readFileSync(multiAltPoolPath, "utf8"))
	: [];

// Constraints off (0): the single-alternative pool (one item per slot, no choice at all) can't
// satisfy the UI's real default avoidance/crit-cap targets - this investigation cares about
// round-over-round convergence behavior, not about reproducing the UI's default hard
// constraints, so leave the LP free to always find a feasible solution regardless of pool.
const baseOptions: Omit<SolveOptions, "optimizeStats" | "objectiveMode"> = {
	uncritabilitySetting: 0,
	uncrushabilitySetting: 0,
	resistanceFloors: [],
	areEnchantsGemsLocked: false,
	excludeUniqueGems: false,
	excludeJewelcraftingItems: false,
	excludeEnchantingItems: false,
	phase: 3,
	raceId: "1",
	classId: "2",
	talentSources: [],
	buffs: getBuffs(),
	abilitySources: [],
	enabledConsumableIds: CONSUMABLES.map((c) => c.id),
};

function profileWith(maxRounds: number, iterations: number) {
	return {
		...DEFAULT_SIM_CALIBRATION_PROFILE,
		calibration: {
			...DEFAULT_SIM_CALIBRATION_PROFILE.calibration,
			maxRounds,
			iterations,
		},
	};
}

describe.skipIf(!canRun)(
	"solveConfigForSimMetric convergence investigation",
	() => {
		// Always runs (when the wasm/db artifacts exist) - fast, and exists purely to catch this
		// file's Node-wasm mocking setup silently breaking (e.g. a future SimWorkerPool interface
		// change) long before anyone tries to use it for a real investigation run.
		it("harness sanity: the real wasm+LP pipeline runs end to end in Node", {
			timeout: 60_000,
		}, async () => {
			const diagnostics: import("./solveSimMetric").RoundDiagnostics[] = [];
			const result = await solveConfigForSimMetric(
				singleAltPool,
				baseOptions,
				PROT_PALADIN_BASELINE_GEAR,
				db,
				{ tps: 1 },
				profileWith(2, 50),
				undefined,
				undefined,
				(d) => diagnostics.push(d),
			);
			expect(result.items.length).toBeGreaterThan(0);
			expect(result.simMetrics.tps).toBeGreaterThan(0);
			expect(diagnostics.length).toBeGreaterThan(0);
			expect(diagnostics[0].roundIndex).toBe(0);
		});

		// Opt-in only - see this file's header comment. Run with:
		//   RUN_CONVERGENCE_INVESTIGATION=1 npx vitest run src/sim/convergenceInvestigation.test.ts
		describe.skipIf(!process.env.RUN_CONVERGENCE_INVESTIGATION)(
			"extended round-by-round investigation (opt-in, slow)",
			() => {
				const MAX_ROUNDS = Number(process.env.CONVERGENCE_MAX_ROUNDS ?? 15);
				const ITERATIONS = Number(process.env.CONVERGENCE_ITERATIONS ?? 300);
				// Optional substring filter so a follow-up run can re-check just the combinations
				// that didn't converge last time, without re-paying for the ones that already did.
				const COMBO_FILTER = process.env.CONVERGENCE_COMBO_FILTER;

				const allCombinations: Array<{
					name: string;
					pool: ReturnType<typeof parseItemInput>;
					metricRatios: Record<string, number>;
				}> = [
					{
						name: "tps / single-alt pool",
						pool: singleAltPool,
						metricRatios: { tps: 1 },
					},
					{
						name: "tps / multi-alt pool",
						pool: multiAltPool,
						metricRatios: { tps: 1 },
					},
					{
						name: "tmi / single-alt pool",
						pool: singleAltPool,
						metricRatios: { tmi: 1 },
					},
					{
						name: "tmi / multi-alt pool",
						pool: multiAltPool,
						metricRatios: { tmi: 1 },
					},
					{
						name: "balanced / multi-alt pool",
						pool: multiAltPool,
						metricRatios: metricRatiosForBalance(0.5, "tmi"),
					},
				];
				const comboFilterTerms = COMBO_FILTER?.split(",");
				const combinations = comboFilterTerms
					? allCombinations.filter((c) =>
							comboFilterTerms.some((term) => c.name.includes(term)),
						)
					: allCombinations;

				for (const combo of combinations) {
					it(combo.name, { timeout: 30 * 60_000 }, async () => {
						const diagnostics: import("./solveSimMetric").RoundDiagnostics[] =
							[];
						const result = await solveConfigForSimMetric(
							combo.pool,
							baseOptions,
							PROT_PALADIN_BASELINE_GEAR,
							db,
							combo.metricRatios,
							profileWith(MAX_ROUNDS, ITERATIONS),
							undefined,
							undefined,
							(d) => diagnostics.push(d),
						);

						console.log(
							`\n=== ${combo.name} (maxRounds=${MAX_ROUNDS}, iterations=${ITERATIONS}) ===`,
						);
						console.log(
							`converged=${result.converged}, iterations=${result.iterations}`,
						);
						console.table(
							diagnostics.map((d) => ({
								round: d.roundIndex,
								accepted: d.accepted,
								delta: d.delta?.toFixed(3),
								stdevDelta: d.stdevDelta?.toFixed(3),
								significant: d.significant,
								itemsChanged: d.itemsChangedCount,
								fixedYardstickDelta: d.fixedYardstickDelta.toFixed(3),
								weightNorm: d.weightVectorL2Norm.toFixed(3),
							})),
						);

						expect(result.items.length).toBeGreaterThan(0);
					});
				}
			},
		);
	},
);
