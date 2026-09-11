// Drift guard for the enum tables hand-transcribed into src/data/tbcDatabase.ts.
//
// Those tables are deliberately NOT imported from src/sim/proto/common.ts at runtime:
// tbcDatabase.ts is loaded on the solver path, and pulling a 200KB+ generated protobuf-ts
// module (plus @protobuf-ts/runtime) in for a handful of enum values would drag the sim
// chunk into plain solves. Importing them HERE costs nothing - tests are not bundled - and
// makes a future upstream enum renumbering fail loudly instead of silently mis-adapting
// every item in the database.
import { describe, expect, it } from "vitest";
import {
	EnchantType,
	GemColor,
	HandType,
	ItemType,
	Profession,
	Stat,
	WeaponType,
} from "#/sim/proto/common";
import {
	armorConstant,
	BOSS_LEVEL,
	baseBlockChance,
	baseCrushChance,
	baseDodgeChance,
	baseMissChance,
	baseParryChance,
	MISS_DODGE_PARRY_BLOCK_CRIT_CHANCE_PER_DEFENSE,
} from "./mechanics";
import { __enumTablesForTest, STAT_INDEX_TO_NAME } from "./tbcDatabase";

describe("tbcDatabase enum tables match the generated protobuf enums", () => {
	const {
		itemTypes,
		gemColors,
		handTypes,
		weaponTypes,
		enchantTypes,
		professions,
	} = __enumTablesForTest;

	it("ItemType indices line up", () => {
		expect(itemTypes[ItemType.ItemTypeHead]).toBe("Head");
		expect(itemTypes[ItemType.ItemTypeFinger]).toBe("Finger");
		expect(itemTypes[ItemType.ItemTypeWeapon]).toBe("Weapon");
		expect(itemTypes[ItemType.ItemTypeRanged]).toBe("Ranged");
		// The table must cover every declared enum value, or items silently vanish.
		const declared = Object.values(ItemType).filter(
			(v): v is number =>
				typeof v === "number" && v !== ItemType.ItemTypeUnknown,
		);
		for (const value of declared) expect(itemTypes[value]).toBeTruthy();
	});

	it("GemColor indices line up", () => {
		expect(gemColors[GemColor.GemColorMeta]).toBe("Meta");
		expect(gemColors[GemColor.GemColorRed]).toBe("Red");
		expect(gemColors[GemColor.GemColorBlue]).toBe("Blue");
		expect(gemColors[GemColor.GemColorYellow]).toBe("Yellow");
		expect(gemColors[GemColor.GemColorPrismatic]).toBe("Prismatic");
	});

	it("HandType and WeaponType indices line up", () => {
		expect(handTypes[HandType.HandTypeMainHand]).toBe("MainHand");
		expect(handTypes[HandType.HandTypeTwoHand]).toBe("TwoHand");
		expect(weaponTypes[WeaponType.WeaponTypeShield]).toBe("Shield");
		expect(weaponTypes[WeaponType.WeaponTypeMace]).toBe("Mace");
	});

	it("EnchantType and Profession indices line up", () => {
		expect(enchantTypes[EnchantType.EnchantTypeTwoHand]).toBe("TwoHand");
		expect(enchantTypes[EnchantType.EnchantTypeShield]).toBe("Shield");
		expect(professions[Profession.Enchanting]).toBe("Enchanting");
		expect(professions[Profession.Jewelcrafting]).toBe("Jewelcrafting");
	});

	it("the stat index table lines up with proto.Stat", () => {
		expect(STAT_INDEX_TO_NAME[Stat.StatStrength]).toBe("Strength");
		expect(STAT_INDEX_TO_NAME[Stat.StatStamina]).toBe("Stamina");
		expect(STAT_INDEX_TO_NAME[Stat.StatSpellDamage]).toBe("SpellPower");
		expect(STAT_INDEX_TO_NAME[Stat.StatDefenseRating]).toBe("Defense");
		expect(STAT_INDEX_TO_NAME[Stat.StatDodgeRating]).toBe("Dodge");
		expect(STAT_INDEX_TO_NAME[Stat.StatParryRating]).toBe("Parry");
		expect(STAT_INDEX_TO_NAME[Stat.StatBlockRating]).toBe("Block");
		expect(STAT_INDEX_TO_NAME[Stat.StatArmor]).toBe("Armor");
		expect(STAT_INDEX_TO_NAME[Stat.StatBonusArmor]).toBe("BonusArmor");
		expect(STAT_INDEX_TO_NAME[Stat.StatFireResistance]).toBe("FireResistance");
	});
});

describe("mechanics constants", () => {
	it("reproduces the armor constant this repo had hardcoded for a boss", () => {
		// The deleted helpers/convertStat.ts hardcoded 11960; that is the level-73 value only.
		expect(armorConstant(BOSS_LEVEL)).toBeCloseTo(11960, 6);
		expect(armorConstant(72)).toBeCloseTo(11492.5, 6);
	});

	it("exposes the boss-level combat values (NOT the display convention)", () => {
		expect(baseMissChance(BOSS_LEVEL)).toBeCloseTo(0.044, 6);
		expect(baseMissChance(70)).toBeCloseTo(0.05, 6);
		expect(baseDodgeChance(BOSS_LEVEL)).toBeCloseTo(-0.006, 6);
		// Crushing blows only exist from +3 attackers, which is why uncrushable is a thing.
		expect(baseCrushChance(BOSS_LEVEL)).toBeCloseTo(0.15, 6);
		expect(baseCrushChance(72)).toBe(0);
	});

	// The reason the uncrushable target is 102.4 and not 100: a level-73 attacker costs each
	// of miss/dodge/parry/block exactly 0.6 percentage points, and the displayed figure keeps
	// the level-70 base values rather than subtracting that. 0.6 * 4 = 2.4.
	it("accounts for the 102.4% uncrushable threshold", () => {
		const perAvoidanceTypePenalty = 0.6;
		for (const atLevel70 of [
			baseMissChance(70),
			baseBlockChance(70),
			baseParryChance(70),
		]) {
			expect((atLevel70 - baseMissChance(BOSS_LEVEL)) * 100).toBeCloseTo(
				perAvoidanceTypePenalty,
				6,
			);
		}
		expect(
			(baseDodgeChance(70) - baseDodgeChance(BOSS_LEVEL)) * 100,
		).toBeCloseTo(perAvoidanceTypePenalty, 6);
		expect(100 + perAvoidanceTypePenalty * 4).toBeCloseTo(102.4, 6);
	});

	it("keeps the defense-skill conversion rate", () => {
		expect(MISS_DODGE_PARRY_BLOCK_CRIT_CHANCE_PER_DEFENSE).toBe(0.04);
	});
});
