

(()=>{'use strict';

/* Markdown rendering for advisor answers: DOM nodes only, never model-supplied HTML. */

function renderAdvisorMarkdown(target, text) {

  const lines=String(text||'').replace(/\r\n?/g,'\n').split('\n');

  const inline=(parent, source)=>{

    const re=/(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)|\*[^*\n]+\*)/g; let last=0,match;

    while((match=re.exec(source))){parent.append(document.createTextNode(source.slice(last,match.index)));const token=match[0];let el;

      if(token.startsWith('**')){el=document.createElement('strong');el.textContent=token.slice(2,-2);}

      else if(token.startsWith('`')){el=document.createElement('code');el.textContent=token.slice(1,-1);}

      else if(token.startsWith('[')){const link=token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);try{const url=new URL(link[2]);if(!['http:','https:'].includes(url.protocol))throw Error();el=document.createElement('a');el.href=url.href;el.target='_blank';el.rel='noopener noreferrer';el.textContent=link[1];}catch{el=document.createTextNode(token);}}

      else{el=document.createElement('em');el.textContent=token.slice(1,-1);}parent.append(el);last=re.lastIndex;

    }parent.append(document.createTextNode(source.slice(last)));

  };

  const tableStart=i=>lines[i]?.includes('|')&&/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i+1]||'');

  const cells=line=>line.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(s=>s.trim());

  const listType=line=>/^\s*\d+[.)]\s+/.test(line)?'ol':/^\s*[-*+]\s+/.test(line)?'ul':'';

  const special=i=>/^(?:-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim())||/^```/.test(lines[i].trim())||/^#{1,4}\s+/.test(lines[i].trim())||/^\s*>\s?/.test(lines[i])||listType(lines[i])||tableStart(i);

  let i=0;while(i<lines.length){let line=lines[i],trim=line.trim();if(!trim){i++;continue;}

    if(/^(?:-{3,}|\*{3,}|_{3,})$/.test(trim)){target.append(document.createElement('hr'));i++;continue;}

    if(/^```/.test(trim)){i++;const chunk=[];while(i<lines.length&&!/^```/.test(lines[i].trim()))chunk.push(lines[i++]);if(i<lines.length)i++;const pre=document.createElement('pre'),code=document.createElement('code');code.textContent=chunk.join('\n');pre.append(code);target.append(pre);continue;}

    if(tableStart(i)){const heads=cells(line),wrap=document.createElement('div'),table=document.createElement('table'),thead=document.createElement('thead'),tr=document.createElement('tr'),tbody=document.createElement('tbody');wrap.className='advisor-table-wrap';heads.forEach(h=>{const th=document.createElement('th');inline(th,h);tr.append(th)});thead.append(tr);table.append(thead,tbody);i+=2;while(i<lines.length&&lines[i].trim()&&lines[i].includes('|')){const row=document.createElement('tr'),values=cells(lines[i++]);heads.forEach((_,n)=>{const td=document.createElement('td');inline(td,values[n]||'');row.append(td)});tbody.append(row)}wrap.append(table);target.append(wrap);continue;}

    const heading=trim.match(/^(#{1,4})\s+(.+)$/);if(heading){const el=document.createElement('h'+Math.min(heading[1].length+2,5));inline(el,heading[2]);target.append(el);i++;continue;}

    const type=listType(line);if(type){const list=document.createElement(type);if(type==='ol'){const n=Number.parseInt(line,10);if(Number.isFinite(n))list.start=n;}while(i<lines.length&&listType(lines[i])===type){const li=document.createElement('li');inline(li,lines[i++].replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/,''));list.append(li);}target.append(list);continue;}

    if(/^\s*>\s?/.test(line)){const quote=document.createElement('blockquote');while(i<lines.length&&/^\s*>\s?/.test(lines[i])){if(quote.childNodes.length)quote.append(document.createElement('br'));inline(quote,lines[i++].replace(/^\s*>\s?/,''));}target.append(quote);continue;}

    const para=document.createElement('p');while(i<lines.length&&lines[i].trim()&&(i===0||!special(i))){if(para.childNodes.length)para.append(document.createElement('br'));inline(para,lines[i++].trim());}target.append(para);

  }

}



const button=document.createElement('button');button.type='button';button.className='btn primary advisor-open';button.textContent='💬 图片顾问';button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','imageAdvisor');document.querySelector('.topbar .brand').after(button);

const panel=document.createElement('section');panel.className='advisor-panel';panel.id='imageAdvisor';panel.hidden=true;panel.setAttribute('aria-label','图片顾问');panel.innerHTML=`<div class="advisor-head"><span class="advisor-mark" aria-hidden="true">✦</span><div class="advisor-title"><strong>图片顾问</strong><small>图片制作与工作台使用助手</small></div><button type="button" class="advisor-clear">清空对话</button><button type="button" class="advisor-close" aria-label="关闭图片顾问">×</button></div><div class="advisor-messages" role="log" aria-live="polite"></div><div class="advisor-suggestions" aria-label="快捷提问"></div><form class="advisor-form"><textarea aria-label="输入问题" placeholder="输入你的问题，Enter 发送" rows="1" maxlength="3000"></textarea><button class="btn primary" type="submit">发送</button></form><div class="advisor-meta">图片顾问 · 输入问题获取操作建议</div>`;document.body.append(panel);

const messages=panel.querySelector('.advisor-messages'),input=panel.querySelector('textarea'),form=panel.querySelector('form'),send=form.querySelector('button'),meta=panel.querySelector('.advisor-meta'),suggestions=panel.querySelector('.advisor-suggestions');

let history=[];let sending=false;let revision=0;const storageKey='chun-image-advisor-history-v1';

function persist(){try{localStorage.setItem(storageKey,JSON.stringify(history.slice(-60)));}catch{}}

function add(role,text,save=true){const node=document.createElement('div');node.className='advisor-message '+role;const content=document.createElement('div');if(role==='assistant'){content.className='advisor-markdown';renderAdvisorMarkdown(content,text);}else content.textContent=text;node.append(content);if(role==='assistant'){const copy=document.createElement('button');copy.type='button';copy.textContent='复制';copy.addEventListener('click',async()=>{try{if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(text);else{const area=document.createElement('textarea');area.value=text;area.style.cssText='position:fixed;left:-9999px';document.body.append(area);area.select();const ok=document.execCommand('copy');area.remove();if(!ok)throw Error('copy failed');}copy.textContent='已复制';}catch{copy.textContent='请手动选择文字复制';}});node.append(copy);}messages.append(node);messages.scrollTop=messages.scrollHeight;if(save){history.push({role,content:text});persist();}return node;}

function reset(){revision++;history=[];persist();messages.replaceChildren();add('assistant','你好，我是图片顾问。你可以问我如何制作赠品图、SKU 图、添加 LOGO，或使用工作台。',false);}

async function submit(question){
  question=(question||input.value).trim();if(!question||sending)return;
  input.value='';const userNode=add('user',question);sending=true;send.disabled=true;const requestRevision=revision;const pending=add('assistant','AI 正在思考…',false);
  try{
    const h=await fetch('/api/health',{cache:'no-store'});if(!h.ok)throw Error('无法连接工作台服务，请确认服务已启动。');
    const health=await h.json();if(!health.promptHelpConfigured)throw Error('图片顾问尚未配置文字模型，请联系管理员。');
    const response=await fetch('/api/advisor',{method:'POST',headers:{'Content-Type':'application/json','X-Workbench-Token':health.token},body:JSON.stringify({messages:history.slice(-12).map(m=>({role:m.role,content:m.content.slice(0,3000)}))})});
    if(!response.ok){const data=await response.json().catch(()=>({}));throw Error(typeof data.error==='string'?data.error:'图片顾问暂时无法连接，请稍后重试。');}
    const data=await response.json();if(typeof data.answer!=='string'||!data.answer.trim())throw Error('图片顾问没有返回回答，请重试。');
    pending.remove();if(requestRevision!==revision)return;meta.textContent='图片顾问 · AI 回答，请核对商品、文字和数量';add('assistant',data.answer);
  }catch(error){
    pending.remove();if(requestRevision!==revision)return;
    if(history[history.length-1]?.role==='user'&&history[history.length-1]?.content===question){history.pop();persist();}
    const reason=error instanceof TypeError?'无法连接图片顾问，请检查网络或工作台服务。':error.message||'图片顾问暂时无法连接，请稍后重试。';
    meta.textContent='图片顾问 · 暂未收到 AI 回答';const failure=add('assistant',reason,false),retry=document.createElement('button');retry.type='button';retry.className='advisor-retry';retry.textContent='重试';retry.addEventListener('click',()=>{if(sending)return;failure.remove();userNode.remove();submit(question);});failure.append(retry);
  }finally{sending=false;send.disabled=false;if(!panel.hidden)input.focus();}
}
['如何添加赠品？','SKU 图怎么做？','如何添加 LOGO？','背景怎么编辑？','其他需求怎么用？'].forEach(q=>{const b=document.createElement('button');b.type='button';b.textContent=q;b.addEventListener('click',()=>submit(q));suggestions.append(b);});

function positionPanel(){if(panel.hidden)return;const anchor=button.getBoundingClientRect(),width=Math.min(420,window.innerWidth-16);panel.style.left=Math.max(8,Math.min(anchor.left,window.innerWidth-width-8))+'px';panel.style.top=Math.min(anchor.bottom+8,Math.max(8,window.innerHeight-180))+'px';panel.style.height=Math.min(680,window.innerHeight-parseFloat(panel.style.top)-8)+'px';}window.addEventListener('resize',positionPanel);window.addEventListener('scroll',positionPanel,true);button.addEventListener('click',()=>{panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden){positionPanel();input.focus();}});panel.querySelector('.advisor-close').addEventListener('click',()=>{panel.hidden=true;button.setAttribute('aria-expanded','false');button.focus();});panel.querySelector('.advisor-clear').addEventListener('click',reset);form.addEventListener('submit',e=>{e.preventDefault();submit();});input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();submit();}});let saved=[];try{saved=JSON.parse(localStorage.getItem(storageKey)||'[]');}catch{}reset();if(Array.isArray(saved))saved.slice(-60).filter(m=>m&&['user','assistant'].includes(m.role)&&typeof m.content==='string'&&m.content.length<=12000).forEach(m=>add(m.role,m.content));

})();
