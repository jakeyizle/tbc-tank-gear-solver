// Maps this repo's gear representation to tbc-new's proto.ItemSpec JSON shape.
//
// This is a near-identity mapping, not a real translation: `resolveChosenDecomposableItems`
// (src/solver/decomposedModel.ts) already produces gear in the same
// `{id, enchant, gemSlots}` shape WowSims-style exports use (see that file's own comment),
// which is structurally identical to how tbc-new's own gear presets are authored (e.g.
// vendor/tbc-sim/ui/paladin/protection/gear_sets/p3.gear.json).
export interface TbcItemSpec {
	id: number;
	enchant?: number;
	gems?: number[];
}

// Structural type covering just what this module needs, satisfied by both ItemVariation and
// LPItem (which otherwise differ on `type`'s exact union) without either side needing casts.
export interface GearPiece {
	id: string;
	enchant: { id: string };
	gemSlots: string[];
}

/** Trailing "0" entries in gemSlots mark unfilled sockets and carry no gem to send. */
function parseGemSlots(gemSlots: string[]): number[] {
	return gemSlots.map((slot) => Number(slot)).filter((id) => id !== 0);
}

export function toTbcItemSpec(item: GearPiece): TbcItemSpec {
	const spec: TbcItemSpec = { id: Number(item.id) };
	// item.enchant is always a defined object (EMPTY_ENCHANT when unenchanted, id: "") -
	// check the id itself, not the object's truthiness.
	if (item.enchant.id) spec.enchant = Number(item.enchant.id);
	const gems = parseGemSlots(item.gemSlots);
	if (gems.length > 0) spec.gems = gems;
	return spec;
}
