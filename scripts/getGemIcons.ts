import fs from "node:fs";
import { XMLParser } from "fast-xml-parser";
// Fetches gem icons from wowhead, then writes them to data directory.
//
// Reads gem ids from the vendored database, since src/data/gems.json was deleted in favour of
// it. NOTE: db.json carries an `icon` for every gem already, so the only reason to run this is
// if wowhead's icon names are wanted specifically - see src/data/gem-tooltips.json.
const db = JSON.parse(
    fs.readFileSync("./vendor/tbc-sim/assets/database/db.json", "utf8"),
) as { gems: { id: number }[] };

const gemIds = db.gems.map((gem) => String(gem.id));

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