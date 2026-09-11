// Guards a LOCAL PATCH to the vendored sim: vendor/tbc-sim/sim/core/unit.go's
// GetTotalChanceToBeMissedAsDefender had no GetDefenseReduction() term, so defense rating
// bought dodge, parry and block in combat but no miss at all.
//
// In TBC, defense skill grants 0.04% to each of the four per point over the attacker's
// weapon skill. Unpatched, this test measured +100 defense skill moving dodge +4.00 and
// parry +4.09 but miss +0.02, understating a geared prot paladin's avoidance by ~6 points
// (baseline miss 5.98% patched to 11.97%) - which over-reported DTPS/TMI and under-valued
// Defense Rating in every stat weight the app derived.
//
// If someone re-vendors the sim and loses the patch, this fails.
//
// Method: run the same raid sim twice, the second time injecting exactly 100 defense SKILL
// (100 * DefenseRatingPerDefenseLevel = 236.5385 rating) via Player.bonus_stats, and count
// the boss's incoming melee outcomes against the tank. All four avoidance types must move
// together by ~4.00 points.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { DEFAULT_SIM_CALIBRATION_PROFILE } from "#/types/SimCalibrationProfile";
import { buildStatWeightsRequest } from "./buildStatWeightsRequest";
import type { GearPiece } from "./toTbcItemSpec";
import "./wasm_exec.js";
import {
	RaidSimRequest,
	RaidSimResult,
	StatWeightRequestsData,
	StatWeightsRequest,
} from "./proto/api.js";

const root = path.resolve(__dirname, "../..");
const wasmGzPath = path.join(root, "public/sim/lib.wasm.gz");
const dbPath = path.join(root, "vendor/tbc-sim/assets/database/db.json");
const gearPath = path.join(
	root,
	"vendor/tbc-sim/ui/paladin/protection/gear_sets/p3.gear.json",
);
const canRun = [wasmGzPath, dbPath, gearPath].every(fs.existsSync);

const DEFENSE_RATING_PER_LEVEL = 2.365385;
const ADDED_DEFENSE_SKILL = 100;
const ADDED_DEFENSE_RATING = ADDED_DEFENSE_SKILL * DEFENSE_RATING_PER_LEVEL;
const DEFENSE_RATING_STAT_INDEX = 25;

function buildRequest(bonusDefenseRating: number) {
	const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
	const gearJson = JSON.parse(fs.readFileSync(gearPath, "utf8")).items as {
		id: number;
		enchant?: number;
		gems?: number[];
	}[];
	const gear = gearJson.map((i) => ({
		id: String(i.id),
		enchant: { id: i.enchant ? String(i.enchant) : "" },
		gemSlots: (i.gems ?? []).map(String),
	})) as GearPiece[];

	// biome-ignore lint/suspicious/noExplicitAny: proto JSON
	const json = buildStatWeightsRequest(
		gear,
		db,
		["Stamina", "Armor", "Dodge", "Defense"],
		200,
		DEFAULT_SIM_CALIBRATION_PROFILE,
		"1",
	) as any;

	if (bonusDefenseRating > 0) {
		// Must be the FULL 42-long proto.Stat array - the Go side indexes it positionally and
		// panics on a short one rather than treating missing entries as zero.
		const dense = new Array(42).fill(0);
		dense[DEFENSE_RATING_STAT_INDEX] = bonusDefenseRating;
		json.player.bonusStats = { stats: dense };
	}
	return StatWeightsRequest.toBinary(
		StatWeightsRequest.fromJson(json, { ignoreUnknownFields: true }),
	);
}

describe.skipIf(!canRun)(
	"does defense rating give miss in the sim's combat?",
	() => {
		it("measures incoming melee outcomes with and without +100 defense skill", async () => {
			const g = globalThis as Record<string, unknown>;
			await new Promise<void>((resolve) => {
				g.wasmready = () => resolve();
				// biome-ignore lint/suspicious/noExplicitAny: wasm_exec global
				const go = new (g as any).Go();
				WebAssembly.instantiate(
					zlib.gunzipSync(fs.readFileSync(wasmGzPath)),
					go.importObject,
				).then((r) => go.run(r.instance));
			});

			const run = (bonus: number) => {
				// statWeightRequests assembles a proper RaidSimRequest from a StatWeightsRequest.
				// biome-ignore lint/suspicious/noExplicitAny: wasm_exec global
				const data = StatWeightRequestsData.fromBinary(
					(g as any).statWeightRequests(buildRequest(bonus)),
				);
				const base = data.baseRequest as RaidSimRequest;
				// biome-ignore lint/suspicious/noExplicitAny: wasm_exec global
				const result = RaidSimResult.fromBinary(
					(g as any).raidSim(RaidSimRequest.toBinary(base)),
				);

				const totals = {
					misses: 0,
					dodges: 0,
					parries: 0,
					blocks: 0,
					crushes: 0,
					hits: 0,
					crits: 0,
					glances: 0,
				};
				for (const target of result.encounterMetrics?.targets ?? []) {
					for (const action of target.actions ?? []) {
						for (const t of action.targets ?? []) {
							totals.misses += t.misses;
							totals.dodges += t.dodges;
							totals.parries += t.parries;
							totals.blocks += t.blocks;
							totals.crushes += t.crushes;
							totals.hits += t.hits;
							totals.crits += t.crits;
							totals.glances += t.glances;
						}
					}
				}
				const swings = Object.values(totals).reduce((a, b) => a + b, 0);
				return { totals, swings };
			};

			const before = run(0);
			const after = run(ADDED_DEFENSE_RATING);

			const pct = (n: number, d: number) => (d ? (n / d) * 100 : 0);
			const lines = [
				`swings: ${before.swings} -> ${after.swings}`,
				`${"outcome".padEnd(10)}${"before%".padStart(10)}${"after%".padStart(10)}${"delta".padStart(10)}`,
			];
			for (const key of Object.keys(
				before.totals,
			) as (keyof typeof before.totals)[]) {
				const b = pct(before.totals[key], before.swings);
				const a = pct(after.totals[key], after.swings);
				lines.push(
					`${key.padEnd(10)}${b.toFixed(2).padStart(10)}${a.toFixed(2).padStart(10)}${(a - b).toFixed(2).padStart(10)}`,
				);
			}
			const expectedDelta = ADDED_DEFENSE_SKILL * 0.04;
			lines.push("");
			lines.push(
				`EXPECTED delta for all four avoidance types: +${expectedDelta.toFixed(2)}`,
			);
			console.log(lines.join("\n"));

			// Sampling tolerance: ~9.5k swings gives a standard error near 0.4 points on a rate
			// in this range, so allow 1.5 points and still catch the unpatched behaviour, which
			// left miss flat at +0.02.
			const tolerance = 1.5;
			const delta = (key: keyof typeof before.totals) =>
				pct(after.totals[key], after.swings) -
				pct(before.totals[key], before.swings);

			expect(delta("misses")).toBeGreaterThan(expectedDelta - tolerance);
			expect(delta("dodges")).toBeGreaterThan(expectedDelta - tolerance);
			expect(delta("parries")).toBeGreaterThan(expectedDelta - tolerance);
		}, 600000);
	},
);
