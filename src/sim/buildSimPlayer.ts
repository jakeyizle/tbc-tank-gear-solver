// Shared assembly of the proto.Player and proto.Encounter messages for a Protection Paladin
// gear set, extracted from buildStatWeightsRequest so that every kind of sim request
// (StatWeightsRequest, ComputeStatsRequest, ...) describes the SAME character.
//
// Keeping this in one place is the point: the app previously grew a second, hand-written
// stat engine that drifted from the sim, and the cheapest way to grow a third is to let two
// request builders assemble the player differently.
//
// See docs/plans/sim-backed-objectives.md for the corrected proto field map this relies on
// (Player.rotation is top-level; a oneof like `protectionPaladin` is flattened onto its
// parent message in JSON, not nested under a `spec` key).
import type { SimCalibrationProfile } from "#/types/SimCalibrationProfile";
import { buildSimDatabase, type GearItemRef } from "./buildSimDatabase";
import type { TbcUiDatabase } from "./buildStatWeightsRequest";
import {
	buildReferenceTargetStats,
	PROT_PALADIN_REFERENCE_ENCOUNTER,
} from "./protPaladinEncounter";
import {
	PROT_PALADIN_CLASS_OPTIONS,
	PROT_PALADIN_PLAYER_DEFAULTS,
} from "./protPaladinProfile";
import { buildProtPaladinRotation } from "./protPaladinSimpleRotation";
import { type GearPiece, toTbcItemSpec } from "./toTbcItemSpec";

/** The item/enchant/gem ids a gear set references, in the shape buildSimDatabase filters on. */
export function toGearRefs(gear: GearPiece[]): GearItemRef[] {
	return gear.map((item) => ({
		id: Number(item.id),
		// item.enchant is always a defined object (EMPTY_ENCHANT when unenchanted, id: "").
		enchant: item.enchant.id ? Number(item.enchant.id) : undefined,
		gems: item.gemSlots.map(Number).filter((id) => id !== 0),
	}));
}

/**
 * Builds the proto.Player JSON for `gear` under `profile`, carrying its own minimal
 * SimDatabase (the wasm target ships without a built-in item database).
 */
export function buildPlayer(
	gear: GearPiece[],
	db: TbcUiDatabase,
	profile: SimCalibrationProfile,
) {
	const { raidProfile } = profile;

	return {
		...PROT_PALADIN_PLAYER_DEFAULTS,
		healingModel: profile.healingModel,
		name: "Player",
		class: "ClassPaladin",
		equipment: { items: gear.map(toTbcItemSpec) },
		// The consumables are passed a SECOND time here, as database records. Listing an id in
		// `consumables` below only names it; the sim resolves the actual stats out of
		// SimDatabase.consumables, so omitting them silently drops every flask/food/potion/
		// elixir effect. See buildSimDatabase's ConsumableRefs comment.
		database: buildSimDatabase(db, toGearRefs(gear), raidProfile.consumables),
		talentsString: raidProfile.talentsString,
		buffs: raidProfile.individualBuffs,
		consumables: raidProfile.consumables,
		// A proto3 JSON oneof is flattened onto its parent message, never nested under its
		// group name ("spec") - see the plan doc's Phase 0 execution log for the bug this
		// caused the first time around.
		protectionPaladin: PROT_PALADIN_CLASS_OPTIONS,
		// The Go/wasm sim only understands a precompiled APL, never the simple-rotation
		// booleans directly - see protPaladinSimpleRotation.ts's header comment.
		rotation: buildProtPaladinRotation(
			raidProfile.simpleRotation,
			raidProfile.talentsString,
		),
	};
}

/** Builds the proto.Encounter JSON from the profile's encounter settings. */
export function buildEncounter(profile: SimCalibrationProfile) {
	return {
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
}
