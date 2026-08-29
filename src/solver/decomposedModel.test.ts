import { describe, expect, it } from "vitest";
import { resolveChosenDecomposableItems } from "./decomposedModel";
import type { DecomposableItem, Gem, Item } from "./types";

const makeGem = (id: string, color: Gem["color"] = "Red"): Gem => ({
	name: `gem-${id}`,
	id,
	color,
	phase: "1",
	stats: [],
});

const makeBaseItem = (numSockets: number): Item => ({
	name: "test item",
	id: "999",
	type: "Chest",
	stats: [],
	sockets: Array.from({ length: numSockets }, () => ({ color: "Red" as const })),
	socketBonus: [],
});

// Builds a DecomposableItem with one gem candidate per given socket index, so a test can
// pick exactly which sockets end up "chosen" via varValues without needing a real solve.
const makeDecomposableItem = (
	uniqueId: string,
	numSockets: number,
	socketIndexesWithCandidates: number[],
): DecomposableItem => ({
	base: makeBaseItem(numSockets),
	uniqueId,
	processedType: "Chest",
	itemScores: { avoidanceScore: 0, objectiveScore: 0, uncritabilityScore: 0, resistanceScores: {} },
	enchantCandidates: [],
	sockets: socketIndexesWithCandidates.map((socketIndex) => ({
		socketIndex,
		color: "Red" as const,
		candidates: [
			{
				gem: makeGem(`gem-${socketIndex}`),
				varName: `g_${uniqueId}_${socketIndex}_gem-${socketIndex}`,
				scores: { avoidanceScore: 0, objectiveScore: 0, uncritabilityScore: 0, resistanceScores: {} },
			},
		],
	})),
});

describe("resolveChosenDecomposableItems", () => {
	it("fills a skipped middle socket with '0' instead of shifting the later gem into it", () => {
		// 3 sockets; only sockets 0 and 2 get a gem chosen
		const item = makeDecomposableItem("chest-1", 3, [0, 1, 2]);
		const varValues: Record<string, number> = {
			"chest-1": 1,
			"g_chest-1_0_gem-0": 1,
			// socket 1 not chosen
			"g_chest-1_2_gem-2": 1,
		};

		const [resolved] = resolveChosenDecomposableItems([item], varValues);

		expect(resolved.gemSlots).toEqual(["gem-0", "0", "gem-2"]);
		expect(resolved.gems.map((g) => g.id)).toEqual(["gem-0", "gem-2"]);
	});

	it("drops trailing empty sockets instead of padding them with '0'", () => {
		// 3 sockets; only socket 0 gets a gem chosen
		const item = makeDecomposableItem("chest-2", 3, [0, 1, 2]);
		const varValues: Record<string, number> = {
			"chest-2": 1,
			"g_chest-2_0_gem-0": 1,
		};

		const [resolved] = resolveChosenDecomposableItems([item], varValues);

		expect(resolved.gemSlots).toEqual(["gem-0"]);
	});

	it("produces an empty gemSlots array when no sockets are chosen", () => {
		const item = makeDecomposableItem("chest-3", 2, [0, 1]);
		const varValues: Record<string, number> = { "chest-3": 1 };

		const [resolved] = resolveChosenDecomposableItems([item], varValues);

		expect(resolved.gemSlots).toEqual([]);
		expect(resolved.gems).toEqual([]);
	});

	it("keeps gemSlots fully populated when every socket gets a gem", () => {
		const item = makeDecomposableItem("chest-4", 2, [0, 1]);
		const varValues: Record<string, number> = {
			"chest-4": 1,
			"g_chest-4_0_gem-0": 1,
			"g_chest-4_1_gem-1": 1,
		};

		const [resolved] = resolveChosenDecomposableItems([item], varValues);

		expect(resolved.gemSlots).toEqual(["gem-0", "gem-1"]);
	});
});
