import { sentimentLexicon, sentimentMetadata } from './sentiment-lexicon.js';
export { sentimentMetadata };
const negators=new Set(['not','no','never','neither','nor','without','hardly','barely',"isn't","wasn't","don't","didn't","can't","couldn't","won't","wouldn't","aren't","wasn't","weren't","doesn't","haven't","hasn't"]);
const intensifiers=new Map([['super',1.3],['very',1.3],['really',1.3],['extremely',1.5],['so',1.2],['slightly',0.7],['somewhat',0.7]]);
// Transparent lexicon heuristic, NOT a reproduction of the full VADER algorithm.
export function analyzeJournalTone(text) {
  const tokens=String(text).slice(0,10000).replaceAll('’',"'").toLowerCase().match(/[\p{L}]+(?:'[\p{L}]+)?|[.!?;,]|[:;=][\-^]?[)(DPp/]/gu)||[];
  let sum=0,positive=0,negative=0,context=[]; const matches=[];
  for(const token of tokens) {
    if(/^[.!?;,]$/.test(token)) {context=[]; continue;}
    if(token==='but') {sum*=0.5; context=[]; continue;}
    const raw=Object.hasOwn(sentimentLexicon,token)?sentimentLexicon[token]:0;
    if(raw && !negators.has(token) && !intensifiers.has(token)) {
      const negated=context.slice(-3).some((v,i,arr)=>negators.has(v) && !(v==='not' && arr[i+1]==='only'));
      let value=raw*(negated ? -0.74 : 1)*(intensifiers.get(context.at(-1))||1);
      sum+=value; if(value>0) positive+=value; else negative-=value;
      matches.push({term:token,negated,value:Number(value.toFixed(2))});
    }
    context.push(token); if(context.length>3) context.shift();
  }
  const score=sum/Math.sqrt(sum*sum+15);
  const mixed=positive>0 && negative>0 && Math.min(positive,negative)/Math.max(positive,negative)>=0.4;
  const label=!matches.length?'Not enough signal':mixed?'Mixed tone':score>=0.05?'Positive tone':score<=-0.05?'Negative tone':'Balanced tone';
  return {label,score:Number(score.toFixed(3)),matches,version:'vader-lexicon-heuristic-1'};
}
export function journalToneElement(text) {
  const result=analyzeJournalTone(text), section=document.createElement('div'); section.className='journal-tone';
  const heading=document.createElement('strong'); heading.textContent=`Text sentiment · ${result.label}`;
  const help=document.createElement('p'); help.className='micro'; help.textContent=result.matches.length?'Approximate English wording analysis, not a measure of your mood or health.':'No rated sentiment words matched. This does not mean your entry or feelings are neutral.';
  const details=document.createElement('details'), summary=document.createElement('summary'); summary.textContent='Why this estimate?'; details.append(summary);
  const evidence=document.createElement('p'); const unique=[...new Map(result.matches.map(m=>[m.term+String(m.negated),m])).values()].slice(0,8);
  evidence.textContent=unique.length?`Matched wording: ${unique.map(m=>`${m.term}${m.negated?' (negated)':''}`).join(', ')}. Lexicon score: ${result.score} (−1 to +1; not a confidence percentage).`:'Try an English reflection with more context. Other languages and unfamiliar expressions may not be recognized.';
  details.append(evidence); section.append(heading,help,details); return section;
}
