import { ref } from 'tsx-vanilla';

import { IndividualSimUI } from '../../../individual_sim_ui';
import { Class, EquipmentSpec, ItemSlot, ItemSpec, Profession, Race, Spec } from '../../../proto/common';
import { nameToClass, nameToRace } from '../../../proto_utils/names';
import { IndividualImporter } from './individual_importer';
import i18n from '../../../../i18n/config';
import { CHARACTER_LEVEL } from '../../../constants/mechanics';

interface WowheadGearPlannerImportJSON {
	classId: string;
	raceId: string;
	genderId: number;
	level: number;
	specIndex: number;
	talentString: string;
	items: {
		slotId: number;
		itemId: number;
		randomEnchantId?: number;
		gemItemIds: number[];
		enchantId?: number;
	}[];
}

// Taken from Wowhead
function readHash(hash: string): WowheadGearPlannerImportJSON {
	const enchantOffset = 128;
	const randomEnchantOffset = 64;

	const t: WowheadGearPlannerImportJSON = {
		classId: '',
		raceId: '',
		genderId: 0,
		level: 0,
		specIndex: 0,
		talentString: '',
		items: [],
	};
	const l = /^([a-z-]+)\/([a-z-]+)(?:\/([a-zA-Z0-9_-]+))?$/.exec(hash);
	if (!l) return t;

	t.classId = l[1];
	t.raceId = l[2];

	t.level = CHARACTER_LEVEL;

	if (!l) return t;

	let gearPlannerString = l[3].replace(/-/g, '+').replace(/_/g, '/');
	let gearPlannerHash = atob(gearPlannerString);
	let gearPlannerBits: number[] = [];
	for (let e = 0; e < gearPlannerHash.length; e++) {
		gearPlannerBits.push(gearPlannerHash.charCodeAt(e));
	}

	let r = gearPlannerBits.shift()!;
	if (r < 4) {
		if (r > 0) {
			t.level = gearPlannerBits.shift()!;
		}
		t.talentString = '';
		if (r > 1) {
			let e = gearPlannerBits.shift()!;
			let a = gearPlannerBits.splice(0, e);
			let s = [];
			for (let e = 0; e < a.length; e++) {
				s.push(a[e] >> 4, a[e] & 15);
			}
			let n = 0;
			for (let e = 0; e < s.length && n < 3; e++) {
				if (s[e] === 15) {
					t.talentString += '-';
					n++;
				} else {
					t.talentString += '' + s[e];
				}
			}
			t.talentString = t.talentString.replace(/-+$/, '');
		}
		while (gearPlannerBits.length >= 3) {
			let slotIdx = gearPlannerBits.shift()!;
			let n = 0;
			let itemID = 0;
			if (r >= 3) {
				let e = gearPlannerBits.shift()!;
				n = (e & 224) >> 5;
				itemID |= (e & 31) << 16;
			}
			itemID |= gearPlannerBits.shift()! << 8;
			itemID |= gearPlannerBits.shift()!;
			let o = (slotIdx & enchantOffset) > 0;
			let c = (slotIdx & randomEnchantOffset) > 0;
			slotIdx = slotIdx & ~enchantOffset & ~randomEnchantOffset;
			let item: WowheadGearPlannerImportJSON['items'][number] = {
				slotId: slotIdx,
				itemId: itemID,
				randomEnchantId: undefined,
				gemItemIds: [],
				enchantId: undefined,
			};

			if (o) {
				let enchantId = gearPlannerBits.shift()! << 8;
				enchantId |= gearPlannerBits.shift()!;
				item.enchantId = enchantId;
			}
			if (c) {
				let randomEnchantId = gearPlannerBits.shift()! << 8;
				randomEnchantId |= gearPlannerBits.shift()!;
				if ((randomEnchantId & 32768) > 0) {
					randomEnchantId -= 65536;
				}
				item.randomEnchantId = randomEnchantId;
			}
			while (n--) {
				let gemID = 0;
				let s = gearPlannerBits.shift()!;
				gemID |= (s & 31) << 16;
				gemID |= gearPlannerBits.shift()! << 8;
				gemID |= gearPlannerBits.shift()!;
				item.gemItemIds.push(gemID);
			}
			t.items.push(item);
		}
	}

	return t;
}

function parseWowheadGearLink(link: string): WowheadGearPlannerImportJSON {
	// Extract the part after 'tbc/gear-planner/'
	const match = link.match(/tbc\/gear-planner\/(.+)/);
	if (!match) {
		throw new Error(`Invalid WCL URL ${link}, must look like "https://www.wowhead.com/tbc/gear-planner/CLASS/RACE/XXXX"`);
	}
	const e = match[1];
	return readHash(e);
}

export class IndividualWowheadGearPlannerImporter<SpecType extends Spec> extends IndividualImporter<SpecType> {
	constructor(parent: HTMLElement, simUI: IndividualSimUI<SpecType>) {
		super(parent, simUI, { title: i18n.t('import.wowhead.title'), allowFileUpload: true });

		this.descriptionElem.appendChild(
			<div>
				<p>
					{i18n.t('import.wowhead.description')}{' '}
					<a href="https://www.wowhead.com/tbc/gear-planner" target="_blank">
						{i18n.t('import.wowhead.gear_planner_link')}
					</a>
					.
				</p>
				<p>{i18n.t('import.wowhead.feature_description')}</p>
				<p>{i18n.t('import.wowhead.instructions')}</p>
			</div>,
		);
	}

	async onImport(url: string) {
		const match = url.match(/www\.wowhead\.com\/tbc\/gear-planner\/([a-z\-]+)\/([a-z\-]+)\/([a-zA-Z0-9_\-]+)/);
		if (!match) {
			throw new Error(i18n.t('import.wowhead.error_invalid_url', { url }));
		}
		const missingItems: number[] = [];
		const missingEnchants: number[] = [];
		const professions: Profession[] = [];

		const parsed = parseWowheadGearLink(url);
		const charClass = nameToClass(parsed.classId.replaceAll('-', ''));
		if (charClass == Class.ClassUnknown) {
			throw new Error(i18n.t('import.wowhead.error_cannot_parse_class', { classId: parsed.classId }));
		}

		const converWowheadRace = (raceId: string): string => {
			const allianceSuffix = raceId.startsWith('alliance-') ? ' (A)' : undefined;
			const hordeSuffix = raceId.startsWith('horde-') ? ' (H)' : undefined;
			return raceId.replaceAll('alliance', '').replaceAll('horde', '').replaceAll('-', '') + (allianceSuffix ?? hordeSuffix ?? '');
		};

		const race = nameToRace(converWowheadRace(parsed.raceId));
		if (race == Race.RaceUnknown) {
			throw new Error(i18n.t('import.wowhead.error_cannot_parse_race', { raceId: parsed.raceId }));
		}

		const equipmentSpec = EquipmentSpec.create();

		parsed.items.forEach(item => {
			const dbItem = this.simUI.sim.db.getItemById(item.itemId);
			if (!dbItem) {
				missingItems.push(item.itemId);
				return;
			}
			const itemSpec = ItemSpec.create();
			itemSpec.id = item.itemId;
			const slotId = item.slotId;
			if (item.enchantId) {
				const enchant = this.simUI.sim.db.enchantSpellIdToEnchant(item.enchantId);
				if (!enchant) {
					missingEnchants.push(item.enchantId);
					return;
				} else {
					itemSpec.enchant = enchant.effectId;
				}
			}
			if (item.gemItemIds) {
				itemSpec.gems = item.gemItemIds;
			}
			if (item.randomEnchantId) {
				itemSpec.randomSuffix = item.randomEnchantId;
			}
			const itemSlotEntry = Object.entries(IndividualWowheadGearPlannerImporter.slotIDs).find(e => e[1] == slotId);
			if (itemSlotEntry != null) {
				equipmentSpec.items.push(itemSpec);
			}
		});

		this.finishIndividualImport(this.simUI, {
			charClass,
			race,
			equipmentSpec,
			talentsStr: parsed.talentString ?? '',
			professions,
			missingEnchants,
			missingItems,
		});
	}

	static slotIDs: Record<ItemSlot, number> = {
		[ItemSlot.ItemSlotHead]: 1,
		[ItemSlot.ItemSlotNeck]: 2,
		[ItemSlot.ItemSlotShoulder]: 3,
		[ItemSlot.ItemSlotBack]: 15,
		[ItemSlot.ItemSlotChest]: 5,
		[ItemSlot.ItemSlotWrist]: 9,
		[ItemSlot.ItemSlotHands]: 10,
		[ItemSlot.ItemSlotWaist]: 6,
		[ItemSlot.ItemSlotLegs]: 7,
		[ItemSlot.ItemSlotFeet]: 8,
		[ItemSlot.ItemSlotFinger1]: 11,
		[ItemSlot.ItemSlotFinger2]: 12,
		[ItemSlot.ItemSlotTrinket1]: 13,
		[ItemSlot.ItemSlotTrinket2]: 14,
		[ItemSlot.ItemSlotMainHand]: 16,
		[ItemSlot.ItemSlotOffHand]: 17,
		[ItemSlot.ItemSlotRanged]: 18,
	};
}
