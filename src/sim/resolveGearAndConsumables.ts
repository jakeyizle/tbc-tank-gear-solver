// Splits a solved LP item list (gear + 0+ chosen flask/elixir consumables, mixed together per
// solveConfig.ts's makeSlotConstraint/makeConsumableExclusionConstraint) into what the wasm sim
// actually needs: a canonically slot-ordered equipment array, and the flask/battle/guardian
// elixir ids it picked - see solveSimMetric.ts for why this split matters (the wasm sim's
// equipment array is positionally indexed by ItemSlot, so leaving consumables mixed into it
// misaligns every later slot).
import { CONSUMABLES } from "#/data/consumables";
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

	// A consumable LPItem's own `id` is the CONSUMABLES slug (e.g. "flask-of-blinding-light"),
	// not the real game item id - see consumables.ts's getConsumableLPItems - so it has to be
	// looked back up to get the wowheadId the sim actually wants.
	const wowheadIdFor = (item?: LPItem) =>
		item ? (CONSUMABLES.find((c) => c.id === item.id)?.wowheadId ?? 0) : 0;

	return {
		gear,
		consumables: {
			flaskId: wowheadIdFor(bySlot.Flask),
			battleElixirId: wowheadIdFor(bySlot.BattleElixir),
			guardianElixirId: wowheadIdFor(bySlot.GuardianElixir),
		},
	};
}
