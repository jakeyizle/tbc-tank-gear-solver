import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import type { ConsumableItem } from "#/solver/types";

type DisplayConsumable = ConsumableItem & { checked: boolean };

interface ConsumablesSectionProps {
	consumables: DisplayConsumable[];
	onConsumableChange: (consumableId: string) => void;
}

export default function ConsumablesSection({
	consumables,
	onConsumableChange,
}: ConsumablesSectionProps) {
	return (
		<Box
			sx={{
				display: "flex",
				alignItems: "flex-start",
				gap: 1.25,
				pt: 1.5,
				borderTop: 1,
				borderColor: "divider",
			}}
		>
			<Box
				component="span"
				sx={{
					font: "500 11px/1 Roboto, sans-serif",
					letterSpacing: "0.08em",
					textTransform: "uppercase",
					color: "text.secondary",
					pt: 0.5,
					flexShrink: 0,
				}}
			>
				Consumables
			</Box>

			<Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ flex: 1 }}>
				{consumables.map((consumable) => (
					<Chip
						key={consumable.id}
						label={consumable.checked ? `✓ ${consumable.name}` : consumable.name}
						size="small"
						onClick={() => onConsumableChange(consumable.id)}
						sx={consumable.checked
							? {
									bgcolor: "rgba(126,163,189,0.2)",
									border: "1px solid rgba(126,163,189,0.6)",
									color: "primary.light",
									fontWeight: 500,
								}
							: {
									bgcolor: "transparent",
									border: "1px solid rgba(255,255,255,0.14)",
									color: "rgba(255,255,255,0.4)",
									textDecoration: "line-through",
								}}
					/>
				))}
			</Stack>
		</Box>
	);
}
