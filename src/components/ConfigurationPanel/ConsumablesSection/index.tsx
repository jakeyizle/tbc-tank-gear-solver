import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import { useState } from "react";
import type { ConsumableItem } from "#/solver/types";
import ConsumableInput from "./ConsumableInput";

type DisplayConsumable = ConsumableItem & { checked: boolean };

interface ConsumablesSectionProps {
	consumables: DisplayConsumable[];
	onConsumableChange: (consumableId: string) => void;
}

export default function ConsumablesSection({
	consumables,
	onConsumableChange,
}: ConsumablesSectionProps) {
	const [expanded, setExpanded] = useState(false);
	const checkedConsumables = consumables.filter((c) => c.checked);

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

			{expanded ? (
				<Stack sx={{ flex: 1 }}>
					{consumables.map((consumable) => (
						<ConsumableInput
							key={consumable.id}
							name={consumable.name}
							isChecked={consumable.checked}
							onChange={() => onConsumableChange(consumable.id)}
						/>
					))}
					<Chip
						label="Done"
						size="small"
						onClick={() => setExpanded(false)}
						sx={{ alignSelf: "flex-start", mt: 0.5 }}
					/>
				</Stack>
			) : (
				<Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ flex: 1 }}>
					{checkedConsumables.map((consumable) => (
						<Chip
							key={consumable.id}
							label={consumable.name}
							size="small"
							onClick={() => setExpanded(true)}
							sx={{
								bgcolor: "rgba(126,163,189,0.16)",
								border: "1px solid rgba(126,163,189,0.4)",
								color: "primary.light",
							}}
						/>
					))}
					<Chip
						label={
							checkedConsumables.length === consumables.length
								? "Edit consumables"
								: checkedConsumables.length === 0
									? "None enabled — edit"
									: `+ ${consumables.length - checkedConsumables.length} more`
						}
						size="small"
						variant="outlined"
						onClick={() => setExpanded(true)}
						sx={{ borderStyle: "dashed" }}
					/>
				</Stack>
			)}
		</Box>
	);
}
