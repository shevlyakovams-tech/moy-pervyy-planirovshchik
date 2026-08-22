CREATE UNIQUE INDEX "NotificationOccurrence_notificationRuleId_scheduledFor_kind_key"
ON "NotificationOccurrence"("notificationRuleId", "scheduledFor", "kind");
