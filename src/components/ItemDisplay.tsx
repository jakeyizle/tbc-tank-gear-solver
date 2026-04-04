import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import ItemTooltips from "../data/item-tooltips.json";

interface ItemDisplayProps {
	slotName: string;
	itemId?: string;
	enchantId?: string;
	gemIds?: string[];
	itemName?: string;
}

export default function ItemDisplay({
	slotName,
	itemId = "",
	enchantId = "",
	gemIds = [],
	itemName = "",
}: ItemDisplayProps) {
	const tooltip = ItemTooltips.find((t) => t.id === itemId)?.icon;

	const baseHref = `item=${itemId}`;
	const enchantParam = enchantId ? `&ench=${enchantId}` : "";
	const gemString = gemIds.join(":");
	const gemsParam = gemString ? `&gems=${gemString}` : "";
	const href = `${baseHref}${enchantParam}${gemsParam}`;


	return (
		<Box
			component="a"
			href={`https://tbc.wowhead.com/${href}`}
			onClick={(e) => e.preventDefault()}
			sx={{
				display: "inline-flex",
				alignItems: "center",
				gap: 1,
				textDecoration: "none",
				color: "inherit",
			}}
		>
			<Box
				component="img"
				src={`https://wow.zamimg.com/images/wow/icons/large/${tooltip}.jpg`}
				alt={`Item ${itemId}`}
				sx={{
					width: 32,
					height: 32,
				}}
			/>

			<Typography variant="body2">{itemName || slotName}</Typography>
		</Box>
	);
}
