import CloseIcon from "@mui/icons-material/Close";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { STAT_LABELS, STAT_NAMES, type Stat, type StatName } from "#/solver/types";
import { monoFontFamily } from "#/theme";

const FILTERED_STAT_NAMES: StatName[] = STAT_NAMES.filter((stat) => {
	return ['SpellPower', 'SpellCrit', 'Armor', 'Resilience', 'Defense', 'MeleeHit', 'Dodge', 'BlockValue', 'SpellHit', 'Parry', 'Block', 'Expertise', 'Health'].includes(stat);
}).sort((a, b) => STAT_LABELS[a].localeCompare(STAT_LABELS[b]));

interface StatsEntryProps {
	stats: Stat[];
	onChange: (stats: Stat[]) => void;
}

export default function StatsEntry({ stats, onChange }: StatsEntryProps) {
	const [addingStat, setAddingStat] = useState(false);
	// raw in-progress text for fields being edited, keyed by stat name.
	// keeping this separate from `stats` means the list doesn't reorder (and
	// the input isn't reformatted) until the field is committed on blur.
	const [drafts, setDrafts] = useState<Partial<Record<StatName, string>>>({});

	const usedStats = new Set(stats.map((s) => s.name));
	const availableStats = FILTERED_STAT_NAMES.filter((stat) => !usedStats.has(stat));

	const editValue = (name: StatName, newValue: string) => {
		setDrafts((prev) => ({ ...prev, [name]: newValue }));
	};

	const commitValue = (name: StatName, rawValue: string) => {
		const parsed = Number(rawValue);
		const value = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
		onChange(
			stats.map((entry) => (entry.name === name ? { ...entry, value } : entry)),
		);
		setDrafts((prev) => {
			const next = { ...prev };
			delete next[name];
			return next;
		});
	};

	const removeStat = (name: StatName) => {
		onChange(stats.filter((entry) => entry.name !== name));
	};

	const addStat = (name: StatName) => {
		onChange([...stats, { name, value: 0, type: "flat" }]);
		setAddingStat(false);
	};

	const sortedStats = [...stats].sort((a, b) => b.value - a.value);

	return (
		<Box display="flex" flexDirection="column" gap={0.75}>
			<Box display="flex" alignItems="center" gap={1.25}>
				<Box
					component="span"
					sx={{
						font: "500 11px/1 Roboto, sans-serif",
						letterSpacing: "0.08em",
						textTransform: "uppercase",
						color: "text.secondary",
					}}
				>
					Stat weights
				</Box>
				<Typography variant="caption" color="text.disabled">
					relative value per point
				</Typography>
				{!addingStat && (
					<Typography
						variant="caption"
						color="primary"
						sx={{ ml: "auto", cursor: "pointer" }}
						onClick={() => setAddingStat(true)}
					>
						+ Add stat
					</Typography>
				)}
			</Box>

			{addingStat && (
				<Autocomplete
					autoFocus
					size="small"
					openOnFocus
					options={availableStats}
					getOptionLabel={(stat) => STAT_LABELS[stat]}
					onChange={(_, value) => value && addStat(value)}
					onBlur={() => setAddingStat(false)}
					renderInput={(params) => (
						<TextField {...params} placeholder="Search stats…" autoFocus />
					)}
					sx={{ maxWidth: 260 }}
				/>
			)}

			{stats.length === 0 && !addingStat && (
				<Typography variant="body2" color="text.secondary" fontStyle="italic">
					No stats added yet. Add at least one stat to tell the solver what to
					optimize for.
				</Typography>
			)}

			{sortedStats.length > 0 && (
				<Box
					sx={{
						display: "grid",
						gridTemplateColumns: {
							xs: "1fr",
							sm: "repeat(2, 1fr)",
							md: "repeat(3, 1fr)",
						},
						gap: "2px 20px",
					}}
				>
					{sortedStats.map((entry) => (
						<Box
							key={entry.name}
							sx={{
								display: "flex",
								alignItems: "center",
								gap: 1,
								py: 0.375,
								"&:hover .stat-delete": { opacity: 1 },
							}}
						>
							<Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
								{STAT_LABELS[entry.name]}
							</Typography>
							<TextField
								value={drafts[entry.name] ?? entry.value.toFixed(2)}
								onFocus={(e) => e.target.select()}
								onChange={(e) => editValue(entry.name, e.target.value)}
								onBlur={(e) => commitValue(entry.name, e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") e.currentTarget.blur();
								}}
								size="small"
								type="number"
								sx={{
									flexShrink: 0,
									width: 66,
									"& .MuiOutlinedInput-root": { pr: 0.5 },
									"& input": {
										fontFamily: monoFontFamily,
										fontSize: 13,
										textAlign: "right",
										py: 0.5,
										px: 0.75,
									},
								}}
								slotProps={{
									htmlInput: { min: 0, step: 0.01 },
								}}
							/>
							<IconButton
								className="stat-delete"
								size="small"
								onClick={() => removeStat(entry.name)}
								sx={{ opacity: 0, transition: "opacity 0.1s", flexShrink: 0 }}
							>
								<CloseIcon fontSize="inherit" />
							</IconButton>
						</Box>
					))}
				</Box>
			)}
		</Box>
	);
}
