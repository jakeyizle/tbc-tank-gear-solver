// Real end-to-end check against the vendored WASM sim: builds a request for the P3
// Protection Paladin preset via the production buildStatWeightsRequest/buildSimDatabase
// path, calls the actual statWeights() wasm export, and asserts the returned weights are
// directionally sane. This is the Phase 0 feasibility spike's logic, kept as permanent
// regression coverage instead of a throwaway script — a submodule bump or proto schema
// change that breaks the integration will show up here.
//
// Loads the wasm module by reading public/sim/lib.wasm directly from disk rather than
// through statWeightsClient.ts's fetch("/sim/lib.wasm") - that relative fetch has no base
// URL to resolve against under plain Node/vitest (it works in the browser worker context
// statWeightsClient.ts actually ships in), so this test exercises the same wasm_exec.js
// loading sequence by hand instead.
//
// Skipped automatically if the submodule/wasm artifact aren't present (e.g. a checkout that
// hasn't run `git submodule update --init` and `npm run sim:build-wasm` yet).
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildStatWeightsRequest } from "./buildStatWeightsRequest";
import type { GearPiece } from "./toTbcItemSpec";
import "./wasm_exec.js";
import {
	ProgressMetrics,
	StatWeightsRequest,
	StatWeightsResult,
} from "./proto/api.js";

interface GoWasmGlobals {
	wasmready?: () => void;
	statWeights?: (requestBytes: Uint8Array) => Uint8Array;
	statWeightsAsync?: (
		requestBytes: Uint8Array,
		onProgress: (progressBytes: Uint8Array) => void,
		requestId: string,
	) => void;
	Go?: new () => {
		importObject: WebAssembly.Imports;
		run: (instance: WebAssembly.Instance) => Promise<void>;
	};
}

/** Loads a fresh, independent wasm instance and resolves once it signals ready. */
async function loadFreshWasmInstance(): Promise<GoWasmGlobals> {
	const wasmGlobals = globalThis as unknown as GoWasmGlobals;
	await new Promise<void>((resolve) => {
		wasmGlobals.wasmready = () => resolve();
		if (!wasmGlobals.Go)
			throw new Error("wasm_exec.js did not register globalThis.Go");
		const go = new wasmGlobals.Go();
		WebAssembly.instantiate(fs.readFileSync(wasmPath), go.importObject).then(
			(result) => go.run(result.instance),
		);
	});
	return wasmGlobals;
}

const root = path.resolve(__dirname, "../..");
const wasmPath = path.join(root, "public/sim/lib.wasm");
const wasmExecPath = path.join(root, "src/sim/wasm_exec.js");
const dbPath = path.join(root, "vendor/tbc-sim/assets/database/db.json");
const gearPath = path.join(
	root,
	"vendor/tbc-sim/ui/paladin/protection/gear_sets/p3.gear.json",
);

const canRun = [wasmPath, wasmExecPath, dbPath, gearPath].every(fs.existsSync);

function fakeItem(
	id: string,
	enchantId?: string,
	gemSlots: string[] = [],
): GearPiece {
	return { id, enchant: { id: enchantId ?? "" }, gemSlots };
}

/** Builds the same P3 Protection Paladin request bytes both tests below calibrate against. */
function buildTestRequestBytes(): Uint8Array {
	const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
	const gearJson = JSON.parse(fs.readFileSync(gearPath, "utf8")).items as {
		id: number;
		enchant?: number;
		gems?: number[];
	}[];
	const gear = gearJson.map((i) =>
		fakeItem(
			String(i.id),
			i.enchant ? String(i.enchant) : undefined,
			(i.gems ?? []).map(String),
		),
	);

	const requestJson = buildStatWeightsRequest(
		gear,
		db,
		["Stamina", "Armor", "Dodge", "Defense"],
		200,
	);
	const request = StatWeightsRequest.fromJson(
		requestJson as unknown as Parameters<typeof StatWeightsRequest.fromJson>[0],
		{ ignoreUnknownFields: true },
	);
	return StatWeightsRequest.toBinary(request);
}

// tbc-new proto.Stat ordinals (common.proto): Stamina=2, DefenseRating=25, DodgeRating=28, Armor=31.
const [STAMINA, DEFENSE, DODGE, ARMOR] = [2, 25, 28, 31];

describe.skipIf(!canRun)("statWeights wasm integration", () => {
	it("returns directionally-correct TMI/DTPS weights for the P3 Protection Paladin preset", async () => {
		const requestBytes = buildTestRequestBytes();

		const wasmGlobals = await loadFreshWasmInstance();
		if (!wasmGlobals.statWeights)
			throw new Error("statWeights global not registered");
		const resultBytes = wasmGlobals.statWeights(requestBytes);

		const result = StatWeightsResult.fromBinary(resultBytes);
		expect(result.error).toBeUndefined();

		for (const idx of [STAMINA, DEFENSE, DODGE, ARMOR]) {
			expect(result.tmi?.weights?.stats[idx]).toBeLessThanOrEqual(0);
			expect(result.dtps?.weights?.stats[idx]).toBeLessThanOrEqual(0);
		}
	}, 30000);

	it("statWeightsAsync reports progress before resolving, and agrees with the sync result", async () => {
		const requestBytes = buildTestRequestBytes();

		const wasmGlobals = await loadFreshWasmInstance();
		if (!wasmGlobals.statWeightsAsync)
			throw new Error("statWeightsAsync global not registered");
		const statWeightsAsync = wasmGlobals.statWeightsAsync;

		const progressMessages: ProgressMetrics[] = [];
		const result = await new Promise<StatWeightsResult>((resolve) => {
			statWeightsAsync(
				requestBytes,
				(progressBytes) => {
					const metrics = ProgressMetrics.fromBinary(progressBytes);
					if (metrics.finalWeightResult) {
						resolve(metrics.finalWeightResult);
					} else {
						progressMessages.push(metrics);
					}
				},
				crypto.randomUUID(),
			);
		});

		expect(result.error).toBeUndefined();
		expect(progressMessages.length).toBeGreaterThan(0);
		// progress is cumulative across the whole calibration batch - should trend upward.
		expect(progressMessages.at(-1)?.completedIterations).toBeGreaterThan(0);

		for (const idx of [STAMINA, DEFENSE, DODGE, ARMOR]) {
			expect(result.tmi?.weights?.stats[idx]).toBeLessThanOrEqual(0);
			expect(result.dtps?.weights?.stats[idx]).toBeLessThanOrEqual(0);
		}
	}, 30000);
});
