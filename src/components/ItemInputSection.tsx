import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import LockIcon from "@mui/icons-material/Lock";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControlLabel from "@mui/material/FormControlLabel";
import Link from "@mui/material/Link";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useEffect, useMemo, useRef, useState } from "react";
import { CLASS_LABELS } from "#/data/classes";
import { RACE_LABELS } from "#/data/races";
import type { DetectedCharacter } from "#/helpers/parseItemInput";
import { analyzeItemInput } from "#/helpers/parseItemInput";

const PHASE_OPTIONS = [1, 2, 3, 4, 5];

interface ItemInputSectionProps {
	itemInput: string;
	setItemInput: (value: string) => void;
	areEnchantsGemsLocked: boolean;
	setAreEnchantsGemsLocked: (value: boolean) => void;
	excludeUniqueGems: boolean;
	setExcludeUniqueGems: (value: boolean) => void;
	independentConfigs: boolean;
	setIndependentConfigs: (value: boolean) => void;
	phase: number;
	setPhase: (value: number) => void;
	// Called once per pasted character export that resolves to a supported class -
	// used to pre-fill the Character section's class/race/talent inputs, which stay
	// editable afterward.
	onCharacterDetected?: (character: DetectedCharacter) => void;
}

const characterLabel = (character: DetectedCharacter): string => {
	const parts: string[] = [];
	if (character.name) parts.push(character.name);
	const raceLabel =
		(character.raceId && RACE_LABELS[character.raceId]) || character.raceName;
	const classLabel =
		(character.classId && CLASS_LABELS[character.classId]) ||
		character.className;
	const classRace = [raceLabel, classLabel].filter(Boolean).join(" ");
	if (classRace) parts.push(classRace);
	if (character.spec) {
		parts.push(character.spec[0].toUpperCase() + character.spec.slice(1));
	}
	return parts.join(" · ");
};

function PhaseSelect({
	phase,
	setPhase,
}: {
	phase: number;
	setPhase: (value: number) => void;
}) {
	return (
		<Select
			size="small"
			value={phase}
			onChange={(e) => setPhase(Number(e.target.value))}
			sx={{ minWidth: 88 }}
		>
			{PHASE_OPTIONS.map((option) => (
				<MenuItem key={option} value={option}>
					Phase {option}
				</MenuItem>
			))}
		</Select>
	);
}

const formatUnknownIdsMessage = (analysis: {
	unknownItemIds: string[];
	unknownGemIds: string[];
	unknownEnchantIds: string[];
}) => {
	const clauses = [];
	if (analysis.unknownItemIds.length) {
		clauses.push(`Unknown item IDs: ${analysis.unknownItemIds.join(", ")}.`);
	}
	if (analysis.unknownGemIds.length) {
		clauses.push(`Unknown gem IDs: ${analysis.unknownGemIds.join(", ")}.`);
	}
	if (analysis.unknownEnchantIds.length) {
		clauses.push(
			`Unknown enchant IDs: ${analysis.unknownEnchantIds.join(", ")}.`,
		);
	}
	return clauses.join(" ");
};

const PLACEHOLDER = `Paste your WowSims Exporter output here, e.g.

{"items":[{"id":28825,"enchant":2673,"gems":[24033]}, ...]}

A full character export (with class/race/talents) also works, and will
pre-fill the Character section above.`;

export default function ItemInputSection({
	itemInput,
	setItemInput,
	areEnchantsGemsLocked,
	setAreEnchantsGemsLocked,
	excludeUniqueGems,
	setExcludeUniqueGems,
	independentConfigs,
	setIndependentConfigs,
	phase,
	setPhase,
	onCharacterDetected,
}: ItemInputSectionProps) {
	const analysis = useMemo(() => analyzeItemInput(itemInput), [itemInput]);
	const isValid = analysis.status === "valid" || analysis.status === "warning";
	const character =
		analysis.status === "valid" || analysis.status === "warning"
			? analysis.character
			: null;

	// Pre-fill class/race/talents from a pasted character export, once per distinct
	// paste - the user can freely edit those fields afterward without this
	// overwriting them again.
	const appliedCharacterInputRef = useRef<string | null>(null);
	useEffect(() => {
		if (!onCharacterDetected || !character?.supported) return;
		if (appliedCharacterInputRef.current === itemInput) return;
		appliedCharacterInputRef.current = itemInput;
		onCharacterDetected(character);
	}, [character, itemInput, onCharacterDetected]);

	const [textareaOpen, setTextareaOpen] = useState(
		() => itemInput.trim().length > 0,
	);
	const [manualEdit, setManualEdit] = useState(false);
	const [focused, setFocused] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	const editing = manualEdit || focused || (!isValid && textareaOpen);
	const showSummary = isValid && !editing;

	// Collapse only on an actual click outside the component — not on blur, so
	// toggling controls inside it (e.g. the lock switch) or losing window focus
	// (alt-tab, clicking off the browser) doesn't collapse the input.
	useEffect(() => {
		if (!focused) return;
		const handlePointerDown = (e: MouseEvent) => {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				setFocused(false);
				if (analyzeItemInput(itemInput).status === "valid")
					setManualEdit(false);
			}
		};
		document.addEventListener("mousedown", handlePointerDown);
		return () => document.removeEventListener("mousedown", handlePointerDown);
	}, [focused, itemInput]);

	const handlePasteFromClipboard = async () => {
		setTextareaOpen(true);
		try {
			const text = await navigator.clipboard.readText();
			if (text) setItemInput(text);
		} catch {
			// clipboard permission denied — leave the textarea open for a manual paste
		}
	};

	if (showSummary) {
		return (
			<Paper
				variant="outlined"
				sx={{
					display: "flex",
					alignItems: "center",
					gap: 1.5,
					px: 1.75,
					py: 1.25,
				}}
			>
				<Typography
					variant="body2"
					sx={{ fontWeight: 500, width: 78, flexShrink: 0 }}
				>
					Gear pool
				</Typography>
				<Stack direction="row" spacing={0.75} alignItems="center">
					<Box
						sx={{
							width: 7,
							height: 7,
							borderRadius: "50%",
							bgcolor:
								analysis.status === "warning" ? "warning.main" : "success.main",
						}}
					/>
					{analysis.status === "warning" ? (
						<Typography variant="body2" color="warning.main">
							{analysis.count} {analysis.count === 1 ? "item" : "items"}
							{" · "}
							{analysis.unknownItemIds.length +
								analysis.unknownGemIds.length +
								analysis.unknownEnchantIds.length}{" "}
							unknown ID
							{analysis.unknownItemIds.length +
								analysis.unknownGemIds.length +
								analysis.unknownEnchantIds.length ===
							1
								? ""
								: "s"}
						</Typography>
					) : (
						<Typography variant="body2" color="success.main">
							{analysis.status === "valid" &&
								`${analysis.count} ${analysis.count === 1 ? "item" : "items"}`}
						</Typography>
					)}
					{character && (
						<Typography variant="body2" color="text.secondary">
							· {characterLabel(character)}
							{!character.supported && " (unsupported)"}
						</Typography>
					)}
				</Stack>

				<Stack
					direction="row"
					spacing={1}
					alignItems="center"
					sx={{ ml: "auto" }}
				>
					<PhaseSelect phase={phase} setPhase={setPhase} />
					<FormControlLabel
						sx={{ mr: 0 }}
						control={
							<Switch
								size="small"
								checked={!excludeUniqueGems}
								onChange={(e) => setExcludeUniqueGems(!e.target.checked)}
							/>
						}
						label={
							<Typography variant="body2" color="text.secondary">
								Unique gems
							</Typography>
						}
					/>
					<FormControlLabel
						sx={{ mr: 0 }}
						control={
							<Switch
								size="small"
								checked={areEnchantsGemsLocked}
								onChange={(e) => setAreEnchantsGemsLocked(e.target.checked)}
							/>
						}
						label={
							<Typography variant="body2" color="text.secondary">
								Lock enchants &amp; gems
							</Typography>
						}
					/>
					<FormControlLabel
						sx={{ mr: 0 }}
						control={
							<Switch
								size="small"
								checked={independentConfigs}
								onChange={(e) => setIndependentConfigs(e.target.checked)}
							/>
						}
						label={
							<Typography variant="body2" color="text.secondary">
								Compare independently
							</Typography>
						}
					/>
					<Typography
						variant="body2"
						color="primary"
						sx={{ cursor: "pointer" }}
						onClick={() => setManualEdit(true)}
					>
						Edit Gear Pool
					</Typography>
				</Stack>
			</Paper>
		);
	}

	return (
		<Paper
			ref={containerRef}
			variant="outlined"
			sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.25 }}
		>
			<Stack
				direction="row"
				alignItems="baseline"
				justifyContent="space-between"
			>
				<Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
					Gear pool
				</Typography>
				<Typography variant="caption" color="text.secondary">
					Every set draws from these items
				</Typography>
			</Stack>

			{!textareaOpen ? (
				<Box
					sx={{
						border: "1px dashed",
						borderColor: "divider",
						borderRadius: 1,
						bgcolor: "background.default",
						py: 3.5,
						px: 2.5,
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						gap: 1,
						textAlign: "center",
					}}
				>
					<Typography variant="body1" sx={{ fontWeight: 500 }}>
						Paste your WowSims export
					</Typography>
					<Typography
						variant="body2"
						color="text.secondary"
						sx={{ maxWidth: 380 }}
					>
						A full character export also works, and will pre-fill your class,
						race, and talents. Export with the{" "}
						<Link
							href="https://www.curseforge.com/wow/addons/wowsimsexporter"
							target="_blank"
							rel="noopener noreferrer"
						>
							WowSims Exporter
						</Link>{" "}
						addon.
					</Typography>
					<Stack direction="row" spacing={1} sx={{ mt: 0.75 }}>
						<Button variant="contained" onClick={handlePasteFromClipboard}>
							Paste from clipboard
						</Button>
						<Button variant="outlined" onClick={() => setTextareaOpen(true)}>
							Type it in
						</Button>
					</Stack>
				</Box>
			) : (
				<>
					<TextField
						placeholder={PLACEHOLDER}
						variant="outlined"
						fullWidth
						multiline
						minRows={4}
						maxRows={12}
						autoFocus
						value={itemInput}
						onChange={(e) => setItemInput(e.target.value)}
						onFocus={() => setFocused(true)}
						error={analysis.status === "error"}
						slotProps={{ htmlInput: { spellCheck: false } }}
					/>
					<Box sx={{ minHeight: 24 }}>
						{analysis.status === "valid" ? (
							<Stack direction="row" spacing={0.5} alignItems="center">
								<CheckCircleIcon color="success" fontSize="small" />
								<Typography variant="caption" color="success.main">
									{analysis.count} {analysis.count === 1 ? "item" : "items"}{" "}
									recognized from WowSims export
									{character && `. Detected ${characterLabel(character)}`}
									{character &&
										!character.supported &&
										" — class not supported here, only class/race/talents were skipped."}
								</Typography>
							</Stack>
						) : analysis.status === "warning" ? (
							<Stack direction="row" spacing={0.5} alignItems="center">
								<ErrorOutlineIcon color="warning" fontSize="small" />
								<Typography variant="caption" color="warning.main">
									{formatUnknownIdsMessage(analysis)}
								</Typography>
							</Stack>
						) : analysis.status === "error" ? (
							<Stack direction="row" spacing={0.5} alignItems="center">
								<ErrorOutlineIcon color="error" fontSize="small" />
								<Typography variant="caption" color="error.main">
									{analysis.message}
								</Typography>
							</Stack>
						) : null}
					</Box>
					<Stack
						direction="row"
						spacing={2}
						alignItems="center"
						useFlexGap
						sx={{ flexWrap: "wrap" }}
					>
						<FormControlLabel
							control={
								<Switch
									size="small"
									checked={areEnchantsGemsLocked}
									onChange={(e) => setAreEnchantsGemsLocked(e.target.checked)}
								/>
							}
							label={
								<Stack direction="row" spacing={0.5} alignItems="center">
									<LockIcon fontSize="inherit" />
									<Typography variant="body2">
										Lock enchants and gems
									</Typography>
								</Stack>
							}
						/>
						<FormControlLabel
							control={
								<Switch
									size="small"
									checked={!excludeUniqueGems}
									onChange={(e) => setExcludeUniqueGems(!e.target.checked)}
								/>
							}
							label={<Typography variant="body2">Unique gems</Typography>}
						/>
						<FormControlLabel
							control={
								<Switch
									size="small"
									checked={independentConfigs}
									onChange={(e) => setIndependentConfigs(e.target.checked)}
								/>
							}
							label={
								<Typography variant="body2">Compare independently</Typography>
							}
						/>
						<Stack direction="row" spacing={1} alignItems="center">
							<Typography variant="body2">Phase</Typography>
							<PhaseSelect phase={phase} setPhase={setPhase} />
						</Stack>
					</Stack>
				</>
			)}
		</Paper>
	);
}
