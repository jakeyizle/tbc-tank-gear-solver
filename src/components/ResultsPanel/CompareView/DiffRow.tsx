import LockIcon from "@mui/icons-material/Lock";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import ItemTooltips from "#/data/item-tooltips.json";
import type { LPItem } from "#/solver/types";

interface ItemCellProps {
	item?: LPItem;
}

function ItemCell({ item }: ItemCellProps) {
	if (!item) {
		return (
			<Typography variant="body2" color="text.disabled" fontStyle="italic">
				(empty)
			</Typography>
		);
	}
	const tooltip = ItemTooltips.find((t) => t.id === item.id)?.icon;
	return (
		<Box sx={{ display: "flex", alignItems: "center", gap: 1.25, minWidth: 0 }}>
			<Box
				component="img"
				src={`https://wow.zamimg.com/images/wow/icons/large/${tooltip}.jpg`}
				alt={item.name}
				sx={{ width: 32, height: 32, borderRadius: "5px", flexShrink: 0 }}
			/>
			<Box
				sx={{
					display: "flex",
					flexDirection: "column",
					gap: 0.125,
					minWidth: 0,
				}}
			>
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
				{item.enchant?.name && (
					<Typography
						variant="caption"
						sx={{
							color: "#7fd07f",
							whiteSpace: "nowrap",
							overflow: "hidden",
							textOverflow: "ellipsis",
						}}
					>
						{item.enchant.name}
					</Typography>
				)}
			</Box>
		</Box>
	);
}

interface DiffRowProps {
	label: string;
	itemA?: LPItem;
	itemB?: LPItem;
	equal: boolean;
}

export default function DiffRow({ label, itemA, itemB, equal }: DiffRowProps) {
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
					opacity: 0.5,
					bgcolor: "action.hover",
				}}
			>
				<Typography
					variant="caption"
					color="text.disabled"
					sx={{ textTransform: "uppercase", letterSpacing: "0.06em" }}
				>
					{label}
				</Typography>
				<ItemCell item={itemA} />
				<LockIcon
					sx={{ fontSize: 14, color: "text.disabled", justifySelf: "center" }}
				/>
				<Typography variant="caption" color="text.secondary">
					same item — enchant &amp; gems inherited between sets
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
			}}
		>
			<Typography
				variant="caption"
				color="text.disabled"
				sx={{ textTransform: "uppercase", letterSpacing: "0.06em" }}
			>
				{label}
			</Typography>
			<ItemCell item={itemA} />
			<Typography sx={{ textAlign: "center", color: "text.disabled" }}>
				→
			</Typography>
			<ItemCell item={itemB} />
		</Box>
	);
}
