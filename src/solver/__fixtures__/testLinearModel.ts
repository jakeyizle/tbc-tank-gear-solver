// GENERATED - do not edit by hand.
//
// A snapshot of src/sim/deriveLinearModel.ts's output for DEFAULT_SIM_CALIBRATION_PROFILE,
// so that src/solver/'s unit tests can exercise real coefficients without loading the 5.5MB
// wasm sim. Regenerate with:
//
//   UPDATE_LINEAR_MODEL_FIXTURE=1 npx vitest run src/sim/deriveLinearModel.test.ts
//
// deriveLinearModel.test.ts fails if this drifts from what the sim actually produces.
import type { LinearStatModel } from "#/types/LinearStatModel";

export const TEST_LINEAR_MODEL: LinearStatModel = {
	base: {
		Strength: 289,
		Agility: 123,
		Stamina: 307,
		Intellect: 155,
		HealingPower: 120.6,
		SpellPower: 185.6,
		ArcaneSpellPower: 80,
		FireSpellPower: 0,
		FrostSpellPower: 0,
		HolySpellPower: 80,
		NatureSpellPower: 80,
		ShadowSpellPower: 0,
		SpellHit: 0,
		SpellCrit: 0,
		SpellHaste: 0,
		SpellPenetration: 0,
		Spirit: 196,
		AttackPower: 1032,
		RangedAttackPower: 264,
		FeralAttackPower: 0,
		MeleeHit: 0,
		MeleeCrit: 0,
		MeleeHaste: 0,
		ArmorPenetration: 0,
		Expertise: 19.71154,
		Defense: 47.3077,
		Block: 0,
		BlockValue: 14.450000000000001,
		Dodge: 93.10154868000001,
		Parry: 0,
		Resilience: 0,
		Armor: 1105.5,
		BonusArmor: 0,
		Health: 6267,
		Mana: 4998,
		MP5: 99,
		ArcaneResistance: 33,
		FireResistance: 33,
		FrostResistance: 33,
		NatureResistance: 33,
		ShadowResistance: 80,
		Miss: 7.8,
		Avoidance: 60.769999999999996,
		ShearAvoidance: 52.97,
		Uncritability: 0.8,
	},
	coefficients: {
		Strength: {
			Strength: 1.1,
			AttackPower: 2.2,
			BlockValue: 0.055,
		},
		Agility: {
			Agility: 1.1,
			Dodge: 0.832615476,
			Armor: 2.4200000000000004,
			Avoidance: 0.04399999999999999,
			ShearAvoidance: 0.04399999999999999,
		},
		Stamina: {
			Stamina: 1.283,
			Health: 12.83,
		},
		Intellect: {
			Intellect: 1.1,
			Mana: 16.5,
		},
		HealingPower: {
			HealingPower: 0.9999999999999999,
		},
		SpellPower: {
			SpellPower: 0.9999999999999999,
		},
		ArcaneSpellPower: {
			ArcaneSpellPower: 1,
		},
		FireSpellPower: {
			FireSpellPower: 1,
		},
		FrostSpellPower: {
			FrostSpellPower: 1,
		},
		HolySpellPower: {
			HolySpellPower: 1,
		},
		NatureSpellPower: {
			NatureSpellPower: 1,
		},
		ShadowSpellPower: {
			ShadowSpellPower: 1,
		},
		SpellHit: {
			SpellHit: 1,
		},
		SpellCrit: {
			SpellCrit: 1,
		},
		SpellHaste: {
			SpellHaste: 1,
		},
		SpellPenetration: {
			SpellPenetration: 1,
		},
		Spirit: {
			HealingPower: 0.11,
			SpellPower: 0.11000000000000003,
			Spirit: 1.1,
		},
		AttackPower: {
			AttackPower: 1,
		},
		RangedAttackPower: {
			RangedAttackPower: 1,
		},
		FeralAttackPower: {
			FeralAttackPower: 1,
		},
		MeleeHit: {
			MeleeHit: 1,
		},
		MeleeCrit: {
			MeleeCrit: 1,
		},
		MeleeHaste: {
			MeleeHaste: 1,
		},
		ArmorPenetration: {
			ArmorPenetration: 1,
		},
		Expertise: {
			Expertise: 1,
		},
		Block: {
			Block: 1,
			Avoidance: 0.1268292744794768,
			ShearAvoidance: 0.1268292744794768,
		},
		BlockValue: {
			BlockValue: 1,
		},
		Dodge: {
			Dodge: 1,
			Avoidance: 0.052845522655166205,
			ShearAvoidance: 0.052845522655166205,
		},
		Parry: {
			Parry: 1,
			Avoidance: 0.042276421251900384,
			ShearAvoidance: 0.042276421251900384,
		},
		Resilience: {
			Resilience: 1,
			Uncritability: 0.0253658388102407,
		},
		Armor: {
			Armor: 1.1,
		},
		BonusArmor: {
			Armor: 1.1,
			BonusArmor: 1,
		},
		Health: {
			Health: 1,
		},
		Mana: {
			Mana: 1,
		},
		MP5: {
			MP5: 1,
		},
		ArcaneResistance: {
			ArcaneResistance: 1,
		},
		FireResistance: {
			FireResistance: 1,
		},
		FrostResistance: {
			FrostResistance: 1,
		},
		NatureResistance: {
			NatureResistance: 1,
		},
		ShadowResistance: {
			ShadowResistance: 1,
		},
	},
	defense: {
		ratingPerPoint: 2.365385,
		baseRating: 47.3077,
		perPoint: {
			Miss: 0.04,
			Avoidance: 0.16,
			ShearAvoidance: 0.12,
			Uncritability: 0.04,
			Dodge: 0.75692316,
			Parry: 0.94615388,
			Block: 0.3153846,
		},
	},
	attackerLevel: 73,
	physicalDamageTakenMultiplier: 0.94,
};
