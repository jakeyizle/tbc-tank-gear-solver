import { describe, expect, it } from "vitest";
import { solve } from "../src/solver/index";
import { getAvoidanceFromItems } from "../src/helpers.ts/getStatFromItem";
import type { InputItem } from "../src/solver/types";

describe("Solver Integration Tests", () => {
	it("should have avoidance discrepancy within 0.16 between sum of avoidanceScores and getAvoidanceFromItems", async () => {
		const options = {
			raceId: "1",
			classId: "2",
			uncrushabilitySetting: 1,
			uncritabilitySetting: 2,
			optimizeStats: [
				{ name: "Stamina" as const, value: 1 },
				{ name: "SpellPower" as const, value: 1 },
				{ name: "SpellHit" as const, value: 1 },
			],
			areEnchantsGemsLocked: true,
		};

		const items: InputItem[] = [
			{ id: "28505", gems: [] },
			{ id: "28511", gems: [] },
			{ enchant: "2622", gems: [], id: "27804" },
			{ id: "28245", gems: ["31867"] },
			{ id: "29126", gems: [] },
			{ id: "29172", gems: [] },
			{ id: "29370", gems: [] },
			{ id: "29132", gems: [] },
			{ id: "27529", gems: [] },
			{ enchant: "2999", gems: ["24062", "25896"], id: "29068" },
			{ enchant: "2991", gems: ["30555", "24062"], id: "28743" },
			{ enchant: "2659", gems: ["24056", "34831", "31867"], id: "29066" },
			{ enchant: "2650", gems: ["24062"], id: "28502" },
			{ enchant: "2613", gems: [], id: "29067" },
			{ id: "29253", gems: [] },
			{ enchant: "2748", gems: [], id: "29069" },
			{ enchant: "2649", gems: [], id: "29254" },
			{ enchant: "2669", gems: [], id: "29153" },
			{ enchant: "1071", gems: [], id: "28316" },
			{ id: "29388", gems: [] },
			{ enchant: "1071", gems: [], id: "28611" },
			{ id: "27917", gems: [] },
			{ id: "29323", gems: [] },
			{ id: "29279", gems: [] },
			{ id: "28528", gems: [] },
		];

		const result = await solve(items, options);
		const solvedItems = result.items;

		// Sum of individual avoidanceScores
		const sumOfAvoidanceScores = solvedItems.reduce(
			(sum, item) => sum + item.avoidanceScore,
			0,
		);

		// Avoidance calculated by getAvoidanceFromItems
		const calculatedAvoidance = getAvoidanceFromItems(solvedItems);

		// Calculate the difference
		const difference = Math.abs(sumOfAvoidanceScores - calculatedAvoidance);

		// Assert the difference is within expected tolerance (0.16)
		// This accounts for defense rating being floored to integer defense skills
		expect(difference).toBeLessThanOrEqual(0.16);
	});
});
