import fs from "node:fs";
import path from "node:path";
import { quotes, reflectionPrompts } from "../src/data/seed.ts";

const target = path.resolve("docs/data.js");
const payload = {
  quotes: quotes.map(({ id, category, author, workTitle, workYear, sourceUrl, translationRu, locator }) => ({ id, category, author, workTitle, workYear, sourceUrl, text: translationRu, locator })),
  fixedPrompts: reflectionPrompts.filter((item) => item.kind === "FIXED").map((item) => item.textRu),
  rotatingPrompts: reflectionPrompts.filter((item) => item.kind === "ROTATING").map((item) => item.textRu)
};
fs.writeFileSync(target, `window.PLANNER_SEED = ${JSON.stringify(payload, null, 2)};\n`, "utf8");
console.log(`GitHub Pages data generated: ${payload.quotes.length} quotes, ${payload.fixedPrompts.length + payload.rotatingPrompts.length} prompts.`);
