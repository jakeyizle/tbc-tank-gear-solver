import {
	calculateAvoidanceTarget,
	calculateBaseAvoidance,
	calculateUncritabilityTarget,
} from "./avoidance";
import { getTransformedItems } from "./items";
import { runLPModel } from "./solver";
import type { InputItem, Stat } from "./types";

interface SolveOptions {
	uncrushabilitySetting: number;
	uncritabilitySetting: number;
	optimizeStats: Stat[];
	areEnchantsGemsLocked: boolean;
	raceId: string;
	classId: string;
}

export const solve = async (
	items: InputItem[],
	options: SolveOptions,
) => {
    const { raceId, classId, uncrushabilitySetting, uncritabilitySetting, optimizeStats, areEnchantsGemsLocked } = options;
	const lpItems = getTransformedItems(items, optimizeStats, areEnchantsGemsLocked, uncrushabilitySetting, uncritabilitySetting);
	const avoidanceTarget = calculateAvoidanceTarget(raceId, classId, uncrushabilitySetting);
	const uncritabilityTarget = calculateUncritabilityTarget(uncritabilitySetting);
	console.log(`avoidance target: ${avoidanceTarget}`);
	console.log(`uncritability target: ${uncritabilityTarget}`);
	console.log(`items: ${lpItems.length}`);
	const solvedItems = await runLPModel(lpItems, avoidanceTarget, uncritabilityTarget);
	const baseAvoidance = calculateBaseAvoidance(raceId, classId, uncrushabilitySetting);
	return {items: solvedItems, baseAvoidance};
};
