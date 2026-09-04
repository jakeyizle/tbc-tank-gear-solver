import { CHARACTER_LEVEL } from '../../../constants/mechanics';
import { IndividualSimUI } from '../../../individual_sim_ui';
import { Spec } from '../../../proto/common';
import { raceNames } from '../../../proto_utils/names';
import { IndividualWowheadGearPlannerImporter } from '../importers';
import { IndividualExporter } from './individual_exporter';
import i18n from '../../../../i18n/config';

function writeTalents(talentStr: string): number[] {
	const bits: number[] = [];
	let t = (talentStr + '--').split('-', 3);
	for (let e = 0; e < t.length; e++) {
		for (let a = 0; a < t[e].length; a++) bits.push(parseInt(t[e].charAt(a)));
		bits.push(15);
	}
	return bits;
}

// Function to write the hash (reverse of readHash)
function writeHash(data: WowheadGearPlannerData): string {
	let hash = '';
	const enchantOffset = 128;
	const randomEnchantOffset = 64;

	// Initialize bits array
	const t = 3;
	const hashArray: number[] = [t];

	// Level
	hashArray.push(data.level ?? 0);

	// Talents
	const talentBits = writeTalents(data.talents);
	hashArray.push(Math.ceil(talentBits.length / 2));
	for (let e = 0; e < talentBits.length; e += 2) {
		hashArray.push((talentBits[e] << 4) | (talentBits[e + 1] || 0));
	}

	// Items
	const items = data.items ?? [];
	const itemArray: number[] = [];
	items.forEach(item => {
		itemArray.push(item.slotId);
	});

	for (let slotIndex = 0; slotIndex < itemArray.length; slotIndex++) {
		let bits = itemArray[slotIndex];
		const item = items[slotIndex];
		const id = item.itemId;
		const gems = item.gemItemIds || [];
		const enchant = item.enchantId || 0;
		const randomEnchant = item.randomEnchantId || 0;
		if (enchant) bits |= enchantOffset;
		if (randomEnchant) bits |= randomEnchantOffset;

		hashArray.push(bits);
		let _ = Object.keys(gems).length;
		let f = (_ & 7) << 5;
		hashArray.push((f | (id >> 16)) & 255, (id >> 8) & 255, id & 255);
		if (enchant) hashArray.push((enchant >> 8) & 255, enchant & 255);
		if (randomEnchant) hashArray.push((randomEnchant >> 8) & 255, randomEnchant & 255);

		Object.keys(gems).forEach(e => {
			const gemNumber = parseInt(e);
			let t = (gemNumber & 7) << 5;
			let a = gems[gemNumber];
			hashArray.push((t | (a >> 16)) & 255, (a >> 8) & 255, a & 255);
		});
	}

	// Encode bits into characters
	let hashData = '';

	if (hashArray.length <= 3) {
		return '';
	}

	hashData = btoa(String.fromCharCode.apply(null, hashArray)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

	// Append the hash data to the URL
	if (hashData) {
		hash += hashData;
	}

	return hash;
}

export interface WowheadGearPlannerData {
	class?: string;
	race?: string;
	level: number;
	talents: string;
	items: WowheadItemData[];
}

export interface WowheadItemData {
	slotId: number;
	itemId: number;
	randomEnchantId?: number;
	gemItemIds?: Record<number, number>;
	enchantId?: number;
}

export function createWowheadGearPlannerLink(data: WowheadGearPlannerData): string {
	const baseUrl = '';
	const hash = writeHash(data);
	return baseUrl + hash;
}

export class IndividualWowheadGearPlannerExporter<SpecType extends Spec> extends IndividualExporter<SpecType> {
	constructor(parent: HTMLElement, simUI: IndividualSimUI<SpecType>) {
		super(parent, simUI, { title: i18n.t('export.wowhead.title'), allowDownload: true });
		this.getData();
	}

	getData(): string {
		const player = this.simUI.player;

		const converWowheadRace = (raceName: string): string => {
			const alliancePrefix = raceName.endsWith('(A)') ? 'alliance-' : undefined;
			const hordePrefix = raceName.endsWith('(H)') ? 'horde-' : undefined;
			return (alliancePrefix ?? hordePrefix ?? '') + raceName.replaceAll(' (A)', '').replaceAll(' (H)', '').replaceAll(/\s/g, '-').toLowerCase();
		};

		const classStr = player.getPlayerClass().friendlyName.replaceAll(/\s/g, '-').toLowerCase();
		const raceStr = converWowheadRace(raceNames.get(player.getRace())!);
		const url = `https://www.wowhead.com/tbc/gear-planner/${classStr}/${raceStr}/`;

		const data: WowheadGearPlannerData = {
			level: CHARACTER_LEVEL,
			talents: player.getTalentsString(),
			items: [],
		};

		const gear = player.getGear();

		gear.getItemSlots()
			.sort((slot1, slot2) => IndividualWowheadGearPlannerImporter.slotIDs[slot1] - IndividualWowheadGearPlannerImporter.slotIDs[slot2])
			.forEach(itemSlot => {
				const item = gear.getEquippedItem(itemSlot);
				if (!item) {
					return;
				}

				const slotId = IndividualWowheadGearPlannerImporter.slotIDs[itemSlot];
				const itemData = {
					slotId: slotId,
					itemId: item.id,
				} as WowheadItemData;
				if (item._randomSuffix?.id) {
					itemData.randomEnchantId = item._randomSuffix.id;
				}
				itemData.enchantId = item._enchant?.spellId;

				if (item._gems) {
					itemData.gemItemIds = {};
					item._gems.map((gem, index) => {
						if (gem?.id) {
							itemData.gemItemIds![index] = gem.id;
						}
					});
				}
				data.items.push(itemData);
			});

		const hash = createWowheadGearPlannerLink(data);

		return url + hash;
	}
}
