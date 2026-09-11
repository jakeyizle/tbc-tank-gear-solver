// Assembles a full proto.StatWeightsRequest (JSON form) for a Protection Paladin gear set,
// using the hardcoded v1 calibration profile. See docs/plans/sim-backed-objectives.md for
// the corrected proto field map this relies on (Player.rotation is top-level; raidBuffs/
// partyBuffs/debuffs are siblings of `player` on the request, not nested in it; a oneof like
// `protectionPaladin` is flattened onto its parent message in JSON, not nested under a
// `spec` key).
import type { StatName } from "#/solver/types";
import type { SimCalibrationProfile } from "#/types/SimCalibrationProfile";
import { buildEncounter, buildPlayer } from "./buildSimPlayer";
import { PROT_PALADIN_REFERENCE_TANKS } from "./protPaladinEncounter";
import {
	STAT_NAME_TO_TBC_STAT,
	TBC_EP_REFERENCE_STAT,
} from "./statTranslation";
import type { GearPiece } from "./toTbcItemSpec";

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
 * @param seedOverride Explicit randomSeed string, instead of the default `Date.now()`-derived
 * one - lets a caller running several batches back-to-back (see calibrateWeights.ts's
 * runCalibrationBatches) guarantee each gets an independent seed rather than relying on enough
 * wall-clock time elapsing between calls.
 */
export function buildStatWeightsRequest(
	gear: GearPiece[],
	db: TbcUiDatabase,
	statsToWeigh: StatName[],
	iterations: number,
	profile: SimCalibrationProfile,
	seedOverride?: string,
) {
	const tbcStatsToWeigh = statsToWeigh
		.map((name) => STAT_NAME_TO_TBC_STAT[name])
		.filter((s): s is string => s != null);

	const { raidProfile } = profile;

	return {
		player: buildPlayer(gear, db, profile),
		raidBuffs: raidProfile.raidBuffs,
		partyBuffs: raidProfile.partyBuffs,
		debuffs: raidProfile.debuffs,
		encounter: buildEncounter(profile),
		tanks: PROT_PALADIN_REFERENCE_TANKS,
		// int64 proto fields must be JSON strings, not numbers/bigints (see plan doc).
		simOptions: { iterations, randomSeed: seedOverride ?? String(Date.now()) },
		statsToWeigh: tbcStatsToWeigh,
		epReferenceStat: TBC_EP_REFERENCE_STAT,
	};
}
