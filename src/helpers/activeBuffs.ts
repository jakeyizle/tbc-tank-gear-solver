// What the simulator actually applied to a solved set, as a flat list of labels.
//
// This replaces the old "Buffs included" chip row, which listed src/data/buffs.ts's four
// ModifierSource objects. That row described neither what the sim applied nor what the user had
// enabled - it was a third, stale account of the buffs - so it was removed with the formula
// engine rather than ported. This derives the list from the raid profile instead, which IS what
// the measured LinearStatModel is built from, so it cannot drift from the numbers beside it.
import type {
	DebuffSettings,
	IndividualBuffSettings,
	PartyBuffSettings,
	RaidBuffSettings,
	RaidProfileSettings,
	TristateEffect,
} from "#/types/SimCalibrationProfile";

/** A tristate contributes unless it is Missing; "Improved" is worth showing, "Regular" is not. */
const tristate = (value: TristateEffect, label: string): string[] => {
	if (value === "TristateEffectMissing") return [];
	return [value === "TristateEffectImproved" ? `${label} (Improved)` : label];
};

const bool = (value: boolean, label: string): string[] => (value ? [label] : []);

const raidBuffLabels = (b: RaidBuffSettings): string[] => [
	...bool(b.bloodlust, "Bloodlust"),
	...bool(b.arcaneBrilliance, "Arcane Brilliance"),
	...bool(b.shadowProtection, "Shadow Protection"),
	...tristate(b.divineSpirit, "Divine Spirit"),
	...tristate(b.giftOfTheWild, "Gift of the Wild"),
	...tristate(b.powerWordFortitude, "Power Word: Fortitude"),
	...tristate(b.thorns, "Thorns"),
];

const partyBuffLabels = (b: PartyBuffSettings): string[] => [
	...tristate(b.manaSpringTotem, "Mana Spring Totem"),
	...tristate(b.wrathOfAirTotem, "Wrath of Air Totem"),
	...tristate(b.graceOfAirTotem, "Grace of Air Totem"),
	...tristate(b.strengthOfEarthTotem, "Strength of Earth Totem"),
	...tristate(b.windfuryTotem, "Windfury Totem"),
	...tristate(b.battleShout, "Battle Shout"),
	...tristate(b.sanctityAura, "Sanctity Aura"),
	...(b.drums && b.drums !== "DrumsUnknown"
		? // "GreaterDrumsOfBattle" -> "Greater Drums Of Battle"
			[b.drums.replace(/([A-Z])/g, " $1").trim()]
		: []),
];

const individualBuffLabels = (b: IndividualBuffSettings): string[] => [
	...bool(b.blessingOfKings, "Blessing of Kings"),
	...bool(b.blessingOfSanctuary, "Blessing of Sanctuary"),
	...tristate(b.blessingOfWisdom, "Blessing of Wisdom"),
	...tristate(b.blessingOfMight, "Blessing of Might"),
];

const debuffLabels = (d: DebuffSettings): string[] => [
	...bool(d.misery, "Misery"),
	...bool(d.judgementOfWisdom, "Judgement of Wisdom"),
	...bool(d.judgementOfLight, "Judgement of Light"),
	...bool(d.bloodFrenzy, "Blood Frenzy"),
	...bool(d.curseOfRecklessness, "Curse of Recklessness"),
	...bool(d.sunderArmor, "Sunder Armor"),
	...bool(d.insectSwarm, "Insect Swarm"),
	...tristate(d.curseOfElements, "Curse of Elements"),
	...tristate(d.improvedSealOfTheCrusader, "Improved Seal of the Crusader"),
	...tristate(d.huntersMark, "Hunter's Mark"),
	...tristate(d.faerieFire, "Faerie Fire"),
	...tristate(d.exposeArmor, "Expose Armor"),
];

export interface ActiveBuffGroup {
	title: string;
	labels: string[];
}

/**
 * Grouped so the panel can show where each effect comes from - debuffs in particular are on the
 * TARGET, not the character, which the old flat chip row obscured.
 */
export function activeBuffGroups(
	raidProfile: RaidProfileSettings,
): ActiveBuffGroup[] {
	return [
		{ title: "Raid", labels: raidBuffLabels(raidProfile.raidBuffs) },
		{ title: "Party", labels: partyBuffLabels(raidProfile.partyBuffs) },
		{
			title: "Individual",
			labels: individualBuffLabels(raidProfile.individualBuffs),
		},
		{ title: "Debuffs", labels: debuffLabels(raidProfile.debuffs) },
	].filter((group) => group.labels.length > 0);
}
