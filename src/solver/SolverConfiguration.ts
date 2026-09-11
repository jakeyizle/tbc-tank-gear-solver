import type { LinearStatModel } from "#/types/LinearStatModel";
import {
	calculateAvoidanceTarget,
	calculateUncritabilityTarget,
} from "./avoidance";
import type { SolverItemDatabase } from "./itemDatabase";
import { calculateScores } from "./scores";
import type { ResistanceFloor, ScoreSet, Stat } from "./types";

/**
 * Centralized configuration object that encapsulates all solver settings
 * and provides derived calculations. Eliminates the need to pass multiple
 * parameters through function call chains.
 *
 * The game math it used to do itself - base stats per race/class, and the flat/multiplier
 * split over talents, buffs and abilities - is now a `LinearStatModel` measured from the
 * simulator (src/sim/deriveLinearModel.ts). This class only decides targets and delegates
 * scoring, which is why `calculateScoresForStats` kept its exact signature through the
 * change: decomposedModel.ts and solveConfig.ts never saw it.
 */
export class SolverConfiguration {
	readonly uncrushabilitySetting: number;
	readonly uncritabilitySetting: number;
	readonly optimizeStats: Stat[];
	readonly resistanceFloors: ResistanceFloor[];
	readonly linearModel: LinearStatModel;
	/**
	 * The pool of items/gems/enchants this solve draws from. Held here for the same reason as
	 * `linearModel`: it is part of the world a configuration is solving in, and every function
	 * that needs it already has a `config` in hand.
	 */
	readonly itemDatabase: SolverItemDatabase;
	readonly avoidanceStatName: "Avoidance" | "ShearAvoidance";
	readonly excludeUniqueGems: boolean;
	readonly excludeJewelcraftingItems: boolean;
	readonly excludeEnchantingItems: boolean;
	readonly classId: string;
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
		linearModel: LinearStatModel;
		itemDatabase: SolverItemDatabase;
		classId: string;
		excludeUniqueGems: boolean;
		excludeJewelcraftingItems: boolean;
		excludeEnchantingItems: boolean;
		phase: number;
	}) {
		this.uncrushabilitySetting = options.uncrushabilitySetting;
		this.uncritabilitySetting = options.uncritabilitySetting;
		this.excludeUniqueGems = options.excludeUniqueGems;
		this.excludeJewelcraftingItems = options.excludeJewelcraftingItems;
		this.excludeEnchantingItems = options.excludeEnchantingItems;
		this.classId = options.classId;
		this.phase = options.phase;
		this.resistanceFloors = options.resistanceFloors ?? [];
		this.avoidanceStatName =
			options.uncrushabilitySetting === 2 ? "ShearAvoidance" : "Avoidance";
		this.optimizeStats = options.optimizeStats;
		this.linearModel = options.linearModel;
		this.itemDatabase = options.itemDatabase;

		// The base vector is the character with NO gear on: race, talents, buffs, debuffs and
		// consumables, straight from computeStats. A 102.4% uncrushable floor therefore becomes
		// a constraint of 102.4 - baseAvoidance on the items the LP is choosing.
		this.baseAvoidance = this.linearModel.base[this.avoidanceStatName] ?? 0;
		this.avoidanceTarget = calculateAvoidanceTarget(
			this.uncrushabilitySetting,
			this.baseAvoidance,
		);

		this.baseUncritability = this.linearModel.base.Uncritability ?? 0;
		this.uncritabilityTarget = calculateUncritabilityTarget(
			this.uncritabilitySetting,
			this.baseUncritability,
		);

		this.resistanceTargets = this.resistanceFloors.map((floor) => ({
			stat: floor.stat,
			target: floor.value - (this.linearModel.base[floor.stat] ?? 0),
		}));
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

		return (
			hasRelevantAvoidance ||
			hasRelevantUncritability ||
			hasRelevantObjective ||
			hasRelevantResistance
		);
	}

	calculateScoresForStats(stats: Stat[]): ScoreSet {
		return calculateScores(
			stats,
			this.optimizeStats,
			this.linearModel,
			this.avoidanceStatName,
			this.resistanceFloors.map((floor) => floor.stat),
		);
	}

	stepAvoidanceTarget(step: number) {
		this.avoidanceTarget += step;
	}

	stepUncritabilityTarget(step: number) {
		this.uncritabilityTarget += step;
	}
}
