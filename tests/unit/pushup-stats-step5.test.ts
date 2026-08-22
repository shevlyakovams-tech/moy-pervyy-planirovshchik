import { describe, expect, it } from "vitest";
import { calculatePushupStats } from "@/lib/habit-service";

function habit(values:number[]=[]){ return { id:"p",type:"PUSHUPS",builtInKey:"PUSHUPS",name:"Отжимания",normalizedName:"отжимания",status:"ACTIVE",startDate:"2026-08-21",statusChangedAt:new Date(),createdAt:new Date(),updatedAt:new Date(),version:1,revisions:[{id:"r",habitId:"p",effectiveFromDate:"2026-08-21",effectiveToDate:null,scheduleMask:16,goalValue:30,unit:"REPETITION",createdAt:new Date(),version:1}],exclusions:[],simpleLogs:[],plankSessions:[],pushupSets:values.map((repetitions,index)=>({id:`s${index}`,habitId:"p",localDate:"2026-08-21",recordedAt:new Date(),repetitions,setOrder:index+1,isExtra:false,createdAt:new Date(),updatedAt:new Date(),version:1})) } as never; }
describe("pushup statistics step 5",()=>{
  it("calculates empty and boundary sets exactly",()=>{ expect(calculatePushupStats(habit(),"2026-08-21")).toMatchObject({todayTotal:0,todayBest:0,todaySetCount:0,percentage:null}); expect(calculatePushupStats(habit([1,10000]),"2026-08-21")).toMatchObject({todayTotal:10001,todayBest:10000,todaySetCount:2,percentage:100}); });
  it("calculates the normative 10, 15, 12 set",()=>{ expect(calculatePushupStats(habit([10,15,12]),"2026-08-21")).toMatchObject({todayTotal:37,todayBest:15,todaySetCount:3,currentStreak:1,bestStreak:1}); });
});
