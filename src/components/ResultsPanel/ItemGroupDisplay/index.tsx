import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import type { LPItem } from "#/solver/types";
import ItemDisplay from "./ItemDisplay";

const leftSlots: string[] = [
	"Head",
	"Neck",
	"Shoulder",
	"Back",
	"Chest",
	"Wrist",
	"Hands",
];
const rightSlots: string[] = [
	"Waist",
	"Legs",
	"Feet",
	"Finger1",
	"Finger2",
	"Trinket1",
	"Trinket2",
];

const bottomSlots: string[] = ["Weapon", "Shield", "Ranged"];

interface ItemGroupDisplayProps {
	items: LPItem[];
}

const normalizeItems = (items: LPItem[]) => {
	const result: any = {};
	const counters: any = {};

	items.forEach((item) => {
		const type = item.type;
		// Slots that can have multiples
		if (type === "Finger" || type === "Trinket") {
			counters[type] = (counters[type] || 0) + 1;
			const indexedType = `${type}${counters[type]}`;
			result[indexedType] = item;
		} else {
			result[type] = item;
		}
	});

	return result;
};

export default function ItemGroupDisplay({ items }: ItemGroupDisplayProps) {
	const itemMap = normalizeItems(items);
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
									gemIds={item.gems.map((g) => g.id)}
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
									gemIds={item.gems.map((g) => g.id)}
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
								gemIds={item.gems.map((g) => g.id)}
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
