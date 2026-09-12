import { describe, expect, it } from "vitest";
import { indexItemDatabase } from "./itemDatabase";
import type { Enchant, Gem, Item } from "./types";

// Indexing the solver's item pool.
//
// Small, and it guards a HARD failure rather than a wrong number: a duplicate ITEM id in the
// array becomes two LP variables with the same name, and GLPK rejects the whole model with
// "duplicate indices not allowed". The lookup maps would dedupe on their own, which is exactly
// why the array behaviour needs its own test - the bug is invisible from the maps. That is not
// hypothetical; it is what the Phase 3 notes record finding by accident while comparing old and
// new solver picks.
//
// Enchants are the asymmetric case, and writing these tests is what pinned it down: the
// supplement is deduped against the database on effectID, but two enchants the DATABASE itself
// carries may share one (five do - same effect, different slot) and both must survive.

const item = (id: string, name = `item-${id}`): Item =>
	({ id, name, stats: [], sockets: [], socketBonus: [] }) as unknown as Item;

const enchant = (id: string, effectID: string, over: Partial<Enchant> = {}) =>
	({ id, effectID, name: `enchant-${id}`, stats: [], ...over }) as Enchant;

const gem = (id: string): Gem =>
	({ id, name: `gem-${id}`, color: "Red", stats: [] }) as unknown as Gem;

const source = (over: {
	items?: Item[];
	gems?: Gem[];
	enchants?: Enchant[];
}) => ({ items: [], gems: [], enchants: [], ...over });

describe("indexItemDatabase: supplement merging", () => {
	// The supplement exists for the ~30 records db.json genuinely lacks. When the database DOES
	// carry an id, its own record must win - it is the sim-accurate one - and the supplement's
	// copy must not also be appended.
	it("does not append a supplement item whose id the database already carries", () => {
		// 35507 is a real SUPPLEMENT_ITEMS id (see src/data/itemSupplement.ts).
		const db = indexItemDatabase(
			source({ items: [item("35507", "database's own record")] }),
		);

		const matching = db.items.filter((i) => i.id === "35507");
		expect(matching).toHaveLength(1);
		expect(matching[0].name).toBe("database's own record");
	});

	it("still appends supplement items the database lacks", () => {
		const db = indexItemDatabase(source({ items: [item("99999")] }));
		// The supplement is non-empty, so indexing an almost-empty database must grow the array.
		expect(db.items.length).toBeGreaterThan(1);
		expect(db.itemsById.get("99999")).toBeDefined();
	});

	// No id may appear twice in the ARRAY, which is what feeds candidate generation. This is the
	// GLPK "duplicate indices" guard stated directly.
	it("leaves no duplicate item ids in the array that feeds the LP", () => {
		const db = indexItemDatabase(
			source({ items: [item("35507"), item("35509"), item("22736")] }),
		);
		const ids = db.items.map((i) => i.id);
		expect(ids).toHaveLength(new Set(ids).size);
	});

	// With a non-empty source the dedupe key function actually gets consulted, which an
	// empty-source test never does - mutation testing showed the key function could be replaced
	// with `() => undefined` and every empty-source test still passed.
	it("keeps supplement enchants when the source carries unrelated ones", () => {
		const withSupplementOnly = indexItemDatabase(source({ enchants: [] }));
		const db = indexItemDatabase(
			source({ enchants: [enchant("unrelated", "not-a-supplement-effect")] }),
		);
		// Every supplement enchant survives alongside the source's own.
		expect(db.enchants).toHaveLength(withSupplementOnly.enchants.length + 1);
	});

	// The SUPPLEMENT is deduped against the source on effectID, because db.json identifies an
	// enchant by the item that applies it while the supplement sometimes uses a spell id - so the
	// id is the unstable key of the two and effectID is what "the same enchant" means here.
	it("does not append a supplement enchant whose effectID the database already carries", () => {
		const withSupplement = indexItemDatabase(source({ enchants: [] }));
		const supplementEffectId = withSupplement.enchants[0]?.effectID;
		expect(supplementEffectId).toBeDefined();

		const db = indexItemDatabase(
			source({
				enchants: [enchant("database-own", supplementEffectId as string)],
			}),
		);
		const matching = db.enchants.filter(
			(e) => e.effectID === supplementEffectId,
		);
		expect(matching).toHaveLength(1);
		expect(matching[0].id).toBe("database-own");
	});

	// Deliberately NOT deduped: five effectIds in the real database are shared by two enchants
	// that differ only by slot (2649 is both "Bracer - Fortitude" and "Boots - Fortitude"). Both
	// must survive, because dropping one would make that slot un-enchantable. LP variables are
	// named from varName (see decomposedModel.ts), not effectID, so this cannot collide there.
	it("keeps two same-effectID enchants that the database itself carries", () => {
		const db = indexItemDatabase(
			source({
				enchants: [enchant("bracer", "2649"), enchant("boots", "2649")],
			}),
		);
		expect(db.enchants.filter((e) => e.effectID === "2649")).toHaveLength(2);
	});
});

// SUPPLEMENT_ENCHANT_CLASSES backfills a class restriction that lives on the ITEM applying an
// enchant, not on the enchant record - and 126 of 143 enchants name an item the equipment table
// does not contain, so the restriction is simply lost for those. Phase 3 found this the hard way:
// Presence of Might silently stopped being Warrior-only, which would let the solver enchant a
// paladin with it.
describe("indexItemDatabase: enchant class backfill", () => {
	it("backfills a class restriction the database record lacks", () => {
		// 2583 is the one entry in SUPPLEMENT_ENCHANT_CLASSES, restricted to class "1" (Warrior).
		const db = indexItemDatabase(
			source({ enchants: [enchant("presence-of-might", "2583")] }),
		);
		expect(db.enchantsByEffectId.get("2583")?.classes).toEqual(["1"]);
	});

	// The database's own answer wins when it has one - the backfill is a gap-filler, not an
	// override, or a later database fix would be silently undone by stale hand data.
	it("leaves an existing class restriction alone", () => {
		const db = indexItemDatabase(
			source({
				enchants: [enchant("own", "2583", { classes: ["2"] })],
			}),
		);
		expect(db.enchantsByEffectId.get("2583")?.classes).toEqual(["2"]);
	});

	it("leaves enchants with no supplement entry unrestricted", () => {
		const db = indexItemDatabase(
			source({ enchants: [enchant("plain", "99999")] }),
		);
		expect(db.enchantsByEffectId.get("99999")?.classes).toBeUndefined();
	});
});

describe("indexItemDatabase: lookup maps", () => {
	// Five effectIds are shared by two enchants differing only by slot (2649 is both
	// "Bracer - Fortitude" and "Boots - Fortitude"). Keeping the FIRST matches what the old
	// hand-data `Enchants.find` did; this map is only a fallback for exports naming an effect
	// rather than an item, so the choice is arbitrary but must be STABLE.
	it("keeps the first enchant when two share an effectID", () => {
		const db = indexItemDatabase(
			source({
				enchants: [enchant("first", "shared"), enchant("second", "shared")],
			}),
		);
		expect(db.enchantsByEffectId.get("shared")?.id).toBe("first");
		// Both still exist under their own ids - only the effectId map collapses them.
		expect(db.enchantsById.get("first")).toBeDefined();
		expect(db.enchantsById.get("second")).toBeDefined();
	});

	// Same first-wins rule on the id map. Needs two enchants that genuinely share an id: with
	// distinct ids there is no collision, so the guard is unobservable and a mutant removing it
	// survives.
	it("keeps the first enchant when two share an id", () => {
		const db = indexItemDatabase(
			source({
				enchants: [
					enchant("same-id", "effect-a"),
					enchant("same-id", "effect-b"),
				],
			}),
		);
		expect(db.enchantsById.get("same-id")?.effectID).toBe("effect-a");
	});

	it("indexes gems by id without touching the array", () => {
		const db = indexItemDatabase(source({ gems: [gem("1"), gem("2")] }));
		expect(db.gems).toHaveLength(2);
		expect(db.gemsById.get("2")?.name).toBe("gem-2");
	});

	it("maps every array entry, so nothing is reachable only by scan", () => {
		const db = indexItemDatabase(
			source({ items: [item("1"), item("2")], gems: [gem("3")] }),
		);
		for (const i of db.items) expect(db.itemsById.has(i.id)).toBe(true);
		for (const g of db.gems) expect(db.gemsById.has(g.id)).toBe(true);
		for (const e of db.enchants) expect(db.enchantsById.has(e.id)).toBe(true);
	});
});

describe("indexItemDatabase: overrides", () => {
	// Applied at index time rather than per lookup, so nothing can read an un-overridden record
	// by accident. Libram of Repentance's +42 block is what makes a paladin's block floor
	// reachable, so an override that silently stopped applying would show up as an infeasible
	// solve rather than as an error.
	it("applies item overrides at index time, on both the array and the map", () => {
		const db = indexItemDatabase(
			source({ items: [item("29388", "Libram of Repentance")] }),
		);

		const fromMap = db.itemsById.get("29388");
		expect(fromMap?.stats).toEqual([
			{ name: "Block", value: 42, type: "flat" },
		]);

		const fromArray = db.items.find((i) => i.id === "29388");
		expect(fromArray?.stats).toEqual(fromMap?.stats);
	});

	it("leaves items with no override untouched", () => {
		const original = item("1", "Some Helm");
		const db = indexItemDatabase(source({ items: [original] }));
		expect(db.itemsById.get("1")?.name).toBe("Some Helm");
		expect(db.itemsById.get("1")?.stats).toEqual([]);
	});
});
