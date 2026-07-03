import Box from "@mui/material/Box";
import FormGroup from "@mui/material/FormGroup";
import FormLabel from "@mui/material/FormLabel";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { Buff } from "#/solver/types";
import BuffInput from "./BuffInput";
import ElixirFlaskFormGroup from "./ElixirFlaskFormGroup";

interface BuffsConsumablesSectionProps {
	buffs: Buff[];
	onBuffChange: (buffId: string) => void;
}

export default function BuffSection({
	buffs,
	onBuffChange,
}: BuffsConsumablesSectionProps) {

	return (
		<Box>
			<Typography variant="subtitle2" sx={{ mb: 1.5 }}>
				Buffs
			</Typography>
			<Stack direction="row" spacing={2}>
				<FormGroup>
					<FormLabel sx={{ fontSize: "0.75rem" }}>Buffs</FormLabel>
					{buffs.map((buff) => (
						<BuffInput
							key={buff.id}
							name={buff.name}
							isChecked={buff.checked}
							onChange={() => onBuffChange(buff.id)}
						/>
					))}
				</FormGroup>
				<Box>
					<ElixirFlaskFormGroup />
				</Box>
			</Stack>
		</Box>
	);
}
