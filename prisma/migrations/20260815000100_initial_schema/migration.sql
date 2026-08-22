-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "onboardingCompletedAt" DATETIME,
    "weeklyPlanningWeekday" INTEGER NOT NULL DEFAULT 7,
    "pageTurnEnabled" BOOLEAN NOT NULL DEFAULT true,
    "plankGoalSoundEnabled" BOOLEAN NOT NULL DEFAULT true,
    "notificationsGloballyPaused" BOOLEAN NOT NULL DEFAULT false,
    "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT false,
    "quietStartMinutes" INTEGER,
    "quietEndMinutes" INTEGER,
    "autostartEnabled" BOOLEAN NOT NULL DEFAULT false,
    "waterQuickAmounts" TEXT NOT NULL DEFAULT '200,250,300',
    "version" INTEGER NOT NULL DEFAULT 1
);

-- CreateTable
CREATE TABLE "OnboardingState" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "currentStep" INTEGER NOT NULL DEFAULT 1,
    "serializedDraft" TEXT NOT NULL DEFAULT '{}',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DailyEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "localDate" TEXT NOT NULL,
    "gratitude" TEXT,
    "mood" TEXT,
    "moodNote" TEXT,
    "thought" TEXT,
    "intention" TEXT,
    "mainResult" TEXT,
    "selfAction" TEXT,
    "selfActionCompletedAt" DATETIME,
    "closeAction" TEXT,
    "closeActionCompletedAt" DATETIME,
    "rotatingPromptId" TEXT,
    "quoteId" TEXT,
    "quoteAssignedAt" DATETIME,
    "morningCompletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "DailyEntry_rotatingPromptId_fkey" FOREIGN KEY ("rotatingPromptId") REFERENCES "ReflectionPrompt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DailyEntry_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReflectionPrompt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "orderIndex" INTEGER,
    "textRu" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "seedVersion" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "DailyReflectionAnswer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dailyEntryId" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "promptTextSnapshot" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "DailyReflectionAnswer_dailyEntryId_fkey" FOREIGN KEY ("dailyEntryId") REFERENCES "DailyEntry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DailyReflectionAnswer_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "ReflectionPrompt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "localDate" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priorityRank" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "sortOrder" INTEGER NOT NULL,
    "sourceTaskId" TEXT,
    "chainRootTaskId" TEXT,
    "resolvedAt" DATETIME,
    "resolvedByNextMorning" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "Task_sourceTaskId_fkey" FOREIGN KEY ("sourceTaskId") REFERENCES "Task" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Task_chainRootTaskId_fkey" FOREIGN KEY ("chainRootTaskId") REFERENCES "Task" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WeeklyPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weekStart" TEXT NOT NULL,
    "goal" TEXT,
    "whyImportant" TEXT,
    "successCriterion" TEXT,
    "obstacle" TEXT,
    "fallbackPlan" TEXT,
    "selfAction" TEXT,
    "closeAction" TEXT,
    "outcome" TEXT NOT NULL DEFAULT 'UNRESOLVED',
    "outcomeResolvedAt" DATETIME,
    "sourceWeeklyPlanId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "WeeklyPlan_sourceWeeklyPlanId_fkey" FOREIGN KEY ("sourceWeeklyPlanId") REFERENCES "WeeklyPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WeeklyStep" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weeklyPlanId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "text" TEXT,
    "assignedDate" TEXT,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "WeeklyStep_weeklyPlanId_fkey" FOREIGN KEY ("weeklyPlanId") REFERENCES "WeeklyPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WeeklyHabitFocus" (
    "weeklyPlanId" TEXT NOT NULL,
    "habitId" TEXT NOT NULL,
    "habitNameSnapshot" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("weeklyPlanId", "habitId"),
    CONSTRAINT "WeeklyHabitFocus_weeklyPlanId_fkey" FOREIGN KEY ("weeklyPlanId") REFERENCES "WeeklyPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WeeklyHabitFocus_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "translationRu" TEXT NOT NULL,
    "sourceExcerpt" TEXT NOT NULL,
    "sourceLanguage" TEXT NOT NULL DEFAULT 'en',
    "workTitle" TEXT NOT NULL,
    "workYear" INTEGER NOT NULL,
    "yearKind" TEXT NOT NULL,
    "locator" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "builtIn" BOOLEAN NOT NULL DEFAULT true,
    "seedVersion" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "QuoteUserState" (
    "quoteId" TEXT NOT NULL PRIMARY KEY,
    "favoriteAt" DATETIME,
    "hiddenAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QuoteUserState_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuoteDisplay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "quoteId" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "displayedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cycleNumber" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "replacedByDisplayId" TEXT,
    CONSTRAINT "QuoteDisplay_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QuoteDisplay_replacedByDisplayId_fkey" FOREIGN KEY ("replacedByDisplayId") REFERENCES "QuoteDisplay" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Habit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "builtInKey" TEXT,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "startDate" TEXT NOT NULL,
    "statusChangedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1
);

-- CreateTable
CREATE TABLE "HabitRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "habitId" TEXT NOT NULL,
    "effectiveFromDate" TEXT NOT NULL,
    "effectiveToDate" TEXT,
    "scheduleMask" INTEGER NOT NULL,
    "goalValue" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "HabitRevision_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HabitExclusionInterval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "habitId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    CONSTRAINT "HabitExclusionInterval_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SimpleHabitLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "habitId" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "checkedAt" DATETIME NOT NULL,
    "isExtra" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "SimpleHabitLog_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlankSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "habitId" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "stoppedAt" DATETIME NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "isExtra" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "PlankSession_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PushupSet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "habitId" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "recordedAt" DATETIME NOT NULL,
    "repetitions" INTEGER NOT NULL,
    "setOrder" INTEGER NOT NULL,
    "isExtra" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "PushupSet_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WaterEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "habitId" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "recordedAt" DATETIME NOT NULL,
    "milliliters" INTEGER NOT NULL,
    "entryOrder" INTEGER NOT NULL,
    "isExtra" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "WaterEntry_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NotificationRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "habitId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "weekdaysMask" INTEGER,
    "timeMinutes" INTEGER,
    "repeatAfter15" BOOLEAN NOT NULL DEFAULT false,
    "intervalMinutes" INTEGER,
    "windowStartMinutes" INTEGER,
    "windowEndMinutes" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "NotificationRule_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NotificationOccurrence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "notificationRuleId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "scheduledFor" DATETIME NOT NULL,
    "deliveredAt" DATETIME,
    "action" TEXT NOT NULL DEFAULT 'NONE',
    "suppressedReason" TEXT NOT NULL DEFAULT 'NONE',
    "snoozeOfOccurrenceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationOccurrence_notificationRuleId_fkey" FOREIGN KEY ("notificationRuleId") REFERENCES "NotificationRule" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NotificationOccurrence_snoozeOfOccurrenceId_fkey" FOREIGN KEY ("snoozeOfOccurrenceId") REFERENCES "NotificationOccurrence" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SearchDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "taskCategory" TEXT,
    "originalText" TEXT NOT NULL,
    "normalizedText" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AppMetadata" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "appVersion" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "seedVersion" INTEGER NOT NULL,
    "maxObservedBusinessDate" TEXT NOT NULL,
    "installedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyEntry_localDate_key" ON "DailyEntry"("localDate");

-- CreateIndex
CREATE INDEX "DailyEntry_localDate_idx" ON "DailyEntry"("localDate");

-- CreateIndex
CREATE INDEX "DailyReflectionAnswer_dailyEntryId_orderIndex_idx" ON "DailyReflectionAnswer"("dailyEntryId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "DailyReflectionAnswer_dailyEntryId_promptId_key" ON "DailyReflectionAnswer"("dailyEntryId", "promptId");

-- CreateIndex
CREATE INDEX "Task_localDate_sortOrder_idx" ON "Task"("localDate", "sortOrder");

-- CreateIndex
CREATE INDEX "Task_localDate_status_idx" ON "Task"("localDate", "status");

-- CreateIndex
CREATE INDEX "Task_sourceTaskId_idx" ON "Task"("sourceTaskId");

-- CreateIndex
CREATE INDEX "Task_chainRootTaskId_idx" ON "Task"("chainRootTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyPlan_weekStart_key" ON "WeeklyPlan"("weekStart");

-- CreateIndex
CREATE INDEX "WeeklyPlan_sourceWeeklyPlanId_idx" ON "WeeklyPlan"("sourceWeeklyPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyStep_weeklyPlanId_orderIndex_key" ON "WeeklyStep"("weeklyPlanId", "orderIndex");

-- CreateIndex
CREATE INDEX "WeeklyHabitFocus_habitId_idx" ON "WeeklyHabitFocus"("habitId");

-- CreateIndex
CREATE INDEX "QuoteDisplay_cycleNumber_displayedAt_idx" ON "QuoteDisplay"("cycleNumber", "displayedAt");

-- CreateIndex
CREATE INDEX "QuoteDisplay_localDate_idx" ON "QuoteDisplay"("localDate");

-- CreateIndex
CREATE UNIQUE INDEX "Habit_builtInKey_key" ON "Habit"("builtInKey");

-- CreateIndex
CREATE INDEX "Habit_normalizedName_status_idx" ON "Habit"("normalizedName", "status");

-- CreateIndex
CREATE INDEX "HabitRevision_habitId_effectiveFromDate_effectiveToDate_idx" ON "HabitRevision"("habitId", "effectiveFromDate", "effectiveToDate");

-- CreateIndex
CREATE INDEX "HabitExclusionInterval_habitId_kind_startDate_idx" ON "HabitExclusionInterval"("habitId", "kind", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "SimpleHabitLog_habitId_localDate_key" ON "SimpleHabitLog"("habitId", "localDate");

-- CreateIndex
CREATE INDEX "PlankSession_habitId_localDate_idx" ON "PlankSession"("habitId", "localDate");

-- CreateIndex
CREATE INDEX "PushupSet_habitId_localDate_setOrder_idx" ON "PushupSet"("habitId", "localDate", "setOrder");

-- CreateIndex
CREATE INDEX "WaterEntry_habitId_localDate_entryOrder_idx" ON "WaterEntry"("habitId", "localDate", "entryOrder");

-- CreateIndex
CREATE INDEX "NotificationRule_habitId_kind_idx" ON "NotificationRule"("habitId", "kind");

-- CreateIndex
CREATE INDEX "NotificationOccurrence_notificationRuleId_scheduledFor_idx" ON "NotificationOccurrence"("notificationRuleId", "scheduledFor");

-- CreateIndex
CREATE INDEX "NotificationOccurrence_snoozeOfOccurrenceId_idx" ON "NotificationOccurrence"("snoozeOfOccurrenceId");

-- CreateIndex
CREATE INDEX "SearchDocument_localDate_idx" ON "SearchDocument"("localDate");

-- CreateIndex
CREATE INDEX "SearchDocument_sourceType_idx" ON "SearchDocument"("sourceType");

-- CreateIndex
CREATE INDEX "SearchDocument_taskCategory_idx" ON "SearchDocument"("taskCategory");

-- CreateIndex
CREATE UNIQUE INDEX "SearchDocument_sourceType_sourceId_key" ON "SearchDocument"("sourceType", "sourceId");

-- Constraints that Prisma cannot express for SQLite.
CREATE UNIQUE INDEX "Task_localDate_priorityRank_unique"
  ON "Task"("localDate", "priorityRank") WHERE "priorityRank" IS NOT NULL;
CREATE UNIQUE INDEX "NotificationRule_singleton_kind_unique"
  ON "NotificationRule"("kind") WHERE "kind" IN ('MORNING', 'WEEKLY');
CREATE UNIQUE INDEX "NotificationRule_habit_kind_unique"
  ON "NotificationRule"("habitId", "kind") WHERE "habitId" IS NOT NULL;
CREATE UNIQUE INDEX "Habit_open_exclusion_unique"
  ON "HabitExclusionInterval"("habitId", "kind") WHERE "endDate" IS NULL;
CREATE UNIQUE INDEX "Habit_normalizedName_nonarchive_unique"
  ON "Habit"("normalizedName") WHERE "status" <> 'ARCHIVED';

CREATE TRIGGER "validate_AppSettings_insert" BEFORE INSERT ON "AppSettings"
WHEN NEW."id" <> 'singleton' OR NEW."weeklyPlanningWeekday" NOT BETWEEN 1 AND 7
  OR (NEW."quietStartMinutes" IS NOT NULL AND NEW."quietStartMinutes" NOT BETWEEN 0 AND 1439)
  OR (NEW."quietEndMinutes" IS NOT NULL AND NEW."quietEndMinutes" NOT BETWEEN 0 AND 1439)
BEGIN SELECT RAISE(ABORT, 'invalid AppSettings'); END;

CREATE TRIGGER "validate_Task_insert" BEFORE INSERT ON "Task"
WHEN length(NEW."title") NOT BETWEEN 1 AND 240 OR NEW."sortOrder" < 0
  OR NEW."category" NOT IN ('WORK','CLOSE_PEOPLE','FAMILY','HOBBY','LEARNING')
  OR NEW."status" NOT IN ('PLANNED','COMPLETED','TRANSFERRED','LET_GO')
  OR (NEW."priorityRank" IS NOT NULL AND NEW."priorityRank" NOT BETWEEN 1 AND 3)
BEGIN SELECT RAISE(ABORT, 'invalid Task'); END;

CREATE TRIGGER "validate_HabitRevision_insert" BEFORE INSERT ON "HabitRevision"
WHEN NEW."scheduleMask" NOT BETWEEN 1 AND 127 OR NEW."goalValue" < 1
  OR NEW."unit" NOT IN ('CHECK','SECOND','REPETITION','MILLILITER')
  OR (NEW."effectiveToDate" IS NOT NULL AND NEW."effectiveToDate" < NEW."effectiveFromDate")
BEGIN SELECT RAISE(ABORT, 'invalid HabitRevision'); END;

CREATE TRIGGER "validate_PlankSession_insert" BEFORE INSERT ON "PlankSession"
WHEN NEW."durationSeconds" NOT BETWEEN 1 AND 599
BEGIN SELECT RAISE(ABORT, 'invalid PlankSession'); END;

CREATE TRIGGER "validate_PushupSet_insert" BEFORE INSERT ON "PushupSet"
WHEN NEW."repetitions" NOT BETWEEN 1 AND 10000
BEGIN SELECT RAISE(ABORT, 'invalid PushupSet'); END;

CREATE TRIGGER "validate_WaterEntry_insert" BEFORE INSERT ON "WaterEntry"
WHEN NEW."milliliters" NOT BETWEEN 1 AND 10000
BEGIN SELECT RAISE(ABORT, 'invalid WaterEntry'); END;

CREATE TRIGGER "validate_WeeklyStep_insert" BEFORE INSERT ON "WeeklyStep"
WHEN NEW."orderIndex" NOT BETWEEN 1 AND 3 OR length(COALESCE(NEW."text",'')) > 500
BEGIN SELECT RAISE(ABORT, 'invalid WeeklyStep'); END;

CREATE TRIGGER "validate_NotificationRule_insert" BEFORE INSERT ON "NotificationRule"
WHEN NEW."kind" NOT IN ('MORNING','WEEKLY','HABIT','WATER_INTERVAL')
  OR (NEW."timeMinutes" IS NOT NULL AND NEW."timeMinutes" NOT BETWEEN 0 AND 1439)
  OR (NEW."intervalMinutes" IS NOT NULL AND NEW."intervalMinutes" NOT IN (60,90,120))
  OR (NEW."windowStartMinutes" IS NOT NULL AND NEW."windowStartMinutes" NOT BETWEEN 0 AND 1439)
  OR (NEW."windowEndMinutes" IS NOT NULL AND NEW."windowEndMinutes" NOT BETWEEN 0 AND 1439)
BEGIN SELECT RAISE(ABORT, 'invalid NotificationRule'); END;

CREATE TRIGGER "validate_AppSettings_update" BEFORE UPDATE ON "AppSettings"
WHEN NEW."id" <> 'singleton' OR NEW."weeklyPlanningWeekday" NOT BETWEEN 1 AND 7
  OR (NEW."quietStartMinutes" IS NOT NULL AND NEW."quietStartMinutes" NOT BETWEEN 0 AND 1439)
  OR (NEW."quietEndMinutes" IS NOT NULL AND NEW."quietEndMinutes" NOT BETWEEN 0 AND 1439)
BEGIN SELECT RAISE(ABORT, 'invalid AppSettings'); END;

CREATE TRIGGER "validate_DailyEntry_insert" BEFORE INSERT ON "DailyEntry"
WHEN NEW."localDate" NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  OR (NEW."mood" IS NOT NULL AND NEW."mood" NOT IN ('HARD','BELOW_USUAL','EVEN','GOOD','EXCELLENT'))
  OR length(COALESCE(NEW."gratitude",'')) > 2000 OR length(COALESCE(NEW."moodNote",'')) > 500
  OR length(COALESCE(NEW."thought",'')) > 2000 OR length(COALESCE(NEW."intention",'')) > 2000
  OR length(COALESCE(NEW."mainResult",'')) > 500 OR length(COALESCE(NEW."selfAction",'')) > 500 OR length(COALESCE(NEW."closeAction",'')) > 500
BEGIN SELECT RAISE(ABORT, 'invalid DailyEntry'); END;

CREATE TRIGGER "validate_DailyEntry_update" BEFORE UPDATE ON "DailyEntry"
WHEN NEW."localDate" NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  OR (NEW."mood" IS NOT NULL AND NEW."mood" NOT IN ('HARD','BELOW_USUAL','EVEN','GOOD','EXCELLENT'))
  OR length(COALESCE(NEW."gratitude",'')) > 2000 OR length(COALESCE(NEW."moodNote",'')) > 500
  OR length(COALESCE(NEW."thought",'')) > 2000 OR length(COALESCE(NEW."intention",'')) > 2000
  OR length(COALESCE(NEW."mainResult",'')) > 500 OR length(COALESCE(NEW."selfAction",'')) > 500 OR length(COALESCE(NEW."closeAction",'')) > 500
BEGIN SELECT RAISE(ABORT, 'invalid DailyEntry'); END;

CREATE TRIGGER "validate_Task_update" BEFORE UPDATE ON "Task"
WHEN length(NEW."title") NOT BETWEEN 1 AND 240 OR NEW."sortOrder" < 0
  OR NEW."category" NOT IN ('WORK','CLOSE_PEOPLE','FAMILY','HOBBY','LEARNING')
  OR NEW."status" NOT IN ('PLANNED','COMPLETED','TRANSFERRED','LET_GO')
  OR (NEW."priorityRank" IS NOT NULL AND NEW."priorityRank" NOT BETWEEN 1 AND 3)
BEGIN SELECT RAISE(ABORT, 'invalid Task'); END;

CREATE TRIGGER "validate_WeeklyPlan_insert" BEFORE INSERT ON "WeeklyPlan"
WHEN NEW."weekStart" NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  OR NEW."outcome" NOT IN ('UNRESOLVED','ACHIEVED','TRANSFERRED','NOT_RELEVANT')
  OR length(COALESCE(NEW."goal",'')) > 500 OR length(COALESCE(NEW."whyImportant",'')) > 2000
  OR length(COALESCE(NEW."successCriterion",'')) > 2000 OR length(COALESCE(NEW."obstacle",'')) > 2000
  OR length(COALESCE(NEW."fallbackPlan",'')) > 2000 OR length(COALESCE(NEW."selfAction",'')) > 500 OR length(COALESCE(NEW."closeAction",'')) > 500
BEGIN SELECT RAISE(ABORT, 'invalid WeeklyPlan'); END;

CREATE TRIGGER "validate_WeeklyPlan_update" BEFORE UPDATE ON "WeeklyPlan"
WHEN NEW."weekStart" NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  OR NEW."outcome" NOT IN ('UNRESOLVED','ACHIEVED','TRANSFERRED','NOT_RELEVANT')
  OR length(COALESCE(NEW."goal",'')) > 500 OR length(COALESCE(NEW."whyImportant",'')) > 2000
  OR length(COALESCE(NEW."successCriterion",'')) > 2000 OR length(COALESCE(NEW."obstacle",'')) > 2000
  OR length(COALESCE(NEW."fallbackPlan",'')) > 2000 OR length(COALESCE(NEW."selfAction",'')) > 500 OR length(COALESCE(NEW."closeAction",'')) > 500
BEGIN SELECT RAISE(ABORT, 'invalid WeeklyPlan'); END;

CREATE TRIGGER "validate_WeeklyStep_update" BEFORE UPDATE ON "WeeklyStep"
WHEN NEW."orderIndex" NOT BETWEEN 1 AND 3 OR length(COALESCE(NEW."text",'')) > 500
BEGIN SELECT RAISE(ABORT, 'invalid WeeklyStep'); END;

CREATE TRIGGER "validate_Habit_insert" BEFORE INSERT ON "Habit"
WHEN NEW."type" NOT IN ('SIMPLE','PLANK','PUSHUPS','WATER') OR NEW."status" NOT IN ('DRAFT','ACTIVE','PAUSED','ARCHIVED')
  OR length(NEW."name") NOT BETWEEN 1 AND 80 OR length(NEW."normalizedName") NOT BETWEEN 1 AND 80
BEGIN SELECT RAISE(ABORT, 'invalid Habit'); END;

CREATE TRIGGER "validate_Habit_update" BEFORE UPDATE ON "Habit"
WHEN NEW."type" NOT IN ('SIMPLE','PLANK','PUSHUPS','WATER') OR NEW."status" NOT IN ('DRAFT','ACTIVE','PAUSED','ARCHIVED')
  OR length(NEW."name") NOT BETWEEN 1 AND 80 OR length(NEW."normalizedName") NOT BETWEEN 1 AND 80
BEGIN SELECT RAISE(ABORT, 'invalid Habit'); END;

CREATE TRIGGER "validate_HabitRevision_overlap_insert" BEFORE INSERT ON "HabitRevision"
WHEN EXISTS (
  SELECT 1 FROM "HabitRevision" existing WHERE existing."habitId" = NEW."habitId"
  AND COALESCE(existing."effectiveToDate", '9999-12-31') >= NEW."effectiveFromDate"
  AND COALESCE(NEW."effectiveToDate", '9999-12-31') >= existing."effectiveFromDate"
)
BEGIN SELECT RAISE(ABORT, 'overlapping HabitRevision'); END;

CREATE TRIGGER "validate_HabitRevision_update" BEFORE UPDATE ON "HabitRevision"
WHEN NEW."scheduleMask" NOT BETWEEN 1 AND 127 OR NEW."goalValue" < 1
  OR NEW."unit" NOT IN ('CHECK','SECOND','REPETITION','MILLILITER')
  OR (NEW."effectiveToDate" IS NOT NULL AND NEW."effectiveToDate" < NEW."effectiveFromDate")
  OR EXISTS (
    SELECT 1 FROM "HabitRevision" existing WHERE existing."habitId" = NEW."habitId" AND existing."id" <> NEW."id"
    AND COALESCE(existing."effectiveToDate", '9999-12-31') >= NEW."effectiveFromDate"
    AND COALESCE(NEW."effectiveToDate", '9999-12-31') >= existing."effectiveFromDate"
  )
BEGIN SELECT RAISE(ABORT, 'invalid HabitRevision'); END;

CREATE TRIGGER "validate_HabitExclusion_insert" BEFORE INSERT ON "HabitExclusionInterval"
WHEN NEW."kind" NOT IN ('PAUSE','ARCHIVE') OR (NEW."endDate" IS NOT NULL AND NEW."endDate" < NEW."startDate")
  OR EXISTS (
    SELECT 1 FROM "HabitExclusionInterval" existing WHERE existing."habitId" = NEW."habitId" AND existing."kind" = NEW."kind"
    AND COALESCE(existing."endDate", '9999-12-31') >= NEW."startDate"
    AND COALESCE(NEW."endDate", '9999-12-31') >= existing."startDate"
  )
BEGIN SELECT RAISE(ABORT, 'invalid HabitExclusionInterval'); END;

CREATE TRIGGER "validate_PlankSession_update" BEFORE UPDATE ON "PlankSession"
WHEN NEW."durationSeconds" NOT BETWEEN 1 AND 599
BEGIN SELECT RAISE(ABORT, 'invalid PlankSession'); END;

CREATE TRIGGER "validate_PushupSet_update" BEFORE UPDATE ON "PushupSet"
WHEN NEW."repetitions" NOT BETWEEN 1 AND 10000
BEGIN SELECT RAISE(ABORT, 'invalid PushupSet'); END;

CREATE TRIGGER "validate_WaterEntry_update" BEFORE UPDATE ON "WaterEntry"
WHEN NEW."milliliters" NOT BETWEEN 1 AND 10000
BEGIN SELECT RAISE(ABORT, 'invalid WaterEntry'); END;

CREATE TRIGGER "validate_NotificationRule_update" BEFORE UPDATE ON "NotificationRule"
WHEN NEW."kind" NOT IN ('MORNING','WEEKLY','HABIT','WATER_INTERVAL')
  OR (NEW."timeMinutes" IS NOT NULL AND NEW."timeMinutes" NOT BETWEEN 0 AND 1439)
  OR (NEW."intervalMinutes" IS NOT NULL AND NEW."intervalMinutes" NOT IN (60,90,120))
  OR (NEW."windowStartMinutes" IS NOT NULL AND NEW."windowStartMinutes" NOT BETWEEN 0 AND 1439)
  OR (NEW."windowEndMinutes" IS NOT NULL AND NEW."windowEndMinutes" NOT BETWEEN 0 AND 1439)
BEGIN SELECT RAISE(ABORT, 'invalid NotificationRule'); END;

CREATE TRIGGER "validate_NotificationOccurrence_insert" BEFORE INSERT ON "NotificationOccurrence"
WHEN NEW."kind" NOT IN ('MORNING','WEEKLY','HABIT','WATER_INTERVAL')
  OR NEW."action" NOT IN ('NONE','OPEN','SNOOZE','CLOSE')
  OR NEW."suppressedReason" NOT IN ('NONE','GOAL_ALREADY_REACHED','MORNING_ALREADY_COMPLETED','GLOBAL_PAUSE','QUIET_HOURS','PROCESS_WAS_OFF','RULE_DISABLED','HABIT_NOT_SCHEDULED','HABIT_PAUSED_OR_ARCHIVED')
BEGIN SELECT RAISE(ABORT, 'invalid NotificationOccurrence'); END;

CREATE TRIGGER "validate_SearchDocument_insert" BEFORE INSERT ON "SearchDocument"
WHEN NEW."sourceType" NOT IN ('TASK','GRATITUDE','THOUGHT','INTENTION','REFLECTION','WEEKLY_GOAL','QUOTE')
BEGIN SELECT RAISE(ABORT, 'invalid SearchDocument'); END;
