import { describe,expect,it } from "vitest";import { summarizeHabitCalendar } from "@/lib/history-service";
describe("history statistics step 7",()=>{
it("skips rest, pause, extra and unfinished today in percentages and streaks",()=>{expect(summarizeHabitCalendar([{date:"1",state:"COMPLETED"},{date:"2",state:"REST"},{date:"3",state:"EXCLUDED"},{date:"4",state:"EXTRA"},{date:"5",state:"IN_PROGRESS"}])).toEqual({completedScheduledDays:1,elapsedScheduledDays:1,percentage:100,currentStreak:1,bestStreak:1});});
it("a missed completed date breaks the current streak but preserves the best",()=>{expect(summarizeHabitCalendar([{date:"1",state:"COMPLETED"},{date:"2",state:"COMPLETED"},{date:"3",state:"MISSED"},{date:"4",state:"COMPLETED"}])).toEqual({completedScheduledDays:3,elapsedScheduledDays:4,percentage:75,currentStreak:1,bestStreak:2});});
it("returns a dash-compatible null when there are no completed dates",()=>{expect(summarizeHabitCalendar([{date:"1",state:"REST"},{date:"2",state:"IN_PROGRESS"}])).toMatchObject({percentage:null,currentStreak:0,bestStreak:0});});
});
