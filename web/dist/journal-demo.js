import { JOURNAL_DEMO_STEPS } from './journal-demo-data.js';
import { journalReflectionElement } from './journal-reflection.js';

// This presentation never reads or writes journal storage or Mission progress.
export function openJournalDemo() {
  if(document.querySelector('.journal-demo')) return;
  const previousFocus=document.activeElement;
  const dialog=document.createElement('dialog');dialog.className='journal-demo';
  dialog.setAttribute('aria-labelledby','astronaut-demo-title');
  dialog.innerHTML=`<header><div><span class="demo-eyebrow">Fictional demo · Live MUSE</span><h2 id="astronaut-demo-title">Three days away from home</h2></div><button type="button" class="demo-close" aria-label="Close astronaut demo">Close</button></header>
    <p class="micro">Three preset journal entries go to Meta for a real reflection. This demo never saves to your journal or changes Mission progress.</p>
    <div class="demo-story"><div class="demo-portrait" data-stage="0">
      <svg viewBox="0 0 240 240" role="img" aria-label="Illustrated fictional astronaut">
        <circle cx="120" cy="120" r="112" fill="currentColor" opacity=".05"/>
        <g fill="currentColor" opacity=".35"><circle cx="33" cy="48" r="2"/><circle cx="206" cy="68" r="3"/><circle cx="192" cy="28" r="2"/><circle cx="40" cy="153" r="2"/></g>
        <path d="M53 239v-35c0-36 30-58 67-58s67 22 67 58v35" fill="#b8d5c5"/>
        <rect x="82" y="181" width="76" height="51" rx="10" fill="#344d44"/>
        <rect x="94" y="193" width="29" height="6" rx="3" fill="#9ae3b9"/>
        <circle cx="139" cy="196" r="4" fill="#e3b165"/>
        <path d="M74 219h92M64 182l-11 39M176 182l11 39" stroke="#7ea38f" stroke-width="7" fill="none"/>
        <circle cx="120" cy="104" r="76" fill="#d8e8df"/>
        <rect x="39" y="82" width="18" height="42" rx="8" fill="#8fae9d"/><rect x="183" y="82" width="18" height="42" rx="8" fill="#8fae9d"/>
        <ellipse cx="120" cy="103" rx="60" ry="57" fill="#253a34"/>
        <path d="M80 80q17-21 44-21" fill="none" stroke="#709487" stroke-width="7" stroke-linecap="round" opacity=".5"/>
        <g stroke="#e2eee6" stroke-width="5" stroke-linecap="round" fill="none"><path class="demo-brow-left" d="M88 94l15 0"/><path class="demo-brow-right" d="M137 94l15 0"/><path d="M96 107v3m48-3v3"/><path class="demo-mouth" d="M104 131q16 9 32 0"/></g>
        <path class="demo-tear" d="M153 115q-11 15 0 15q11 0 0-15" fill="#8cd0ee"/>
      </svg>
      <p class="demo-day">Day 1 of 3</p><h3 class="demo-feeling">Missing home</h3><p class="micro">An illustrated story, not camera analysis.</p>
    </div><ol class="demo-entries"></ol></div>
    <div class="demo-actions"><p class="demo-status" role="status" aria-live="polite"></p><button type="button" class="demo-skip">Show all three entries</button></div>
    <div class="demo-result" aria-live="polite"></div>`;
  const portrait=dialog.querySelector('.demo-portrait'), entries=dialog.querySelector('.demo-entries');
  const status=dialog.querySelector('.demo-status'), result=dialog.querySelector('.demo-result'), skip=dialog.querySelector('.demo-skip');
  let stage=0,timer,controller,closed=false;
  function reveal() {
    const step=JOURNAL_DEMO_STEPS[stage++];
    portrait.dataset.stage=String(stage);
    portrait.querySelector('.demo-day').textContent=`Day ${stage} of 3`;
    portrait.querySelector('.demo-feeling').textContent=step.label;
    portrait.querySelector('svg').setAttribute('aria-label',`Fictional astronaut: ${step.label.toLowerCase()}`);
    const item=document.createElement('li'), heading=document.createElement('strong'), body=document.createElement('p');
    heading.textContent=`Day ${step.day} · ${step.label}`;body.textContent=step.body.replace(/^Fictional astronaut demo, day \d: /,'');
    item.append(heading,body);entries.append(item);
    status.textContent=stage<3?`${stage} of 3 entries. Building context before collective suggestions…`:'3 of 3 entries. Ready for collective suggestions.';
  }
  async function reflect() {
    clearTimeout(timer);skip.hidden=true;controller=new AbortController();
    result.replaceChildren();status.textContent='MUSE is reading the three fictional entries…';
    const timeout=setTimeout(()=>controller.abort(),35000);
    try {
      const response=await fetch('/api/journal/demo',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({consent:true}),signal:controller.signal});
      const value=await response.json();
      if(!response.ok) throw new Error(value.error||'MUSE is unavailable. Please retry.');
      if(value.demo!==true || value.context?.entryCount!==3 || typeof value.message!=='string' || typeof value.question!=='string' || !Array.isArray(value.suggestions) || !value.suggestions.length || !value.suggestions.every(item=>typeof item==='string')) throw new Error('MUSE did not return a complete demo reflection. Please retry.');
      if(closed)return;
      result.append(journalReflectionElement(value));
      status.textContent='Live MUSE reflection · Based only on the three fictional entries';
    } catch(error) {
      if(closed)return;
      status.textContent=error.name==='AbortError'?'MUSE took too long. Retry the demo reflection.':error.message;
      const retry=document.createElement('button');retry.type='button';retry.textContent='Retry demo reflection';retry.onclick=reflect;result.append(retry);
    } finally {clearTimeout(timeout);}
  }
  function advance() {reveal();if(stage<3)timer=setTimeout(advance,2300);else void reflect();}
  skip.onclick=()=>{clearTimeout(timer);while(stage<3)reveal();void reflect();};
  dialog.querySelector('.demo-close').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{closed=true;clearTimeout(timer);controller?.abort();dialog.remove();previousFocus?.focus();},{once:true});
  document.body.append(dialog);dialog.showModal();
  if(matchMedia('(prefers-reduced-motion: reduce)').matches) {while(stage<3)reveal();void reflect();}
  else advance();
}
