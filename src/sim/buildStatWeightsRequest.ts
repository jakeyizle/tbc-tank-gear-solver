// Assembles a full proto.StatWeightsRequest (JSON form) for a Protection Paladin gear set,
// using the hardcoded v1 calibration profile. See docs/plans/sim-backed-objectives.md for
// the corrected proto field map this relies on (Player.rotation is top-level; raidBuffs/
// partyBuffs/debuffs are siblings of `player` on the request, not nested in it; a oneof like
// `protectionPaladin` is flattened onto its parent message in JSON, not nested under a
// `spec` key).
import type { StatName } from "#/solver/types";
import type { SimCalibrationProfile } from "#/types/SimCalibrationProfile";
import { buildSimDatabase, type GearItemRef } from "./buildSimDatabase";
import {
	buildReferenceTargetStats,
	PROT_PALADIN_REFERENCE_ENCOUNTER,
	PROT_PALADIN_REFERENCE_TANKS,
} from "./protPaladinEncounter";
import {
	PROT_PALADIN_CLASS_OPTIONS,
	PROT_PALADIN_PLAYER_DEFAULTS,
} from "./protPaladinProfile";
import { buildProtPaladinRotation } from "./protPaladinSimpleRotation";
import {
	STAT_NAME_TO_TBC_STAT,
	TBC_EP_REFERENCE_STAT,
} from "./statTranslation";
import { type GearPiece, toTbcItemSpec } from "./toTbcItemSpec";

export interface TbcUiDatabase {
	items: Record<string, unknown>[];
	enchants: Record<string, unknown>[];
	gems: Record<string, unknown>[];
}

/**
 * @param gear The candidate gear set to calibrate around (baseline for the perturbation
 * sims — see the plan's note on calibration being a local linearization).
 * @param db The full vendored tbc-new item/gem/enchant database (parsed
 * vendor/tbc-sim/assets/database/db.json), filtered down to just what `gear` references.
 * @param statsToWeigh Which of this repo's StatNames to calibrate. Any name with no
 * translation entry in statTranslation.ts is silently dropped, not an error — the caller is
 * expected to only pass tank-relevant stats that have one.
 * @param iterations Sim iterations per stat perturbation branch; must be even (half go to
 * the +/- branches — see statweight.go:138). Higher = less noisy, slower.
 * @param profile User-editable calibration inputs (encounter, healing model, raid buffs/
 * talents/consumables/rotation) - see src/types/SimCalibrationProfile.ts. `iterations` is
 * passed separately since callers already source it from `profile.calibration.iterations`
 * themselves (see calibrateWeights.ts).
 */
export function buildStatWeightsRequest(
	gear: GearPiece[],
	db: TbcUiDatabase,
	statsToWeigh: StatName[],
	iterations: number,
	profile: SimCalibrationProfile,
) {
	const gearRefs: GearItemRef[] = gear.map((item) => ({
		id: Number(item.id),
		// item.enchant is always a defined object (EMPTY_ENCHANT when unenchanted, id: "").
		enchant: item.enchant.id ? Number(item.enchant.id) : undefined,
		gems: item.gemSlots.map(Number).filter((id) => id !== 0),
	}));

	const tbcStatsToWeigh = statsToWeigh
		.map((name) => STAT_NAME_TO_TBC_STAT[name])
		.filter((s): s is string => s != null);

	const { raidProfile } = profile;

	const encounter = {
		...PROT_PALADIN_REFERENCE_ENCOUNTER,
		duration: profile.encounter.duration,
		durationVariation: profile.encounter.durationVariation,
		targets: [
			{
				...PROT_PALADIN_REFERENCE_ENCOUNTER.targets[0],
				stats: buildReferenceTargetStats(
					profile.encounter.bossArmor,
					profile.encounter.bossHealth,
				),
				minBaseDamage: profile.encounter.minBaseDamage,
				damageSpread: profile.encounter.damageSpread,
				swingSpeed: profile.encounter.swingSpeed,
			},
		],
	};

	return {
		player: {
			...PROT_PALADIN_PLAYER_DEFAULTS,
			healingModel: profile.healingModel,
			name: "Player",
			class: "ClassPaladin",
			equipment: { items: gear.map(toTbcItemSpec) },
			database: buildSimDatabase(db, gearRefs),
			talentsString: raidProfile.talentsString,
			buffs: raidProfile.individualBuffs,
			consumables: raidProfile.consumables,
			// A proto3 JSON oneof is flattened onto its parent message, never nested under
			// its group name ("spec") — see the plan doc's Phase 0 execution log for the bug
			// this caused the first time around.
			protectionPaladin: PROT_PALADIN_CLASS_OPTIONS,
			// The Go/wasm sim only understands a precompiled APL, never the simple-rotation
			// booleans directly - see protPaladinSimpleRotation.ts's header comment.
			rotation: buildProtPaladinRotation(raidProfile.simpleRotation),
		},
		raidBuffs: raidProfile.raidBuffs,
		partyBuffs: raidProfile.partyBuffs,
		debuffs: raidProfile.debuffs,
		encounter,
		tanks: PROT_PALADIN_REFERENCE_TANKS,
		// int64 proto fields must be JSON strings, not numbers/bigints (see plan doc).
		simOptions: { iterations, randomSeed: String(Date.now()) },
		statsToWeigh: tbcStatsToWeigh,
		epReferenceStat: TBC_EP_REFERENCE_STAT,
	};
}
