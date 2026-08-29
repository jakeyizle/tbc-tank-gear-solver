import LockIcon from "@mui/icons-material/Lock";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ItemTooltips from "#/data/item-tooltips.json";
import type { LPItem } from "#/solver/types";

interface ConsumablesCellProps {
	items: LPItem[];
}

function ConsumablesCell({ items }: ConsumablesCellProps) {
	if (items.length === 0) {
		return (
			<Typography variant="body2" color="text.disabled" fontStyle="italic">
				(empty)
			</Typography>
		);
	}
	return (
		<Stack spacing={0.5} sx={{ minWidth: 0 }}>
			{items.map((item) => {
				const tooltip = ItemTooltips.find((t) => t.id === item.id)?.icon;
				return (
					<Box
						key={item.uniqueId}
						sx={{ display: "flex", alignItems: "center", gap: 1.25, minWidth: 0 }}
					>
						<Box
							component="img"
							src={`https://wow.zamimg.com/images/wow/icons/large/${tooltip}.jpg`}
							alt={item.name}
							sx={{ width: 28, height: 28, borderRadius: "5px", flexShrink: 0 }}
						/>
						<Typography
							variant="body2"
							sx={{
								color: "#c07dfb",
								whiteSpace: "nowrap",
								overflow: "hidden",
								textOverflow: "ellipsis",
							}}
						>
							{item.name}
						</Typography>
					</Box>
				);
			})}
		</Stack>
	);
}

interface ConsumablesDiffRowProps {
	itemsA: LPItem[];
	itemsB: LPItem[];
	equal: boolean;
}

export default function ConsumablesDiffRow({
	itemsA,
	itemsB,
	equal,
}: ConsumablesDiffRowProps) {
	if (equal) {
		return (
			<Box
				sx={{
					display: "grid",
					gridTemplateColumns: "66px 1fr 22px 1fr",
					gap: "0 10px",
					alignItems: "center",
					minHeight: 44,
					px: 1,
					py: itemsA.length > 1 ? 0.5 : 0,
					opacity: 0.5,
					bgcolor: "action.hover",
				}}
			>
				<Box
					sx={{
						font: `400 10px 'Roboto Mono', monospace`,
						letterSpacing: "0.06em",
						textTransform: "uppercase",
						color: "text.disabled",
						whiteSpace: "nowrap",
					}}
				>
					Consumables
				</Box>
				<ConsumablesCell items={itemsA} />
				<LockIcon
					sx={{ fontSize: 14, color: "text.disabled", justifySelf: "center" }}
				/>
				<Typography variant="caption" color="text.secondary">
					same consumables
				</Typography>
			</Box>
		);
	}

	return (
		<Box
			sx={{
				display: "grid",
				gridTemplateColumns: "66px 1fr 22px 1fr",
				gap: "0 10px",
				alignItems: "center",
				minHeight: 52,
				px: 1,
				py: Math.max(itemsA.length, itemsB.length) > 1 ? 0.5 : 0,
			}}
		>
			<Box
				sx={{
					font: `400 10px 'Roboto Mono', monospace`,
					letterSpacing: "0.06em",
					textTransform: "uppercase",
					color: "text.disabled",
					whiteSpace: "nowrap",
				}}
			>
				Consumables
			</Box>
			<ConsumablesCell items={itemsA} />
			<Typography sx={{ textAlign: "center", color: "text.disabled" }}>
				→
			</Typography>
			<ConsumablesCell items={itemsB} />
		</Box>
	);
}
