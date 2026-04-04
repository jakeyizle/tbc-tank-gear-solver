import {
	calculateAvoidanceTarget,
	calculateUncritabilityTarget,
} from "./avoidance";
import { getTransformedItems } from "./items";
import { runLPModel } from "./solver";
import type { Stat } from "./types";

interface SolveOptions {
	uncrushabilitySetting: number;
	uncritabilitySetting: number;
	optimizeStats: Stat[];
	areEnchantsGemsLocked: boolean;
	raceId: string;
	classId: string;
}

export const solve = async (
	itemIds: string[],
	options: SolveOptions,
) => {
    const { raceId, classId, uncrushabilitySetting, uncritabilitySetting, optimizeStats, areEnchantsGemsLocked } = options;
	const lpItems = getTransformedItems(itemIds, optimizeStats, areEnchantsGemsLocked, uncrushabilitySetting, uncritabilitySetting);
	const avoidanceTarget = calculateAvoidanceTarget(raceId, classId, uncrushabilitySetting);
	const uncritabilityTarget = calculateUncritabilityTarget(uncritabilitySetting);
	console.log(`avoidance target: ${avoidanceTarget}`);
	console.log(`uncritability target: ${uncritabilityTarget}`);
	console.log(`items: ${lpItems.length}`);

	return await runLPModel(lpItems, avoidanceTarget, uncritabilityTarget);
};
