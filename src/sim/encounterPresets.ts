// Named encounter presets a user can pick from EncounterSettingsFields.tsx instead of hand-typing
// boss armor/health/swing numbers. Values are copied from tbc-new's own vendored
// vendor/tbc-sim/ui/paladin/protection/builds/*_encounter_only.build.json presets (same set is
// duplicated verbatim across warrior/druid tank specs too), reading each build's
// raidSimInput.encounter.targets[0] fields - not a runtime import of that JSON, since it's shaped
// for tbc-new's own proto types rather than this repo's EncounterSettings.
import type { EncounterSettings } from "#/types/SimCalibrationProfile";

export interface EncounterPreset {
	id: string;
	name: string;
	values: EncounterSettings;
}

export const ENCOUNTER_PRESETS: EncounterPreset[] = [
	{
		// vendor/tbc-sim/ui/paladin/protection/builds/default_encounter_only.build.json
		id: "default",
		name: "Generic raid boss (180s)",
		values: {
			duration: 180,
			durationVariation: 5,
			bossArmor: 7685,
			bossHealth: 6070400,
			minBaseDamage: 15113,
			damageSpread: 0.5,
			swingSpeed: 2,
		},
	},
	{
		// vendor/tbc-sim/ui/paladin/protection/builds/magtheridon_encounter_only.build.json
		id: "magtheridon",
		name: "Magtheridon",
		values: {
			duration: 180,
			durationVariation: 5,
			bossArmor: 7685,
			bossHealth: 4818380,
			minBaseDamage: 14603,
			damageSpread: 0.413,
			swingSpeed: 2,
		},
	},
	{
		// vendor/tbc-sim/ui/paladin/protection/builds/karazhan_encounter_only.build.json - modeled
		// as a trash-style encounter with no target health tracked (bossHealth: 0 in the source).
		id: "karazhan",
		name: "Karazhan (boss average)",
		values: {
			duration: 60,
			durationVariation: 30,
			bossArmor: 7685,
			bossHealth: 0,
			minBaseDamage: 11850,
			damageSpread: 0.413,
			swingSpeed: 2,
		},
	},
	{
		// vendor/tbc-sim/ui/paladin/protection/builds/morogrim_encounter_only.build.json
		id: "morogrim",
		name: "Morogrim Tidewalker",
		values: {
			duration: 180,
			durationVariation: 30,
			bossArmor: 7685,
			bossHealth: 5691000,
			minBaseDamage: 12744,
			damageSpread: 0.413,
			swingSpeed: 1.6,
		},
	},
	{
		// vendor/tbc-sim/ui/paladin/protection/builds/hydross_encounter_only.build.json
		id: "hydross",
		name: "Hydross the Unstable",
		values: {
			duration: 180,
			durationVariation: 5,
			bossArmor: 7685,
			bossHealth: 3380792,
			minBaseDamage: 5974,
			damageSpread: 0.413,
			swingSpeed: 1.5,
		},
	},
	{
		// vendor/tbc-sim/ui/paladin/protection/builds/gorefiend_encounter_only.build.json
		id: "gorefiend",
		name: "Teron Gorefiend",
		values: {
			duration: 118,
			durationVariation: 12,
			bossArmor: 6193,
			bossHealth: 5007750,
			minBaseDamage: 19688,
			damageSpread: 0.413,
			swingSpeed: 2,
		},
	},
	{
		// vendor/tbc-sim/ui/paladin/protection/builds/archimonde_encounter_only.build.json
		id: "archimonde",
		name: "Archimonde",
		values: {
			duration: 140,
			durationVariation: 22,
			bossArmor: 6193,
			bossHealth: 4552500,
			minBaseDamage: 20304,
			damageSpread: 0.413,
			swingSpeed: 1.5,
		},
	},
];

/** Returns the preset id whose values exactly match `encounter`, or null if none do ("Custom"). */
export function findMatchingPresetId(encounter: EncounterSettings): string | null {
	return (
		ENCOUNTER_PRESETS.find((preset) =>
			(Object.keys(preset.values) as (keyof EncounterSettings)[]).every(
				(key) => preset.values[key] === encounter[key],
			),
		)?.id ?? null
	);
}
