import { describe, expect, it } from "vitest";
import { calculateWaterStats } from "@/lib/habit-service";

function habit(records:Record<string,number[]>={},scheduleMask=16){
  return {id:"w",type:"WATER",builtInKey:"WATER",name:"Вода",normalizedName:"вода",status:"ACTIVE",startDate:"2026-08-21",statusChangedAt:new Date(),createdAt:new Date(),updatedAt:new Date(),version:1,revisions:[{id:"r",habitId:"w",effectiveFromDate:"2026-08-21",effectiveToDate:null,scheduleMask,goalValue:1000,unit:"MILLILITER",createdAt:new Date(),version:1}],exclusions:[],simpleLogs:[],plankSessions:[],pushupSets:[],waterEntries:Object.entries(records).flatMap(([localDate,values])=>values.map((milliliters,index)=>({id:`${localDate}-${index}`,habitId:"w",localDate,recordedAt:new Date(),milliliters,entryOrder:index+1,isExtra:false,createdAt:new Date(),updatedAt:new Date(),version:1})))} as never;
}

describe("water statistics step 6",()=>{
  it("shows no average or percentage without records",()=>{expect(calculateWaterStats(habit(),"2026-08-21")).toMatchObject({todayTotal:0,allTimeTotal:0,averageOnRecordedDays:null,percentage:null,currentStreak:0});});
  it("calculates an exceeded goal without capping the fact",()=>{expect(calculateWaterStats(habit({"2026-08-21":[900,300]}),"2026-08-21")).toMatchObject({todayTotal:1200,allTimeTotal:1200,averageOnRecordedDays:1200,percentage:100,currentStreak:1,bestStreak:1});});
  it("averages only dates with water and does not penalize unfinished today",()=>{expect(calculateWaterStats(habit({"2026-08-21":[1000],"2026-08-22":[500]},48),"2026-08-22")).toMatchObject({todayTotal:500,allTimeTotal:1500,averageOnRecordedDays:750,percentage:100,currentStreak:1,completedScheduledDays:1,elapsedScheduledDays:1});});
});
