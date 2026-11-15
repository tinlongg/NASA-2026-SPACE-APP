import { sentimentLexicon, sentimentMetadata } from './sentiment-lexicon.js';
export { sentimentMetadata };
const negators=new Set(['not','no','never','neither','nor','without','hardly','barely',"isn't","wasn't","don't","didn't","can't","couldn't","won't","wouldn't","aren't","wasn't","weren't","doesn't","haven't","hasn't"]);
const intensifiers=new Map([['super',1.3],['very',1.3],['really',1.3],['extremely',1.5],['so',1.2],['slightly',0.7],['somewhat',0.7]]);
// App-authored spelling/slang aliases; ratings still come from the VADER dataset.
const aliases=new Map(Object.entries({im:"i'm",dont:"don't",cant:"can't",isnt:"isn't",wasnt:"wasn't",didnt:"didn't",wont:"won't",aint:"isn't",luv:'love',luvv:'love',gud:'good',sux:'sucks',bummed:'sad',pissed:'angry',chillin:'relaxed',chilling:'relaxed',lowkey:'somewhat',hella:'very',rly:'really'}));
const known=word=>aliases.has(word)||negators.has(word)||intensifiers.has(word)||Object.hasOwn(sentimentLexicon,word);
export function normalizeJournalWord(word) {
  if(known(word)) return aliases.get(word)||word;
  // Only reduce repeated runs in unknown words; preserve real double letters.
  // Bound candidate expansion even for long or adversarial input.
  const runs=word.match(/(.)\1*/gu)||[]; let candidates=[''];
  for(const run of runs) {
    const choices=run.length>=2?[run[0].repeat(2),run[0]]:[run];
    candidates=candidates.flatMap(prefix=>choices.map(suffix=>prefix+suffix)).slice(0,64);
  }
  const matched=candidates.find(known);
  return matched ? (aliases.get(matched)||matched) : word;
}
// Transparent lexicon heuristic, NOT a reproduction of the full VADER algorithm.
export function analyzeJournalTone(text) {
  const tokens=String(text).slice(0,10000).replaceAll('’',"'").toLowerCase().match(/[\p{L}]+(?:'[\p{L}]+)?|[.!?;,]|[:;=][\-^]?[)(DPp/]/gu)||[];
  let sum=0,positive=0,negative=0,context=[]; const matches=[];
  for(const original of tokens) {
    let token=normalizeJournalWord(original);
    // "I'm cooked" expresses exhaustion; "cooked dinner" remains literal.
    if(token==='cooked' && ["i'm",'feel','feeling'].includes(context.at(-1))) token='exhausted';
    if(/^[.!?;,]$/.test(token)) {context=[]; continue;}
    if(token==='but') {sum*=0.5; context=[]; continue;}
    const raw=Object.hasOwn(sentimentLexicon,token)?sentimentLexicon[token]:0;
    if(raw && !negators.has(token) && !intensifiers.has(token)) {
      const negated=context.slice(-3).some((v,i,arr)=>negators.has(v) && !(v==='not' && arr[i+1]==='only'));
      let value=raw*(negated ? -0.74 : 1)*(intensifiers.get(context.at(-1))||1);
      sum+=value; if(value>0) positive+=value; else negative-=value;
      matches.push({term:original,normalized:token,negated,value:Number(value.toFixed(2))});
    }
    context.push(token); if(context.length>3) context.shift();
  }
  const score=sum/Math.sqrt(sum*sum+15);
  const mixed=positive>0 && negative>0 && Math.min(positive,negative)/Math.max(positive,negative)>=0.4;
  const label=!matches.length?'Not enough signal':mixed?'Mixed tone':score>=0.05?'Positive tone':score<=-0.05?'Negative tone':'Balanced tone';
  return {label,score:Number(score.toFixed(3)),matches,version:'vader-lexicon-heuristic-2'};
}
export function journalToneElement(text) {
  const result=analyzeJournalTone(text), section=document.createElement('div'); section.className='journal-tone';
  const heading=document.createElement('strong'); heading.textContent=`Text sentiment · ${result.label}`;
  const help=document.createElement('p'); help.className='micro'; help.textContent=result.matches.length?'Approximate English wording analysis, not a measure of your mood or health.':'No rated sentiment words matched. This does not mean your entry or feelings are neutral.';
  const details=document.createElement('details'), summary=document.createElement('summary'); summary.textContent='Why this estimate?'; details.append(summary);
  const evidence=document.createElement('p'); const unique=[...new Map(result.matches.map(m=>[m.term+String(m.negated),m])).values()].slice(0,8);
  evidence.textContent=unique.length?`Matched wording: ${unique.map(m=>`${m.term}${m.normalized!==m.term?` → ${m.normalized}`:''}${m.negated?' (negated)':''}`).join(', ')}. Lexicon score: ${result.score} (−1 to +1; not a confidence percentage).`:'Try an English reflection with more context. Other languages and unfamiliar expressions may not be recognized.';
  details.append(evidence); section.append(heading,help,details); return section;
}

export function museJournalElement(text, {memory=false}={}) {
  const section=document.createElement('div'); section.className='journal-tone';
  const heading=document.createElement('strong'); heading.textContent='MUSE · optional AI reflection';
  const disclosure=document.createElement('p'); disclosure.className='micro';
  const button=document.createElement('button'); button.type='button';
  const output=document.createElement('p'); output.setAttribute('role','status'); output.style.whiteSpace='pre-wrap';
  // MUSE memory: signed-in users may let the server attach up to three related past
  // entries from their own account. The browser never chooses or sends those entries.
  let recall=null, toggle=null;
  if(memory) {
    toggle=document.createElement('label'); toggle.className='toggle'; recall=document.createElement('input'); recall.type='checkbox'; recall.checked=true;
    toggle.append(recall,' Include up to 3 related past entries from my account');
  }
  const describe=()=>{
    const withMemory=Boolean(recall?.checked);
    button.textContent=withMemory?'Send to MUSE with related entries':'Send this entry to MUSE';
    disclosure.textContent=(withMemory?'Clicking sends this entry, plus up to three of your own account entries with similar wording, through our server to Meta (Muse Spark). Crew data is not included.':'Clicking sends only this entry through our server to Meta (Muse Spark). Other entries and crew data are not included.')+' AI reflections may be wrong and are not a health assessment.';
  };
  describe(); if(recall) recall.onchange=describe;
  if(text.length>2000) {button.disabled=true; output.textContent='MUSE supports entries up to 2,000 characters. Local analysis is available for this longer entry.';}
  button.onclick=async()=>{
    const withMemory=Boolean(recall?.checked);
    button.disabled=true; output.textContent='MUSE is reflecting…';
    try {
      const response=await fetch('/api/journal/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(withMemory?{entry:text,consent:true,memory:true}:{entry:text,consent:true}),cache:'no-store',signal:AbortSignal.timeout(30000)});
      const result=await response.json();
      if(!response.ok) throw Error(typeof result.error==='string'?result.error:'MUSE is unavailable. Try again later.');
      const used=Array.isArray(result.memory)?result.memory:[];
      const context=!withMemory?'':used.length?`\n\nRelated entries sent with this one: ${used.map(m=>`${new Date(m.date).toLocaleDateString()} (similarity ${Number(m.score).toFixed(2)})`).join(', ')}.`:'\n\nNo related past entries were found, so only this entry was sent.';
      output.textContent=`MUSE reflection (${result.model})\n${result.answer}${context}`;
    } catch(error) {output.textContent=error.name==='TimeoutError'?'MUSE took too long. Try again.':error.message;}
    finally {button.disabled=false;}
  };
  section.append(heading,disclosure,...(toggle?[toggle]:[]),button,output); return section;
}
