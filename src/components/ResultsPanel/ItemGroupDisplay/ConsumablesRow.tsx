import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { CONSUMABLES } from "#/data/consumables";
import ItemTooltips from "#/data/item-tooltips.json";
import { getConsumableWowheadUrl } from "#/helpers/wowhead";
import type { LPItem } from "#/solver/types";

interface ConsumablesRowProps {
	items: LPItem[];
}

export default function ConsumablesRow({ items }: ConsumablesRowProps) {
	return (
		<Box
			sx={{
				display: "grid",
				gridTemplateColumns: "66px 1fr",
				gap: "0 10px",
				alignItems: "center",
				minHeight: 48,
				px: 1,
				py: items.length > 1 ? 0.5 : 0,
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

			{items.length === 0 ? (
				<Typography
					variant="body2"
					color="text.disabled"
					fontStyle="italic"
					sx={{ opacity: 0.4 }}
				>
					(empty)
				</Typography>
			) : (
				<Stack spacing={0.5}>
					{items.map((item) => {
						const consumable = CONSUMABLES.find((c) => c.id === item.id);
						const href = getConsumableWowheadUrl(
							consumable?.wowheadId ?? 0,
							consumable?.id ?? item.id,
						);
						const tooltip = ItemTooltips.find((t) => t.id === item.id)?.icon;

						return (
							<Stack
								key={item.uniqueId}
								direction="row"
								alignItems="center"
								spacing={1.25}
							>
								<Box
									component="a"
									href={href}
									onClick={(e) => e.preventDefault()}
									sx={{ display: "block", flexShrink: 0 }}
								>
									<Box
										component="img"
										src={`https://wow.zamimg.com/images/wow/icons/large/${tooltip}.jpg`}
										alt={item.name}
										sx={{ width: 34, height: 34, borderRadius: "5px" }}
									/>
								</Box>
								<Typography
									variant="body2"
									component="a"
									href={href}
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
							</Stack>
						);
					})}
				</Stack>
			)}
		</Box>
	);
}
