import { JOURNAL_MIN_ENTRIES } from './journal-demo-data.js';
// The browser selects only dated text. All sentiment/theme analysis lives on the server.
export function deviceJournalPayload(entry, entries) {
  const end=Date.parse(entry.date), start=end-14*86400000;
  const history=entries.filter(other=>other.id!==entry.id && Date.parse(other.date)>=start && Date.parse(other.date)<=end)
    .sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)).slice(0,11).reverse();
  const text=({body,date})=>({body,date});
  return {entry:text(entry),history:history.map(text),consent:true};
}

export function journalReflectionElement(reflection, state, retry) {
  const section=document.createElement('div'); section.className='journal-tone';
  const title=document.createElement('strong'); title.textContent='MUSE reflection'; section.append(title);
  if(reflection) {
    const message=document.createElement('p'); message.textContent=reflection.message;
    const list=document.createElement('ul');
    const ready=reflection.context.entryCount>=JOURNAL_MIN_ENTRIES;
    for(const suggestion of (ready?reflection.suggestions:[])) {const item=document.createElement('li');item.textContent=suggestion;list.append(item);}
    const question=document.createElement('p');question.textContent=reflection.question;
    const context=document.createElement('p');context.className='micro';
    context.textContent=`Based on ${reflection.context.entryCount} ${reflection.context.entryCount===1?'entry':'entries'}, ${new Date(reflection.context.from).toLocaleDateString()}–${new Date(reflection.context.to).toLocaleDateString()}. A reflection on your words, not a diagnosis.`;
    section.append(message);
    if(ready) {
      const heading=document.createElement('h4');heading.textContent='Things you could try';section.append(heading,list);
    } else {
      const progress=document.createElement('p');progress.className='journal-progress';
      const remaining=JOURNAL_MIN_ENTRIES-reflection.context.entryCount;
      progress.textContent=`${reflection.context.entryCount} of ${JOURNAL_MIN_ENTRIES} recent entries. Collective suggestions start after ${remaining} more ${remaining===1?'entry':'entries'} within 14 days.`;
      section.append(progress);
    }
    section.append(question,context);
    if(ready) {
      const catBreak=document.createElement('div');catBreak.className='journal-cat-break';
      const heading=document.createElement('strong');heading.textContent='A little cat break 🐾';
      const note=document.createElement('p');note.textContent='If you feel like a light distraction, pick a cute cat video. Optional, just for fun.';
      const links=document.createElement('div');links.className='journal-cat-links';
      // Fixed entertainment links; no journal text or model-generated URLs go to YouTube.
      for(const [label,url] of [
        ['Meet Marmalade — kitten cuteness','https://www.youtube.com/watch?v=UnJCiJD1mig'],
        ['Cole meets kitten Marmalade','https://www.youtube.com/watch?v=XswFdWL7HM0'],
      ]) {
        const link=document.createElement('a');link.textContent=label;link.href=url;
        link.target='_blank';link.rel='noopener noreferrer';link.referrerPolicy='no-referrer';
        link.setAttribute('aria-label',`${label} (opens YouTube in a new tab)`);links.append(link);
      }
      const source=document.createElement('p');source.className='micro';source.textContent='Cole & Marmalade · Opens YouTube in a new tab.';
      catBreak.append(heading,note,links,source);section.append(catBreak);
    }
  } else {
    const status=document.createElement('p');status.setAttribute('role','status');
    status.textContent=state?.pending?'Your entry is saved. MUSE is reflecting on your recent entries…':state?.error||'Entry saved. MUSE reflection pending.';
    const button=document.createElement('button');button.type='button';button.disabled=Boolean(state?.pending);button.textContent='Retry MUSE reflection';button.onclick=retry;
    section.append(status,button);
  }
  return section;
}
