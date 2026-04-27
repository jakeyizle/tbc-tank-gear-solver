import type { Stat } from "#/solver/types";

type StatRatingName =
	| "Parry"
	| "Dodge"
	| "Block"
	| "Defense"
	| "Resilience"
	| "Armor"
	| "SpellCrit"
	| "SpellHit"
	| "SpellHaste"
	| "Miss"
	| "Agility";

type Conversion = {
	toPercentageOrSkill: (value: number, roundRating?: boolean) => number;
	toRating: (value: number) => number; // optional reverse
};

const statConversions: Record<StatRatingName, Conversion> = {
	Parry: {
		toPercentageOrSkill: (v) => v / 23.6538,
		toRating: (v) => v * 23.6538,
	},
	Dodge: {
		toPercentageOrSkill: (v) => v / 18.9231,
		toRating: (v) => v * 18.9231,
	},
	Block: {
		toPercentageOrSkill: (v) => v / 7.8846,
		toRating: (v) => v * 7.8846,
	},
	Defense: {
		toPercentageOrSkill: (v, roundRating) => {
			const val = v / 2.3654;
      return roundRating ? Math.round(val) : val;
    },
		toRating: (v) => v * 2.3654,
	},
	Resilience: {
		toPercentageOrSkill: (v, roundRating) => {
			const val = v / 39.4231;
			return roundRating ? Math.round(val) : val;
		},
		toRating: (v) => v * 39.4231,
	},
	Armor: {
		toPercentageOrSkill: (v) => v / (v + 10557.5),
		toRating: () => {
			throw new Error("Armor cannot be converted to rating");
		},
	},
	SpellCrit: {
		toPercentageOrSkill: (v) => v / 22.1,
		toRating: (v) => v * 22.1,
	},
	SpellHit: {
		toPercentageOrSkill: (v) => v / 12.6,
		toRating: (v) => v * 12.6,
	},
	SpellHaste: {
		toPercentageOrSkill: (v) => v / 15.8,
		toRating: (v) => v * 15.8,
	},
	Miss: {
		toPercentageOrSkill: (v) => v,
		toRating: (v) => v,
	},
	// this converts agility to dodge
	// TODO: this is based on class
	Agility: {
		toPercentageOrSkill: (v) => v / 25,
		toRating: () => {
			throw new Error("Cannot caluclate agility from dodge");
		},
	},
};

export const convertStatToPercentageOrSkill = (
	stat: Stat & { name: StatRatingName },
	roundRating = false,
) => statConversions[stat.name].toPercentageOrSkill(stat.value, roundRating);
export const convertStatToRating = (
	stat: Stat & { name: Exclude<StatRatingName, "Armor"> },
) => statConversions[stat.name].toRating(stat.value);

export const convertStat = (
	stat: Stat & {
		name:
			| "Parry"
			| "Dodge"
			| "Block"
			| "Defense"
			| "Resilience"
			| "Armor"
			| "SpellCrit"
			| "SpellHit"
			| "SpellHaste";
	},
) => {
	switch (stat.name) {
		case "Parry":
			return stat.value / 23.6538;
		case "Dodge":
			return stat.value / 18.9231;
		case "Block":
			return stat.value / 7.8846;
		case "Defense":
			return Math.floor(stat.value / 2.3654);
		case "Resilience":
			return Math.floor(stat.value / 39.4231);
		case "Armor":
			// TODO this differs depending on the level of attacker (ex less armor against a 73)
			return stat.value / (stat.value + 10557.5);
		case "SpellCrit":
			return stat.value / 22.1;
		case "SpellHit":
			return stat.value / 12.6;
		case "SpellHaste":
			return stat.value / 15.8;
	}
};
