import { getBaseStats } from "#/data/baseStats";
import { calculateStatValue } from "#/helpers/stats";
import { CONSUMABLE_TYPES } from "#/solver/itemSlots";
import type { LPItem, ModifierSource } from "#/solver/types";
import type { BaseConfig, SolveResult, SolverConfiguration } from "#/types/SolverConfig";

export interface HeadlineStat {
	name: string;
	value: number;
}

export function buildStatInputs(
	items: LPItem[],
	baseConfig: BaseConfig,
	solverConfig: SolverConfiguration,
	includeBuffsConsumables: boolean,
): { items: LPItem[]; modifierSources: ModifierSource[] } {
	const filteredItems = includeBuffsConsumables
		? items
		: items.filter((item) => !CONSUMABLE_TYPES.includes(item.type));
	const modifierSources = [
		...baseConfig.abilitySources,
		...baseConfig.talentSources,
		...(includeBuffsConsumables ? solverConfig.buffs : []),
	];
	return { items: filteredItems, modifierSources };
}

export function getHeadlineStats(
	result: SolveResult,
	includeBuffsConsumables: boolean,
): HeadlineStat[] {
	const baseStats = getBaseStats(result.baseConfig.raceId, result.baseConfig.classId);
	const { items, modifierSources } = buildStatInputs(
		result.items,
		result.baseConfig,
		result.solverConfig,
		includeBuffsConsumables,
	);
	const calc = (statName: Parameters<typeof calculateStatValue>[0]["statName"]) =>
		calculateStatValue({ items, modifierSources, baseStats, statName });

	return [
		{ name: "Avoidance", value: calc("Avoidance") },
		{ name: "Shear Avoidance", value: calc("ShearAvoidance") },
		{ name: "Effective HP", value: calc("Effective HP") },
		{ name: "Spell Power", value: calc("SpellPower") },
	];
}
