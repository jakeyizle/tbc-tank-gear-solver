import Enchants from "../data/enchants.json";
import Gems from "../data/gems.json";
import Items from "../data/items.json";
import {
	calculateAvoidance,
	calculateObjectiveScore,
	calculateUncritability,
} from "./calculateScores";
import { overrideItem } from "./itemOverride";
import { gemsSatisfySocketBonus } from "./socketBonus";
import type {
	Enchant,
	Gem,
	InputItem,
	Item,
	ItemVariation,
	LPItem,
	ProcessedItemType,
	Stat,
} from "./types";

const createEmptyEnchant = (): Enchant => {
	return {
		name: "",
		id: "",
		effectID: "",
		type: "Ranged",
		stats: [],
	}
}

export const getTransformedItems = (
	inputItems: InputItem[],
	optimizeStats: Stat[],
	areEnchantsGemsLocked: boolean,
	uncrushabilitySetting: number,
	uncritabilitySetting: number,
) => {
	const items = inputItems
		.map((item) => getItem(item))
		.filter((item) => !!item);
	const itemVariations = createItemVariations(
		items,
		optimizeStats,
		uncrushabilitySetting,
		uncritabilitySetting,
		areEnchantsGemsLocked,
	);
	const lpItems = itemVariations.map((item) =>
		transformItem(
			item,
			optimizeStats,
			uncrushabilitySetting,
			uncritabilitySetting,
		),
	);
	return lpItems;
};

const getEnchants = (
	optimizeStats: Stat[],
	uncrushabilitySetting: number,
	uncritabilitySetting: number,
) => {
	function doesEnchantHaveAScore(enchant: Enchant) {
		const avoidanceScore = enchant.stats.reduce(
			(acc, stat) => acc + calculateAvoidance(stat, uncrushabilitySetting),
			0,
		);
		const objectiveScore = enchant.stats.reduce(
			(acc, stat) => acc + calculateObjectiveScore(stat, optimizeStats),
			0,
		);
		const uncritabilityScore = enchant.stats.reduce(
			(acc, stat) => acc + calculateUncritability(stat, uncritabilitySetting),
			0,
		);
		return avoidanceScore > 0 || objectiveScore > 0 || uncritabilityScore > 0;
	}
	let enchants = Enchants as Enchant[];
	enchants = enchants.filter((enchant) => enchant.stats.length > 0);
	enchants = enchants.filter((enchant) => doesEnchantHaveAScore(enchant));
	return enchants;
};

const getGem = (id: string) => {
	const gemToReturn = Gems.find((g) => g.id === id);
	if (!gemToReturn) {
		console.error(`Gem not found: ${id}`);
		return undefined;
	}
	return gemToReturn;
};

const getEnchantByEffectID = (effectID: string) => {
	const enchantToReturn = Enchants.find((e) => e.effectID === effectID);
	if (!enchantToReturn) {
		console.error(`Enchant not found with effectID: ${effectID}`);
		return undefined;
	}
	return enchantToReturn;
};

const getGems = (
	optimizeStats: Stat[],
	uncrushabilitySetting: number,
	uncritabilitySetting: number,
) => {
	function doesGemHaveAScore(gem: Gem) {
		const avoidanceScore = gem.stats.reduce(
			(acc, stat) => acc + calculateAvoidance(stat, uncrushabilitySetting),
			0,
		);
		const objectiveScore = gem.stats.reduce(
			(acc, stat) => acc + calculateObjectiveScore(stat, optimizeStats),
			0,
		);
		const uncritabilityScore = gem.stats.reduce(
			(acc, stat) => acc + calculateUncritability(stat, uncritabilitySetting),
			0,
		);
		return avoidanceScore > 0 || objectiveScore > 0 || uncritabilityScore > 0;
	}
	let gems = Gems as Gem[];
	// TODO: make phase configurable
	gems = gems.filter((gem) => gem.phase === "1");
	gems = gems.filter((gem) => !gem.isUnique);
	// TODO: include meta gems
	gems = gems.filter((gem) => gem.color !== "Meta");
	gems = gems.filter((gem) => gem.stats.length > 0);
	gems = gems.filter((gem) => doesGemHaveAScore(gem));
	return gems;
};

const getItem = (inputItem: InputItem) => {
	const items = Items as Item[];
	let baseItem = items.find((i) => i.id === inputItem.id);
	if (!baseItem) {
		console.error(`Item not found: ${inputItem.id}`);
		return undefined;
	}
	baseItem = overrideItem(baseItem);
	const gems = inputItem.gems
		.map((gem) => getGem(gem))
		.filter((gem) => !!gem) as Gem[];
	const enchant =
		(inputItem.enchant ? getEnchantByEffectID(inputItem.enchant) : undefined) ||
		createEmptyEnchant();

	const item: ItemVariation = {
		...baseItem,
		gems,
		enchant: enchant as Enchant,
		uniqueId: `${inputItem.id}-0`,
	};
	return item;
};

const createGemCombinations = (gems: Gem[], socketCount: number): Gem[][] => {
	const result: Gem[][] = [];

	function backtrack(start: number, current: Gem[]) {
		if (current.length === socketCount) {
			result.push([...current]);
			return;
		}

		for (let i = start; i < gems.length; i++) {
			current.push(gems[i]);
			backtrack(i, current);
			current.pop();
		}
	}

	backtrack(0, []);
	return result;
};

const getEnchantsForItem = (item: Item, enchants: Enchant[]) => {
	// weapon is ranged if type == ranged
	// however need to exclude wands, relics
	if (item.type === "Ranged") {
		if (["Bow", "Gun", "Crossbow"].includes(item.weaponType ?? "")) {
			return enchants.filter((enchant) => enchant.type === "Ranged");
		} else {
			return [];
		}
	}
	// weapon is shield if weaponType == shield
	// weapon is 2handed if handType == TwoHand
	if (item.type === "Weapon") {
		if (item.weaponType === "Shield") {
			return enchants.filter((enchant) => enchant.enchantType === "Shield");
		} else if (item.handType === "TwoHand") {
			return enchants.filter(
				(enchant) =>
					enchant.type === "Weapon" && enchant.enchantType !== "Shield",
			);
		}
		return enchants.filter(
			(enchant) => enchant.type === "Weapon" && !enchant.enchantType,
		);
	}

	// else its normal
	return enchants.filter((enchant) => enchant.type === item.type);
};

const createItemVariations = (
	items: ItemVariation[],
	optimizeStats: Stat[],
	uncrushabilitySetting: number,
	uncritabilitySetting: number,
	areEnchantsGemsLocked: boolean,
) => {
	const enchants = getEnchants(
		optimizeStats,
		uncrushabilitySetting,
		uncritabilitySetting,
	);
	const gems = getGems(
		optimizeStats,
		uncrushabilitySetting,
		uncritabilitySetting,
	);

	const itemVariations: ItemVariation[] = [];
	for (const item of items) {
		// "locking" enchants and gems means that if an item already has an enchant or any gems
		// we will not create any new variations
		if (areEnchantsGemsLocked && (item.gems.length > 0 || item.enchant)) {
			itemVariations.push(item);
			continue;
		}
		let index = 0;
		let itemEnchants = getEnchantsForItem(item, enchants);
		// TODO deal with meta gems
		let socketLength = item.sockets.length;
		if (item.sockets.find((socket) => socket.color === "Meta")) {
			socketLength -= 1;
		}
		let itemGemCombinations = createGemCombinations(gems, socketLength);

		if (itemEnchants.length === 0) {
			itemEnchants = [
				{
					id: "",
					name: "",
					stats: [],
					effectID: "",
					type: "Trinket",
				},
			];
		}

		if (itemGemCombinations.length === 0) {
			itemGemCombinations = [
				[
					{
						id: "",
						name: "",
						stats: [],
						color: "Meta",
						phase: "1",
					},
				],
			];
		}
		for (const enchant of itemEnchants) {
			for (const gemCombination of itemGemCombinations) {
				itemVariations.push({
					...item,
					enchant: enchant,
					gems: gemCombination,
					uniqueId: `${item.id}-${index}`,
				});
				index++;
			}
		}
	}
	return itemVariations;
};

const transformItem = (
	item: ItemVariation,
	optimizeStats: Stat[],
	uncrushabilitySetting: number,
	uncritabilitySetting: number,
): LPItem => {
	let avoidanceScore = 0;
	let objectiveScore = 0;
	let uncritabilityScore = 0;

	for (const stat of item.stats) {
		avoidanceScore += calculateAvoidance(stat, uncrushabilitySetting);
		objectiveScore += calculateObjectiveScore(stat, optimizeStats);
		uncritabilityScore += calculateUncritability(stat, uncritabilitySetting);
	}

	if (item.enchant.stats.length > 0) {
		for (const stat of item.enchant.stats) {
			avoidanceScore += calculateAvoidance(stat, uncrushabilitySetting);
			objectiveScore += calculateObjectiveScore(stat, optimizeStats);
			uncritabilityScore += calculateUncritability(stat, uncritabilitySetting);
		}
	}

	for (const gem of item.gems) {
		for (const stat of gem.stats) {
			avoidanceScore += calculateAvoidance(stat, uncrushabilitySetting);
			objectiveScore += calculateObjectiveScore(stat, optimizeStats);
			uncritabilityScore += calculateUncritability(stat, uncritabilitySetting);
		}
	}

	// TODO: socket bonus
	const nonMetaSockets = item.sockets
		.map((s) => s.color)
		.filter((s) => s !== "Meta");
	const nonMetaGems = item.gems.map((g) => g.color).filter((g) => g !== "Meta");
	if (gemsSatisfySocketBonus(nonMetaSockets, nonMetaGems)) {
		for (const stat of item.socketBonus) {
			avoidanceScore += calculateAvoidance(stat, uncrushabilitySetting);
			objectiveScore += calculateObjectiveScore(stat, optimizeStats);
			uncritabilityScore += calculateUncritability(stat, uncritabilitySetting);
		}
	}

	let processedType: ProcessedItemType = item.type;
	if (item.type === "Weapon") {
		if (item.weaponType === "Shield") {
			processedType = "Shield";
		}
	}

	return {
		...item,
		type: processedType,
		avoidanceScore,
		objectiveScore,
		uncritabilityScore,
	};
};
