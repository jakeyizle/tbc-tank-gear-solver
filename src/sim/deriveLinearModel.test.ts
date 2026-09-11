// THE correctness claim of the sim-as-source-of-truth refactor, in one assertion:
//
//   model.base[axis] + sum over chosen items of scoreStats(item)[axis]  ===  computeStats(set)[axis]
//
// If that holds for arbitrary gear sets, then the LP is solving against the real game, because
// the LP's entire view of the world is a base vector plus a sum of per-item scores. If it does
// not, every constraint the solver enforces is a guess.
//
// It is also the cheapest way to catch the three failure modes this refactor invites, each of
// which is silent rather than loud:
//   - party buffs placed on Raid instead of Party (drops ~8 buffs, no error)
//   - sparse vs dense stat arrays crossing the proto boundary
//   - differencing across the defense floor (a measured slope that is simply wrong)
//
// Loads the wasm from disk and stubs loadWasm, because wasmCoordinator's fetch("/sim/...")
// has no base URL under plain Node/vitest - same approach as computeStats.integration.test.ts.
// `wasmGlobals` IS globalThis, so the instance loaded here is the one the client will call.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
	BLOCK_RATING_PER_BLOCK_PERCENT,
	DEFENSE_RATING_PER_DEFENSE_LEVEL,
	DODGE_RATING_PER_DODGE_PERCENT,
	MISS_DODGE_PARRY_BLOCK_CRIT_CHANCE_PER_DEFENSE,
	PARRY_RATING_PER_PARRY_PERCENT,
} from "#/data/mechanics";
import { type RawDbItem, toItem } from "#/data/tbcDatabase";
import {
	DISPLAY_BASE_MISS_PERCENT,
	debuffMissChance,
	HOLY_SHIELD_BLOCK_PERCENT,
	PSEUDO,
} from "#/helpers/characterStatsDisplay";
import { TEST_LINEAR_MODEL } from "#/solver/__fixtures__/testLinearModel";
import { axisTotals } from "#/solver/scores";
import type { Item, Stat } from "#/solver/types";
import type { LinearAxis, LinearStatModel } from "#/types/LinearStatModel";
import { DEFAULT_SIM_CALIBRATION_PROFILE } from "#/types/SimCalibrationProfile";
import "./wasm_exec.js";
import type { TbcUiDatabase } from "./buildStatWeightsRequest";
import { computeCharacterStats } from "./computeStatsClient";
import { deriveLinearModel } from "./deriveLinearModel";
import type { GearPiece } from "./toTbcItemSpec";

vi.mock("./wasmCoordinator", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./wasmCoordinator")>();
	return { ...actual, loadWasm: () => Promise.resolve() };
});

interface GoWasmGlobals {
	wasmready?: () => void;
	Go?: new () => {
		importObject: WebAssembly.Imports;
		run: (instance: WebAssembly.Instance) => Promise<void>;
	};
}

const root = path.resolve(__dirname, "../..");
const wasmGzPath = path.join(root, "public/sim/lib.wasm.gz");
const dbPath = path.join(root, "vendor/tbc-sim/assets/database/db.json");
const canRun = [wasmGzPath, dbPath].every(fs.existsSync);

const PROFILE = DEFAULT_SIM_CALIBRATION_PROFILE;

/** Deterministic PRNG - a flaky gear-set draw would make failures impossible to reproduce. */
function mulberry32(seed: number): () => number {
	let a = seed;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const FIXTURE_PATH = path.join(
	root,
	"src/solver/__fixtures__/testLinearModel.ts",
);

function writeLinearModelFixture(value: LinearStatModel): void {
	const banner = `// GENERATED - do not edit by hand.
//
// A snapshot of src/sim/deriveLinearModel.ts's output for DEFAULT_SIM_CALIBRATION_PROFILE,
// so that src/solver/'s unit tests can exercise real coefficients without loading the 5.5MB
// wasm sim. Regenerate with:
//
//   UPDATE_LINEAR_MODEL_FIXTURE=1 npx vitest run src/sim/deriveLinearModel.test.ts
//
// deriveLinearModel.test.ts fails if this drifts from what the sim actually produces.
import type { LinearStatModel } from "#/types/LinearStatModel";

export const TEST_LINEAR_MODEL: LinearStatModel = `;
	fs.writeFileSync(
		FIXTURE_PATH,
		`${banner}${JSON.stringify(value, null, "\t")};\n`,
		"utf8",
	);
}

function toGearPiece(item: Item): GearPiece {
	// No gems and no enchant: this harness is about the coefficient matrix, so the gear sets
	// are kept to plain items whose stats are exactly `toItem(raw).stats`. Socket bonuses and
	// enchants are ordinary additive stats and ride the same code path.
	return { id: item.id, enchant: { id: "" }, gemSlots: [] };
}

let db: TbcUiDatabase;
let model: LinearStatModel;
/** Usable items grouped by the slot they occupy, so a drawn set is actually equippable. */
let bySlot: Map<string, Item[]>;

describe.skipIf(!canRun)("deriveLinearModel", () => {
	beforeAll(async () => {
		db = JSON.parse(fs.readFileSync(dbPath, "utf8")) as TbcUiDatabase;

		const globals = globalThis as unknown as GoWasmGlobals;
		await new Promise<void>((resolve) => {
			globals.wasmready = () => resolve();
			if (!globals.Go) throw new Error("wasm_exec.js did not register Go");
			const go = new globals.Go();
			WebAssembly.instantiate(
				zlib.gunzipSync(fs.readFileSync(wasmGzPath)),
				go.importObject,
			).then((result) => go.run(result.instance));
		});

		bySlot = new Map();
		for (const raw of db.items as unknown as RawDbItem[]) {
			const item = toItem(raw);
			if (!item || item.stats.length === 0) continue;
			// Two-handers cannot coexist with a shield, and an uncrushable tank always has one.
			if (item.handType === "TwoHand") continue;
			const slot =
				item.type === "Weapon"
					? item.weaponType === "Shield"
						? "Shield"
						: item.handType === "OffHand"
							? "OffHandNonShield"
							: "MainHand"
					: item.type;
			const bucket = bySlot.get(slot);
			if (bucket) bucket.push(item);
			else bySlot.set(slot, [item]);
		}
		for (const bucket of bySlot.values()) bucket.sort((a, b) => +a.id - +b.id);

		model = await deriveLinearModel(db, PROFILE);
	}, 600_000);

	// The solver's own unit tests cannot load the wasm (and should not have to - they are about
	// LP behaviour, not game mechanics), so they run against a committed snapshot of this
	// model. This keeps that snapshot honest: if the sim, the profile defaults or the
	// derivation change, this fails and the fixture must be regenerated.
	//
	//   UPDATE_LINEAR_MODEL_FIXTURE=1 npx vitest run src/sim/deriveLinearModel.test.ts
	it("agrees with the committed fixture the solver tests run against", () => {
		if (process.env.UPDATE_LINEAR_MODEL_FIXTURE) {
			writeLinearModelFixture(model);
			return;
		}
		expect(JSON.parse(JSON.stringify(model))).toEqual(
			JSON.parse(JSON.stringify(TEST_LINEAR_MODEL)),
		);
	});

	it("measures the sim's own stat dependencies as coefficients", () => {
		// vendor/tbc-sim/sim/paladin/paladin.go:118-128 and character.go:272-273. Nothing in
		// src/ states these; they fall out of differencing the real character build.
		//
		// Ratios, not absolutes: the profile's Blessing of Kings multiplies Strength/Agility/
		// Stamina by 1.1, and the coefficients correctly carry that multiplier (bonus_stats
		// join the character at the GEAR phase - character.go:277 - so buffs apply to them
		// exactly as they apply to an item's stats). That is the whole reason a measured model
		// beats a hand-written one: the buff never has to be modelled twice.
		const strength = model.coefficients.Strength?.Strength ?? 0;
		const agility = model.coefficients.Agility?.Agility ?? 0;
		const stamina = model.coefficients.Stamina?.Stamina ?? 0;
		expect(strength).toBeGreaterThan(1);

		expect(model.coefficients.Strength?.AttackPower).toBeCloseTo(
			2 * strength,
			3,
		);
		expect(model.coefficients.Strength?.BlockValue).toBeCloseTo(
			strength / 20,
			3,
		);
		// Armor carries a second multiplier of its own (Toughness), on top of Kings' effect on
		// the Agility that feeds it - so the expected value is the product of the two measured
		// coefficients, not a constant. Hand-written stat code had to know about both; this
		// does not.
		const armorMultiplier = model.coefficients.Armor?.Armor ?? 0;
		expect(armorMultiplier).toBeGreaterThan(1);
		expect(model.coefficients.Agility?.Armor).toBeCloseTo(
			2 * agility * armorMultiplier,
			3,
		);
		expect(model.coefficients.Agility?.Dodge).toBeCloseTo(
			(agility / 25) * DODGE_RATING_PER_DODGE_PERCENT,
			3,
		);
		expect(model.coefficients.Stamina?.Health).toBeCloseTo(10 * stamina, 3);
		// BonusArmor feeds Armor 1:1 (paladin.go:129) and then rides the same Armor multiplier,
		// because the vendored sim implements Toughness as MultiplyStat(stats.Armor, ...)
		// (paladin/talents.go:468) rather than as a multiplier on item armor only. Retail TBC
		// exempted bonus armor; this sim does not, and the sim is the source of truth here.
		// Pinned so that a future vendor bump changing it shows up as a failure, not a drift.
		expect(model.coefficients.BonusArmor?.Armor).toBeCloseTo(
			armorMultiplier,
			3,
		);
		// It stays its own axis regardless: the sim reports the two stats separately, so a
		// stat weight on one must not be applied to the other.
		expect(model.coefficients.BonusArmor?.BonusArmor).toBeCloseTo(1, 3);
		expect(model.coefficients.Armor?.BonusArmor ?? 0).toBeCloseTo(0, 6);
	});

	it("converts avoidance rating at the flat TBC rates, with no diminishing returns", () => {
		expect(model.coefficients.Dodge?.Avoidance).toBeCloseTo(
			1 / DODGE_RATING_PER_DODGE_PERCENT,
			6,
		);
		expect(model.coefficients.Parry?.Avoidance).toBeCloseTo(
			1 / PARRY_RATING_PER_PARRY_PERCENT,
			6,
		);
		expect(model.coefficients.Block?.Avoidance).toBeCloseTo(
			1 / BLOCK_RATING_PER_BLOCK_PERCENT,
			6,
		);
		// Block is the one avoidance type Illidan's Shear ignores... no: Shear ignores MISS.
		// Block counts for both, so the two axes agree on every non-defense stat.
		expect(model.coefficients.Block?.ShearAvoidance).toBeCloseTo(
			model.coefficients.Block?.Avoidance ?? 0,
			9,
		);
	});

	it("keeps defense analytic and unrounded, per the LP additivity invariant", () => {
		expect(model.coefficients.Defense).toBeUndefined();
		expect(model.defense.perPoint.Avoidance).toBeCloseTo(0.16, 9);
		expect(model.defense.perPoint.ShearAvoidance).toBeCloseTo(0.12, 9);
		expect(model.defense.perPoint.Uncritability).toBeCloseTo(0.04, 9);

		// floor(a + b) !== floor(a) + floor(b): two items of 2 defense rating each are worth a
		// whole defense point together and nothing apart. The unrounded per-item rate is what
		// lets the LP see that.
		const twoRating: Stat[] = [{ name: "Defense", value: 2, type: "flat" }];
		const perItem = axisTotals(twoRating, model, ["Avoidance"]).Avoidance ?? 0;
		const assembled =
			axisTotals(
				[{ name: "Defense", value: 4, type: "flat" }],
				model,
				["Avoidance"],
				{ roundDefense: true },
			).Avoidance ?? 0;
		expect(perItem * 2).toBeGreaterThan(0);
		expect(assembled).toBeCloseTo(0.16, 9);
	});

	it("recovers the class's base block chance despite the no-gear probe having no shield", () => {
		// A Protection Paladin's base avoidance, in the character-panel convention, is built
		// from PseudoStats the sim reports (paladin.go:107-109) - nothing in src/ states it.
		// Block's is the one that needs recovering: character.go:716 reports 0% block unless a
		// shield is equipped, and the probe character wears nothing.
		expect(model.base.ShearAvoidance ?? 0).toBeGreaterThan(
			HOLY_SHIELD_BLOCK_PERCENT,
		);
		// The whole difference between the two axes is miss, which is not a pseudo-stat.
		expect(model.base.Avoidance ?? 0).toBeCloseTo(
			(model.base.ShearAvoidance ?? 0) + (model.base.Miss ?? 0),
			6,
		);
		// Base miss is the panel's 5, plus the profile's own miss debuffs, plus defense.
		expect(model.base.Miss ?? 0).toBeGreaterThanOrEqual(
			DISPLAY_BASE_MISS_PERCENT,
		);
	});

	describe("equality harness", () => {
		const SETS = 5;
		const SLOTS = [
			"Head",
			"Neck",
			"Shoulder",
			"Back",
			"Chest",
			"Wrist",
			"Hands",
			"Waist",
			"Legs",
			"Feet",
			"Finger",
			"Trinket",
			"MainHand",
			"Shield",
			"Ranged",
		];

		function drawSet(seed: number): Item[] {
			const random = mulberry32(seed);
			const picked: Item[] = [];
			for (const slot of SLOTS) {
				const bucket = bySlot.get(slot);
				if (!bucket || bucket.length === 0) continue;
				picked.push(bucket[Math.floor(random() * bucket.length)]);
			}
			return picked;
		}

		for (let seed = 1; seed <= SETS; seed++) {
			it(`predicts the sim's own stats for gear set #${seed}`, async () => {
				const set = drawSet(seed);
				const stats: Stat[] = set.flatMap((item) => item.stats);
				const axes: LinearAxis[] = [
					"Avoidance",
					"ShearAvoidance",
					"Uncritability",
					"Armor",
					"Health",
					"ArcaneResistance",
					"FireResistance",
					"FrostResistance",
					"NatureResistance",
					"ShadowResistance",
				];
				const predicted = axisTotals(stats, model, axes, {
					roundDefense: true,
				});

				const actual = (
					await computeCharacterStats(set.map(toGearPiece), db, PROFILE)
				).final;

				// Read straight off the sim, deliberately NOT through deriveLinearModel's own
				// axisValues - a harness that reuses the code under test proves nothing.
				const pseudoAvoidance =
					(actual.pseudoStats[PSEUDO.DodgePercent] ?? 0) +
					(actual.pseudoStats[PSEUDO.ParryPercent] ?? 0) +
					(actual.pseudoStats[PSEUDO.BlockPercent] ?? 0);
				// Miss is not a pseudo-stat: the panel builds it as base + defense skill * 0.04
				// (characterStatsDisplay.missChanceInfo). Defense's fourth avoidance type has to
				// be added by hand here, which is exactly why the model's defense coefficient is
				// 0.16 and not 0.12.
				const missPercent =
					DISPLAY_BASE_MISS_PERCENT +
					debuffMissChance(
						PROFILE.raidProfile.debuffs as {
							scorpidSting?: boolean;
							insectSwarm?: boolean;
						},
					) +
					Math.floor(
						(actual.stats[25] ?? 0) / DEFENSE_RATING_PER_DEFENSE_LEVEL,
					) *
						MISS_DODGE_PARRY_BLOCK_CRIT_CHANCE_PER_DEFENSE;

				// Holy Shield is an active aura, not a stat, so it is absent from pseudoStats
				// and the model adds it to the base by hand (see deriveLinearModel's
				// baseAvoidanceParts). Added here too, or the two sides are measuring
				// different characters.
				const expected: Record<string, number> = {
					Avoidance: pseudoAvoidance + missPercent + HOLY_SHIELD_BLOCK_PERCENT,
					ShearAvoidance: pseudoAvoidance + HOLY_SHIELD_BLOCK_PERCENT,
					Uncritability:
						actual.pseudoStats[PSEUDO.ReducedCritTakenPercent] ?? 0,
					Armor: actual.stats[31] ?? 0,
					Health: actual.stats[33] ?? 0,
					ArcaneResistance: actual.stats[36] ?? 0,
					FireResistance: actual.stats[37] ?? 0,
					FrostResistance: actual.stats[38] ?? 0,
					NatureResistance: actual.stats[39] ?? 0,
					ShadowResistance: actual.stats[40] ?? 0,
				};

				for (const axis of axes) {
					const got = (model.base[axis] ?? 0) + (predicted[axis] ?? 0);
					// The sim floors Strength/Agility/Stamina/Intellect/Spirit AFTER applying
					// buff multipliers (stats.go:310, character.go:281), so a linear prediction
					// can sit up to one point of each above what the sim reports - and those
					// points feed Armor (Agility x2), Health (Stamina x10) and dodge rating
					// (Agility /25). That residual is inherent quantization, not model error;
					// runLPModelWithAvoidanceConvergence is what closes it for real solves.
					const tolerance = ({
						Armor: 2.001,
						Health: 10.001,
						Avoidance: 0.05,
						ShearAvoidance: 0.05,
					}[axis as string] ?? 1e-6) as number;
					expect(
						Math.abs(got - expected[axis]),
						`${axis}: predicted ${got}, sim reported ${expected[axis]}`,
					).toBeLessThanOrEqual(tolerance);
				}
			}, 120_000);
		}
	});
});
