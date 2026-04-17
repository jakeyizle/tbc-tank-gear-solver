import type { LPItem, StatName } from "#/solver/types";
import { convertStat } from "./convertStat";
import { getBaseStat } from "./getBaseStat";
import { getStatFromAllItems } from "./getStatFromItem";

type DisplayStatName =
	| StatName
	| "Avoidance"
	| "Uncritability"
	| "Effective HP";

export default class StatCalculator {
	items: LPItem[];
	raceId: string;
	classId: string;

	constructor(items: LPItem[], raceId: string, classId: string) {
		this.items = items;
		this.raceId = raceId;
		this.classId = classId;
	}
	calculateStat(statName: DisplayStatName): number {
		switch (statName) {
			case "Health":
				return this.calculateHealth();
			case "Mana":
				return this.calculateMana();
			case "Armor":
				return this.calculateArmor();
			case "Avoidance":
				return this.calculateAvoidance();
			case "Uncritability":
				return this.calculateUncritability();
			case "Effective HP":
				return this.calculateEffectiveHP();
			case "Dodge":
				return this.calculateDodge();
			default:
				return this.getEntireStat(statName);
		}
	}

	private getEntireStat(statName: StatName): number {
		const itemStat = getStatFromAllItems(this.items, statName);
		const baseStat = getBaseStat(statName, this.classId, this.raceId);
		// TODO: buffs, talents, etc.
		return baseStat + itemStat;
	}

	private calculateHealthFromStamina(stamina: number): number {
		// derived empirically - first 20 stam provides 1 hp each and stam is rounded down
		const staminaRounded = Math.floor(stamina);
		return (staminaRounded - 20) * 10 + 20;
	}

	private calculateHealth(): number {
		// TODO: base health numbers are wrong - they are too high
		const health = this.getEntireStat("Health");

		const stamina = this.getEntireStat("Stamina");
		// TODO: talents that increase stamina - sacred duty is 6% and combat expertise is 10%
		// these are multiplied, cannot be added together
		const SACRED_DUTY_STAM_MULTIPLIER = 1.06;
		const COMBAT_EXPERTISE_STAM_MULTIPLIER = 1.1;
		// TODO: include kings and other buffs
		const totalStamina =
			stamina * SACRED_DUTY_STAM_MULTIPLIER * COMBAT_EXPERTISE_STAM_MULTIPLIER;
		const healthFromStamina = this.calculateHealthFromStamina(totalStamina);
		return health + healthFromStamina;
	}

	private calculateMana(): number {
		const mana = this.getEntireStat("Mana");
		// TODO: include kings and other buffs
		const intellect = this.getEntireStat("Intellect");
		const manaFromIntellect = intellect * 15;
		return mana + manaFromIntellect;
	}

	private calculateArmor(): number {
		const armor = this.getEntireStat("Armor");
		// TODO: talents increase armor
		const TOUGHNESS_ARMOR_MULTIPLIER = 1.06;
		const totalItemArmor = armor * TOUGHNESS_ARMOR_MULTIPLIER;

		const agility = this.getEntireStat("Agility");
		const armorFromAgility = agility * 2;
		return Math.floor(totalItemArmor + armorFromAgility);
	}

	private calculateDodge(): number {
		const dodge = this.getEntireStat("Dodge");
		const agility = this.getEntireStat("Agility");
		// TODO: this based on class
		const dodgeFromAgility = agility / 25;
		return dodge + dodgeFromAgility;
	}

	private calculateUncritability(): number {
		const DEFENSE_RATING_PER_SKILL = 2.3654;
		const RESILIENCE_RATING_PER_SKILL = 39.4231;

		const defenseRating = this.getEntireStat("Defense");
		const resilienceRating = this.getEntireStat("Resilience");

		const defenseSkill = Math.floor(defenseRating / DEFENSE_RATING_PER_SKILL);
		const resilienceSkill = Math.floor(
			resilienceRating / RESILIENCE_RATING_PER_SKILL,
		);

		const uncritabilityFromDefense = defenseSkill * 0.04;
		return uncritabilityFromDefense + resilienceSkill;
	}

	private calculateAvoidance(): number {
		const dodgeRating = this.calculateStat("Dodge");
		const parryRating = this.calculateStat("Parry");
		const blockRating = this.calculateStat("Block");
		const defenseRating = this.calculateStat("Defense");

		const dodge = convertStat({ name: "Dodge", value: dodgeRating });
		const parry = convertStat({ name: "Parry", value: parryRating });
		const block = convertStat({ name: "Block", value: blockRating });
		const defense = convertStat({ name: "Defense", value: defenseRating });
		// TODO: figure out where the fuck to put this
		const avoidanceFromDefense = defense * 0.04 * 4;

		return dodge + parry + block + avoidanceFromDefense;
	}

	private calculateEffectiveHP(): number {
		const health = this.calculateStat("Health");
		const armor = this.calculateStat("Armor");
		const armorDR = convertStat({ name: "Armor", value: armor });
		return health / (1 - armorDR);
	}
}
