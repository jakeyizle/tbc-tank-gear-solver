import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { getHeadlineStats } from "#/helpers/resultStats";
import {
	CONSUMABLE_TYPES,
	groupItemsBySlot,
	SLOT_LABELS,
	SLOT_ORDER,
} from "#/solver/itemSlots";
import type { SolveResult } from "#/types/SolverConfig";
import ConsumablesDiffRow from "./ConsumablesDiffRow";
import DiffRow from "./DiffRow";

interface CompareViewProps {
	resultA: SolveResult;
	resultB: SolveResult;
	allResults: SolveResult[];
	includeBuffsConsumables: boolean;
	buffsConsumablesToggle: ReactNode;
	onChangeCompareTo: (id: string) => void;
	onExit: () => void;
}

export default function CompareView({
	resultA,
	resultB,
	allResults,
	includeBuffsConsumables,
	buffsConsumablesToggle,
	onChangeCompareTo,
	onExit,
}: CompareViewProps) {
	const [showAll, setShowAll] = useState(false);

	const consumablesDiff = useMemo(() => {
		const consumablesA = resultA.items.filter((item) =>
			CONSUMABLE_TYPES.includes(item.type),
		);
		const consumablesB = resultB.items.filter((item) =>
			CONSUMABLE_TYPES.includes(item.type),
		);
		const idsA = consumablesA
			.map((item) => item.id)
			.sort()
			.join(",");
		const idsB = consumablesB
			.map((item) => item.id)
			.sort()
			.join(",");
		return { itemsA: consumablesA, itemsB: consumablesB, equal: idsA === idsB };
	}, [resultA, resultB]);

	const slotDiffs = useMemo(() => {
		const itemsA = groupItemsBySlot(resultA.items);
		const itemsB = groupItemsBySlot(resultB.items);
		return SLOT_ORDER.map((slot) => {
			const itemA = itemsA[slot];
			const itemB = itemsB[slot];
			return {
				slot,
				label: SLOT_LABELS[slot] ?? slot,
				itemA,
				itemB,
				equal: itemA?.id === itemB?.id,
			};
		});
	}, [resultA, resultB]);

	const differing = slotDiffs.filter((d) => !d.equal);
	const identicalCount =
		slotDiffs.length - differing.length + (consumablesDiff.equal ? 1 : 0);
	const totalRows = slotDiffs.length + 1;
	const differingCount = differing.length + (consumablesDiff.equal ? 0 : 1);
	const rows = showAll ? slotDiffs : differing;

	const statsA = getHeadlineStats(resultA, includeBuffsConsumables);
	const statsB = getHeadlineStats(resultB, includeBuffsConsumables);

	return (
		<Paper
			elevation={1}
			sx={{ p: 2.25, display: "flex", flexDirection: "column", gap: 1.75 }}
		>
			<Stack
				direction="row"
				alignItems="center"
				spacing={1.25}
				sx={{
					px: 1.5,
					py: 1.125,
					borderRadius: 1,
					bgcolor: "rgba(126,163,189,0.10)",
					border: 1,
					borderColor: "rgba(126,163,189,0.35)",
				}}
			>
				<Typography variant="body2" sx={{ fontWeight: 700 }}>
					Comparing
				</Typography>
				<Box
					sx={{
						px: 1.25,
						py: 0.5,
						borderRadius: "5px",
						bgcolor: "rgba(126,163,189,0.25)",
						fontSize: 13,
						fontWeight: 500,
					}}
				>
					{resultA.name}
				</Box>
				<Typography variant="body2" color="text.disabled">
					vs
				</Typography>
				<Select
					size="small"
					value={resultB.id}
					onChange={(e) => onChangeCompareTo(e.target.value)}
					sx={{ fontSize: 13 }}
				>
					{allResults
						.filter((r) => r.id !== resultA.id)
						.map((r) => (
							<MenuItem key={r.id} value={r.id}>
								{r.name}
							</MenuItem>
						))}
				</Select>
				<Typography variant="body2" color="text.secondary">
					{differingCount} of {totalRows} slots differ
				</Typography>
				<Box sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 1.5 }}>
					{buffsConsumablesToggle}
					<Typography
						variant="body2"
						color="primary"
						sx={{ cursor: "pointer" }}
						onClick={onExit}
					>
						Exit compare
					</Typography>
				</Box>
			</Stack>

			<Box
				sx={{
					display: "flex",
					border: 1,
					borderColor: "divider",
					borderRadius: 1,
					overflow: "hidden",
					bgcolor: "background.default",
				}}
			>
				{statsA.map((stat, i) => {
					const other = statsB[i].value;
					const delta = stat.value - other;
					const positive = delta >= 0;
					return (
						<Box
							key={stat.name}
							sx={{
								flex: 1,
								p: 1.5,
								display: "flex",
								flexDirection: "column",
								gap: 0.375,
								borderRight: i < statsA.length - 1 ? 1 : 0,
								borderColor: "divider",
							}}
						>
							<Typography
								variant="caption"
								color="text.disabled"
								sx={{ textTransform: "uppercase", letterSpacing: "0.06em" }}
							>
								{stat.name}
							</Typography>
							<Stack direction="row" spacing={1} alignItems="baseline">
								<Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
									{stat.value.toFixed(2)}
								</Typography>
								{Math.abs(delta) > 0.005 && (
									<Typography
										variant="body2"
										sx={{
											color: positive ? "#7fd07f" : "#e08a8a",
											fontWeight: 500,
										}}
									>
										{positive ? "+" : ""}
										{delta.toFixed(2)}
									</Typography>
								)}
							</Stack>
							<Typography variant="caption" color="text.disabled">
								{resultB.name} {other.toFixed(2)}
							</Typography>
						</Box>
					);
				})}
			</Box>

			<Stack spacing={0}>
				{(showAll || !consumablesDiff.equal) && (
					<ConsumablesDiffRow
						itemsA={consumablesDiff.itemsA}
						itemsB={consumablesDiff.itemsB}
						equal={consumablesDiff.equal}
					/>
				)}
				{rows.map((row) => (
					<DiffRow
						key={row.slot}
						label={row.label}
						itemA={row.itemA}
						itemB={row.itemB}
						equal={row.equal}
					/>
				))}
			</Stack>

			{!showAll && identicalCount > 0 && (
				<Stack
					direction="row"
					alignItems="center"
					spacing={1.5}
					sx={{
						px: 1.5,
						py: 1.25,
						borderRadius: 1,
						bgcolor: "background.default",
						border: 1,
						borderColor: "divider",
					}}
				>
					<Typography variant="body2" color="text.secondary">
						{identicalCount} more {identicalCount === 1 ? "slot" : "slots"}{" "}
						identical
					</Typography>
					<Typography
						variant="body2"
						color="primary"
						sx={{ cursor: "pointer" }}
						onClick={() => setShowAll(true)}
					>
						Show all slots
					</Typography>
				</Stack>
			)}
			{showAll && identicalCount > 0 && (
				<Typography
					variant="body2"
					color="primary"
					sx={{ cursor: "pointer", alignSelf: "flex-start" }}
					onClick={() => setShowAll(false)}
				>
					Hide identical slots
				</Typography>
			)}
		</Paper>
	);
}
