import { CONSUMABLES } from "../data/consumables";
import type { SolverConfiguration } from "./SolverConfiguration";
import type { LPItem } from "./types";

export const getConsumableLPItems = (
	config: SolverConfiguration,
	enabledConsumableIds: number[],
): LPItem[] => {
	return CONSUMABLES.filter((consumable) =>
		enabledConsumableIds.includes(consumable.id),
	).map((consumable) => {
		const scores = config.calculateScoresForStats(consumable.stats);
		// LPItem ids are strings across the board (gear ids are strings), so the numeric
		// consumable id is stringified here and read back with Number() where the sim needs it.
		return {
			id: String(consumable.id),
			icon: consumable.icon,
			name: consumable.name,
			type: consumable.type,
			stats: consumable.stats,
			sockets: [],
			socketBonus: [],
			enchant: { name: "", id: "", effectID: "", type: "Ranged", stats: [] },
			gems: [],
			gemSlots: [],
			uniqueId: String(consumable.id),
			locked: false,
			avoidanceScore: scores.avoidanceScore,
			objectiveScore: scores.objectiveScore,
			uncritabilityScore: scores.uncritabilityScore,
			resistanceScores: scores.resistanceScores,
		};
	});
};
