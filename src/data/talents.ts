import { convertStatToRating } from "#/helpers/convertStat";
import type { ModifierSource } from "#/solver/types";

export const getTalentsByClass = (classId: string): ModifierSource[] => {
	return TALENTS.filter((talent) => talent.classId === classId);
};

// Position of each modeled talent within a WowSims talent export string
// (e.g. "00000000000000000000-0530503050000132521050-0520502030030100000000").
// The string is 3 "-"-separated segments, one per talent tree (Holy, Protection,
// Retribution for Paladin), and within a segment character i is the rank spent in
// the i-th talent of that tree, in the tree's canonical (row-major) declaration
// order - see vendor/tbc-sim/ui/core/talents/trees/paladin.json. Trailing zero
// characters are trimmed by the exporter, so a segment may be shorter than its
// tree's talent count.
const TALENT_STRING_POSITIONS: Record<
	string,
	Record<string, { segment: number; index: number }>
> = {
	// Paladin
	"2": {
		toughness: { segment: 1, index: 4 },
		anticipation: { segment: 1, index: 8 },
		"sacred-duty": { segment: 1, index: 15 },
		"combat-expertise": { segment: 1, index: 20 },
		deflection: { segment: 2, index: 4 },
	},
};

// Extracts ranks for only the talents this app models out of a full WowSims
// talent export string. Points in unmodeled talents are ignored.
export const parseTalentsString = (
	classId: string,
	talentsStr: string,
): Record<string, number> => {
	const positions = TALENT_STRING_POSITIONS[classId];
	if (!positions) return {};

	const segments = talentsStr.split("-");
	const ranks: Record<string, number> = {};
	for (const [talentId, pos] of Object.entries(positions)) {
		const char = segments[pos.segment]?.[pos.index];
		ranks[talentId] = char ? Number(char) || 0 : 0;
	}
	return ranks;
};

export const TALENTS: ModifierSource[] = [
	{
		classId: "2",
		name: "Toughness",
		id: "toughness",
		type: "talent",
		maxRank: 5,
		stats: [
			{
				name: "Armor",
				value: 0.02,
				type: "multiplier",
			},
		],
	},
	{
		classId: "2",
		name: "Anticipation",
		id: "anticipation",
		type: "talent",
		maxRank: 5,
		stats: [
			{
				name: "Defense",
				type: "flat",
				value: convertStatToRating({
					name: "Defense",
					value: 4,
					type: "flat",
				}),
			},
		],
	},
	{
		classId: "2",
		name: "Sacred Duty",
		id: "sacred-duty",
		type: "talent",
		maxRank: 2,
		stats: [
			{
				name: "Stamina",
				value: 0.03,
				type: "multiplier",
			},
		],
	},
	{
		classId: "2",
		name: "Combat Expertise",
		id: "combat-expertise",
		type: "talent",
		maxRank: 5,
		stats: [
			{
				name: "Stamina",
				value: 0.02,
				type: "multiplier",
			},
		],
	},
	{
		classId: "2",
		name: "Deflection",
		id: "deflection",
		type: "talent",
		maxRank: 5,
		stats: [
			{
				name: "Parry",
				// 1% per rank
				value: 23.6538,
				type: "flat",
			},
		],
	},
];
