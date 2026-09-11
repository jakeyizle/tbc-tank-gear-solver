import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { TristateEffect } from "#/types/SimCalibrationProfile";

const OPTIONS: { value: TristateEffect; label: string }[] = [
	{ value: "TristateEffectMissing", label: "Missing" },
	{ value: "TristateEffectRegular", label: "Regular" },
	{ value: "TristateEffectImproved", label: "Improved" },
];

interface TristateSelectProps {
	label: string;
	value: TristateEffect;
	onChange: (value: TristateEffect) => void;
}

export default function TristateSelect({
	label,
	value,
	onChange,
}: TristateSelectProps) {
	return (
		<Stack direction="row" spacing={1} alignItems="center">
			<Typography variant="body2" sx={{ minWidth: 160 }} noWrap>
				{label}
			</Typography>
			<Select
				size="small"
				value={value}
				onChange={(e) => onChange(e.target.value as TristateEffect)}
				sx={{ minWidth: 110 }}
			>
				{OPTIONS.map((option) => (
					<MenuItem key={option.value} value={option.value}>
						{option.label}
					</MenuItem>
				))}
			</Select>
		</Stack>
	);
}
