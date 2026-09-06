import { CONSUMABLES } from "../data/consumables";
import type { SolverConfiguration } from "./SolverConfiguration";
import type { LPItem } from "./types";

export const getConsumableLPItems = (
	config: SolverConfiguration,
	enabledConsumableIds: string[],
): LPItem[] => {
	return CONSUMABLES.filter((consumable) =>
		enabledConsumableIds.includes(consumable.id),
	).map((consumable) => {
		const scores = config.calculateScoresForStats(consumable.stats);
		return {
			id: consumable.id,
			name: consumable.name,
			type: consumable.type,
			stats: consumable.stats,
			sockets: [],
			socketBonus: [],
			enchant: { name: "", id: "", effectID: "", type: "Ranged", stats: [] },
			gems: [],
			gemSlots: [],
			uniqueId: consumable.id,
			locked: false,
			avoidanceScore: scores.avoidanceScore,
			objectiveScore: scores.objectiveScore,
			uncritabilityScore: scores.uncritabilityScore,
			resistanceScores: scores.resistanceScores,
		};
	});
};
