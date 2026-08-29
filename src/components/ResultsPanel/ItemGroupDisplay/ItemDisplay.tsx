import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import GemToolTips from "#/data/gem-tooltips.json";
import ItemTooltips from "#/data/item-tooltips.json";
import type { LPItem } from "#/solver/types";

const GEM_COLORS: Record<string, string> = {
	Red: "#c41f3b",
	Yellow: "#fff569",
	Blue: "#69ccf0",
	Orange: "#ff8000",
	Purple: "#a335ee",
	Green: "#1eff00",
	Meta: "#9d9d9d",
};

interface ItemDisplayProps {
	slotLabel: string;
	item?: LPItem;
}

export default function ItemDisplay({ slotLabel, item }: ItemDisplayProps) {
	if (!item) {
		return (
			<Box
				sx={{
					display: "grid",
					gridTemplateColumns: "66px 34px 1fr 78px",
					gap: "0 10px",
					alignItems: "center",
					minHeight: 48,
					px: 1,
					opacity: 0.4,
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
					{slotLabel}
				</Box>
				<Box
					sx={{
						width: 34,
						height: 34,
						borderRadius: "5px",
						border: 1,
						borderColor: "divider",
						bgcolor: "action.hover",
					}}
				/>
				<Typography variant="body2" color="text.disabled" fontStyle="italic">
					(empty)
				</Typography>
				<span />
			</Box>
		);
	}

	const tooltip = ItemTooltips.find((t) => t.id === item.id)?.icon;
	const hasEnchant = Boolean(item.enchant?.effectID && item.enchant?.name);

	const gemOccurrences: Record<string, number> = {};
	const keyedGems = item.gems.map((gem) => {
		gemOccurrences[gem.id] = (gemOccurrences[gem.id] ?? 0) + 1;
		return { ...gem, key: `${gem.id}-${gemOccurrences[gem.id]}` };
	});

	const baseHref = `item=${item.id}`;
	const enchantParam = item.enchant?.effectID
		? `&ench=${item.enchant.effectID}`
		: "";
	const gemString = item.gems.map((g) => g.id).join(":");
	const gemsParam = gemString ? `&gems=${gemString}` : "";

	return (
		<Box
			sx={{
				display: "grid",
				gridTemplateColumns: "66px 34px 1fr 78px",
				gap: "0 10px",
				alignItems: "center",
				minHeight: 48,
				px: 1,
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
				{slotLabel}
			</Box>

			<Box
				component="a"
				href={`https://tbc.wowhead.com/${baseHref}${enchantParam}${gemsParam}`}
				onClick={(e) => e.preventDefault()}
				sx={{ display: "block", textDecoration: "none" }}
			>
				<Box
					component="img"
					src={`https://wow.zamimg.com/images/wow/icons/large/${tooltip}.jpg`}
					alt={item.name}
					sx={{ width: 34, height: 34, borderRadius: "5px" }}
				/>
			</Box>

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
					component="a"
					href={`https://tbc.wowhead.com/${baseHref}${enchantParam}${gemsParam}`}
					onClick={(e) => e.preventDefault()}
					sx={{
						color: "#c07dfb",
						textDecoration: "none",
						whiteSpace: "nowrap",
						overflow: "hidden",
						textOverflow: "ellipsis",
					}}
				>
					{item.name}
				</Typography>
				{hasEnchant ? (
					<Typography
						variant="caption"
						component="a"
						href={`https://tbc.wowhead.com/${
							item.enchant.isSpellID === "true" ? "spell" : "item"
						}=${item.enchant.id}`}
						onClick={(e) => e.preventDefault()}
						sx={{
							color: "#7fd07f",
							textDecoration: "none",
							whiteSpace: "nowrap",
							overflow: "hidden",
							textOverflow: "ellipsis",
						}}
					>
						{item.enchant.name}
					</Typography>
				) : null}
			</Box>

			<Box
				sx={{
					display: "flex",
					gap: 0.5,
					alignItems: "center",
					justifyContent: "flex-end",
				}}
			>
				{keyedGems.map((gem) => {
					const iconName = GemToolTips.find((t) => t.id === gem.id)?.iconName;
					const color = GEM_COLORS[gem.color];
					return (
						<Box
							key={gem.key}
							component="a"
							href={`https://tbc.wowhead.com/item=${gem.id}`}
							onClick={(e) => e.preventDefault()}
							title={gem.name}
							sx={{
								width: 20,
								height: 20,
								borderRadius: "4px",
								border: `1.5px solid ${color}`,
								bgcolor: `${color}33`,
								display: "block",
								overflow: "hidden",
							}}
						>
							{iconName && (
								<Box
									component="img"
									src={`https://wow.zamimg.com/images/wow/icons/large/${iconName}.jpg`}
									alt={gem.name}
									sx={{ width: "100%", height: "100%" }}
								/>
							)}
						</Box>
					);
				})}
			</Box>
		</Box>
	);
}
