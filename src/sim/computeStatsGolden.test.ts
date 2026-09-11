// Golden test: a real character, with a real buff selection, against numbers read off the
// wowsims.github.io/tbc character panel for that exact setup.
//
// This is the strongest guarantee in the repo that the app and wowsims agree. If someone
// changes request assembly, buff placement, the item adapter, or the vendored sim, and the
// two stop agreeing, this fails with the specific stat that drifted.
//
// Provenance: the gear string, talents and buff selection below were supplied by the app's
// author from a live wowsims session, along with a screenshot of the resulting character
// panel (the EXPECTED values). See computeStats.integration.test.ts for the structural
// assertions; this file is about exact numeric agreement.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { DEFAULT_SIM_CALIBRATION_PROFILE } from "#/types/SimCalibrationProfile";
import { buildComputeStatsRequest } from "./buildComputeStatsRequest";
import type { GearPiece } from "./toTbcItemSpec";
import "./wasm_exec.js";
import { ComputeStatsRequest, ComputeStatsResult } from "./proto/api.js";

const root = path.resolve(__dirname, "../..");
const wasmGzPath = path.join(root, "public/sim/lib.wasm.gz");
const dbPath = path.join(root, "vendor/tbc-sim/assets/database/db.json");
const canRun = [wasmGzPath, dbPath].every(fs.existsSync);

const GEAR: { id: number; enchant?: number; gems?: number[] }[] = [
	{ id: 30125, enchant: 3002, gems: [24056, 25896] },
	{ id: 30007 },
	{ id: 30998, enchant: 2991, gems: [32200, 32200] },
	{ id: 28766, enchant: 2622 },
	{ id: 30991, enchant: 2659, gems: [24033, 24033, 24033] },
	{ id: 32232, enchant: 2649 },
	{ id: 30985, enchant: 2613, gems: [32200] },
	{ id: 30034, gems: [24033, 24033] },
	{ id: 30995, enchant: 2748, gems: [24033] },
	{ id: 32268, enchant: 2649, gems: [24033, 24033] },
	{ id: 29172, enchant: 2928 },
	{ id: 30083, enchant: 2928 },
	{ id: 30447 },
	{ id: 29370 },
	{ id: 32963, enchant: 2669 },
	{ id: 30889, enchant: 1071, gems: [24033] },
	{ id: 29388 },
];
const TALENTS =
	"00000000000000000000-0530503050000132521050-0520502030030100000000";

const CONSUMABLES = {
	flaskId: 22861, // Flask of Blinding Light
	battleElixirId: 0,
	guardianElixirId: 0,
	foodId: 27657, // Blackened Basilisk
	potId: 22839, // Destruction Potion
	conjuredId: 12662, // Demonic Rune
	mhImbueId: 28017, // Superior Wizard Oil
	explosiveId: 0,
	superSapper: false,
	goblinSapper: false,
	nightmareSeed: true,
	scrollStr: true,
	scrollAgi: true,
	// NOT taken. The app's hardcoded default has this on, which by itself put Armor 330 over
	// the real character - the original symptom that started this whole refactor.
	scrollArm: false,
};
const INDIVIDUAL_BUFFS = {
	blessingOfKings: true,
	blessingOfWisdom: "TristateEffectImproved",
	blessingOfMight: "TristateEffectRegular",
	blessingOfSanctuary: true,
};

// proto.Stat ordinals
const S = {
	Strength: 0,
	Agility: 1,
	Stamina: 2,
	SpellDamage: 5,
	HolyDamage: 9,
	SpellHit: 12,
	AttackPower: 17,
	MeleeHit: 20,
	DefenseRating: 25,
	BlockRating: 26,
	DodgeRating: 28,
	ParryRating: 29,
	Resilience: 30,
	Armor: 31,
	Health: 33,
	Mana: 34,
} as const;

/**
 * Read off the wowsims character panel for the setup above.
 *
 * SpellDamage is the stat that caught the missing-consumables bug. Its panel tooltip breaks
 * down as gear 650 + buffs 120 + consumes 68, and the consumes figure is what disagreed:
 *   gear      650.0   items + enchants + gems
 *   buffs    +119.9   Wrath of Air Totem 101 + Improved Divine Spirit 18.9 (10% of Spirit)
 *   consumes  +67.5   Superior Wizard Oil 42 + Blackened Basilisk 23 (+ its Spirit via Imp DS)
 * Before SimDatabase.consumables was populated, the Basilisk contributed nothing and this
 * read 811.9 - the wizard oil alone, because imbues are hardcoded in Go while food is
 * database-driven.
 */
const EXPECTED_STATS: Partial<Record<keyof typeof S, number>> = {
	Health: 17807,
	Mana: 8043,
	Strength: 288,
	Agility: 126,
	Stamina: 1446,
	// Panel tooltip breakdown: gear 650 + buffs 120 + consumes 68.
	SpellDamage: 837,
	// Flask of Blinding Light is Arcane/Holy/Nature-specific, which is why the panel shows
	// "Holy Spell Damage 917 (+80)" as its own row rather than folding it into the 837.
	HolyDamage: 80,
	SpellHit: 68,
	MeleeHit: 38,
	Armor: 18614,
	Resilience: 18,
	DodgeRating: 299,
	ParryRating: 30,
	BlockRating: 56,
};

/** wowsims character panel percentages, from PseudoStat. */
const EXPECTED_PSEUDO = {
	dodgePercent: 22.51,
	parryPercent: 17.31,
	blockPercent: 18.14,
	// Panel showed "Crit Immunity: Over by 0.90%" against the 5.6% boss requirement.
	reducedCritTakenPercent: 6.5,
};
const PSEUDO_INDEX = {
	dodgePercent: 4,
	parryPercent: 5,
	blockPercent: 16,
	reducedCritTakenPercent: 26,
} as const;

describe.skipIf(!canRun)(
	"computeStats matches wowsims for a known character",
	() => {
		it("reproduces every stat on the wowsims character panel", async () => {
			const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
			const gear: GearPiece[] = GEAR.map((i) => ({
				id: String(i.id),
				enchant: { id: i.enchant ? String(i.enchant) : "" },
				gemSlots: (i.gems ?? []).map(String),
			})) as GearPiece[];

			const profile = {
				...DEFAULT_SIM_CALIBRATION_PROFILE,
				raidProfile: {
					...DEFAULT_SIM_CALIBRATION_PROFILE.raidProfile,
					talentsString: TALENTS,
					consumables: CONSUMABLES,
					individualBuffs: INDIVIDUAL_BUFFS,
				},
			} as unknown as typeof DEFAULT_SIM_CALIBRATION_PROFILE;

			// biome-ignore lint/suspicious/noExplicitAny: proto JSON is untyped here
			const request = buildComputeStatsRequest(gear, db, profile) as any;
			// The character is Human. PROT_PALADIN_PLAYER_DEFAULTS hardcodes Draenei and there is
			// no way to override it yet - that lands with the config-model collapse, at which
			// point this override should be replaced by setting it on the profile.
			request.raid.parties[0].players[0].race = "RaceHuman";

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

			const bytes = ComputeStatsRequest.toBinary(
				ComputeStatsRequest.fromJson(request, { ignoreUnknownFields: true }),
			);
			// biome-ignore lint/suspicious/noExplicitAny: wasm_exec global
			const result = ComputeStatsResult.fromBinary(
				(g as any).computeStats(bytes),
			);
			expect(result.errorResult).toBeFalsy();

			const finalStats =
				result.raidStats?.parties?.[0]?.players?.[0]?.finalStats;
			const stats = finalStats?.stats ?? [];
			const pseudo = finalStats?.pseudoStats ?? [];

			const actual: Record<string, number> = {};
			const expected: Record<string, number> = {};
			for (const [name, want] of Object.entries(EXPECTED_STATS)) {
				actual[name] = Math.round(stats[S[name as keyof typeof S]] ?? 0);
				expected[name] = want as number;
			}
			expect(actual).toEqual(expected);

			for (const [name, want] of Object.entries(EXPECTED_PSEUDO)) {
				expect(
					pseudo[PSEUDO_INDEX[name as keyof typeof PSEUDO_INDEX]],
				).toBeCloseTo(want, 2);
			}
		});

		// Three panel rows are NOT raw finalStats values - wowsims computes them for display in
		// ui/core/components/character_stats.tsx. Any stats panel this app builds has to
		// replicate these, so they are pinned here as documentation.
		it("documents the display-only adjustments wowsims applies", () => {
			// Block Value: the panel shows the value EXCLUDING the strength-derived portion.
			// finalStats carried 294.4 where the panel showed 280; the difference is exactly
			// Strength/20 = 288/20 = 14.4 (sim/core: BlockValuePerStrength).
			expect(294.4 - 288 / 20).toBeCloseTo(280, 1);

			// Attack Power: the panel ADDS debuff-derived AP that never enters the player's own
			// stat array (character_stats.tsx:678-697):
			//   + hunterAgility * 0.25   (Expose Weakness, uptime deliberately NOT applied)
			//   + 110                    (Improved Hunter's Mark)
			// finalStats carried 986; the panel showed 1384, implying hunterAgility 1152. The
			// app hardcodes 1210 (a phase-3 assumption, protPaladinProfile.ts), which is the
			// entire residual - not a modelling error.
			expect(986 + 1152 * 0.25 + 110).toBe(1384);
		});
	},
);
