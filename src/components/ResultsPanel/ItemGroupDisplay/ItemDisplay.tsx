import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import GemToolTips from '#/data/gem-tooltips.json';
import ItemTooltips from "#/data/item-tooltips.json";

interface DisplayGem {
	id: string;
	name: string;
	color: string;
}

interface ItemDisplayProps {
	slotName: string;
	itemId?: string;
	enchantId?: string;
	enchantName?: string;
	gems?: DisplayGem[];
	itemName?: string;
}

const GEM_COLORS: Record<string, string> = {
	Red: "#c41f3b",
	Yellow: "#fff569",
	Blue: "#69ccf0",
	Orange: "#ff8000",
	Purple: "#a335ee",
	Green: "#1eff00",
	Meta: "#9d9d9d",
};

export default function ItemDisplay({
	slotName,
	itemId = "",
	enchantId = "",
	enchantName = "",
	gems = [],
	itemName = "",
}: ItemDisplayProps) {
	const tooltip = ItemTooltips.find((t) => t.id === itemId)?.icon;

	const baseHref = `item=${itemId}`;
	const enchantParam = enchantId ? `&ench=${enchantId}` : "";
	const gemString = gems.map((g) => g.id).join(":");
	const gemsParam = gemString ? `&gems=${gemString}` : "";
	const href = `${baseHref}${enchantParam}${gemsParam}`;

	const gemOccurrences: Record<string, number> = {};
	const keyedGems = gems.map((gem) => {
		gemOccurrences[gem.id] = (gemOccurrences[gem.id] ?? 0) + 1;
		return { ...gem, key: `${gem.id}-${gemOccurrences[gem.id]}` };
	});


	return (
		<Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
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

			{/* TODO: link enchantName to wowhead. Wowhead's enchant pages need a
			    spell id that isn't present in enchants.json (effectID doesn't
			    resolve correctly) — need to source/add the right id first. */}
			{enchantId && enchantName ? (
				<Typography variant="caption" sx={{ color: "#1eff00" }}>
					{enchantName}
				</Typography>
			) : null}

			{gems.length > 0 ? (
				<Box sx={{ display: "flex", gap: 0.5 }}>
					{keyedGems.map((gem) => (
						<Box
							key={gem.key}
							component="a"
							href={`https://tbc.wowhead.com/item=${gem.id}`}
							onClick={(e) => e.preventDefault()}
						>
											<Box
					component="img"
					src={`https://wow.zamimg.com/images/wow/icons/large/${GemToolTips.find((t) => t.id === gem.id)?.iconName}.jpg`}
					alt={`Gem ${gem.id}`}
					sx={{
						width: 32,
						height: 32,
					}}
				/>
							</Box>
					))}
				</Box>
			) : null}
		</Box>
	);
}
