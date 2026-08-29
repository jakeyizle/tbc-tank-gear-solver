import { getBaseStats } from "#/data/baseStats";
import { calculateStatValue } from "#/helpers/stats";
import type { SolveResult } from "#/types/SolverConfig";

export interface HeadlineStat {
	name: string;
	value: number;
}

export function getHeadlineStats(result: SolveResult): HeadlineStat[] {
	const baseStats = getBaseStats(result.baseConfig.raceId, result.baseConfig.classId);
	const modifierSources = [
		...result.baseConfig.abilitySources,
		...result.baseConfig.talentSources,
		...result.solverConfig.buffs,
	];
	const calc = (statName: Parameters<typeof calculateStatValue>[0]["statName"]) =>
		calculateStatValue({ items: result.items, modifierSources, baseStats, statName });

	return [
		{ name: "Avoidance", value: calc("Avoidance") },
		{ name: "Shear Avoidance", value: calc("ShearAvoidance") },
		{ name: "Effective HP", value: calc("Effective HP") },
		{ name: "Spell Power", value: calc("SpellPower") },
	];
}
