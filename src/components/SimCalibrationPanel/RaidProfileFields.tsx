import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Link from "@mui/material/Link";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { CONSUMABLES } from "#/data/consumables";
import type {
	DrumsType,
	PaladinAura,
	PaladinJudgement,
	RaidProfileSettings,
} from "#/types/SimCalibrationProfile";
import NumberSpinner from "../input/NumberSpinner";
import TristateSelect from "./TristateSelect";

interface RaidProfileFieldsProps {
	raidProfile: RaidProfileSettings;
	onChange: (raidProfile: RaidProfileSettings) => void;
}

const DRUMS_OPTIONS: { value: DrumsType; label: string }[] = [
	{ value: "DrumsUnknown", label: "None" },
	{ value: "LesserDrumsOfBattle", label: "Lesser Drums of Battle" },
	{ value: "LesserDrumsOfRestoration", label: "Lesser Drums of Restoration" },
	{ value: "LesserDrumsOfWar", label: "Lesser Drums of War" },
	{ value: "GreaterDrumsOfBattle", label: "Greater Drums of Battle" },
	{
		value: "GreaterDrumsOfRestoration",
		label: "Greater Drums of Restoration",
	},
	{ value: "GreaterDrumsOfWar", label: "Greater Drums of War" },
];

const JUDGEMENT_OPTIONS: { value: PaladinJudgement; label: string }[] = [
	{ value: "JudgementNone", label: "None" },
	{ value: "JudgementOfWisdom", label: "Judgement of Wisdom" },
	{ value: "JudgementOfLight", label: "Judgement of Light" },
];

// "Sanctity Aura" excluded - see protPaladinSimpleRotation.ts's header comment.
const AURA_OPTIONS: { value: PaladinAura; label: string }[] = [
	{ value: "AuraNone", label: "None" },
	{ value: "DevotionAura", label: "Devotion Aura" },
	{ value: "RetributionAura", label: "Retribution Aura" },
	{ value: "ConcentrationAura", label: "Concentration Aura" },
	{ value: "FireResistanceAura", label: "Fire Resistance Aura" },
	{ value: "FrostResistanceAura", label: "Frost Resistance Aura" },
	{ value: "ShadowResistanceAura", label: "Shadow Resistance Aura" },
];

function BoolField({
	label,
	checked,
	onChange,
}: {
	label: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
}) {
	return (
		<FormControlLabel
			control={
				<Checkbox
					size="small"
					checked={checked}
					onChange={(e) => onChange(e.target.checked)}
				/>
			}
			label={<Typography variant="body2">{label}</Typography>}
		/>
	);
}

function ConsumablePicker({
	label,
	type,
	itemId,
	onChange,
}: {
	label: string;
	type: "Flask";
	itemId: number;
	onChange: (itemId: number) => void;
}) {
	const options = CONSUMABLES.filter((c) => c.type === type);
	return (
		<Stack direction="row" spacing={1} alignItems="center">
			<Typography variant="body2" sx={{ minWidth: 110 }} noWrap>
				{label}
			</Typography>
			<Select
				size="small"
				value={itemId}
				onChange={(e) => onChange(Number(e.target.value))}
				sx={{ minWidth: 220 }}
			>
				<MenuItem value={0}>None</MenuItem>
				{options.map((option) => (
					<MenuItem key={option.id} value={option.wowheadId}>
						{option.name}
					</MenuItem>
				))}
			</Select>
		</Stack>
	);
}

export default function RaidProfileFields({
	raidProfile,
	onChange,
}: RaidProfileFieldsProps) {
	const {
		raidBuffs,
		partyBuffs,
		individualBuffs,
		debuffs,
		consumables,
		simpleRotation,
	} = raidProfile;

	const patch = <K extends keyof RaidProfileSettings>(
		key: K,
		value: RaidProfileSettings[K],
	) => onChange({ ...raidProfile, [key]: value });

	return (
		<Stack spacing={2}>
			<Stack spacing={0.5}>
				<Typography variant="overline" color="text.secondary">
					Talents
				</Typography>
				<TextField
					size="small"
					fullWidth
					value={raidProfile.talentsString}
					onChange={(e) => patch("talentsString", e.target.value)}
					placeholder="Talent export string"
				/>
				<Typography variant="caption" color="text.disabled">
					Paste an exported talent string (e.g. from a talent calculator).
					Rotation options that depend on specific talents (Avenger's Shield,
					Sanctity Aura) assume the reference build's talents regardless of
					what's entered here - see the note on that below.
				</Typography>
			</Stack>

			<Stack spacing={0.5}>
				<Typography variant="overline" color="text.secondary">
					Raid Buffs
				</Typography>
				<Stack direction="row" flexWrap="wrap" useFlexGap columnGap={3}>
					<BoolField
						label="Bloodlust"
						checked={raidBuffs.bloodlust}
						onChange={(v) => patch("raidBuffs", { ...raidBuffs, bloodlust: v })}
					/>
					<BoolField
						label="Arcane Brilliance"
						checked={raidBuffs.arcaneBrilliance}
						onChange={(v) =>
							patch("raidBuffs", { ...raidBuffs, arcaneBrilliance: v })
						}
					/>
					<BoolField
						label="Shadow Protection"
						checked={raidBuffs.shadowProtection}
						onChange={(v) =>
							patch("raidBuffs", { ...raidBuffs, shadowProtection: v })
						}
					/>
					<TristateSelect
						label="Divine Spirit"
						value={raidBuffs.divineSpirit}
						onChange={(v) =>
							patch("raidBuffs", { ...raidBuffs, divineSpirit: v })
						}
					/>
					<TristateSelect
						label="Gift of the Wild"
						value={raidBuffs.giftOfTheWild}
						onChange={(v) =>
							patch("raidBuffs", { ...raidBuffs, giftOfTheWild: v })
						}
					/>
					<TristateSelect
						label="Power Word: Fortitude"
						value={raidBuffs.powerWordFortitude}
						onChange={(v) =>
							patch("raidBuffs", { ...raidBuffs, powerWordFortitude: v })
						}
					/>
					<TristateSelect
						label="Thorns"
						value={raidBuffs.thorns}
						onChange={(v) => patch("raidBuffs", { ...raidBuffs, thorns: v })}
					/>
				</Stack>
			</Stack>

			<Stack spacing={0.5}>
				<Typography variant="overline" color="text.secondary">
					Party Buffs
				</Typography>
				<Stack
					direction="row"
					flexWrap="wrap"
					useFlexGap
					columnGap={3}
					rowGap={1}
				>
					<TristateSelect
						label="Mana Spring Totem"
						value={partyBuffs.manaSpringTotem}
						onChange={(v) =>
							patch("partyBuffs", { ...partyBuffs, manaSpringTotem: v })
						}
					/>
					<TristateSelect
						label="Wrath of Air Totem"
						value={partyBuffs.wrathOfAirTotem}
						onChange={(v) =>
							patch("partyBuffs", { ...partyBuffs, wrathOfAirTotem: v })
						}
					/>
					<TristateSelect
						label="Grace of Air Totem"
						value={partyBuffs.graceOfAirTotem}
						onChange={(v) =>
							patch("partyBuffs", { ...partyBuffs, graceOfAirTotem: v })
						}
					/>
					<TristateSelect
						label="Strength of Earth Totem"
						value={partyBuffs.strengthOfEarthTotem}
						onChange={(v) =>
							patch("partyBuffs", { ...partyBuffs, strengthOfEarthTotem: v })
						}
					/>
					<TristateSelect
						label="Windfury Totem"
						value={partyBuffs.windfuryTotem}
						onChange={(v) =>
							patch("partyBuffs", { ...partyBuffs, windfuryTotem: v })
						}
					/>
					<TristateSelect
						label="Battle Shout"
						value={partyBuffs.battleShout}
						onChange={(v) =>
							patch("partyBuffs", { ...partyBuffs, battleShout: v })
						}
					/>
					<TristateSelect
						label="Sanctity Aura (party)"
						value={partyBuffs.sanctityAura}
						onChange={(v) =>
							patch("partyBuffs", { ...partyBuffs, sanctityAura: v })
						}
					/>
					<Stack direction="row" spacing={1} alignItems="center">
						<Typography variant="body2" sx={{ minWidth: 160 }} noWrap>
							Drums
						</Typography>
						<Select
							size="small"
							value={partyBuffs.drums}
							onChange={(e) =>
								patch("partyBuffs", {
									...partyBuffs,
									drums: e.target.value as DrumsType,
								})
							}
							sx={{ minWidth: 220 }}
						>
							{DRUMS_OPTIONS.map((option) => (
								<MenuItem key={option.value} value={option.value}>
									{option.label}
								</MenuItem>
							))}
						</Select>
					</Stack>
				</Stack>
			</Stack>

			<Stack spacing={0.5}>
				<Typography variant="overline" color="text.secondary">
					Individual Buffs
				</Typography>
				<Stack direction="row" flexWrap="wrap" useFlexGap columnGap={3}>
					<BoolField
						label="Blessing of Kings"
						checked={individualBuffs.blessingOfKings}
						onChange={(v) =>
							patch("individualBuffs", {
								...individualBuffs,
								blessingOfKings: v,
							})
						}
					/>
					<BoolField
						label="Blessing of Sanctuary"
						checked={individualBuffs.blessingOfSanctuary}
						onChange={(v) =>
							patch("individualBuffs", {
								...individualBuffs,
								blessingOfSanctuary: v,
							})
						}
					/>
					<TristateSelect
						label="Blessing of Wisdom"
						value={individualBuffs.blessingOfWisdom}
						onChange={(v) =>
							patch("individualBuffs", {
								...individualBuffs,
								blessingOfWisdom: v,
							})
						}
					/>
					<TristateSelect
						label="Blessing of Might"
						value={individualBuffs.blessingOfMight}
						onChange={(v) =>
							patch("individualBuffs", {
								...individualBuffs,
								blessingOfMight: v,
							})
						}
					/>
				</Stack>
			</Stack>

			<Stack spacing={0.5}>
				<Typography variant="overline" color="text.secondary">
					Debuffs
				</Typography>
				<Stack direction="row" flexWrap="wrap" useFlexGap columnGap={3}>
					<BoolField
						label="Misery"
						checked={debuffs.misery}
						onChange={(v) => patch("debuffs", { ...debuffs, misery: v })}
					/>
					<BoolField
						label="Judgement of Wisdom"
						checked={debuffs.judgementOfWisdom}
						onChange={(v) =>
							patch("debuffs", { ...debuffs, judgementOfWisdom: v })
						}
					/>
					<BoolField
						label="Judgement of Light"
						checked={debuffs.judgementOfLight}
						onChange={(v) =>
							patch("debuffs", { ...debuffs, judgementOfLight: v })
						}
					/>
					<BoolField
						label="Blood Frenzy"
						checked={debuffs.bloodFrenzy}
						onChange={(v) => patch("debuffs", { ...debuffs, bloodFrenzy: v })}
					/>
					<BoolField
						label="Curse of Recklessness"
						checked={debuffs.curseOfRecklessness}
						onChange={(v) =>
							patch("debuffs", { ...debuffs, curseOfRecklessness: v })
						}
					/>
					<BoolField
						label="Sunder Armor"
						checked={debuffs.sunderArmor}
						onChange={(v) => patch("debuffs", { ...debuffs, sunderArmor: v })}
					/>
					<BoolField
						label="Insect Swarm"
						checked={debuffs.insectSwarm}
						onChange={(v) => patch("debuffs", { ...debuffs, insectSwarm: v })}
					/>
					<TristateSelect
						label="Curse of Elements"
						value={debuffs.curseOfElements}
						onChange={(v) =>
							patch("debuffs", { ...debuffs, curseOfElements: v })
						}
					/>
					<TristateSelect
						label="Improved Seal of the Crusader"
						value={debuffs.improvedSealOfTheCrusader}
						onChange={(v) =>
							patch("debuffs", { ...debuffs, improvedSealOfTheCrusader: v })
						}
					/>
					<TristateSelect
						label="Hunter's Mark"
						value={debuffs.huntersMark}
						onChange={(v) => patch("debuffs", { ...debuffs, huntersMark: v })}
					/>
					<TristateSelect
						label="Faerie Fire"
						value={debuffs.faerieFire}
						onChange={(v) => patch("debuffs", { ...debuffs, faerieFire: v })}
					/>
					<TristateSelect
						label="Expose Armor"
						value={debuffs.exposeArmor}
						onChange={(v) => patch("debuffs", { ...debuffs, exposeArmor: v })}
					/>
					<NumberSpinner
						id="debuff-expose-weakness-uptime"
						label="Expose Weakness uptime"
						size="small"
						min={0}
						max={1}
						step={0.05}
						value={debuffs.exposeWeaknessUptime}
						onValueChange={(v) =>
							v != null &&
							patch("debuffs", { ...debuffs, exposeWeaknessUptime: v })
						}
					/>
					<NumberSpinner
						id="debuff-expose-weakness-agility"
						label="Expose Weakness hunter agility"
						size="small"
						min={0}
						value={debuffs.exposeWeaknessHunterAgility}
						onValueChange={(v) =>
							v != null &&
							patch("debuffs", { ...debuffs, exposeWeaknessHunterAgility: v })
						}
					/>
				</Stack>
			</Stack>

			<Stack spacing={0.5}>
				<Typography variant="overline" color="text.secondary">
					Consumables
				</Typography>
				<Stack
					direction="row"
					flexWrap="wrap"
					useFlexGap
					columnGap={3}
					rowGap={1}
				>
					<ConsumablePicker
						label="Flask"
						type="Flask"
						itemId={consumables.flaskId}
						onChange={(v) =>
							patch("consumables", { ...consumables, flaskId: v })
						}
					/>
				</Stack>
				<Typography variant="caption" color="text.disabled">
					A flask replaces battle/guardian elixirs entirely for this calibration
					profile (matching tbc-new's own consumables shape - there's no
					separate elixir slot). Food, potion, weapon oil, and explosive don't
					have a name lookup in this app's data yet - enter their tbc-new item
					IDs directly (see wowhead).
				</Typography>
				<Stack
					direction="row"
					flexWrap="wrap"
					useFlexGap
					columnGap={3}
					rowGap={1}
				>
					<NumberSpinner
						id="consumable-food-id"
						label="Food item ID"
						size="small"
						min={0}
						value={consumables.foodId}
						onValueChange={(v) =>
							v != null && patch("consumables", { ...consumables, foodId: v })
						}
					/>
					<NumberSpinner
						id="consumable-pot-id"
						label="Potion item ID"
						size="small"
						min={0}
						value={consumables.potId}
						onValueChange={(v) =>
							v != null && patch("consumables", { ...consumables, potId: v })
						}
					/>
					<NumberSpinner
						id="consumable-conjured-id"
						label="Conjured item ID"
						size="small"
						min={0}
						value={consumables.conjuredId}
						onValueChange={(v) =>
							v != null &&
							patch("consumables", { ...consumables, conjuredId: v })
						}
					/>
					<NumberSpinner
						id="consumable-mh-imbue-id"
						label="Weapon oil item ID"
						size="small"
						min={0}
						value={consumables.mhImbueId}
						onValueChange={(v) =>
							v != null &&
							patch("consumables", { ...consumables, mhImbueId: v })
						}
					/>
					<NumberSpinner
						id="consumable-explosive-id"
						label="Explosive item ID"
						size="small"
						min={0}
						value={consumables.explosiveId}
						onValueChange={(v) =>
							v != null &&
							patch("consumables", { ...consumables, explosiveId: v })
						}
					/>
				</Stack>
				<Stack direction="row" flexWrap="wrap" useFlexGap columnGap={3}>
					<BoolField
						label="Super Sapper Charge"
						checked={consumables.superSapper}
						onChange={(v) =>
							patch("consumables", { ...consumables, superSapper: v })
						}
					/>
					<BoolField
						label="Goblin Sapper Charge"
						checked={consumables.goblinSapper}
						onChange={(v) =>
							patch("consumables", { ...consumables, goblinSapper: v })
						}
					/>
					<BoolField
						label="Fel Nightmare Seed"
						checked={consumables.nightmareSeed}
						onChange={(v) =>
							patch("consumables", { ...consumables, nightmareSeed: v })
						}
					/>
					<BoolField
						label="Scroll of Strength"
						checked={consumables.scrollStr}
						onChange={(v) =>
							patch("consumables", { ...consumables, scrollStr: v })
						}
					/>
					<BoolField
						label="Scroll of Agility"
						checked={consumables.scrollAgi}
						onChange={(v) =>
							patch("consumables", { ...consumables, scrollAgi: v })
						}
					/>
					<BoolField
						label="Scroll of Protection"
						checked={consumables.scrollArm}
						onChange={(v) =>
							patch("consumables", { ...consumables, scrollArm: v })
						}
					/>
				</Stack>
			</Stack>

			<Stack spacing={0.5}>
				<Typography variant="overline" color="text.secondary">
					Rotation
				</Typography>
				<Stack
					direction="row"
					flexWrap="wrap"
					useFlexGap
					columnGap={3}
					rowGap={1}
				>
					<BoolField
						label="Prioritize Holy Shield"
						checked={simpleRotation.prioritizeHolyShield}
						onChange={(v) =>
							patch("simpleRotation", {
								...simpleRotation,
								prioritizeHolyShield: v,
							})
						}
					/>
					<BoolField
						label="Use Exorcism"
						checked={simpleRotation.useExorcism}
						onChange={(v) =>
							patch("simpleRotation", { ...simpleRotation, useExorcism: v })
						}
					/>
					<BoolField
						label="Use Hammer of Wrath"
						checked={simpleRotation.useHammerOfWrath}
						onChange={(v) =>
							patch("simpleRotation", {
								...simpleRotation,
								useHammerOfWrath: v,
							})
						}
					/>
					<NumberSpinner
						id="rotation-consecration-rank"
						label="Consecration rank (0 = off)"
						size="small"
						min={0}
						max={6}
						value={simpleRotation.consecrationRank}
						onValueChange={(v) =>
							v != null &&
							patch("simpleRotation", {
								...simpleRotation,
								consecrationRank: v,
							})
						}
					/>
					<Stack direction="row" spacing={1} alignItems="center">
						<Typography variant="body2" sx={{ minWidth: 110 }} noWrap>
							Maintain Judgement
						</Typography>
						<Select
							size="small"
							value={simpleRotation.maintainJudgement}
							onChange={(e) =>
								patch("simpleRotation", {
									...simpleRotation,
									maintainJudgement: e.target.value as PaladinJudgement,
								})
							}
							sx={{ minWidth: 180 }}
						>
							{JUDGEMENT_OPTIONS.map((option) => (
								<MenuItem key={option.value} value={option.value}>
									{option.label}
								</MenuItem>
							))}
						</Select>
					</Stack>
					<Stack direction="row" spacing={1} alignItems="center">
						<Typography variant="body2" sx={{ minWidth: 60 }} noWrap>
							Aura
						</Typography>
						<Select
							size="small"
							value={simpleRotation.aura}
							onChange={(e) =>
								patch("simpleRotation", {
									...simpleRotation,
									aura: e.target.value as PaladinAura,
								})
							}
							sx={{ minWidth: 180 }}
						>
							{AURA_OPTIONS.map((option) => (
								<MenuItem key={option.value} value={option.value}>
									{option.label}
								</MenuItem>
							))}
						</Select>
					</Stack>
				</Stack>
				<Typography variant="caption" color="text.disabled">
					Avenger's Shield rotation options aren't available yet - they require
					the Avenger's Shield talent, which this app doesn't currently detect
					from the talent string above.
				</Typography>
			</Stack>

			<Stack spacing={0.5}>
				<Typography variant="caption" color="text.disabled">
					Reference encounter:{" "}
					<Link
						href="https://www.wowhead.com/tbc/zone=4131/magtheridons-lair"
						target="_blank"
						rel="noopener noreferrer"
					>
						Magtheridon's Lair
					</Link>{" "}
					profile, as shipped by tbc-new's own Protection Paladin defaults.
				</Typography>
			</Stack>
		</Stack>
	);
}
