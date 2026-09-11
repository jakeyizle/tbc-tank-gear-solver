import type { LinearAxis } from "#/types/LinearStatModel";
import type { SolverConfiguration } from "../SolverConfiguration";
import { scoreItemSet } from "../scores";
import type { LPItem, ProcessedItemType } from "../types";

const MANDATORY_SLOTS: ProcessedItemType[] = [
	"Head",
	"Neck",
	"Shoulder",
	"Back",
	"Chest",
	"Wrist",
	"Hands",
	"Waist",
	"Legs",
	"Feet",
	"Weapon",
	"Ranged",
];
const MULTI_SLOTS: ProcessedItemType[] = ["Finger", "Trinket"];

interface AchievedStats {
	avoidance: number;
	uncritability: number;
	objective: number;
	resistances: Partial<Record<string, number>>;
}

// Independently recomputes what a solved item set actually achieves, by re-scoring the whole
// set from the stat model, rather than trusting the solver's internal per-item score fields -
// so this stays meaningful no matter how the solver represents its internal solution.
//
// Figures are the ITEMS' contribution only, and are checked below against config's item-level
// targets (which already have the character's base subtracted out). Defense skill's floor is
// applied, because a whole set is where it belongs - see scores.ts.
export const computeAchievedStats = (
	items: LPItem[],
	config: SolverConfiguration,
): AchievedStats => {
	const axes: LinearAxis[] = [
		config.avoidanceStatName,
		"Uncritability",
		...config.optimizeStats.map((stat) => stat.name),
		...config.resistanceTargets.map((target) => target.stat),
	];
	const totals = scoreItemSet(items, config.linearModel, axes);

	const objective = config.optimizeStats.reduce(
		(sum, stat) => sum + (totals[stat.name] ?? 0) * stat.value,
		0,
	);
	const resistances: Partial<Record<string, number>> = {};
	for (const target of config.resistanceTargets) {
		resistances[target.stat] = totals[target.stat] ?? 0;
	}

	return {
		avoidance: totals[config.avoidanceStatName] ?? 0,
		uncritability: totals.Uncritability ?? 0,
		objective,
		resistances,
	};
};

// Structural invariants a broken model (especially a mis-linearized socket-bonus constraint)
// could silently violate. Returns a list of violation descriptions; empty = valid.
export const validateSolution = (
	items: LPItem[],
	config: SolverConfiguration,
): string[] => {
	const issues: string[] = [];

	for (const slot of MANDATORY_SLOTS) {
		const count = items.filter((item) => item.type === slot).length;
		if (count !== 1) issues.push(`expected exactly 1 ${slot}, got ${count}`);
	}
	for (const slot of MULTI_SLOTS) {
		const count = items.filter((item) => item.type === slot).length;
		if (count > 2) issues.push(`expected at most 2 ${slot}, got ${count}`);
	}

	// A two-hander occupies the off-hand slot a shield would, so the two can never be equipped
	// together - see solveConfig.ts's makeWeaponShieldConstraint.
	const hasShield = items.some((item) => item.type === "Shield");
	const hasTwoHand = items.some(
		(item) => item.type === "Weapon" && item.handType === "TwoHand",
	);
	if (hasShield && hasTwoHand) {
		issues.push("a two-handed weapon was equipped alongside a shield");
	}

	const idCounts = new Map<string, number>();
	for (const item of items)
		idCounts.set(item.id, (idCounts.get(item.id) ?? 0) + 1);
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
	const hasGuardianElixir = items.some(
		(item) => item.type === "GuardianElixir",
	);
	const hasBattleElixir = items.some((item) => item.type === "BattleElixir");
	if (hasFlask && hasGuardianElixir)
		issues.push("flask co-selected with a guardian elixir");
	if (hasFlask && hasBattleElixir)
		issues.push("flask co-selected with a battle elixir");

	const achieved = computeAchievedStats(items, config);
	if (
		config.avoidanceTarget > 0 &&
		achieved.avoidance < config.avoidanceTarget
	) {
		issues.push(
			`avoidance floor not met: achieved ${achieved.avoidance}, target ${config.avoidanceTarget}`,
		);
	}
	if (
		config.uncritabilityTarget > 0 &&
		achieved.uncritability < config.uncritabilityTarget
	) {
		issues.push(
			`uncrit floor not met: achieved ${achieved.uncritability}, target ${config.uncritabilityTarget}`,
		);
	}
	for (const target of config.resistanceTargets) {
		const achievedValue = achieved.resistances[target.stat] ?? 0;
		if (achievedValue < target.target) {
			issues.push(
				`resistance floor not met for ${target.stat}: achieved ${achievedValue}, target ${target.target}`,
			);
		}
	}
	return issues;
};
