import type { PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api-response";
import { addLocalDays, parseLocalDate, startOfLocalWeek } from "@/lib/date-service";
import { listHabits } from "@/lib/habit-service";
import type { BusinessContext } from "@/lib/planner-service";
import { normalizeSearch } from "@/lib/text-normalization";

type CalendarState = "NOT_STARTED" | "EXCLUDED" | "EXTRA" | "COMPLETED" | "IN_PROGRESS" | "MISSED" | "REST";
export type CalendarDay = { date:string; state:CalendarState; total?:number; totalSeconds?:number };

export function summarizeHabitCalendar(calendar:CalendarDay[]){
  const elapsed=calendar.filter((day)=>day.state==="COMPLETED"||day.state==="MISSED");
  const completed=elapsed.filter((day)=>day.state==="COMPLETED").length;
  let bestStreak=0;let running=0;
  for(const day of elapsed){running=day.state==="COMPLETED"?running+1:0;bestStreak=Math.max(bestStreak,running);}
  let currentStreak=0;
  for(let index=elapsed.length-1;index>=0&&elapsed[index]?.state==="COMPLETED";index-=1)currentStreak+=1;
  return {completedScheduledDays:completed,elapsedScheduledDays:elapsed.length,percentage:elapsed.length?Math.round(completed/elapsed.length*1000)/10:null,currentStreak,bestStreak};
}

function monthStart(date:string){return `${date.slice(0,7)}-01`;}
function rangeStart(range:string,businessDate:string,earliest:string){
  if(range==="week")return startOfLocalWeek(businessDate);
  if(range==="month")return monthStart(businessDate);
  if(range==="all")return earliest;
  throw new ApiError(422,"INVALID_PROGRESS_RANGE","Выберите неделю, месяц или всё время");
}

const moodValues:Record<string,number>={HARD:1,BELOW_USUAL:2,EVEN:3,GOOD:4,EXCELLENT:5};
export async function getProgress(client:PrismaClient,context:BusinessContext,range:string){
  const [earliestEntry,earliestTask,earliestHabit]=await Promise.all([
    client.dailyEntry.findFirst({orderBy:{localDate:"asc"},select:{localDate:true}}),
    client.task.findFirst({orderBy:{localDate:"asc"},select:{localDate:true}}),
    client.habit.findFirst({orderBy:{startDate:"asc"},select:{startDate:true}})
  ]);
  const earliest=[earliestEntry?.localDate,earliestTask?.localDate,earliestHabit?.startDate,context.businessDate].filter((value):value is string=>Boolean(value)).sort()[0]??context.businessDate;
  const start=rangeStart(range,context.businessDate,earliest);const end=context.businessDate;
  const [tasks,entries,habits,measureHabits]=await Promise.all([
    client.task.findMany({where:{localDate:{gte:start,lte:end}}}),
    client.dailyEntry.findMany({where:{localDate:{gte:start,lte:end}},orderBy:{localDate:"asc"}}),
    listHabits(client,context),
    client.habit.findMany({include:{simpleLogs:{where:{localDate:{gte:start,lte:end}}},plankSessions:{where:{localDate:{gte:start,lte:end}}},pushupSets:{where:{localDate:{gte:start,lte:end}}},waterEntries:{where:{localDate:{gte:start,lte:end}}}}})
  ]);
  const priorities=tasks.filter((task)=>task.priorityRank!==null);const completedPriorities=priorities.filter((task)=>task.status==="COMPLETED").length;
  const categoryCompleted=Object.fromEntries(["WORK","CLOSE_PEOPLE","FAMILY","HOBBY","LEARNING"].map((category)=>[category,tasks.filter((task)=>task.category===category&&task.status==="COMPLETED").length]));
  const measurements=new Map<string,Record<string,number|string|null>>(measureHabits.map((habit):[string,Record<string,number|string|null>]=>{
    if(habit.type==="SIMPLE")return [habit.id,{completions:habit.simpleLogs.length}];
    if(habit.type==="PLANK"){const values=habit.plankSessions.map((item)=>item.durationSeconds);return [habit.id,{total:values.reduce((sum,value)=>sum+value,0),best:values.length?Math.max(...values):0,unit:"сек"}];}
    if(habit.type==="PUSHUPS"){const values=habit.pushupSets.map((item)=>item.repetitions);return [habit.id,{total:values.reduce((sum,value)=>sum+value,0),best:values.length?Math.max(...values):0,count:values.length,unit:"повт."}];}
    const byDate=new Map<string,number>();for(const item of habit.waterEntries)byDate.set(item.localDate,(byDate.get(item.localDate)??0)+item.milliliters);const total=[...byDate.values()].reduce((sum,value)=>sum+value,0);return [habit.id,{total,average:byDate.size?Math.round(total/byDate.size*10)/10:null,unit:"мл"}];
  }));
  return {range,start,end,tasks:{plannedPriorities:priorities.length,completedPriorities,percentage:priorities.length?Math.round(completedPriorities/priorities.length*1000)/10:null,categoryCompleted,selfDays:entries.filter((entry)=>entry.selfActionCompletedAt).length,otherDays:entries.filter((entry)=>entry.closeActionCompletedAt).length,moods:entries.filter((entry)=>entry.mood&&moodValues[entry.mood]).map((entry)=>({date:entry.localDate,label:entry.mood!,value:moodValues[entry.mood!]}))},habits:habits.map((habit)=>{const stats=habit.stats as unknown as {calendar:CalendarDay[];currentStreak:number;bestStreak:number};const calendar=stats.calendar.filter((day)=>day.date>=start&&day.date<=end);return {id:habit.id,name:habit.name,type:habit.type,status:habit.status,goal:habit.currentRevision?.goalValue??null,...summarizeHabitCalendar(calendar),currentAllTimeStreak:stats.currentStreak,bestAllTimeStreak:stats.bestStreak,calendar,measurements:measurements.get(habit.id)??{}};})};
}

export async function getArchiveMonth(client:PrismaClient,month:string,context:BusinessContext){
  if(!/^\d{4}-\d{2}$/.test(month)||!parseLocalDate(`${month}-01`))throw new ApiError(422,"INVALID_MONTH","Выберите корректный месяц");
  const start=`${month}-01`;const nextMonthDate=parseLocalDate(start)!;nextMonthDate.setMonth(nextMonthDate.getMonth()+1);const nextMonth=`${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth()+1).padStart(2,"0")}-01`;const end=addLocalDays(nextMonth,-1);
  const [entries,tasks]=await Promise.all([client.dailyEntry.findMany({where:{localDate:{gte:start,lte:end}},include:{quote:true},orderBy:{localDate:"desc"}}),client.task.findMany({where:{localDate:{gte:start,lte:end}},orderBy:{localDate:"desc"}})]);
  const taskDates=new Set(tasks.map((task)=>task.localDate));const byDate=new Map(entries.map((entry)=>[entry.localDate,entry]));const days=[];for(let date=start;date<=end;date=addLocalDays(date,1)){const entry=byDate.get(date);days.push({date,future:date>context.businessDate,hasRecord:Boolean(entry||taskDates.has(date)),morningCompleted:Boolean(entry?.morningCompletedAt),quote:entry?.quote?{text:entry.quote.translationRu,author:entry.quote.author}:null,taskCount:tasks.filter((task)=>task.localDate===date).length});}
  return {month,start,end,businessDate:context.businessDate,days};
}

export async function listArchiveWeeks(client:PrismaClient){return client.weeklyPlan.findMany({where:{OR:[{goal:{not:null}},{whyImportant:{not:null}},{steps:{some:{text:{not:null}}}}]},include:{steps:{orderBy:{orderIndex:"asc"}}},orderBy:{weekStart:"desc"}});}
export async function listFavoriteQuotes(client:PrismaClient){return client.quote.findMany({where:{userState:{favoriteAt:{not:null}}},include:{userState:true},orderBy:[{userState:{favoriteAt:"desc"}},{author:"asc"}]});}

const searchGroups:Record<string,string[]>= {all:[],task:["TASK"],journal:["GRATITUDE","THOUGHT","INTENTION","REFLECTION"],week:["WEEKLY_GOAL"],quote:["QUOTE"]};
export async function searchHistory(client:PrismaClient,context:BusinessContext,params:{q:string;period:string;from?:string|null;to?:string|null;category?:string|null;type?:string|null}){
  const query=normalizeSearch(params.q.trim());if(query.length<2)throw new ApiError(422,"SEARCH_TOO_SHORT","Введите не меньше двух символов");
  const period=params.period||"all";let from:string|undefined;let to=context.businessDate;
  if(period==="week")from=startOfLocalWeek(context.businessDate);else if(period==="month")from=monthStart(context.businessDate);else if(period==="custom"){if(!params.from||!params.to||!parseLocalDate(params.from)||!parseLocalDate(params.to)||params.from>params.to)throw new ApiError(422,"INVALID_SEARCH_PERIOD","Проверьте даты поиска");from=params.from;to=params.to;}else if(period!=="all")throw new ApiError(422,"INVALID_SEARCH_PERIOD","Выберите период поиска");
  const group=params.type&&params.type in searchGroups?params.type:"all";const sourceTypes=searchGroups[group]!;const category=params.category&&params.category!=="all"?params.category:null;
  const rows=await client.searchDocument.findMany({where:{normalizedText:{contains:query},...(from?{localDate:{gte:from,lte:to}}:{localDate:{lte:to}}),...(sourceTypes.length?{sourceType:{in:sourceTypes}}:{}),...(category?{taskCategory:category}:{})},orderBy:[{localDate:"desc"},{sourceType:"asc"}]});
  return {query,results:rows.map((row)=>({id:row.id,sourceId:row.sourceId,sourceType:row.sourceType,localDate:row.localDate,taskCategory:row.taskCategory,text:row.originalText,isWeek:row.sourceType==="WEEKLY_GOAL"}))};
}
