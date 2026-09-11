// The four numbers the compare view puts side by side for two solve results.
//
// Reads the simulator's own stats (SolveResult.characterStats, produced by
// src/sim/measureCharacterStats.ts) rather than recomputing anything. The previous version of
// this file existed almost entirely to reconcile two config models - a `buildStatInputs` that
// picked between the formula-mode buff list and the raid profile depending on objective mode -
// and that reconciliation has no subject left now that the sim is the only stat authority.
import type { CharacterStatsSnapshot } from "#/types/CharacterStats";
import type { SolveResult } from "#/types/SolverConfig";
import {
	avoidanceInfo,
	LIBRAM_OF_REPENTANCE_ID,
	mitigationInfo,
	STAT,
	stat,
} from "./characterStatsDisplay";

/** Class id for Paladin, per #/data/classes.ts. Gates Holy Shield's block bonus. */
const PALADIN_CLASS_ID = "2";

/**
 * Non-stat physical damage reduction (today only Improved Righteous Fury), as captured on the
 * result at solve time from the LinearStatModel the solver actually used - see
 * SolveResult.physicalDamageTakenMultiplier.
 *
 * This used to be recomputed here from baseConfig.talentSources, which meant two independent
 * implementations (the other in deriveLinearModel.ts) that could - and did - disagree, since one
 * read the imported character's talents and the other the raid profile's talent string. Reading
 * the solver's own number instead makes disagreement impossible.
 *
 * Falls back to 1 for results persisted before the field existed, which under-reports Effective
 * HP rather than inventing a reduction the solve may not have had.
 */
export function damageTakenMultiplier(result: SolveResult): number {
	return result.physicalDamageTakenMultiplier ?? 1;
}

interface HeadlineStat {
	name: string;
	value: number;
}

/**
 * The snapshot matching the "include buffs & consumables" toggle, or undefined for results
 * saved before the sim measured them. Callers render a prompt to re-solve in that case rather
 * than a fabricated number.
 */
export function viewForResult(
	characterStats: CharacterStatsSnapshot | undefined,
	includeBuffsConsumables: boolean,
) {
	if (!characterStats) return undefined;
	return includeBuffsConsumables
		? characterStats.buffed.final
		: characterStats.unbuffed.final;
}

export function getHeadlineStats(
	result: SolveResult,
	includeBuffsConsumables: boolean,
): HeadlineStat[] {
	const view = viewForResult(result.characterStats, includeBuffsConsumables);
	if (!view) return [];

	const avoidance = avoidanceInfo(view, {
		// Debuffs are raid-supplied, so they belong to the buffed view only.
		debuffs: includeBuffsConsumables
			? result.baseConfig.simCalibrationProfile?.raidProfile?.debuffs
			: undefined,
		isProtectionPaladin: result.baseConfig.classId === PALADIN_CLASS_ID,
		hasLibramOfRepentance: result.items.some(
			(item) => item.id === LIBRAM_OF_REPENTANCE_ID,
		),
	});
	const mitigation = mitigationInfo(view, {
		physicalDamageTakenMultiplier: damageTakenMultiplier(result),
	});

	return [
		{ name: "Avoidance", value: avoidance.total },
		{ name: "Shear Avoidance", value: avoidance.shear },
		{ name: "Effective HP", value: mitigation.effectiveHealth },
		{ name: "Spell Power", value: stat(view, STAT.SpellDamage) },
	];
}
