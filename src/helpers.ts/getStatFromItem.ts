import { gemsSatisfySocketBonus } from "#/solver/socketBonus";
import type { LPItem, Stat, StatName } from "#/solver/types";

export function getStatFromItem(item: LPItem, stat: StatName): number {
	const itemStats = item.stats.find((s) => s.name === stat);
	const enchantStats = item.enchant?.stats.find((s) => s.name === stat);
	const allGemStats = item.gems.flatMap((g) => g.stats);
	const gemStatsValue = allGemStats
		.filter((s) => s.name === stat)
		.reduce((sum, s) => sum + s.value, 0);
	const hasSocketBonus = gemsSatisfySocketBonus(
		item.sockets.map((s) => s.color).filter((s) => s !== "Meta"),
		item.gems.map((g) => g.color).filter((g) => g !== "Meta"),
	);

	let statValue = 0;
	if (itemStats) {
		statValue += itemStats.value;
	}
	if (enchantStats) {
		statValue += enchantStats.value;
	}
	statValue += gemStatsValue;
	const socketStat = hasSocketBonus ? item.socketBonus.find((s) => s.name === stat)?.value || 0 : 0;
	statValue += socketStat;
	
	return statValue;
}

export function getStatFromAllItems(items: LPItem[], stat: StatName) {
	return items.reduce((acc, item) => acc + getStatFromItem(item, stat), 0);
}

export function getAvoidanceFromItems(items: LPItem[]) {
	const statNames: StatName[] = [
		"Agility",
		"Defense",
		"Dodge",
		"Parry",
		"Block",
	];
	const stats: Stat[] = statNames.map((stat) => {
		return {
			name: stat,
			value: items.reduce((acc, item) => acc + getStatFromItem(item, stat), 0),
		};
	});
	const avoidance = stats.reduce(
		(acc, stat) => acc + calculateAvoidance(stat),
		0,
	);
	return avoidance;
}

// the difference between this and the one in ScoreCalculator
// is that this rounds the defense rating down - which is actualy behavior, but can't be used for LP calculations because it is more inaccurate
function calculateAvoidance(stat: Stat): number {
	switch (stat.name) {
		case "Agility":
			return stat.value / 25;
		case "Defense":
			return Math.floor(stat.value / 2.3654) * 0.04 * 4;
		case "Dodge":
			return stat.value / 18.9231;
		case "Parry":
			return stat.value / 23.6538;
		case "Block":
			return stat.value / 7.8846;
		default:
			return 0;
	}
}
