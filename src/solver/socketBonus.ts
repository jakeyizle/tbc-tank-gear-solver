import type { LPItem } from "./types";

export type SocketColor = "Red" | "Blue" | "Yellow";
export type GemColor =
	| "Red"
	| "Blue"
	| "Yellow"
	| "Purple"
	| "Green"
	| "Orange"
	| "Prismatic";

// "Prismatic" (22459 Void Sphere, 22460 Prismatic Sphere - the two all-resistance gems)
// satisfies a socket of any colour, so it appears in every list. Until the Gem colour union
// gained the case, a prismatic gem fell through the gemCounts lookup as undefined and
// silently satisfied nothing, mispricing any set built to clear a resistance floor.
export const gemColorMatches: Record<SocketColor, GemColor[]> = {
	Red: ["Red", "Purple", "Orange", "Prismatic"],
	Blue: ["Blue", "Purple", "Green", "Prismatic"],
	Yellow: ["Yellow", "Green", "Orange", "Prismatic"],
};

function generateValidSocketCombos(sockets: SocketColor[]): GemColor[][] {
	const result: GemColor[][] = [];

	function backtrack(index: number, current: GemColor[]) {
		if (index === sockets.length) {
			result.push([...current]);
			return;
		}

		const socket = sockets[index];
		for (const gem of gemColorMatches[socket]) {
			current.push(gem);
			backtrack(index + 1, current);
			current.pop();
		}
	}

	backtrack(0, []);
	return result;
}

export function gemsSatisfySocketBonus(
	sockets: SocketColor[],
	gems: GemColor[],
): boolean {
	const combos = generateValidSocketCombos(sockets);

	// convert gems to a multiset
	const gemCounts: Record<GemColor, number> = {
		Red: 0,
		Blue: 0,
		Yellow: 0,
		Purple: 0,
		Green: 0,
		Orange: 0,
		Prismatic: 0,
	};
	for (const gem of gems) gemCounts[gem] = gemCounts[gem] + 1;

	// helper to check if a combo can be satisfied by available gems
	function canMatch(combo: GemColor[]): boolean {
		const countsCopy = { ...gemCounts };
		for (const gem of combo) {
			if (!countsCopy[gem] || countsCopy[gem] === 0) return false;
			countsCopy[gem]--;
		}
		return true;
	}

	return combos.some(canMatch);
}

export function itemMeetsSocketBonus(item: LPItem): boolean {
	if (item.socketBonus.length === 0) return false;
	const nonMetaGems = item.gems
		.map((g) => g.color)
		.filter((c) => c !== "Meta") as GemColor[];
	const nonMetaSockets = item.sockets
		.map((s) => s.color)
		.filter((c) => c !== "Meta") as SocketColor[];
	return gemsSatisfySocketBonus(nonMetaSockets, nonMetaGems);
}
