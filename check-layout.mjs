import { chromium } from "playwright";

const ITEMS = `{"items":[{"id":7005,"gems":[]},{"id":30641,"gems":[]},{"id":30678,"gems":[],"random_suffix":-26},{"id":28505,"gems":[]},{"id":28511,"gems":[]},{"id":25344,"gems":[]},{"id":28516,"gems":[]},{"enchant":2622,"gems":[],"id":27804},{"id":28245,"gems":[31867]},{"id":29126,"gems":[]},{"id":29172,"gems":[]},{"id":29370,"gems":[]},{"id":29132,"gems":[]},{"id":28518,"gems":[]},{"id":28621,"gems":[]},{"id":27529,"gems":[]},{"enchant":2650,"gems":[],"id":23538},{"id":28593,"gems":[]},{"id":28749,"gems":[]},{"enchant":2999,"gems":[24062,25896],"id":29068},{"enchant":2991,"gems":[30555,24062],"id":28743},{"enchant":2659,"gems":[24056,34831,31867],"id":29066},{"enchant":2650,"gems":[24062],"id":28502},{"enchant":2613,"gems":[],"id":29067},{"id":29253,"gems":[]},{"enchant":2748,"gems":[],"id":29069},{"enchant":2649,"gems":[],"id":29254},{"enchant":2669,"gems":[],"id":29153},{"enchant":1071,"gems":[],"id":28316},{"id":29388,"gems":[]},{"enchant":1071,"gems":[],"id":28611},{"id":27917,"gems":[]},{"id":29323,"gems":[]},{"id":29279,"gems":[]},{"id":28528,"gems":[]}],"version":"v3.2.1"}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
page.on("console", (m) => console.log("[console]", m.type(), m.text()));
page.on("pageerror", (e) => console.log("[pageerror]", e.message));

await page.goto("http://localhost:3001/", { waitUntil: "networkidle" });
await page.screenshot({ path: "screens/1-initial.png" });

const textarea = page.locator("textarea").first();
await textarea.click();
await textarea.fill(ITEMS);
await page.waitForTimeout(500);
await page.screenshot({ path: "screens/2-pasted.png" });

// Add a stat weight so solve isn't disabled
const addStat = page.getByText("+ Add stat").first();
if (await addStat.count()) {
	await addStat.click();
	await page.waitForTimeout(300);
	await page.keyboard.type("Defense");
	await page.waitForTimeout(300);
	await page.keyboard.press("Enter");
	await page.waitForTimeout(300);
}
await page.screenshot({ path: "screens/3-stat-added.png" });

const solveBtn = page.getByRole("button", { name: /solve/i }).first();
await solveBtn.click();
await page.waitForTimeout(4000);
await page.screenshot({ path: "screens/4-results.png", fullPage: true });

// scroll to check sticky rail behavior
await page.evaluate(() => window.scrollBy(0, 400));
await page.waitForTimeout(300);
await page.screenshot({ path: "screens/5-scrolled.png" });

await browser.close();
console.log("done");
