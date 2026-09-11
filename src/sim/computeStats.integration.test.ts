// Real end-to-end check of the computeStats path against the vendored WASM sim.
//
// This is the Phase 1 gate for making the sim authoritative for character stats: it builds a
// ComputeStatsRequest through the production buildComputeStatsRequest path, calls the actual
// wasm export, and asserts the result is structurally what the stats panel will rely on.
//
// The highest-value assertion here is the PARTY BUFFS one. ComputeStatsRequest nests
// everything in a proto.Raid, where party buffs belong to Party and raid buffs to Raid -
// and misplacing them does not error, it silently drops the buffs. That is precisely the
// class of bug that made the app's numbers disagree with wowsims in the first place.
//
// Loads the wasm from disk (gunzipping by hand) rather than through wasmCoordinator's
// fetch("/sim/lib.wasm.gz"), which has no base URL to resolve under plain Node/vitest -
// same approach as statWeights.integration.test.ts.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { DEFAULT_SIM_CALIBRATION_PROFILE } from "#/types/SimCalibrationProfile";
import { buildComputeStatsRequest } from "./buildComputeStatsRequest";
import type { GearPiece } from "./toTbcItemSpec";
import "./wasm_exec.js";
import { ComputeStatsRequest, ComputeStatsResult } from "./proto/api.js";

interface GoWasmGlobals {
	wasmready?: () => void;
	computeStats?: (requestBytes: Uint8Array) => Uint8Array;
	Go?: new () => {
		importObject: WebAssembly.Imports;
		run: (instance: WebAssembly.Instance) => Promise<void>;
	};
}

const root = path.resolve(__dirname, "../..");
const wasmGzPath = path.join(root, "public/sim/lib.wasm.gz");
const wasmExecPath = path.join(root, "src/sim/wasm_exec.js");
const dbPath = path.join(root, "vendor/tbc-sim/assets/database/db.json");
const gearPath = path.join(
	root,
	"vendor/tbc-sim/ui/paladin/protection/gear_sets/p3.gear.json",
);

const canRun = [wasmGzPath, wasmExecPath, dbPath, gearPath].every(
	fs.existsSync,
);

async function loadFreshWasmInstance(): Promise<GoWasmGlobals> {
	const wasmGlobals = globalThis as unknown as GoWasmGlobals;
	await new Promise<void>((resolve) => {
		wasmGlobals.wasmready = () => resolve();
		if (!wasmGlobals.Go)
			throw new Error("wasm_exec.js did not register globalThis.Go");
		const go = new wasmGlobals.Go();
		WebAssembly.instantiate(
			zlib.gunzipSync(fs.readFileSync(wasmGzPath)),
			go.importObject,
		).then((result) => go.run(result.instance));
	});
	return wasmGlobals;
}

function loadP3Gear(): GearPiece[] {
	const gearJson = JSON.parse(fs.readFileSync(gearPath, "utf8")).items as {
		id: number;
		enchant?: number;
		gems?: number[];
	}[];
	return gearJson.map((i) => ({
		id: String(i.id),
		enchant: { id: i.enchant ? String(i.enchant) : "" },
		gemSlots: (i.gems ?? []).map(String),
	})) as GearPiece[];
}

async function runComputeStats(requestJson: object) {
	const wasmGlobals = await loadFreshWasmInstance();
	if (!wasmGlobals.computeStats) {
		throw new Error(
			"computeStats global was not registered by the wasm module",
		);
	}
	const bytes = ComputeStatsRequest.toBinary(
		ComputeStatsRequest.fromJson(
			requestJson as Parameters<typeof ComputeStatsRequest.fromJson>[0],
			{ ignoreUnknownFields: true },
		),
	);
	const result = ComputeStatsResult.fromBinary(wasmGlobals.computeStats(bytes));
	expect(result.errorResult).toBeFalsy();
	const playerStats = result.raidStats?.parties?.[0]?.players?.[0];
	if (!playerStats) throw new Error("no player stats returned");
	return playerStats;
}

// proto.Stat ordinals (common.proto)
const STAMINA = 2;
const SPELL_DAMAGE = 5;
const STRENGTH = 0;
const AGILITY = 1;
const ARMOR = 31;
const HEALTH = 33;
// proto.PseudoStat ordinals (common.proto:260-292)
const DODGE_PCT = 4;
const PARRY_PCT = 5;
const BLOCK_PCT = 16;
const REDUCED_CRIT_TAKEN_PCT = 26;

describe.skipIf(!canRun)("computeStats wasm integration", () => {
	it("returns a cumulative per-build-phase stat breakdown", async () => {
		const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
		const request = buildComputeStatsRequest(
			loadP3Gear(),
			db,
			DEFAULT_SIM_CALIBRATION_PROFILE,
		);
		const stats = await runComputeStats(request);

		const base = stats.baseStats?.stats ?? [];
		const gear = stats.gearStats?.stats ?? [];
		const final = stats.finalStats?.stats ?? [];

		// Every phase must report a full dense stat array.
		expect(base.length).toBeGreaterThan(35);
		expect(final.length).toBe(base.length);

		// Cumulative, not deltas: gear includes base, final includes everything.
		expect(gear[STAMINA]).toBeGreaterThan(base[STAMINA]);
		expect(final[STAMINA]).toBeGreaterThanOrEqual(gear[STAMINA]);
		expect(final[ARMOR]).toBeGreaterThan(base[ARMOR]);

		// Health is derived from Stamina via a stat dependency (character.go:272), so it must
		// be present in the final vector even though no item grants it directly.
		expect(final[HEALTH]).toBeGreaterThan(1000);
	});

	it("exposes avoidance and crit-immunity directly as pseudo-stats", async () => {
		const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
		const request = buildComputeStatsRequest(
			loadP3Gear(),
			db,
			DEFAULT_SIM_CALIBRATION_PROFILE,
		);
		const stats = await runComputeStats(request);
		const pseudo = stats.finalStats?.pseudoStats ?? [];

		// These four are the app's uncrushable/uncrittable quantities, computed by the sim
		// (defense floor included) rather than reimplemented in helpers/stats.ts.
		for (const index of [
			DODGE_PCT,
			PARRY_PCT,
			BLOCK_PCT,
			REDUCED_CRIT_TAKEN_PCT,
		]) {
			expect(Number.isFinite(pseudo[index])).toBe(true);
		}
		// A geared prot paladin: each of these is a meaningful, sane percentage.
		expect(pseudo[DODGE_PCT]).toBeGreaterThan(5);
		expect(pseudo[DODGE_PCT]).toBeLessThan(60);
		expect(pseudo[PARRY_PCT]).toBeGreaterThan(5);
		expect(pseudo[BLOCK_PCT]).toBeGreaterThan(5);
		// Crit immunity needs 5.6% against a boss; the P3 preset is built to clear it.
		expect(pseudo[REDUCED_CRIT_TAKEN_PCT]).toBeGreaterThan(5);
	});

	// The regression guard that matters: party buffs live on Party.buffs, raid buffs on
	// Raid.buffs. If buildComputeStatsRequest put party buffs on the Raid, the sim would
	// silently ignore them and this test would see identical stats either way.
	it("actually applies raid, party and individual buffs", async () => {
		const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
		const gear = loadP3Gear();

		const buffed = await runComputeStats(
			buildComputeStatsRequest(gear, db, DEFAULT_SIM_CALIBRATION_PROFILE),
		);

		const stripped = {
			...DEFAULT_SIM_CALIBRATION_PROFILE,
			raidProfile: {
				...DEFAULT_SIM_CALIBRATION_PROFILE.raidProfile,
				raidBuffs: {},
				partyBuffs: {},
				individualBuffs: {},
				consumables: {},
			},
		} as typeof DEFAULT_SIM_CALIBRATION_PROFILE;
		const naked = await runComputeStats(
			buildComputeStatsRequest(gear, db, stripped),
		);

		const buffedStats = buffed.finalStats?.stats ?? [];
		const nakedStats = naked.finalStats?.stats ?? [];

		// Buffs must move the primary attributes the default profile actually grants
		// (Gift of the Wild, Blessing of Kings, Str/Agi scrolls, ...).
		expect(buffedStats[STRENGTH]).toBeGreaterThan(nakedStats[STRENGTH]);
		expect(buffedStats[AGILITY]).toBeGreaterThan(nakedStats[AGILITY]);
		expect(buffedStats[STAMINA]).toBeGreaterThan(nakedStats[STAMINA]);
		expect(buffedStats[SPELL_DAMAGE]).toBeGreaterThan(nakedStats[SPELL_DAMAGE]);
	});
});
