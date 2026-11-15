// Fictional presentation data only. Never inserted into a person's journal.
export const JOURNAL_MIN_ENTRIES = 3;
export const JOURNAL_DEMO_STEPS = [
  {day:1, label:'Missing home', body:'Fictional astronaut demo, day 1: After my shift aboard the station I felt homesick and tired. I missed dinner conversations with my family, though a short chat with a crewmate helped.'},
  {day:2, label:'Feeling lonely', body:'Fictional astronaut demo, day 2: I felt sad and lonely again after work. I stayed in my cabin instead of joining the crew for a meal, and I missed hearing a familiar voice from home.'},
  {day:3, label:'Feeling very low', body:'Fictional astronaut demo, day 3: I feel really down and worn out tonight. Being far from home has been hard across these days. I would welcome some company and a calm conversation with someone I trust.'},
];
export function journalDemoEntries(now=Date.now()) {
  return JOURNAL_DEMO_STEPS.map((step,index)=>({body:step.body,date:new Date(now-(2-index)*86400000).toISOString()}));
}
