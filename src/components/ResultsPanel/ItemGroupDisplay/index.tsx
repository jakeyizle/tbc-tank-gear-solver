import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import {
	BOTTOM_SLOTS as bottomSlots,
	groupItemsBySlot,
	LEFT_SLOTS as leftSlots,
	RIGHT_SLOTS as rightSlots,
} from "#/solver/itemSlots";
import type { LPItem } from "#/solver/types";
import ItemDisplay from "./ItemDisplay";

interface ItemGroupDisplayProps {
	items: LPItem[];
}

export default function ItemGroupDisplay({ items }: ItemGroupDisplayProps) {
	const itemMap = groupItemsBySlot(items);
	return (
		<>
			<Grid container spacing={4}>
				{/* LEFT COLUMN */}
				<Grid size={6}>
					<Box display="flex" flexDirection="column" gap={1}>
						{leftSlots.map((slot) => {
							const item = itemMap[slot] as LPItem | undefined;
							return item ? (
								<ItemDisplay
									key={slot}
									itemId={item.id}
									enchantId={item.enchant.effectID}
									enchantName={item.enchant.name}
									gems={item.gems}
									slotName={item.type}
									itemName={item.name}
								/>
							) : (
								<Box key={slot}>{slot} (empty)</Box>
							);
						})}
					</Box>
				</Grid>

				{/* RIGHT COLUMN */}
				<Grid size={6}>
					<Box display="flex" flexDirection="column" gap={1}>
						{rightSlots.map((slot) => {
							const item = itemMap[slot] as LPItem | undefined;
							return item ? (
								<ItemDisplay
									key={slot}
									itemId={item.id}
									enchantId={item.enchant.effectID}
									enchantName={item.enchant.name}
									gems={item.gems}
									slotName={item.type}
									itemName={item.name}
								/>
							) : (
								<Box key={slot}>{slot} (empty)</Box>
							);
						})}
					</Box>
				</Grid>
			</Grid>
			<Grid container>
				{bottomSlots.map((slot) => {
					const item = itemMap[slot] as LPItem | undefined;
					return item ? (
						<Grid size={4} key={slot}>
							<ItemDisplay
								key={slot}
								itemId={item.id}
								enchantId={item.enchant.effectID}
								gems={item.gems}
								slotName={item.type}
								itemName={item.name}
							/>
						</Grid>
					) : (
						<Grid size={4} key={slot}>
							<Box key={slot}>{slot} (empty)</Box>
						</Grid>
					);
				})}
			</Grid>
		</>
	);
}
