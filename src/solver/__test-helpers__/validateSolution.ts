import { calculateStatValue } from "#/helpers/stats";
import type { SolverConfiguration } from "../SolverConfiguration";
import type { LPItem, ProcessedItemType } from "../types";

const MANDATORY_SLOTS: ProcessedItemType[] = [
	"Head", "Neck", "Shoulder", "Back", "Chest", "Wrist", "Hands",
	"Waist", "Legs", "Feet", "Weapon", "Ranged",
];
const MULTI_SLOTS: ProcessedItemType[] = ["Finger", "Trinket"];

interface AchievedStats {
	avoidance: number;
	uncritability: number;
	objective: number;
	resistances: Partial<Record<string, number>>;
}

// Independently recomputes achieved stats for a solved item set the same way the app's own
// results display does (StatsSummary.tsx's calculateStatValue pattern), rather than trusting the
// solver's internal per-item score fields - so this stays meaningful no matter how the solver
// represents its internal solution.
export const computeAchievedStats = (
	items: LPItem[],
	config: SolverConfiguration,
): AchievedStats => {
	const modifierSources = [...config.flatModifierSources, ...config.multiplierModifierSources];
	const baseStats = config.baseStats;

	const avoidance = calculateStatValue({
		items,
		modifierSources,
		baseStats,
		statName: config.avoidanceStatName,
		roundDefenseAndResilience: true,
	});
	const uncritability = calculateStatValue({
		items,
		modifierSources,
		baseStats,
		statName: "Uncritability",
		roundDefenseAndResilience: true,
	});
	const objective = config.optimizeStats.reduce(
		(sum, stat) =>
			sum + calculateStatValue({ items, modifierSources, baseStats, statName: stat.name }) * stat.value,
		0,
	);
	const resistances: Partial<Record<string, number>> = {};
	for (const floor of config.resistanceFloors) {
		resistances[floor.stat] = calculateStatValue({
			items,
			modifierSources,
			baseStats,
			statName: floor.stat,
		});
	}

	return { avoidance, uncritability, objective, resistances };
};

// Structural invariants a broken model (especially a mis-linearized socket-bonus constraint)
// could silently violate. Returns a list of violation descriptions; empty = valid.
export const validateSolution = (items: LPItem[], config: SolverConfiguration): string[] => {
	const issues: string[] = [];

	for (const slot of MANDATORY_SLOTS) {
		const count = items.filter((item) => item.type === slot).length;
		if (count !== 1) issues.push(`expected exactly 1 ${slot}, got ${count}`);
	}
	for (const slot of MULTI_SLOTS) {
		const count = items.filter((item) => item.type === slot).length;
		if (count > 2) issues.push(`expected at most 2 ${slot}, got ${count}`);
	}

	const idCounts = new Map<string, number>();
	for (const item of items) idCounts.set(item.id, (idCounts.get(item.id) ?? 0) + 1);
	for (const [id, count] of idCounts) {
		if (count > 1) issues.push(`base item ${id} used ${count} times`);
	}

	const uniqueGemCounts = new Map<string, number>();
	for (const item of items) {
		for (const gem of item.gems) {
			if (gem.isUnique !== "true") continue;
			uniqueGemCounts.set(gem.id, (uniqueGemCounts.get(gem.id) ?? 0) + 1);
		}
	}
	for (const [gemId, count] of uniqueGemCounts) {
		if (count > 1) issues.push(`unique gem ${gemId} used ${count} times`);
	}

	const hasFlask = items.some((item) => item.type === "Flask");
	const hasGuardianElixir = items.some((item) => item.type === "GuardianElixir");
	const hasBattleElixir = items.some((item) => item.type === "BattleElixir");
	if (hasFlask && hasGuardianElixir) issues.push("flask co-selected with a guardian elixir");
	if (hasFlask && hasBattleElixir) issues.push("flask co-selected with a battle elixir");

	const achieved = computeAchievedStats(items, config);
	if (config.avoidanceTarget > 0 && achieved.avoidance < config.avoidanceTarget) {
		issues.push(
			`avoidance floor not met: achieved ${achieved.avoidance}, target ${config.avoidanceTarget}`,
		);
	}
	if (config.uncritabilityTarget > 0 && achieved.uncritability < config.uncritabilityTarget) {
		issues.push(
			`uncrit floor not met: achieved ${achieved.uncritability}, target ${config.uncritabilityTarget}`,
		);
	}
	for (const floor of config.resistanceFloors) {
		const achievedValue = achieved.resistances[floor.stat] ?? 0;
		if (achievedValue < floor.value) {
			issues.push(
				`resistance floor not met for ${floor.stat}: achieved ${achievedValue}, target ${floor.value}`,
			);
		}
	}

	return issues;
};
