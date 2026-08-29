import Stack from "@mui/material/Stack";
import SegmentedControl from "#/components/input/SegmentedControl";
import type { ResistanceFloor } from "#/solver/types";
import ResistanceFloors from "./ResistanceFloors";

interface ConstraintsSectionProps {
	uncritabilitySetting: number;
	uncrushabilitySetting: number;
	resistanceFloors: ResistanceFloor[];
	onUpdateConstraints: (
		uncritabilitySetting: number,
		uncrushabilitySetting: number,
	) => void;
	onUpdateResistanceFloors: (floors: ResistanceFloor[]) => void;
}

const CRIT_OPTIONS = [
	{ value: 0, label: "Off" },
	{ value: 1, label: "Lvl 72 · 5.4%" },
	{ value: 2, label: "Lvl 73 · 5.6%" },
];

const UNCRUSHABLE_OPTIONS = [
	{ value: 0, label: "Off" },
	{ value: 1, label: "Uncrushable · 102.4%" },
	{ value: 2, label: "Illidan Shear · 101.8%" },
];

export default function ConstraintsSection({
	uncritabilitySetting,
	uncrushabilitySetting,
	resistanceFloors,
	onUpdateConstraints,
	onUpdateResistanceFloors,
}: ConstraintsSectionProps) {
	return (
		<Stack spacing={2}>
			<Stack direction="row" spacing={3.5} useFlexGap sx={{ flexWrap: "wrap", rowGap: 2 }}>
				<SegmentedControl
					label="Crit reduction"
					options={CRIT_OPTIONS}
					value={uncritabilitySetting}
					onChange={(val) => onUpdateConstraints(val, uncrushabilitySetting)}
				/>
				<SegmentedControl
					label="Avoidance floor"
					options={UNCRUSHABLE_OPTIONS}
					value={uncrushabilitySetting}
					onChange={(val) => onUpdateConstraints(uncritabilitySetting, val)}
				/>
			</Stack>
			<ResistanceFloors floors={resistanceFloors} onChange={onUpdateResistanceFloors} />
		</Stack>
	);
}
