import fs from "node:fs";
import { quotes, reflectionPrompts } from "../src/data/seed";

const specification = fs.readFileSync("tz.md", "utf8");
const rows = specification.split(/\r?\n/).filter((line) => /^\| Q-[HMP]\d{2} \|/.test(line));
if (rows.length !== 60) throw new Error(`Expected 60 quote rows in tz.md, found ${rows.length}`);

for (const row of rows) {
  const cells = row.split("|").slice(1, -1).map((cell) => cell.trim());
  const [id, author, translationRu, sourceExcerpt, sourceAndLocator] = cells;
  const actual = quotes.find((quote) => quote.id === id);
  if (!actual || !sourceAndLocator) throw new Error(`Missing quote ${id}`);
  const separator = sourceAndLocator.indexOf(", ");
  const locator = separator >= 0 ? sourceAndLocator.slice(separator + 2) : "";
  if (actual.author !== author || actual.translationRu !== translationRu || actual.sourceExcerpt !== sourceExcerpt || actual.locator !== locator) {
    throw new Error(`Quote differs from tz.md: ${id}`);
  }
}

const expectedFixed = [
  "Что вчера получилось или порадовало меня?",
  "Что осталось незавершённым и по-прежнему действительно важно?",
  "Что я могу сегодня сделать немного проще или лучше?"
];
const expectedRotating = [
  "Что вчера дало мне энергию?", "Что забрало у меня больше всего сил?", "Удалось ли мне уделить время себе?",
  "Как я проявил внимание к близкому человеку?", "За что я могу поблагодарить себя?", "Какой момент вчерашнего дня я хочу запомнить?",
  "Что я понял о себе?", "От какой необязательной задачи я могу отказаться?", "Где я взял на себя больше, чем мог выполнить?",
  "Какой небольшой выбор приблизил меня к цели недели?"
];
const actualFixed = reflectionPrompts.filter((item) => item.kind === "FIXED").map((item) => item.textRu);
const actualRotating = reflectionPrompts.filter((item) => item.kind === "ROTATING").map((item) => item.textRu);
if (JSON.stringify(actualFixed) !== JSON.stringify(expectedFixed) || JSON.stringify(actualRotating) !== JSON.stringify(expectedRotating)) {
  throw new Error("Reflection prompts differ from tz.md");
}

console.log("All 60 quotes and 13 prompts match the normative text in tz.md.");
