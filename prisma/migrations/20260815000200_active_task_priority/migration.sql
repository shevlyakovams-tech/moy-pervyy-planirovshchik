-- Terminal tasks keep their historical rank, while only active tasks occupy today's 1-3 slots.
DROP INDEX IF EXISTS "Task_localDate_priorityRank_unique";
CREATE UNIQUE INDEX "Task_localDate_priorityRank_unique"
  ON "Task"("localDate", "priorityRank")
  WHERE "priorityRank" IS NOT NULL AND "status" IN ('PLANNED', 'COMPLETED');
