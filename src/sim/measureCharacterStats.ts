// Produces the authoritative character stats for a solved gear set, for display.
//
// Runs in the solver worker, alongside measureFinalSimMetrics, because the worker already has
// the wasm loaded - asking the main thread for these would mean a second 37MB Go instance and
// a second 5.5MB download just to render a panel.
//
// Two snapshots are measured, because the results panel has an "Include buffs & consumables"
// toggle and the difference is not something the UI can derive by subtraction: buffs interact
// (Blessing of Kings multiplies, Improved Divine Spirit converts Spirit into spell damage),
// so the unbuffed figure has to be a real second build, not the buffed one minus a delta.
import type { LPItem } from "#/solver/types";
import type { CharacterStatsSnapshot } from "#/types/CharacterStats";
import type { SimCalibrationProfile } from "#/types/SimCalibrationProfile";
import type { TbcUiDatabase } from "./buildStatWeightsRequest";
import { computeCharacterStats } from "./computeStatsClient";
import { splitGearAndConsumables } from "./resolveGearAndConsumables";

/**
 * Strips every raid-supplied and consumed effect, leaving gear + talents + race.
 *
 * Debuffs are stripped alongside buffs deliberately: a debuff like Insect Swarm contributes
 * 2% miss to the displayed avoidance, so leaving it in would make "exclude buffs" still
 * include a raid-supplied effect.
 */
function stripRaidEffects(
	profile: SimCalibrationProfile,
): SimCalibrationProfile {
	return {
		...profile,
		raidProfile: {
			...profile.raidProfile,
			raidBuffs: {},
			partyBuffs: {},
			individualBuffs: {},
			debuffs: {},
			consumables: {},
		},
	} as SimCalibrationProfile;
}

export async function measureCharacterStats(
	items: LPItem[],
	db: TbcUiDatabase,
	profile: SimCalibrationProfile,
): Promise<CharacterStatsSnapshot> {
	const { gear, consumables } = splitGearAndConsumables(items);

	// The solver may have chosen the flask/elixirs itself, so fold its picks into the profile
	// before measuring - same merge measureFinalSimMetrics does.
	const solvedProfile = {
		...profile,
		raidProfile: {
			...profile.raidProfile,
			consumables: { ...profile.raidProfile.consumables, ...consumables },
		},
	} as SimCalibrationProfile;

	const [buffed, unbuffed] = await Promise.all([
		computeCharacterStats(gear, db, solvedProfile),
		computeCharacterStats(gear, db, stripRaidEffects(solvedProfile)),
	]);

	return { buffed, unbuffed };
}
