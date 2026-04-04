import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
import FormLabel from "@mui/material/FormLabel";
import { useState } from "react";

export default function ElixirFlaskFormGroup() {
	return (
		<>
			<FormGroup>
				<FormLabel>Elixirs</FormLabel>
				<FormControlLabel control={<Checkbox />} label="Elixir of Major Agility" />
                <FormControlLabel control={<Checkbox />} label="Elixir of Major Defense" />
			</FormGroup>
			<FormGroup>
                <FormLabel>Flasks</FormLabel>
                <FormControlLabel control={<Checkbox />} label="Flask of Fortification" />
            </FormGroup>
		</>
	);
}
