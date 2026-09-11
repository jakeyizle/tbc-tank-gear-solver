// Splits a solved LP item list (gear + 0+ chosen flask/elixir consumables, mixed together per
// solveConfig.ts's makeSlotConstraint/makeConsumableExclusionConstraint) into what the wasm sim
// actually needs: a canonically slot-ordered equipment array, and the flask/battle/guardian
// elixir ids it picked - see solveSimMetric.ts for why this split matters (the wasm sim's
// equipment array is positionally indexed by ItemSlot, so leaving consumables mixed into it
// misaligns every later slot).
import { groupItemsBySlot, SLOT_ORDER } from "#/solver/itemSlots";
import type { LPItem } from "#/solver/types";
import type { GearPiece } from "./toTbcItemSpec";

export interface ConsumablesOverride {
	flaskId: number;
	battleElixirId: number;
	guardianElixirId: number;
}

export function splitGearAndConsumables(items: LPItem[]): {
	gear: GearPiece[];
	consumables: ConsumablesOverride;
} {
	const bySlot = groupItemsBySlot(items);
	const gear = SLOT_ORDER.map((slot) => bySlot[slot]).filter(
		(item): item is LPItem => item != null,
	);

	// A consumable LPItem's `id` IS the real game item id (stringified - see
	// getConsumableLPItems), which is exactly what the sim wants, so this is just a parse.
	// Anything unparseable resolves to 0 ("no consumable") rather than NaN, which the sim would
	// take as a garbage item id.
	const gameIdFor = (item?: LPItem) => {
		const id = item ? Number(item.id) : 0;
		return Number.isFinite(id) ? id : 0;
	};

	return {
		gear,
		consumables: {
			flaskId: gameIdFor(bySlot.Flask),
			battleElixirId: gameIdFor(bySlot.BattleElixir),
			guardianElixirId: gameIdFor(bySlot.GuardianElixir),
		},
	};
}
