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
 * Improved Righteous Fury reduces damage taken by 2% per rank. It is a damage multiplier, not
 * a stat, so it never appears in computeStats output and still has to be read off the talent
 * list. It moves to the raid profile's talent string with the config-model collapse.
 */
export function improvedRighteousFuryMultiplier(
	talentSources: { id: string; rank?: number }[] | undefined,
): number {
	const rank =
		talentSources?.find((source) => source.id === "improved-righteous-fury")
			?.rank ?? 0;
	return 1 - rank * 0.02;
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
		physicalDamageTakenMultiplier: improvedRighteousFuryMultiplier(
			result.baseConfig.talentSources,
		),
	});

	return [
		{ name: "Avoidance", value: avoidance.total },
		{ name: "Shear Avoidance", value: avoidance.shear },
		{ name: "Effective HP", value: mitigation.effectiveHealth },
		{ name: "Spell Power", value: stat(view, STAT.SpellDamage) },
	];
}
