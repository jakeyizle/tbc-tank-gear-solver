// Hardcoded v1 reference encounter: copied verbatim from tbc-new's own
// vendor/tbc-sim/ui/paladin/protection/builds/default_encounter_only.build.json — a generic
// 180s single-target raid boss profile. Shown to the user as read-only context ("Optimized
// against: ...") per docs/plans/sim-backed-objectives.md's north star, not yet selectable.

export const PROT_PALADIN_REFERENCE_ENCOUNTER_NAME = "Generic raid boss (180s)";

export const PROT_PALADIN_REFERENCE_TANKS = [{ type: "Player" }];

export const PROT_PALADIN_REFERENCE_ENCOUNTER = {
	duration: 180,
	durationVariation: 5,
	executeProportion20: 0.2,
	executeProportion25: 0.25,
	executeProportion35: 0.35,
	executeProportion45: 0.45,
	executeProportion90: 0.9,
	targets: [
		{
			id: 31146,
			name: "Raid Target",
			level: 73,
			mobType: "MobTypeMechanical",
			// Positional stat array, index-matched to common.proto's Stat enum ordinals
			// (see docs/plans/sim-backed-objectives.md's SimDatabase note) — index 17 is
			// Armor (320, trivial), index 31 is the boss's own Armor (7685), index 33 is
			// Health (6070400).
			stats: [
				0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 320, 0, 0, 0, 0, 0,
				0, 0, 0, 0, 0, 0, 0, 0, 7685, 0, 6070400, 0, 0, 0, 0, 0, 0, 0, 0,
			],
			minBaseDamage: 15113,
			damageSpread: 0.5,
			swingSpeed: 2,
			parryHaste: true,
		},
	],
};
