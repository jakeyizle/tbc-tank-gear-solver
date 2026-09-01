// Hardcoded v1 Protection Paladin calibration profile: talents, class options, consumables,
// raid/party/individual buffs, debuffs, and reference encounter. Every value here is copied
// verbatim from vendor/tbc-sim/ui/paladin/protection/presets.ts's `Default*` exports (and
// `OtherDefaults`/`defaultExposeWeaknessSettings()`, inlined since they're phase-dependent
// helpers in tbc-new's UI layer we don't want to pull in wholesale) — this is the same
// baseline tbc-new's own UI defaults a new Protection Paladin sim to.
//
// Deliberately a single hardcoded bundle for v1 (see docs/plans/sim-backed-objectives.md's
// north star) rather than user-editable settings — but every field here maps 1:1 onto a
// proto field tbc-new's own settings UI exposes, so turning any one of these into a real
// solver setting later is "read from user input instead of this constant", not a redesign.
//
// All values are plain JSON objects (proto3 JSON shape, camelCase field names) rather than
// constructed via the generated proto `.create()` helpers, so this file has no dependency on
// src/sim/proto/ and stays readable as plain data.

export const PROT_PALADIN_TALENTS_STRING =
	"-0530513050000142521051-052050003003";

// proto.ProtectionPaladin's shape: { options: { classOptions: PaladinOptions } } - the
// "options" level is easy to drop by mistake (it did get dropped once - see the plan doc's
// Phase 2 execution log) since PaladinOptions itself is currently an empty message.
export const PROT_PALADIN_CLASS_OPTIONS = {
	options: { classOptions: {} },
};

export const PROT_PALADIN_CONSUMABLES = {
	flaskId: 22861, // Flask of Blinding Light
	foodId: 27657, // Blackened Basilisk
	potId: 22849, // Ironshield Potion
	conjuredId: 12662, // Dark Rune
	mhImbueId: 28017,
	explosiveId: 30217,
	superSapper: true,
	goblinSapper: true,
	nightmareSeed: true,
	scrollStr: true,
	scrollAgi: true,
	scrollArm: true,
};

export const PROT_PALADIN_RAID_BUFFS = {
	bloodlust: true,
	divineSpirit: "TristateEffectImproved",
	arcaneBrilliance: true,
	giftOfTheWild: "TristateEffectImproved",
	powerWordFortitude: "TristateEffectImproved",
	shadowProtection: true,
	thorns: "TristateEffectImproved",
};

export const PROT_PALADIN_PARTY_BUFFS = {
	manaSpringTotem: "TristateEffectRegular",
	wrathOfAirTotem: "TristateEffectRegular",
	graceOfAirTotem: "TristateEffectMissing",
	strengthOfEarthTotem: "TristateEffectImproved",
	windfuryTotem: "TristateEffectMissing",
	battleShout: "TristateEffectMissing",
	drums: "LesserDrumsOfBattle",
	sanctityAura: "TristateEffectMissing",
};

export const PROT_PALADIN_INDIVIDUAL_BUFFS = {
	blessingOfKings: true,
	blessingOfWisdom: "TristateEffectImproved",
	blessingOfMight: "TristateEffectImproved",
	blessingOfSanctuary: true,
};

export const PROT_PALADIN_DEBUFFS = {
	misery: true,
	curseOfElements: "TristateEffectImproved",
	improvedSealOfTheCrusader: "TristateEffectImproved",
	judgementOfWisdom: true,
	judgementOfLight: true,
	bloodFrenzy: true,
	huntersMark: "TristateEffectImproved",
	curseOfRecklessness: true,
	sunderArmor: true,
	faerieFire: "TristateEffectImproved",
	exposeArmor: "TristateEffectImproved",
	insectSwarm: true,
	// defaultExposeWeaknessSettings() for tbc-new's CURRENT_PHASE (Phase 3) at the time this
	// was written — a phase-3 raid content assumption baked into the hardcoded v1 profile.
	exposeWeaknessUptime: 0.9,
	exposeWeaknessHunterAgility: 1210,
};

// Simple-rotation booleans (proto.ProtectionPaladin.Rotation), matching tbc-new's own
// `DefaultSimpleRotation`. Documentation only for v1 — not sent to the sim directly. The
// actual `Player.rotation` sent in a request is `protPaladinDefaultApl.ts`'s precompiled
// APLRotation, which is what tbc-new's own `simpleRotation()` transform produces from
// exactly these booleans. Only needed as real input again if the simple-rotation settings
// become user-editable, at which point vendor `simpleRotation()` and run it against
// whatever the user picked instead of using the precompiled constant.
export const PROT_PALADIN_DEFAULT_SIMPLE_ROTATION = {
	prioritizeHolyShield: true,
	consecrationRank: 6,
	useExorcism: true,
	useAvengersShield: false,
	useHammerOfWrath: false,
	precastAvengersShield: true,
	maintainJudgement: "JudgementNone",
	aura: "DevotionAura",
};

// Race/level/healing-model context (OtherDefaults + Player-level fields tbc-new's UI sends
// alongside the above). healingModel matters for DTPS/TMI-5, which depend on incoming heals.
export const PROT_PALADIN_PLAYER_DEFAULTS = {
	race: "RaceDraenei",
	level: 70,
	inFrontOfTarget: true,
	healingModel: {
		hps: 2200,
		cadenceSeconds: 0.4,
		cadenceVariation: 1.2,
		absorbFrac: 0.02,
		burstWindow: 6,
		inspirationUptime: 0.25,
	},
};
