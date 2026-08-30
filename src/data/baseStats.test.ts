import { describe, expect, it } from "vitest";
import { getBaseStats } from "./baseStats";

describe("getBaseStats", () => {
	it.each([
		["3", "Dwarf"],
		["10", "Blood Elf"],
		["11", "Draenei"],
	])("gives Paladin race %s (%s) the class-based Health/Mana baseline", (raceId) => {
		const stats = getBaseStats(raceId, "2");
		expect(stats.find((s) => s.name === "Health")?.value).toBe(3377);
		expect(stats.find((s) => s.name === "Mana")?.value).toBe(2953);
	});
});
