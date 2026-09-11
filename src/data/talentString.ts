// Decoding a WowSims talent export string.
//
// This is vendored-sim knowledge, not app config: the positions below are read off
// vendor/tbc-sim/ui/core/talents/trees/paladin.json, the same way src/data/mechanics.ts restates
// the vendor's combat constants. It lives here, in the neutral data layer, because it depends on
// nothing - not the solver, not the sim, not React - and all three import it.
//
// It was extracted from src/data/talents.ts, whose remaining half (talent ranks modeled as
// ModifierSource stat effects) belongs to the hand-written stat engine and is being deleted. This
// half is NOT part of that: the simulator is the stat authority now, but something still has to
// turn the user's talent string into ranks, for:
//   - src/sim/deriveLinearModel.ts      - Improved Righteous Fury's damage-taken multiplier
//   - src/sim/protPaladinSimpleRotation.ts - rotation option gating
//   - components/.../RaidProfileFields.tsx - showing which rotation options are available

// Position of each modeled talent within a WowSims talent export string
// (e.g. "00000000000000000000-0530503050000132521050-0520502030030100000000").
// The string is 3 "-"-separated segments, one per talent tree (Holy, Protection,
// Retribution for Paladin), and within a segment character i is the rank spent in
// the i-th talent of that tree, in the tree's canonical (row-major) declaration
// order. Trailing zero characters are trimmed by the exporter, so a segment may be
// shorter than its tree's talent count.
const TALENT_STRING_POSITIONS: Record<
	string,
	Record<string, { segment: number; index: number }>
> = {
	// Paladin
	"2": {
		toughness: { segment: 1, index: 4 },
		anticipation: { segment: 1, index: 8 },
		"sacred-duty": { segment: 1, index: 15 },
		"holy-shield": { segment: 1, index: 18 },
		"combat-expertise": { segment: 1, index: 20 },
		"avengers-shield": { segment: 1, index: 21 },
		"improved-righteous-fury": { segment: 1, index: 6 },
		deflection: { segment: 2, index: 4 },
		"sanctity-aura": { segment: 2, index: 13 },
	},
};

/**
 * Ranks for the talents this app reads, out of a full WowSims talent export string. Points in
 * talents no caller asks about are ignored. Returns {} for a class with no position map.
 */
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
