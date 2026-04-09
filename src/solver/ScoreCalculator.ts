import type { SolverConfiguration } from "./SolverConfiguration";
import type { Stat } from "./types";

export interface ScoreResult {
	avoidanceScore: number;
	objectiveScore: number;
	uncritabilityScore: number;
}

export class ScoreCalculator {
	constructor(private config: SolverConfiguration) {}

	calculateAvoidance(stat: Stat): number {
		switch (stat.name) {
			case "Agility":
				return stat.value / 25;
			case "Defense":
				return (stat.value / 2.3654) * 0.04 * 4;
			case "Dodge":
				return stat.value / 18.9231;
			case "Parry":
				return stat.value / 23.6538;
			case "Block":
				return stat.value / 7.8846;
			default:
				return 0;
		}
	}

	calculateObjective(stat: Stat): number {
		const statCoefficient =
			this.config.optimizeStats.find((s) => s.name === stat.name)?.value || 0;
		return stat.value * statCoefficient;
	}

	calculateUncritability(stat: Stat): number {
		const DEFENSE_RATING_PER_SKILL = 2.3654;
		const RESILIENCE_RATING_PER_SKILL = 39.4231;

		switch (stat.name) {
			case "Resilience":
				return (stat.value / RESILIENCE_RATING_PER_SKILL);
			case "Defense":
				return 0.04 * (stat.value / DEFENSE_RATING_PER_SKILL);
			default:
				return 0;
		}
	}

	calculateScoresForStats(stats: Stat[]): ScoreResult {
		let avoidanceScore = 0;
		let objectiveScore = 0;
		let uncritabilityScore = 0;

		for (const stat of stats) {
			avoidanceScore += this.calculateAvoidance(stat);
			objectiveScore += this.calculateObjective(stat);
			uncritabilityScore += this.calculateUncritability(stat);
		}

		return { avoidanceScore, objectiveScore, uncritabilityScore };
	}

	hasRelevantStats(stats: Stat[]): boolean {
		const scores = this.calculateScoresForStats(stats);
		
		const hasRelevantAvoidance = this.config.uncrushabilitySetting > 0 && scores.avoidanceScore > 0;
		const hasRelevantUncritability = this.config.uncritabilitySetting > 0 && scores.uncritabilityScore > 0;
		const hasRelevantObjective = scores.objectiveScore > 0;
		
		return hasRelevantAvoidance || hasRelevantUncritability || hasRelevantObjective;
	}
}
