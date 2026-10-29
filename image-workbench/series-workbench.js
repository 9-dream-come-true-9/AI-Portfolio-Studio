/* First AI image establishes the layout; subsequent rows are composed locally. */
(()=>{
  'use strict';
  const KEY='series-ai-mother:sku',clone=v=>JSON.parse(JSON.stringify(v)),el=id=>document.getElementById(id),uuid=()=>ChunRuntime.randomUUID();
  const read=key=>historyDB('readonly',(s,done)=>{const r=s.get(key);r.onsuccess=()=>done(r.result);});
  let state={version:3,mode:'free',mother:null,motherPlanId:null,planId:null,rows:[],outputs:[],batch:null},loaded=false,busy=false,saveTimer=null,canvasTimer=null,writes=Promise.resolve(),updates=Promise.resolve();
  function status(text,error=false){el('seriesStatus').textContent=text;el('seriesStatus').classList.toggle('series-error',error);}
  function persist(){clearTimeout(saveTimer);const snapshot=clone(state),task=writes.catch(()=>{}).then(()=>historyDB('readwrite',s=>s.put(snapshot,KEY)));writes=task;return task;}
  function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>persist().catch(e=>status('设置保存失败：'+e.message,true)),300);}
  async function run(fn){if(busy||historyRestoring)return;busy=true;activeUIOperations++;sync();try{await fn();}catch(e){status(e.message,true);toast(e.message,true);}finally{activeUIOperations--;busy=false;sync();}}
  const active=p=>p&&['queued','running'].includes(p.status);
  function template(){return state.mother?.template;}
  function textSlots(){const doc=template();return doc?doc.layers.filter(l=>l.type==='text'&&l.groupId?.startsWith('series-slot:')).map(l=>({id:l.groupId.slice(12),label:l.name||'文案',text:l.text,role:doc.meta?.seriesLayout?.slots?.find(s=>s.id===l.groupId.slice(12))?.role||l.role})):[];}
  function running(){return active(state.batch)||active(backgroundGenerationPlans.get(state.planId));}
  function install(){
    const box=document.createElement('div');box.innerHTML=`
    <div class="segmented series-mode" aria-label="SKU 制作方式"><button id="skuFreeMode" type="button">自由生图</button><button id="skuSeriesMode" type="button">同系列母图批量</button></div>
    <div id="seriesPanel" class="series-panel hidden"><fieldset id="seriesFields">
    <section class="series-step"><h3><span>1</span>选定母图</h3><p id="seriesMotherHint" class="note">先在下方生成一张完整 AI 图片，作为这一组的母图。</p>
    <button id="seriesUseCurrent" type="button" class="btn full">使用当前 AI 任务的第一张图</button>
    <button id="seriesMasterCard" class="series-master-card hidden" type="button" title="在画布查看或校正母图"><img id="seriesMasterPreview" alt="母图预览"><span><strong id="seriesMotherTitle">已选定第一张 AI 成图</strong><span id="seriesMotherNote">点击查看母图</span></span></button>
    <div id="seriesMotherActions" class="series-actions hidden"><button id="seriesViewMother" type="button" class="btn">在画布校正</button><button id="seriesNewMother" type="button" class="btn">更换母图</button></div></section>
    <section id="seriesVariants" class="series-step hidden"><h3><span>2</span>逐行替换内容</h3><p class="note">不上传商品则沿用母图。展开“其他文案”可修改卖点等内容；排版在画布中调整。</p>
    <div id="seriesRows"></div><div class="series-actions"><button id="seriesAddRow" class="btn" type="button">添加一行</button><label class="series-upload">批量上传商品<input id="seriesBatchFiles" type="file" accept="image/png,image/jpeg,image/webp" multiple></label></div></section>
    <button id="seriesGenerate" type="button" class="btn primary full hidden">识别并固定母图排版</button><button id="seriesRetry" type="button" class="btn full hidden">重试未完成行</button>
    <p id="seriesReviewNote" class="note hidden">首次识别请核对画布中的商品、文案与清理痕迹，再批量生成。文字和商品均可直接拖动、缩放。</p>
    </fieldset><div id="seriesStatus" class="series-status" role="status" aria-live="polite"></div><div id="seriesResults" class="series-results"></div></div>`;
    el('module-sku').prepend(box);
    el('skuFreeMode').onclick=()=>run(async()=>{state.mode='free';await persist();});
    el('skuSeriesMode').onclick=()=>run(async()=>{state.mode='series';if(!state.mother&&!state.motherPlanId)await adoptCurrent(false);await persist();render();});
    el('seriesUseCurrent').onclick=()=>run(()=>adoptCurrent(true));
    el('seriesNewMother').onclick=()=>run(async()=>{if(running())throw Error('请等待当前批次完成。');captureTemplate();state.mother=null;state.motherPlanId=null;state.planId=null;state.batch=null;state.outputs=[];state.rows=[];await persist();render();status('在下方生成新的第一张母图。');});
    el('seriesMasterCard').onclick=el('seriesViewMother').onclick=()=>run(openMother);
    el('seriesAddRow').onclick=()=>run(async()=>{if(state.rows.length>=100)throw Error('每批最多 100 行。');captureTemplate();state.rows.push(newRow());await persist();renderRows();});
    el('seriesBatchFiles').onchange=e=>{const files=[...e.target.files];e.target.value='';if(files.length)run(()=>importRows(files));};
    el('seriesRows').oninput=e=>{const slot=e.target.dataset.slot;if(!slot)return;const row=state.rows.find(r=>r.id===e.target.closest('[data-row]').dataset.row);if(row){row.values||={};row.values[slot]=e.target.value;scheduleSave();}};
    el('seriesRows').onchange=e=>{if(e.target.type!=='file')return;const file=e.target.files[0],id=e.target.closest('[data-row]').dataset.row,imageSlot=e.target.dataset.imageSlot;e.target.value='';if(file)run(async()=>{if(imageSlot){const src=await readImageFile(file),row=state.rows.find(r=>r.id===id);if(row){row.images||={};row.images[imageSlot]=src;await persist();renderRows();}return;}const data=await product(file),row=state.rows.find(r=>r.id===id);if(row){Object.assign(row,data,{fileName:file.name});await persist();renderRows();status(data.factWarning||'商品已更新，包装保持上传素材原样。',!!data.factWarning);}});};
    el('seriesRows').onclick=e=>{const b=e.target.closest('[data-remove]');if(b)run(async()=>{state.rows=state.rows.filter(r=>r.id!==b.dataset.remove);await persist();renderRows();});};
    el('seriesGenerate').onclick=()=>run(()=>template()?generate(false):prepareMother());el('seriesRetry').onclick=()=>run(()=>generate(true));
    el('seriesResults').onclick=e=>{const b=e.target.closest('[data-output]');if(b)run(async()=>{captureTemplate();await persist();await restoreEditRecord(b.dataset.output);});};
    el('generateBtn').addEventListener('click',e=>{if(activeModule==='sku'&&state.mode==='series'&&!state.mother){e.preventDefault();e.stopImmediatePropagation();run(generateMother);}},true);
    new MutationObserver(sync).observe(el('module-sku'),{attributes:true,attributeFilter:['class']});new MutationObserver(sync).observe(document.querySelector('.ai-card'),{attributes:true,attributeFilter:['class']});
    const previous=editor.onChange;editor.onChange=function(...args){previous.apply(this,args);if(loaded&&!suspendSave&&!historyRestoring&&currentWorkId===state.mother?.layoutWorkId){clearTimeout(canvasTimer);canvasTimer=setTimeout(()=>{if(captureTemplate())scheduleSave();},400);}};
    window.addEventListener('beforeunload',()=>{const changed=captureTemplate();if(changed||saveTimer||canvasTimer)persist().catch(()=>{});});
  }
  function sync(){
    if(!loaded)return;const series=state.mode==='series',has=!!state.mother,ready=!!template(),inProgress=running();
    el('seriesPanel').classList.toggle('hidden',!series);el('seriesFields').disabled=busy;document.body.classList.toggle('series-mother-stage',activeModule==='sku'&&series&&!has);document.body.classList.toggle('series-fixed-mode',activeModule==='sku'&&series&&has);
    for(const [id,selected] of [['skuFreeMode',!series],['skuSeriesMode',series]]){el(id).classList.toggle('active',selected);el(id).setAttribute('aria-pressed',String(selected));el(id).disabled=busy;}
    if(activeModule==='sku'){const hide=series&&has,card=document.querySelector('.ai-card');if(card.classList.contains('hidden')!==hide)card.classList.toggle('hidden',hide);el('primaryInputCard').classList.toggle('hidden',hide);}
    el('seriesGenerate').classList.toggle('hidden',!has);el('seriesGenerate').disabled=busy||inProgress||(ready&&!state.rows.length);el('seriesGenerate').textContent=busy?'处理中…':!ready?'识别并固定母图排版':inProgress?'正在合成…':'按固定排版生成 '+state.rows.length+' 张';
    el('seriesRetry').classList.toggle('hidden',!state.batch||!['paused','finished'].includes(state.batch.status)||state.batch.items.every(i=>i.status==='succeeded'));
    el('seriesNewMother').disabled=busy||inProgress;el('seriesViewMother').textContent=ready?'在画布校正':'查看母图';el('seriesReviewNote').classList.toggle('hidden',!ready);
  }
  function render(){
    const has=!!state.mother;el('seriesMasterCard').classList.toggle('hidden',!has);el('seriesMotherActions').classList.toggle('hidden',!has);el('seriesVariants').classList.toggle('hidden',!template());el('seriesUseCurrent').classList.toggle('hidden',has);el('seriesMotherHint').classList.toggle('hidden',has);
    if(has)el('seriesMasterPreview').src=state.mother.src;el('seriesMotherTitle').textContent=template()?'母图排版已固定':'已选定第一张 AI 成图';el('seriesMotherNote').textContent=template()?'点击在画布校正 · 改动自动保存':'点击查看原图';renderRows();renderResults();sync();
  }
  function newRow(){return{id:uuid(),values:{},productSrc:null,fileName:'沿用母图商品'};}
  function reconcileSlots(doc){
    if(!doc?.meta?.seriesLayout)return false;
    const before=JSON.stringify(doc.meta.seriesLayout.slots),live=new Map(doc.layers.filter(l=>l.groupId?.startsWith('series-slot:')).map(l=>[l.groupId.slice(12),l]));
    doc.meta.seriesLayout.slots=doc.meta.seriesLayout.slots.filter(s=>live.get(s.id)?.id===s.layerId).map(s=>({...s,label:live.get(s.id).name||s.label}));
    const kinds=new Map(doc.meta.seriesLayout.slots.map(s=>[s.id,s.kind]));let changed=before!==JSON.stringify(doc.meta.seriesLayout.slots);
    for(const row of state.rows)for(const [field,kind] of [['values','text'],['images','image'],['products','product']])if(row[field])for(const id of Object.keys(row[field]))if(kinds.get(id)!==kind){delete row[field][id];changed=true;}
    return changed;
  }
  function renderRows(){
    const box=el('seriesRows'),slots=textSlots();box.replaceChildren();const primary=slots.filter(s=>['name','spec','sku-name','sku-info'].includes(s.role)).slice(0,2);if(!primary.length)primary.push(...slots.slice(0,2));
    state.rows.forEach((r,i)=>{const node=document.createElement('article');node.className='series-row';node.dataset.row=r.id;node.innerHTML=`<div class="series-row-head"><img alt="商品参考"><strong></strong><button type="button" data-remove="${r.id}" aria-label="删除第 ${i+1} 行">移除</button></div><label class="series-upload">上传或更换商品<input type="file" accept="image/png,image/jpeg,image/webp" aria-label="第 ${i+1} 行商品图片"></label>`;
      node.querySelector('img').src=r.productSrc||state.mother?.analysis?.slots?.find(s=>s.kind==='product')?.productSrc||state.mother?.src||'';node.querySelector('strong').textContent=(i+1)+'. '+r.fileName;
      const add=(slot,parent)=>{const label=document.createElement('label');label.textContent=slot.label;const input=document.createElement('textarea');input.rows=slot.text?.includes('\n')?2:1;input.maxLength=4000;input.dataset.slot=slot.id;input.setAttribute('aria-label','第 '+(i+1)+' 行'+slot.label);input.placeholder=slot.text||'填写替换文案';input.value=r.values?.[slot.id]??slot.text??'';label.append(input);parent.append(label);};
      primary.forEach(s=>add(s,node));const more=slots.filter(s=>!primary.includes(s)),images=template()?.meta?.seriesLayout?.slots?.filter(s=>s.kind==='image')||[];if(more.length||images.length){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='其他文案与图标 · '+(more.length+images.length)+' 项';details.append(summary);more.forEach(s=>add(s,details));for(const s of images){const label=document.createElement('label');label.className='series-upload';label.textContent='替换'+s.label;const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';input.dataset.imageSlot=s.id;input.setAttribute('aria-label','第 '+(i+1)+' 行'+s.label);label.append(input);details.append(label);}node.append(details);}
      const msg=document.createElement('p');msg.dataset.rowStatus='';node.append(msg);box.append(node);
    });renderRowStatuses();sync();
  }
  function renderRowStatuses(){for(const node of el('seriesRows').children){const item=state.batch?.items.find(i=>i.row.id===node.dataset.row),msg=node.querySelector('[data-row-status]');msg.hidden=!item;if(!item)continue;msg.className=item.status==='failed'||item.warnings?.length?'series-error':'note';msg.textContent=({pending:'等待合成',running:'正在合成',succeeded:item.warnings?.length?'已保存，待核对：'+item.warnings.join('；'):'已生成，可在画布编辑',failed:item.error||'生成失败'})[item.status]||'';}}
  function renderResults(){el('seriesResults').replaceChildren();for(const o of state.outputs){const rec=editRecords.find(r=>r.id===o.workId);if(!rec)continue;const b=document.createElement('button');b.className='series-result';b.type='button';b.dataset.output=o.workId;b.title='在画布编辑 '+o.name;const im=document.createElement('img');im.src=rec.preview;im.alt=o.name;const text=document.createElement('span');text.textContent=o.name;b.append(im,text);el('seriesResults').append(b);}}
  function captureTemplate(){clearTimeout(canvasTimer);canvasTimer=null;if(!template()||currentWorkId!==state.mother.layoutWorkId||suspendSave)return false;const old=template(),next={...editor.getProject(),selectedId:null,meta:clone(old.meta)};for(const layer of next.layers){if(layer.role==='series-background'||layer.groupId?.startsWith('series-slot:')||!['text','image'].includes(layer.type))continue;const id=uuid();layer.groupId='series-slot:'+id;const actual=editor.state.layers.find(l=>l.id===layer.id);if(actual)actual.groupId=layer.groupId;next.meta.seriesLayout.slots.push({id,layerId:layer.id,kind:layer.type==='text'?'text':'image',role:'other',label:layer.name||'新增内容',minFontScale:.85});}const reconciled=reconcileSlots(next);if(JSON.stringify(next)===JSON.stringify(old)&&!reconciled)return false;state.mother.template=next;currentSeriesLayoutMeta=next.meta.seriesLayout;if(!el('seriesRows').contains(document.activeElement))renderRows();return true;}
  async function saveProject(doc){for(const l of doc.layers.filter(l=>l.type==='image'))await editor._image(l.src);if(!await saveEditRecord(doc))throw Error(lastSaveError||'图片保存失败，请检查浏览器存储。');}
  async function openMother(){if(!state.mother)return;captureTemplate();await persist();await saveBeforeSwitch();if(template()){await loadDocument(clone(template()),{save:false});await saveDraft();}else{const plan=await readImageBatch(state.mother.planId);if(!plan?.items[0]?.result)throw Error('母图记录不可用。');await insertImageBatchResults(plan,[plan.items[0]]);}renderRows();}
  async function adopt(plan){
    const first=plan?.items?.[0];if(!first||first.status!=='succeeded'||!first.result?.src||plan.module!=='sku'||plan.kind==='series-edit')throw Error('请先生成第一张完整 AI 图片。');
    const size=await dimensions(first.result.src);if(imageBytes(first.result.src)>10*1024*1024)throw Error('母图超过 10 MB，请使用较小尺寸。');
    state.mother={src:first.result.src,planId:plan.id,requestId:first.requestId,width:size.w,height:size.h,document:clone({...first.document,layers:[]})};state.motherPlanId=plan.id;state.planId=null;state.batch=null;state.outputs=[];if(!state.rows.length)state.rows.push(newRow());await persist();render();status('母图已选定，点击“识别并固定母图排版”。');
  }
  async function adoptCurrent(required){const id=currentBatchAI?.planId,plan=(id?await readImageBatch(id):null)||currentGenerationPlan();if(plan?.module==='sku'&&plan.kind!=='series-edit'&&plan.items?.[0]?.status==='succeeded')return adopt(plan);if(required)throw Error('请先在下方生成第一张完整 AI 图片。');}
  async function service(layout=false){await checkAIService();if(!aiConnected||!aiIdempotentJobs)throw Error('生图服务未就绪，请稍后重试。');if(layout){const r=await fetch(aiAPI+'/api/health',{cache:'no-store'}),h=await r.json();if(!h.seriesLayout)throw Error('固定排版服务尚未更新，请重启图片工作台服务后重试。');}}
  async function api(path,data){const r=await fetch(aiAPI+path,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json','X-Workbench-Token':aiSessionToken}:{},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(180000),cache:'no-store'});let value;try{value=await r.json();}catch{throw Error('服务返回异常，请稍后继续。');}if(!r.ok)throw Error(value.error||'服务暂不可用，请稍后继续。');return value;}
  async function generateMother(){await service();const previous=state.motherPlanId?await readImageBatch(state.motherPlanId):null;if(active(previous)){status('母图正在生成，请稍候。');return;}if(previous?.status==='paused'){await runImageBatch(previous);return;}const s=generationSettings();s.mode='manual';s.count=1;s.enabled=false;if(s.drafts[0])s.drafts[0].prompt=el('aiRequest').value;await persistGenerationSettings();const plan=await createImageBatch();plan.kind='series-mother';state.motherPlanId=plan.id;await persist();await saveImageBatch(plan);await runImageBatch(plan);status('正在生成第一张母图。');}
  async function prepareMother(){
    if(!state.mother)throw Error('请先选定母图。');await service(true);await saveBeforeSwitch();const mother=state.mother,originWork=currentWorkId,originFingerprint=historyFingerprint(getDocument());status('正在识别母图中的商品、文案与排版…');
    if(!mother.analysis){mother.analysis=await api('/api/series/analyze',{image:mother.src});await persist();}
    status('正在清理旧商品和文案，制作固定底图；完成后只需核对一次画布。');
    let job=mother.prepareId&&!mother.retryable?await api('/api/series/jobs/'+mother.prepareId):await api('/api/series/prepare',{image:mother.src,slots:mother.analysis.slots,retry:mother.retryable===true});mother.retryable=false;mother.prepareId=job.id;await persist();
    const start=Date.now();while(['queued','running'].includes(job.status)){if(Date.now()-start>15*60*1000)throw Error('母图仍在处理中，稍后再次点击即可继续读取，不会重复生成。');await new Promise(r=>setTimeout(r,1600));job=await api('/api/series/jobs/'+mother.prepareId);}
    if(job.status!=='succeeded'||!job.backgroundSrc){mother.retryable=job.retryable===true;await persist();throw Error(job.error||'母图底图暂不可用，请稍后重试。');}
    const doc=SeriesLayout.buildTemplate({...mother.analysis,backgroundSrc:job.backgroundSrc});mother.layoutWorkId||=uuid();doc.meta={...mother.document.meta,...doc.meta,workId:mother.layoutWorkId,batchId:mother.layoutWorkId,module:'sku',sourceKind:'generated',sourceName:'母图排版',name:'母图排版',sourceOrder:Date.now(),batchAI:null};mother.template=doc;
    const slots=textSlots();for(const r of state.rows){r.values||={};for(const s of slots){if(s.role==='spec'&&r.spec)r.values[s.id]=r.spec;if(s.role==='name'&&r.productName)r.values[s.id]=r.productName;}delete r.spec;delete r.productName;}
    await saveProject(doc);await persist();render();if(currentWorkId===originWork&&activeModule==='sku'&&historyFingerprint(getDocument())===originFingerprint){await loadDocument(clone(doc),{save:false});await saveDraft();}
    const warnings=doc.meta.seriesLayout.warnings||[];status('排版已固定。请先核对画布，文字和商品可直接拖动、缩放；确认后填写各行并生成。'+(warnings.length?'\n识别提醒：'+warnings.join('；'):''));
  }
  async function product(file){status('正在抠除商品背景并核对包装…');const original=await readImageFile(file),src=await cutoutGiftSource(original);let facts=null,warning='';try{await service(true);facts=await api('/api/series/product-facts',{image:original});}catch{warning='包装文字未能自动核对，请核对商品容量后使用。';}return{productSrc:src,productFacts:facts,factWarning:warning};}
  async function importRows(files){if(state.rows.length+files.length>100)throw Error('每批最多 100 行。');const errors=[];for(const file of files){try{state.rows.push({...newRow(),...await product(file),fileName:file.name});await persist();}catch(e){errors.push(file.name+'：'+e.message);}}renderRows();status(errors.length?errors.join('\n'):'商品已添加，请修改需要替换的文案。',!!errors.length);}
  function rowName(row,index){const slots=textSlots(),name=slots.find(s=>s.role==='name'),spec=slots.find(s=>s.role==='spec');return [name?(row.values?.[name.id]??name.text):'',spec?(row.values?.[spec.id]??spec.text):''].filter(Boolean).join(' · ').slice(0,100)||'系列图片 '+(index+1);}
  async function generate(retry){
    if(!template())return prepareMother();finishInlineText();captureTemplate();await saveBeforeSwitch();if(running())return;
    if(retry){if(!state.batch)return;if(JSON.stringify(state.batch.template.layers)!==JSON.stringify(template().layers))throw Error('母图排版已修改，请重新生成整批，确保每行版式一致。');state.batch.items=state.batch.items.filter(i=>i.status==='succeeded'||state.rows.some(r=>r.id===i.row.id));for(const item of state.batch.items.filter(i=>i.status!=='succeeded')){const index=state.rows.findIndex(r=>r.id===item.row.id),current=state.rows[index];item.row=clone(current);item.name=rowName(current,index);item.status='pending';delete item.error;}}
    else{if(!state.rows.length)throw Error('请添加需要生成的行。');state.batch={id:uuid(),resultBatchId:uuid(),createdAt:Date.now(),status:'running',template:clone(template()),items:state.rows.map((row,i)=>({row:clone(row),outputWorkId:uuid(),name:rowName(row,i),status:'pending'}))};state.outputs=[];state.planId=null;}
    state.batch.status='running';await persist();await processRows();
  }
  async function processRows(){
    const batch=state.batch;if(!batch)return;try{
      for(const [index,item] of batch.items.entries()){
        if(item.status==='succeeded')continue;item.status='running';await persist();renderRowStatuses();status('正在按固定排版合成 '+(index+1)+' / '+batch.items.length+' 张…');
        try{const existing=await read('edit-record:'+item.outputWorkId);if(!existing){const result=await SeriesLayout.compose(batch.template,item.row,{preview:false}),doc=result.project;item.warnings=[...(result.warnings||[]),...(item.row.factWarning?[item.row.factWarning]:[])];doc.meta={...doc.meta,workId:item.outputWorkId,batchId:batch.resultBatchId,module:'sku',sourceKind:'generated',sourceName:item.name,name:item.name,sourceOrder:batch.createdAt+index,imageKey:'series-'+item.outputWorkId,batchAI:null};await saveProject(doc);}item.status='succeeded';if(!state.outputs.some(o=>o.workId===item.outputWorkId))state.outputs.push({workId:item.outputWorkId,name:item.name});}
        catch(e){item.status='failed';item.error=e.message;}
        await persist();renderRowStatuses();renderResults();await new Promise(r=>setTimeout(r,0));
      }
      batch.status='finished';await persist();const failed=batch.items.filter(i=>i.status==='failed').length,warnings=batch.items.filter(i=>i.warnings?.length).length;status('已生成 '+(batch.items.length-failed)+' / '+batch.items.length+' 张。'+(failed?'有 '+failed+' 行需要调整，可重试未完成行。':'点击结果进入画布编辑。')+(warnings?'其中 '+warnings+' 张有核对提醒，请查看对应行。':''),!!failed||!!warnings);
    }catch(e){batch.status='paused';await persist().catch(()=>{});throw e;}finally{renderRowStatuses();renderResults();sync();}
  }
  function planChanged(plan){if(!loaded||![state.planId,state.motherPlanId].includes(plan.id))return;updates=updates.catch(()=>{}).then(()=>handlePlan(plan)).catch(e=>status('结果读取失败：'+e.message,true));}
  async function handlePlan(plan){
    if(plan.id===state.motherPlanId&&!state.mother){if(plan.items[0]?.status==='succeeded')await adopt(plan);else if(plan.status==='paused'||plan.items[0]?.status==='failed')status(plan.error||plan.items[0].error||'母图生成失败，请重试。',true);sync();return;}
    if(plan.id!==state.planId||state.batch)return;
    for(const item of batchSuccessfulItems(plan)){if(state.outputs.some(o=>o.workId===item.outputWorkId))continue;const existing=await read('edit-record:'+item.outputWorkId);if(!existing)await saveProject(await batchOutputDocument(plan,item,plan.items.indexOf(item)));if(plan.id!==state.planId)return;state.outputs.push({workId:item.outputWorkId,name:item.name});await persist();}renderResults();sync();
  }
  async function init(){while(!window.appReady)await new Promise(r=>setTimeout(r,50));install();const saved=await read(KEY);if(saved)state={...state,...saved,version:3};else{const old=await read('series-workbench:sku');if(old?.mode==='series')state.mode='series';}if(state.batch?.status==='running')state.batch.status='paused';if(reconcileSlots(template()))await persist();loaded=true;render();for(const id of new Set([state.planId,state.motherPlanId].filter(Boolean))){const p=await readImageBatch(id);if(p){backgroundGenerationPlans.set(id,p);planChanged(p);}}if(template())status('排版已固定，可在画布校正后按行生成。');}
  window.SeriesWorkbench={sync,flush:()=>{captureTemplate();return persist();},planChanged};init().catch(e=>{console.error(e);toast('母图批量加载失败：'+e.message,true);});
})();
