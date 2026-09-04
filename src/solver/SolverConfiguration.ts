import { getBaseStats } from "#/data/baseStats";
import { calculateStatValue } from "#/helpers/stats";
import {
	calculateAvoidanceTarget,
	calculateUncritabilityTarget,
} from "./avoidance";
import { calculateScores } from "./scores";
import type { ModifierSource, ResistanceFloor, Stat } from "./types";

// A hard floor/ceiling on a second, independently-weighted linear metric (e.g. a sim-calibrated
// TMI-5 ceiling alongside a TPS-maximizing objective) - see decomposedModel.ts's
// buildScoreVars(..., "constraintScore") and solveConfig.ts's makeMetricConstraint. `bound` is
// already expressed in the same marginal/relative units `statWeights` produces (a caller has
// already netted out the metric's current absolute value against its own baseline - see
// solveSimMetric.ts), not a raw absolute threshold.
export interface SecondaryConstraint {
	statWeights: Stat[];
	bound: number;
	kind: "floor" | "ceiling";
}

/**
 * Centralized configuration object that encapsulates all solver settings
 * and provides derived calculations. Eliminates the need to pass multiple
 * parameters through function call chains.
 */
export class SolverConfiguration {
	readonly uncrushabilitySetting: number;
	readonly uncritabilitySetting: number;
	readonly optimizeStats: Stat[];
	readonly resistanceFloors: ResistanceFloor[];
	readonly secondaryConstraint?: SecondaryConstraint;
	readonly baseStats: Stat[];
	readonly flatModifierSources: ModifierSource[];
	readonly multiplierModifierSources: ModifierSource[];
	readonly avoidanceStatName: "Avoidance" | "ShearAvoidance";
	readonly excludeUniqueGems: boolean;
	readonly phase: number;

	// Derived values
	avoidanceTarget: number;
	uncritabilityTarget: number;
	readonly baseAvoidance: number;
	readonly baseUncritability: number;
	// resistance floors converted to LP targets (floor minus what base stats/talents/buffs already provide)
	readonly resistanceTargets: {
		stat: ResistanceFloor["stat"];
		target: number;
	}[];

	constructor(options: {
		uncrushabilitySetting: number;
		uncritabilitySetting: number;
		optimizeStats: Stat[];
		resistanceFloors?: ResistanceFloor[];
		secondaryConstraint?: SecondaryConstraint;
		talentSources: ModifierSource[];
		buffs: ModifierSource[];
		abilitySources: ModifierSource[];
		raceId: string;
		classId: string;
		excludeUniqueGems: boolean;
		phase: number;
	}) {
		this.uncrushabilitySetting = options.uncrushabilitySetting;
		this.uncritabilitySetting = options.uncritabilitySetting;
		this.excludeUniqueGems = options.excludeUniqueGems;
		this.phase = options.phase;
		this.resistanceFloors = options.resistanceFloors ?? [];
		this.secondaryConstraint = options.secondaryConstraint;
		this.avoidanceStatName =
			options.uncrushabilitySetting === 2 ? "ShearAvoidance" : "Avoidance";
		this.optimizeStats = options.optimizeStats;
		this.baseStats = getBaseStats(options.raceId, options.classId);
		const modifierSources = [
			...options.talentSources,
			...options.buffs,
			...options.abilitySources,
		];
		// flat sources are applied against the base targets
		// EX: a flat 5% to dodge means that the uncrushability target is reduced by 5%
		this.flatModifierSources = modifierSources.reduce((result, source) => {
			const flatStats = source.stats.filter((x) => x.type === "flat");
			if (flatStats.length > 0) {
				result.push({ ...source, stats: flatStats });
			}
			return result;
		}, [] as ModifierSource[]);

		// multiplier sources are applied against item/enchant/gem stats
		// EX: kings is a 10% increase to certain stats, so items/enchants/gems that give those stats are increased by 10%
		this.multiplierModifierSources = modifierSources.reduce(
			(result, source) => {
				const flatStats = source.stats.filter((x) => x.type === "multiplier");
				if (flatStats.length > 0) {
					result.push({ ...source, stats: flatStats });
				}
				return result;
			},
			[] as ModifierSource[],
		);

		// Calculate derived values once during construction
		this.baseAvoidance = calculateStatValue({
			items: [],
			modifierSources: this.flatModifierSources,
			baseStats: this.baseStats,
			statName: this.avoidanceStatName,
		});
		this.avoidanceTarget = calculateAvoidanceTarget(
			this.uncrushabilitySetting,
			this.baseAvoidance,
		);

		this.baseUncritability = calculateStatValue({
			items: [],
			modifierSources: this.flatModifierSources,
			baseStats: this.baseStats,
			statName: "Uncritability",
		});
		this.uncritabilityTarget = calculateUncritabilityTarget(
			this.uncritabilitySetting,
			this.baseUncritability,
		);

		this.resistanceTargets = this.resistanceFloors.map((floor) => {
			const baseResistance = calculateStatValue({
				items: [],
				modifierSources: this.flatModifierSources,
				baseStats: this.baseStats,
				statName: floor.stat,
			});
			return { stat: floor.stat, target: floor.value - baseResistance };
		});
	}

	hasRelevantStats(stats: Stat[]): boolean {
		const scores = this.calculateScoresForStats(stats);

		const hasRelevantAvoidance =
			this.uncrushabilitySetting > 0 && scores.avoidanceScore > 0;
		const hasRelevantUncritability =
			this.uncritabilitySetting > 0 && scores.uncritabilityScore > 0;
		const hasRelevantObjective = scores.objectiveScore > 0;
		const hasRelevantResistance = Object.values(scores.resistanceScores).some(
			(value) => (value ?? 0) > 0,
		);
		// A stat that only ever helps the secondary constraint (not the objective/avoidance/
		// uncrit/resistance) would otherwise be pruned here before the LP ever gets a chance to
		// use it to satisfy that constraint - see getEnchants/getGems in items.ts.
		const hasRelevantConstraint = scores.constraintScore !== 0;

		return (
			hasRelevantAvoidance ||
			hasRelevantUncritability ||
			hasRelevantObjective ||
			hasRelevantResistance ||
			hasRelevantConstraint
		);
	}

	calculateScoresForStats(stats: Stat[]): {
		avoidanceScore: number;
		uncritabilityScore: number;
		objectiveScore: number;
		resistanceScores: Partial<Record<ResistanceFloor["stat"], number>>;
		constraintScore: number;
	} {
		return calculateScores(
			stats,
			this.optimizeStats,
			this.multiplierModifierSources,
			this.avoidanceStatName,
			this.resistanceFloors.map((floor) => floor.stat),
			this.secondaryConstraint?.statWeights ?? [],
		);
	}

	stepAvoidanceTarget(step: number) {
		this.avoidanceTarget += step;
	}

	stepUncritabilityTarget(step: number) {
		this.uncritabilityTarget += step;
	}
}
