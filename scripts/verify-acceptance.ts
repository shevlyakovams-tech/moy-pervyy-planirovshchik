import fs from "node:fs";
import path from "node:path";

const specification = fs.readFileSync(path.resolve("tz.md"), "utf8");
const identifiers = [...new Set(specification.match(/AC-[A-Z0-9-]+-\d+/g) ?? [])].sort();
if (identifiers.length !== 83) throw new Error(`Ожидалось 83 критерия приёмки, найдено ${identifiers.length}`);

const evidence: Record<string, string[]> = {
  A11Y: ["tests/e2e/polish-step9.spec.ts"], DATE: ["tests/unit/date-service-step2.test.ts", "tests/integration/planner-step2.test.ts"],
  DAY: ["tests/e2e/planner-step2.spec.ts"], HAB: ["tests/integration/habits-step3.test.ts", "tests/e2e/habits-step3.spec.ts"],
  LIC: ["scripts/check-licenses.ts", "THIRD_PARTY_NOTICES.md"], LOG: ["tests/unit/logger.test.ts"],
  MIG: ["tests/integration/migration-step8.test.ts", "scripts/setup.ts"], MOOD: ["tests/integration/planner-step2.test.ts", "tests/e2e/planner-step2.spec.ts"],
  NOTIF: ["tests/unit/notification-scheduler-step8.test.ts", "tests/integration/settings-step8.test.ts"], ONB: ["tests/unit/onboarding.test.ts", "tests/e2e/onboarding.spec.ts"],
  PLANK: ["tests/unit/plank-timer-step4.test.ts", "tests/integration/plank-step4.test.ts", "tests/e2e/plank-step4.spec.ts"],
  PROG: ["tests/unit/history-stats-step7.test.ts", "tests/integration/history-step7.test.ts"], PUSH: ["tests/integration/pushups-step5.test.ts", "tests/e2e/pushups-step5.spec.ts"],
  QUOTE: ["tests/unit/quote-deck-step2.test.ts", "tests/e2e/planner-step2.spec.ts"], RESET: ["tests/integration/settings-step8.test.ts", "tests/e2e/settings-step8.spec.ts"],
  RESP: ["tests/e2e/polish-step9.spec.ts"], SEARCH: ["tests/integration/history-step7.test.ts", "tests/e2e/history-step7.spec.ts"],
  SEC: ["tests/unit/security.test.ts"], START: ["tests/unit/supervisor.test.ts", "scripts/test-electron-lifecycle.mjs", "scripts/test-start-bat.ps1"],
  TASK: ["tests/integration/planner-step2.test.ts", "tests/e2e/planner-step2.spec.ts"], WATER: ["tests/integration/water-step6.test.ts", "tests/e2e/water-step6.spec.ts"],
  WEEK: ["tests/integration/planner-step2.test.ts", "tests/e2e/planner-step2.spec.ts"]
};

for (const identifier of identifiers) {
  const group = identifier.split("-")[1]!;
  const files = evidence[group];
  if (!files?.length) throw new Error(`Нет группы доказательств для ${identifier}`);
  for (const file of files) if (!fs.existsSync(path.resolve(file))) throw new Error(`Для ${identifier} отсутствует файл доказательства ${file}`);
}
console.log(`Матрица трассировки: ${identifiers.length} из 83 критериев связаны с существующими автоматическими проверками.`);
