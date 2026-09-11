// Assembles a proto.ComputeStatsRequest (JSON form) for a gear set.
//
// ComputeStats runs ZERO sim iterations - it builds the character (gear, gems, enchants,
// socket bonuses, talents, racials, buffs, consumables, stat dependencies) and reports the
// resulting stats. It is what wowsims' own character panel calls on every item swap, so it
// is interactive-speed, deterministic, and authoritative. See vendor/tbc-sim/sim/core/api.go:12.
//
// Unlike StatWeightsRequest - where player/raidBuffs/partyBuffs/debuffs/tanks are all
// SIBLINGS on the request - ComputeStatsRequest nests everything in a real proto.Raid
// (api.proto:426, :103-127). The placement differs per buff category and getting it wrong
// fails SILENTLY, dropping those buffs from the result rather than erroring.
import type { SimCalibrationProfile } from "#/types/SimCalibrationProfile";
import { buildEncounter, buildPlayer } from "./buildSimPlayer";
import type { TbcUiDatabase } from "./buildStatWeightsRequest";
import { PROT_PALADIN_REFERENCE_TANKS } from "./protPaladinEncounter";
import type { GearPiece } from "./toTbcItemSpec";

export function buildComputeStatsRequest(
	gear: GearPiece[],
	db: TbcUiDatabase,
	profile: SimCalibrationProfile,
) {
	const { raidProfile } = profile;

	return {
		raid: {
			parties: [
				{
					players: [buildPlayer(gear, db, profile)],
					// PARTY buffs belong to the Party, not the Raid (api.proto:97-100).
					// Putting them on the Raid silently drops totems/shouts/drums.
					buffs: raidProfile.partyBuffs,
				},
			],
			buffs: raidProfile.raidBuffs,
			debuffs: raidProfile.debuffs,
			tanks: PROT_PALADIN_REFERENCE_TANKS,
		},
		encounter: buildEncounter(profile),
	};
}
