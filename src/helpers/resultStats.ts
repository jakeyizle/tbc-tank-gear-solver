import { getBaseStats } from "#/data/baseStats";
import { calculateStatValue } from "#/helpers/stats";
import { raidProfileToModifierSources } from "#/sim/raidProfileToModifierSources";
import { CONSUMABLE_TYPES } from "#/solver/itemSlots";
import type { LPItem, ModifierSource } from "#/solver/types";
import type { BaseConfig, SolveResult, SolverConfiguration } from "#/types/SolverConfig";

const SIM_OBJECTIVE_MODES = new Set<SolverConfiguration["objectiveMode"]>([
	"tps",
	"dtps",
	"tmi",
	"balanced",
]);

interface HeadlineStat {
	name: string;
	value: number;
}

export function buildStatInputs(
	items: LPItem[],
	baseConfig: BaseConfig,
	solverConfig: SolverConfiguration,
	includeBuffsConsumables: boolean,
): {
	items: LPItem[];
	modifierSources: ModifierSource[];
	buffSources: ModifierSource[];
} {
	const filteredItems = includeBuffsConsumables
		? items
		: items.filter((item) => !CONSUMABLE_TYPES.includes(item.type));
	// Sim objective modes configure buffs via the raid profile, not the formula-mode buffs list
	// (which stays hidden and stuck at its all-unchecked default whenever a sim objective mode is
	// active - see ConfigCard.tsx) - so the buffed-stats display must derive its modifier sources
	// from the raid profile instead for those modes.
	const buffModifierSources = SIM_OBJECTIVE_MODES.has(solverConfig.objectiveMode)
		? raidProfileToModifierSources(baseConfig.simCalibrationProfile.raidProfile)
		: solverConfig.buffs;
	const buffSources = includeBuffsConsumables ? buffModifierSources : [];
	const modifierSources = [
		...baseConfig.abilitySources,
		...baseConfig.talentSources,
		...buffSources,
	];
	return { items: filteredItems, modifierSources, buffSources };
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
