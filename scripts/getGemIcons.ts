import fs from "node:fs";
import Gems from "../src/data/gems.json" with { type: "json" };;
import { XMLParser } from "fast-xml-parser";
// Fetches gem icons from wowhead, then writes them to data directory

const gemIds = Gems.map((gem) => gem.id);

const fetchGemIcon = async (id: string) => {
    const resp = await fetch(`https://www.wowhead.com/tbc/item=${id}&xml`)
    const xmlText = await resp.text();

    const parser = new XMLParser();
    const xml =  parser.parse(xmlText);
    const iconName = xml.wowhead.item.icon;
    return iconName;
}

const main = async () => {
    let gemIcons = [];
    for (const id of gemIds) {
        const iconName = await fetchGemIcon(id);
        gemIcons.push({ id, iconName });
        await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    const gemIconsJson = JSON.stringify(gemIcons);
    fs.writeFileSync("./src/data/gemIcons.json", gemIconsJson);
}

main();