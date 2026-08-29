import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import {
	CONSUMABLE_TYPES,
	groupItemsBySlot,
	SLOT_LABELS,
	SLOT_ORDER,
} from "#/solver/itemSlots";
import type { LPItem } from "#/solver/types";
import ConsumablesRow from "./ConsumablesRow";
import ItemDisplay from "./ItemDisplay";

interface ItemGroupDisplayProps {
	items: LPItem[];
}

export default function ItemGroupDisplay({ items }: ItemGroupDisplayProps) {
	const itemMap = groupItemsBySlot(items);
	const consumableItems = items.filter((item) =>
		CONSUMABLE_TYPES.includes(item.type),
	);

	return (
		<Stack
			spacing={0}
			divider={<Box sx={{ borderBottom: 1, borderColor: "divider" }} />}
		>
			<ConsumablesRow items={consumableItems} />
			{SLOT_ORDER.map((slot) => (
				<ItemDisplay
					key={slot}
					slotLabel={SLOT_LABELS[slot] ?? slot}
					item={itemMap[slot]}
				/>
			))}
		</Stack>
	);
}
