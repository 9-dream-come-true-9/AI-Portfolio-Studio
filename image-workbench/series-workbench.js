/* An uploaded image or existing AI result establishes the layout for local rows. */
(()=>{
  'use strict';
  const KEY='series-ai-mother:sku',clone=v=>JSON.parse(JSON.stringify(v)),el=id=>document.getElementById(id),uuid=()=>ChunRuntime.randomUUID();
  const read=key=>historyDB('readonly',(s,done)=>{const r=s.get(key);r.onsuccess=()=>done(r.result);});
  const freshState=(mode='free')=>({version:4,mode,sessionId:null,pendingMother:null,seenGenerationPlanId:null,mother:null,motherPlanId:null,planId:null,rows:[],outputs:[],batch:null});
  const startedAt=Date.now(),sessionKey=id=>KEY+':session:'+id,workKey=id=>KEY+':work:'+id;
  let state=freshState(),loaded=false,busy=false,saveTimer=null,canvasTimer=null,writes=Promise.resolve(),updates=Promise.resolve(),contextSwitchDepth=0,templateRefresh=null;
  function status(text,error=false){el('seriesStatus').textContent=text;el('seriesStatus').classList.toggle('series-error',error);}
  function persist(){clearTimeout(saveTimer);state.sessionId||=state.mother?.planId||state.motherPlanId||state.mother?.layoutWorkId||null;
    if(state.mother?.template?.meta?.seriesLayout)Object.assign(state.mother.template.meta.seriesLayout,{sessionId:state.sessionId,sourcePlanId:state.mother.planId||null});
    const snapshot=clone(state),task=writes.catch(()=>{}).then(()=>historyDB('readwrite',s=>{s.put(snapshot,KEY);if(!snapshot.sessionId)return;s.put({...snapshot,pendingMother:null},sessionKey(snapshot.sessionId));for(const id of [snapshot.mother?.layoutWorkId,snapshot.mother?.sourceOutputWorkId,...snapshot.outputs.map(o=>o.workId)].filter(Boolean))s.put(snapshot.sessionId,workKey(id));}));writes=task;return task;}
  function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>persist().catch(e=>status('设置保存失败：'+e.message,true)),300);}
  async function run(fn){if(!loaded||busy||historyRestoring)return;busy=true;activeUIOperations++;sync();try{await fn();}catch(e){status(e.message,true);toast(e.message,true);}finally{activeUIOperations--;busy=false;sync();}}
  const active=p=>p&&['queued','running'].includes(p.status);
  const motherPlan=p=>p?.module==='sku'&&p.kind!=='series-edit'&&Array.isArray(p.items)&&p.items.length;
  function currentMotherWork(){return currentWorkId===state.mother?.layoutWorkId||currentWorkId===state.mother?.sourceOutputWorkId||state.outputs.some(o=>o.workId===currentWorkId);}
  async function restoreSession(id){
    if(!id||id===state.sessionId)return false;const saved=await read(sessionKey(id));if(!saved)return false;
    captureTemplate();await persist();state={...freshState(state.mode),...saved,version:4,mode:state.mode,pendingMother:null,seenGenerationPlanId:currentGenerationPlan()?.id||saved.seenGenerationPlanId||null};await persist();render();return true;
  }
  async function showOriginalMother(plan){
    if(!plan?.items[0]?.result?.src)return;contextSwitchDepth++;
    try{await insertImageBatchResults(plan,[plan.items[0]]);}finally{contextSwitchDepth--;}
  }
  async function selectCurrentMother({show=false}={}){
    if(state.mother?.source==='upload'&&currentMotherWork())return true;
    const attachedId=currentBatchAI?.planId,pending=state.pendingMother;
    const pendingMatches=pending&&(pending.workId===currentWorkId||attachedId===pending.planId)&&pending.scope===referenceBatchId();
    let plan=pendingMatches?await readImageBatch(pending.planId):null;
    const latest=currentGenerationPlan();
    if(show&&!motherPlan(plan)&&state.mother&&motherPlan(latest)&&batchMatchesWorkspace(latest)&&latest.id!==state.mother.planId&&latest.id!==state.seenGenerationPlanId){const previous=state.mother.planId?await readImageBatch(state.mother.planId):null;if((Date.parse(latest.createdAt)||0)>(Date.parse(previous?.createdAt)||0))plan=latest;}
    if(!motherPlan(plan)){
      if(currentMotherWork()){await persist();return true;}
      const linked=currentSeriesLayoutMeta?.sessionId||await read(workKey(currentWorkId));
      if(linked){if(linked===state.sessionId)return true;if(await restoreSession(linked))return true;}
      plan=attachedId?await readImageBatch(attachedId):null;
      if(!motherPlan(plan)){const latest=currentGenerationPlan();plan=motherPlan(latest)&&batchMatchesWorkspace(latest)?latest:null;}
    }
    if(!motherPlan(plan)){
      if(state.mother||state.motherPlanId){captureTemplate();await persist();state=freshState(state.mode);await persist();render();}
      return false;
    }
    if(plan.id===state.mother?.planId){state.pendingMother=null;await persist();return true;}
    if(await restoreSession(plan.id)){if(show){if(template())await openMother();else await showOriginalMother(plan);}return true;}
    if(plan.items[0].status==='succeeded'&&plan.items[0].result?.src){await adopt(plan);if(show)await showOriginalMother(plan);return true;}
    captureTemplate();await persist();const mode=state.mode;state={...freshState(mode),sessionId:plan.id,motherPlanId:plan.id};await persist();render();
    status(plan.items[0].error||plan.error||'母图正在生成，完成后会显示“识别并固定母图排版”。',plan.items[0].status==='failed');return true;
  }
  async function enterSeries(){const until=Date.now()+15000;while(generationPreparing.has(generationScope())&&Date.now()<until)await new Promise(r=>setTimeout(r,25));if(generationPreparing.has(generationScope()))throw Error('正在保存第一张图片的生成任务，请稍后再次切换。');await updates.catch(()=>{});captureTemplate();state.mode='series';await selectCurrentMother({show:true});await persist();render();if(template())status('排版已固定，可在画布校正后按行生成。');else if(state.mother)status('母图已选定，点击“识别并固定母图排版”。');}
  function workspaceChanged(){
    if(!loaded||busy||contextSwitchDepth)return Promise.resolve();
    updates=updates.catch(()=>{}).then(async()=>{if(activeModule!=='sku')return;state.pendingMother=null;state.seenGenerationPlanId=currentGenerationPlan()?.id||null;await selectCurrentMother();if(template())await refreshStoredTemplate();render();});return updates;
  }
  function template(){return state.mother?.template;}
  const requiredGeometry=analysis=>(analysis?.slots?.filter(slot=>slot.kind==='product').length||0)>1?4:5;
  const templateFingerprint=doc=>JSON.stringify(doc?{width:doc.width,height:doc.height,background:doc.background,layers:doc.layers}:null);
  const savedTime=value=>Number.isFinite(Date.parse(value||''))?Date.parse(value):0;
  const analysisUpgradeAttempts=new WeakSet(),analysisUpgrades=new WeakMap();
  async function cachedAnalysisUpgrade(mother){
    if(mother.analysis?.layoutRevision>=2)return null;
    if(analysisUpgrades.has(mother))return analysisUpgrades.get(mother);
    if(!mother.analysis||mother.analysis.layoutRevision>=2||analysisUpgradeAttempts.has(mother)||typeof fetch!=='function')return null;
    analysisUpgradeAttempts.add(mother);
    try{
      const response=await fetch(aiAPI+'/api/health',{cache:'no-store',signal:AbortSignal.timeout(2500)}),health=await response.json();
      if(!response.ok||health.app!=='chun-image-workbench'||Number(health.seriesLayoutRevision||0)<2)return null;
      const result=await fetch(aiAPI+'/api/series/analyze',{method:'POST',headers:{'Content-Type':'application/json','X-Workbench-Token':health.token||aiSessionToken},body:JSON.stringify({image:mother.src,cacheOnly:true}),signal:AbortSignal.timeout(10000),cache:'no-store'});
      if(!result.ok)return null;const analysis=await result.json();
      if(analysis.layoutRevision>=2&&analysis.width===mother.analysis.width&&analysis.height===mother.analysis.height&&Array.isArray(analysis.slots)){analysisUpgrades.set(mother,analysis);return analysis;}
    }catch{}
    return null;
  }
  function migrateCachedLayout(project,previous,analysis){
    const unchanged={project,changed:false};if(!analysis||!previous)return unchanged;
    const background=project.layers.find(l=>l.role==='series-background')?.src;if(!background)return unchanged;
    let baseline,fresh;try{baseline=SeriesLayout.buildTemplate({...previous,backgroundSrc:background});fresh=SeriesLayout.buildTemplate({...analysis,backgroundSrc:background});}catch{return unchanged;}
    const next=clone(project),bindings=next.meta.seriesLayout.slots,groups=new Map(),rowUpdates=[];let changed=false;
    const layerFor=(doc,id)=>doc.layers.find(l=>l.groupId==='series-slot:'+id);
    const same=(a,b)=>['text','x','y','w','h','fontSize','fontWeight','color','textAlign','textVerticalAlign','lineHeight','rotation','opacity','visible','locked'].every(k=>typeof a[k]==='number'&&typeof b[k]==='number'?Math.abs(a[k]-b[k])<.02:a[k]===b[k]);
    for(const slot of analysis.slots)if(slot.kind==='text'&&slot.sourceSlotId){if(!groups.has(slot.sourceSlotId))groups.set(slot.sourceSlotId,[]);groups.get(slot.sourceSlotId).push(slot);}
    for(const [id,parts] of groups){
      if(parts.length<2)continue;const oldSlot=previous.slots.find(s=>s.id===id&&s.kind==='text'),layer=layerFor(next,id),base=layerFor(baseline,id);if(!oldSlot||!layer||!base)continue;
      const raw={...base,text:oldSlot.text,x:oldSlot.x,y:oldSlot.y,w:oldSlot.w,h:oldSlot.h,fontSize:oldSlot.fontSize,lineHeight:oldSlot.lineHeight||1.25};
      if(layer.text!==parts[0].originalText||(!same(layer,raw)&&!same(layer,base)))continue;
      if(state.rows.some(r=>Object.prototype.hasOwnProperty.call(r.values||{},id)&&r.values[id]!==oldSlot.text))continue;
      const built=parts.map(s=>layerFor(fresh,s.id));if(built.some(l=>!l)||parts.slice(1).some(s=>layerFor(next,s.id)))continue;
      const index=next.layers.indexOf(layer),replacements=built.map((l,i)=>({...clone(l),id:i?'series_split_'+uuid():layer.id,name:i?l.name:layer.name}));next.layers.splice(index,1,...replacements);
      const oldBinding=bindings.findIndex(s=>s.id===id);if(oldBinding>=0)bindings.splice(oldBinding,1);
      for(let i=0;i<parts.length;i++){const binding=fresh.meta.seriesLayout.slots.find(s=>s.id===parts[i].id);bindings.push({...clone(binding),layerId:replacements[i].id});}
      for(const row of state.rows)if(Object.prototype.hasOwnProperty.call(row.values||{},id))rowUpdates.push({rowId:row.id,values:Object.fromEntries(parts.map(part=>[part.id,part.text]))});
      changed=true;
    }
    for(const slot of analysis.slots.filter(s=>s.kind==='image')){
      const old=previous.slots.find(s=>s.id===slot.id&&s.kind==='image'),layer=layerFor(next,slot.id),oldSource=old?.imageSrc||old?.src,newSource=slot.imageSrc||slot.src;
      // Only replace the original extracted bitmap; keep any custom icon and all
      // user-adjusted placement, angle, size, visibility and opacity untouched.
      if(layer&&oldSource&&newSource&&layer.src===oldSource&&newSource!==oldSource){layer.src=newSource;changed=true;}
    }
    if(changed)next.meta.seriesLayout.layoutRevision=analysis.layoutRevision;
    return{project:next,changed,rowUpdates};
  }
  async function batchHasSavedResults(batch){
    if(batch.items.some(i=>i.status==='succeeded'||state.outputs.some(o=>o.workId===i.outputWorkId)))return true;
    for(const item of batch.items)if(await read('edit-record:'+item.outputWorkId))return true;
    return false;
  }
  async function protectStoredTemplate(mother,project){
    const protectedLayer=project.layers.find(layer=>layer.role==='series-background');
    if((protectedLayer?.seriesPreserve?.version===1&&project.meta?.seriesLayout?.geometryVersion>=requiredGeometry(mother.analysis)&&project.meta?.seriesLayout?.layoutRevision>=5)||!mother.analysis?.slots||typeof fetch!=='function')return false;
    let background=protectedLayer?.src;if(!background)return false;
    const response=await fetch(aiAPI+'/api/health',{cache:'no-store',signal:AbortSignal.timeout(2500)}),health=await response.json();
    if(!response.ok||health.app!=='chun-image-workbench'||health.seriesPreserveVersion!==1)return false;aiSessionToken=health.token||aiSessionToken;
    if(protectedLayer.seriesPreserve){if(!mother.prepareId)throw Error('母图清理底图记录缺失，已保留当前画布。');const job=await api('/api/series/jobs/'+mother.prepareId);if(job.status!=='succeeded')throw Error('母图清理底图暂不可用，已保留当前画布。');background=job.backgroundSrc;}
    const previous=clone(mother.analysis),analysis=await api('/api/series/analyze',{image:mother.src});
    const regions=await api('/api/series/preserve',{image:mother.src,background,slots:analysis.slots});
    if(state.mother!==mother)return false;
    // Preserve every actual user edit; the baseline only determines which source
    // pixels remain untouched and which individual regions must be replaced.
    const key='series-preserve-backup:'+mother.layoutWorkId;if(!await read(key))await historyDB('readwrite',store=>store.put(clone(project),key));
    const upgraded=SeriesLayout.upgradePreservation(project,previous,analysis,background,mother.src,regions);Object.assign(project,upgraded);return{analysis,previous};
  }
  async function repairStoredOutputs(){
    const mother=state.mother,regions=template()?.layers.find(layer=>layer.role==='series-background')?.seriesPreserve;
    if(!mother?.analysis||!regions)return false;let changed=false;
    const preserve={version:1,patches:regions.slots.map(slot=>({id:SeriesLayout.slotId(slot.baseline),box:slot.box,src:slot.src}))};
    for(const output of state.outputs){
      if(state.mother!==mother)return changed;
      const live=currentWorkId===output.workId&&activeModule==='sku'&&currentSeriesLayoutMeta;
      const source=live?getDocument():await read('edit-record:'+output.workId);
      if(!source?.meta?.seriesLayout||source.meta.seriesLayout.preserveVersion===1&&source.meta.seriesLayout.layoutRevision>=5&&source.meta.seriesLayout.geometryVersion>=requiredGeometry(mother.analysis)&&(source.meta.seriesLayout.backgroundRevision||1)>=(mother.backgroundRevision||1))continue;
      const key='series-output-preserve-backup:'+output.workId;if(!await read(key))await historyDB('readwrite',store=>store.put(clone(source),key));
      const previous=source.meta.seriesLayout.geometryVersion>=requiredGeometry(mother.analysis)&&source.meta.seriesLayout.layoutRevision>=5?mother.analysis:source.meta.seriesLayout.geometryVersion===mother.previousAnalysis?.geometryVersion?mother.previousAnalysis:mother.legacyAnalysis||mother.analysis;
      const next=SeriesLayout.upgradePreservation(source,previous,mother.analysis,mother.src,mother.src,preserve);next.meta.seriesLayout.backgroundRevision=mother.backgroundRevision||1;
      await saveProject(next);changed=true;
      if(live&&currentWorkId===output.workId&&activeModule==='sku'){
        // Re-read any edit made while the record was saving before replacing the
        // visible canvas. A repair must never discard a late text/drag operation.
        const latest=getDocument(),final=historyFingerprint(latest)===historyFingerprint(source)?next:SeriesLayout.upgradePreservation(latest,previous,mother.analysis,mother.src,mother.src,preserve);final.meta.seriesLayout.backgroundRevision=mother.backgroundRevision||1;
        contextSwitchDepth++;try{await loadDocument(final,{save:false});await saveDraft();}finally{contextSwitchDepth--;}
      }
    }
    return changed;
  }
  function refreshStoredTemplate(){
    if(templateRefresh?.mother===state.mother)return templateRefresh.promise;
    const entry={mother:state.mother,promise:null};entry.promise=refreshStoredTemplateNow().finally(()=>{if(templateRefresh===entry)templateRefresh=null;});templateRefresh=entry;return entry.promise;
  }
  async function refreshStoredTemplateNow(){
    const mother=state.mother;if(!mother?.template||!mother.layoutWorkId)return false;
    await document.fonts?.ready;
    const upgradedAnalysis=await cachedAnalysisUpgrade(mother);
    const record=await read('edit-record:'+mother.layoutWorkId);if(state.mother!==mother)return false;
    const old=mother.template,current=currentWorkId===mother.layoutWorkId&&!suspendSave;
    const recordTime=Math.max(savedTime(record?.meta?.savedAt),savedTime(editRecords.find(r=>r.id===mother.layoutWorkId)?.updatedAt));
    const stateTime=savedTime(mother.templateUpdatedAt)||savedTime(old.meta?.savedAt);
    const useRecord=record?.meta?.workId===mother.layoutWorkId&&record?.meta?.seriesLayout&&(recordTime>stateTime||(!stateTime&&recordTime));
    // A live canvas is the user's latest edit. Otherwise prefer a newer saved work,
    // never overwrite it with the independent series-state snapshot during migration.
    const source=current?{...editor.getProject(),selectedId:null,meta:{...clone(old.meta),seriesLayout:clone(currentSeriesLayoutMeta||old.meta.seriesLayout)}}:clone(useRecord?record:old);
    const migration=migrateCachedLayout(source,mother.analysis,upgradedAnalysis),repair=SeriesLayout.repairTemplate(migration.project),next=repair.project;next.selectedId=null;
    if(repair.changed||migration.changed){const key='series-text-repair-backup:'+mother.layoutWorkId;if(!await read(key))await historyDB('readwrite',s=>s.put(clone(source),key));if(current&&migration.changed)for(const layer of next.layers.filter(l=>l.type==='image'))await editor._image(layer.src);if(state.mother!==mother)return false;if(current!==(currentWorkId===mother.layoutWorkId&&!suspendSave)||(current&&templateFingerprint(editor.getProject())!==templateFingerprint(source)))return refreshStoredTemplateNow();}
    next.meta={...next.meta,workId:mother.layoutWorkId};
    const protectedOriginal=await protectStoredTemplate(mother,next);if(state.mother!==mother)return false;
    if(protectedOriginal&&current&&templateFingerprint(editor.getProject())!==templateFingerprint(source))return refreshStoredTemplateNow();
    if(protectedOriginal)for(const src of editor._sceneSources(next.layers))await editor._image(src);
    const changed=templateFingerprint(next)!==templateFingerprint(old),reconciled=reconcileSlots(next);
    mother.template=next;for(const update of migration.rowUpdates||[]){const row=state.rows.find(r=>r.id===update.rowId);if(row)Object.assign(row.values||(row.values={}),update.values);}if(upgradedAnalysis)mother.analysis=upgradedAnalysis;if(protectedOriginal){mother.legacyAnalysis||=protectedOriginal.previous;mother.previousAnalysis=protectedOriginal.previous;mother.analysis=protectedOriginal.analysis;}if(changed)mother.templateUpdatedAt=new Date().toISOString();
    if(current){
      currentSeriesLayoutMeta=clone(next.meta.seriesLayout);
      if(repair.changed||migration.changed||protectedOriginal){editor.beginBatch();try{if(migration.changed||protectedOriginal)editor.state.layers=clone(next.layers);else for(const id of repair.repairedIds){const layer=next.layers.find(l=>l.id===id);if(layer)editor.update(id,layer,false);}editor.commit();}finally{editor.endBatch();}}
    }
    if((migration.changed||protectedOriginal)&&state.batch?.template&&templateFingerprint(state.batch.template)===templateFingerprint(source)){if(await batchHasSavedResults(state.batch)){state.batch.requiresRegeneration=true;if(active(state.batch))state.batch.status='paused';}else state.batch.template=clone(next);}
    const needsRecord=!record||templateFingerprint(record)!==templateFingerprint(next)||JSON.stringify(record.meta?.seriesLayout)!==JSON.stringify(next.meta?.seriesLayout);
    if(needsRecord){next.meta.savedAt=new Date().toISOString();await saveProject(next);}
    if(changed||reconciled||upgradedAnalysis||JSON.stringify(old)!==JSON.stringify(next))await persist();
    const outputsRepaired=await repairStoredOutputs();return repair.changed||migration.changed||!!protectedOriginal||outputsRepaired;
  }
  async function repairFrozenBatch(){
    const batch=state.batch;if(!batch?.template)return false;
    const repair=SeriesLayout.repairTemplate(batch.template);
    if(!repair.changed){batch.template=repair.project;return false;}
    const hasResults=await batchHasSavedResults(batch);
    if(hasResults){
      // Keep completed and manually edited works intact. Replacing only the frozen
      // template would mix two layouts in one batch when failed rows resume.
      batch.requiresRegeneration=true;if(active(batch))batch.status='paused';
    }else{batch.template=repair.project;delete batch.requiresRegeneration;}
    await persist();return hasResults;
  }
  function textSlots(){const doc=template();return doc?doc.layers.filter(l=>l.type==='text'&&l.groupId?.startsWith('series-slot:')).map(l=>({id:l.groupId.slice(12),label:l.name||'文案',text:l.text,role:doc.meta?.seriesLayout?.slots?.find(s=>s.id===l.groupId.slice(12))?.role||l.role})):[];}
  function running(){return active(state.batch)||active(backgroundGenerationPlans.get(state.planId));}
  function install(){
    const box=document.createElement('div');box.innerHTML=`
    <div class="segmented series-mode" aria-label="SKU 制作方式"><button id="skuFreeMode" type="button">自由生图</button><button id="skuSeriesMode" type="button">同系列母图批量</button></div>
    <div id="seriesPanel" class="series-panel hidden"><fieldset id="seriesFields">
    <section class="series-step"><h3><span>1</span>选定母图</h3><p id="seriesMotherHint" class="note">上传图片作为这一组的母图，也可使用已有的 AI 成图。</p>
    <button id="seriesUploadMother" type="button" class="btn full series-mother-upload">点击/拖拽，也可粘贴图片</button><input id="seriesMotherFile" type="file" accept="image/png,image/jpeg,image/webp" hidden>
    <button id="seriesUseCurrent" type="button" class="btn full">使用当前 AI 任务的第一张图</button>
    <button id="seriesMasterCard" class="series-master-card hidden" type="button" title="在画布查看或校正母图"><img id="seriesMasterPreview" alt="母图预览"><span><strong id="seriesMotherTitle">已选定第一张 AI 成图</strong><span id="seriesMotherNote">点击查看母图</span></span></button>
    <div id="seriesMotherActions" class="series-actions hidden"><button id="seriesViewMother" type="button" class="btn">在画布校正</button><button id="seriesNewMother" type="button" class="btn">更换母图</button></div></section>
    <section id="seriesVariants" class="series-step hidden"><h3><span>2</span>逐行替换内容</h3>
    <div id="seriesRows"></div><div class="series-actions"><button id="seriesAddRow" class="btn" type="button">添加一行</button></div></section>
    <button id="seriesGenerate" type="button" class="btn primary full hidden">识别并固定母图排版</button><button id="seriesRetry" type="button" class="btn full hidden">重试未完成行</button>
    <p id="seriesReviewNote" class="note hidden"></p>
    </fieldset><div id="seriesStatus" class="series-status" role="status" aria-live="polite"></div><div id="seriesResults" class="series-results"></div></div>`;
    el('module-sku').prepend(box);
    el('seriesFields').disabled=true;el('skuFreeMode').disabled=true;el('skuSeriesMode').disabled=true;
    el('skuFreeMode').onclick=()=>run(async()=>{state.mode='free';await persist();});
    el('skuSeriesMode').onclick=()=>run(enterSeries);
    el('seriesUseCurrent').onclick=()=>run(()=>adoptCurrent(true));
    const upload=el('seriesUploadMother'),motherFile=el('seriesMotherFile');
    upload.onclick=()=>motherFile.click();
    motherFile.onchange=()=>{const file=motherFile.files[0];motherFile.value='';if(file)run(()=>importMother(file));};
    upload.ondragover=event=>{event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect=busy?'none':'copy';upload.classList.toggle('dragging',!busy);};
    upload.ondragleave=()=>upload.classList.remove('dragging');
    upload.ondrop=event=>{event.preventDefault();event.stopPropagation();upload.classList.remove('dragging');const file=[...event.dataTransfer.files].find(file=>file.type.startsWith('image/')||/\.(png|jpe?g|webp)$/i.test(file.name));if(file)run(()=>importMother(file));};
    document.addEventListener('paste',event=>{if(activeModule!=='sku'||state.mode!=='series'||event.target.closest('input:not([type="file"]),textarea,[contenteditable="true"]')||document.querySelector('dialog[open]'))return;const file=[...(event.clipboardData?.items||[])].find(item=>item.kind==='file'&&item.type.startsWith('image/'))?.getAsFile();if(!file)return;event.preventDefault();event.stopImmediatePropagation();run(()=>importMother(file));},true);
    el('seriesNewMother').onclick=()=>motherFile.click();
    el('seriesMasterCard').onclick=el('seriesViewMother').onclick=()=>run(openMother);
    el('seriesAddRow').onclick=()=>run(async()=>{if(state.rows.length>=100)throw Error('每批最多 100 行。');captureTemplate();state.rows.push(newRow());await persist();renderRows();});
    el('seriesRows').oninput=e=>{const slot=e.target.dataset.slot;if(!slot)return;const row=state.rows.find(r=>r.id===e.target.closest('[data-row]').dataset.row);if(row){row.values||={};row.values[slot]=e.target.value;scheduleSave();}};
    el('seriesRows').onchange=e=>{if(e.target.type!=='file')return;const file=e.target.files[0],id=e.target.closest('[data-row]').dataset.row,imageSlot=e.target.dataset.imageSlot,productSlot=e.target.dataset.productSlot;e.target.value='';if(file)run(async()=>{if(imageSlot){const src=await readImageFile(file),row=state.rows.find(r=>r.id===id);if(row){row.images||={};row.images[imageSlot]=src;await persist();renderRows();}return;}const data=await product(file),row=state.rows.find(r=>r.id===id);if(row){if(productSlot){row.products||={};row.products[productSlot]=data.productSrc;row.productFactsBySlot||={};row.productFactsBySlot[productSlot]=data.productFacts;}else Object.assign(row,data,{fileName:file.name});await persist();renderRows();status(data.factWarning||'商品已更新，包装保持上传素材原样。',!!data.factWarning);}});};
    el('seriesRows').onclick=e=>{const b=e.target.closest('[data-remove]');if(b)run(async()=>{state.rows=state.rows.filter(r=>r.id!==b.dataset.remove);await persist();renderRows();});};
    el('seriesGenerate').onclick=()=>run(()=>template()?generate(false):prepareMother());el('seriesRetry').onclick=()=>run(()=>generate(true));
    el('seriesResults').onclick=e=>{const b=e.target.closest('[data-output]');if(b)run(async()=>{captureTemplate();await persist();await restoreEditRecord(b.dataset.output);});};
    new MutationObserver(sync).observe(el('module-sku'),{attributes:true,attributeFilter:['class']});new MutationObserver(sync).observe(document.querySelector('.ai-card'),{attributes:true,attributeFilter:['class']});
    const previous=editor.onChange;editor.onChange=function(...args){previous.apply(this,args);if(loaded&&!suspendSave&&!historyRestoring&&currentWorkId===state.mother?.layoutWorkId){clearTimeout(canvasTimer);canvasTimer=setTimeout(()=>{if(captureTemplate())scheduleSave();},400);}};
    window.addEventListener('beforeunload',()=>{if(!loaded)return;const changed=captureTemplate();if(changed||saveTimer||canvasTimer)persist().catch(()=>{});});
  }
  function sync(){
    if(!loaded)return;const series=state.mode==='series',has=!!state.mother,ready=!!template(),inProgress=running();
    el('seriesPanel').classList.toggle('hidden',!series);el('seriesFields').disabled=busy;document.body.classList.toggle('series-mother-stage',activeModule==='sku'&&series&&!has);document.body.classList.toggle('series-fixed-mode',activeModule==='sku'&&series&&has);
    for(const [id,selected] of [['skuFreeMode',!series],['skuSeriesMode',series]]){el(id).classList.toggle('active',selected);el(id).setAttribute('aria-pressed',String(selected));el(id).disabled=busy;}
    if(activeModule==='sku'){const hide=series,card=document.querySelector('.ai-card');if(card.classList.contains('hidden')!==hide)card.classList.toggle('hidden',hide);el('primaryInputCard').classList.toggle('hidden',hide);}
    el('seriesGenerate').classList.toggle('hidden',!has);el('seriesGenerate').disabled=busy||inProgress||(ready&&!state.rows.length);el('seriesGenerate').textContent=busy?'处理中…':!ready?'识别并固定母图排版':inProgress?'正在合成…':'按固定排版生成 '+state.rows.length+' 张';
    el('seriesRetry').classList.toggle('hidden',!state.batch||!['paused','finished'].includes(state.batch.status)||state.batch.items.every(i=>i.status==='succeeded'));
    el('seriesNewMother').disabled=busy||inProgress;el('seriesViewMother').textContent=ready?'在画布校正':'查看母图';el('seriesReviewNote').classList.toggle('hidden',!ready);
  }
  function render(){
    const has=!!state.mother;el('seriesMasterCard').classList.toggle('hidden',!has);el('seriesMotherActions').classList.toggle('hidden',!has);el('seriesVariants').classList.toggle('hidden',!template());el('seriesUseCurrent').classList.toggle('hidden',has);el('seriesMotherHint').classList.toggle('hidden',has);
    el('seriesUploadMother').classList.toggle('hidden',has);
    if(has)el('seriesMasterPreview').src=state.mother.src;el('seriesMotherTitle').textContent=template()?'母图排版已固定':'已选定母图';el('seriesMotherNote').textContent=template()?'点击在画布校正 · 改动自动保存':'点击查看原图';renderRows();renderResults();sync();
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
      primary.forEach(s=>add(s,node));const more=slots.filter(s=>!primary.includes(s)),bindings=template()?.meta?.seriesLayout?.slots||[],images=bindings.filter(s=>s.kind==='image'),otherProducts=bindings.filter(s=>s.kind==='product').slice(1);if(more.length||images.length||otherProducts.length){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent=(otherProducts.length?'其他文案、商品与图标':'其他文案与图标')+' · '+(more.length+images.length+otherProducts.length)+' 项';details.append(summary);more.forEach(s=>add(s,details));for(const s of [...otherProducts,...images]){const label=document.createElement('label');label.className='series-upload';label.textContent='替换'+s.label;const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';if(s.kind==='product')input.dataset.productSlot=s.id;else input.dataset.imageSlot=s.id;input.setAttribute('aria-label','第 '+(i+1)+' 行'+s.label);label.append(input);details.append(label);}node.append(details);}
      const msg=document.createElement('p');msg.dataset.rowStatus='';node.append(msg);box.append(node);
    });renderRowStatuses();sync();
  }
  function renderRowStatuses(){for(const node of el('seriesRows').children){const item=state.batch?.items.find(i=>i.row.id===node.dataset.row),msg=node.querySelector('[data-row-status]');msg.hidden=!item;if(!item)continue;msg.className=item.status==='failed'||item.warnings?.length?'series-error':'note';msg.textContent=({pending:'等待合成',running:'正在合成',succeeded:item.warnings?.length?'已保存，待核对：'+item.warnings.join('；'):'已生成，可在画布编辑',failed:item.error||'生成失败'})[item.status]||'';}}
  function renderResults(){el('seriesResults').replaceChildren();for(const o of state.outputs){const rec=editRecords.find(r=>r.id===o.workId);if(!rec)continue;const b=document.createElement('button');b.className='series-result';b.type='button';b.dataset.output=o.workId;b.title='在画布编辑 '+o.name;const im=document.createElement('img');im.src=rec.preview;im.alt=o.name;const text=document.createElement('span');text.textContent=o.name;b.append(im,text);el('seriesResults').append(b);}}
  function captureTemplate(){clearTimeout(canvasTimer);canvasTimer=null;if(!template()||currentWorkId!==state.mother.layoutWorkId||suspendSave)return false;const old=template(),next={...editor.getProject(),selectedId:null,meta:clone(old.meta)};for(const layer of next.layers){if(layer.role==='series-background'||layer.groupId?.startsWith('series-slot:')||!['text','image'].includes(layer.type))continue;const id=uuid();layer.groupId='series-slot:'+id;const actual=editor.state.layers.find(l=>l.id===layer.id);if(actual)actual.groupId=layer.groupId;next.meta.seriesLayout.slots.push({id,layerId:layer.id,kind:layer.type==='text'?'text':'image',role:'other',label:layer.name||'新增内容',minFontScale:.85});}const reconciled=reconcileSlots(next);if(JSON.stringify(next)===JSON.stringify(old)&&!reconciled)return false;state.mother.template=next;state.mother.templateUpdatedAt=new Date().toISOString();currentSeriesLayoutMeta=next.meta.seriesLayout;if(!el('seriesRows').contains(document.activeElement))renderRows();return true;}
  async function saveProject(doc){for(const src of editor._sceneSources(doc.layers))await editor._image(src);if(!await saveEditRecord(doc))throw Error(lastSaveError||'图片保存失败，请检查浏览器存储。');}
  async function openMother(){if(!state.mother)return;captureTemplate();await persist();await saveBeforeSwitch();if(template()){await refreshStoredTemplate();await loadDocument(clone(template()),{save:false});await saveDraft();}else if(state.mother.source==='upload'){const doc=await read('edit-record:'+state.mother.sourceOutputWorkId);if(!doc)throw Error('母图记录不可用。');contextSwitchDepth++;try{await loadDocument(doc,{save:false});await saveDraft();}finally{contextSwitchDepth--;}}else{const plan=await readImageBatch(state.mother.planId);if(!plan?.items[0]?.result)throw Error('母图记录不可用。');await insertImageBatchResults(plan,[plan.items[0]]);}renderRows();}
  async function importMother(file){
    if(running())throw Error('请等待当前批次完成。');
    if(!canSwitchWorkspace())return;
    const src=await readImageFile(file),size=await dimensions(src);
    if(imageBytes(src)>10*1024*1024)throw Error('母图超过 10 MB，请使用较小尺寸。');
    await saveBeforeSwitch();captureTemplate();await persist();
    const id=uuid(),sessionId='upload-'+uuid(),name=file.name||'粘贴的母图';
    const doc={...clone(getDocument()),width:size.w,height:size.h,selectedId:null,background:{type:'solid',color:'#ffffff'},layers:[editor._layer({type:'image',src,x:0,y:0,w:size.w,h:size.h,name,role:'base'})]};
    doc.meta={...doc.meta,workId:id,batchId:id,imageKey:await imageContentKey(src),referenceBatchId:id,sourceKind:'uploaded',sourceName:name,name:name.replace(/\.(png|jpe?g|webp)$/i,''),sourceOrder:Date.now(),batchAI:null,seriesLayout:null,module:'sku'};
    await saveProject(doc);
    state={...freshState('series'),sessionId,seenGenerationPlanId:currentGenerationPlan()?.id||null,mother:{source:'upload',src,width:size.w,height:size.h,sourceOutputWorkId:id,document:{...clone(doc),layers:[]}},rows:[newRow()]};
    await persist();contextSwitchDepth++;try{await loadDocument(doc,{save:false});await saveDraft();}finally{contextSwitchDepth--;}
    render();status('母图已选定，点击“识别并固定母图排版”。');
  }
  async function adopt(plan){
    const first=plan?.items?.[0];if(!first||first.status!=='succeeded'||!first.result?.src||plan.module!=='sku'||plan.kind==='series-edit')throw Error('请先生成第一张完整 AI 图片。');
    const size=await dimensions(first.result.src);if(imageBytes(first.result.src)>10*1024*1024)throw Error('母图超过 10 MB，请使用较小尺寸。');
    if(state.mother?.planId===plan.id&&state.mother.requestId===first.requestId)return;
    captureTemplate();await persist();const mode=state.mode;state={...freshState(mode),sessionId:plan.id,seenGenerationPlanId:plan.id,mother:{src:first.result.src,planId:plan.id,requestId:first.requestId,sourceOutputWorkId:first.outputWorkId||null,sourceBatchId:plan.sourceBatchId,width:size.w,height:size.h,document:clone({...first.document,layers:[]})},motherPlanId:plan.id,rows:[newRow()]};await persist();render();status('母图已选定，点击“识别并固定母图排版”。');
  }
  async function adoptCurrent(required){if(await selectCurrentMother({show:true}))return;if(required)throw Error('当前没有可用的 AI 成图，请上传母图，或到自由生图生成图片。');}
  async function service(layout=false){await checkAIService();if(!aiConnected||!aiIdempotentJobs)throw Error('生图服务未就绪，请稍后重试。');if(layout){const r=await fetch(aiAPI+'/api/health',{cache:'no-store'}),h=await r.json();if(!h.seriesLayout)throw Error('固定排版服务尚未更新，请重启图片工作台服务后重试。');}}
  async function api(path,data){const r=await fetch(aiAPI+path,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json','X-Workbench-Token':aiSessionToken}:{},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(180000),cache:'no-store'});let value;try{value=await r.json();}catch{throw Error('服务返回异常，请稍后继续。');}if(!r.ok)throw Error(value.error||'服务暂不可用，请稍后继续。');return value;}
  async function prepareBackground(mother){
    let job=mother.prepareId&&(mother.prepareRevision>=2||mother.backgroundRevision>=2)&&!mother.retryable?await api('/api/series/jobs/'+mother.prepareId):await api('/api/series/prepare',{image:mother.src,slots:mother.analysis.slots,backgroundRevision:2,retry:mother.retryable===true});mother.retryable=false;mother.prepareId=job.id;mother.prepareRevision=job.backgroundRevision||1;await persist();
    const start=Date.now();while(['queued','running'].includes(job.status)){if(Date.now()-start>15*60*1000)throw Error('母图仍在处理中，稍后再次点击即可继续读取，不会重复生成。');await new Promise(r=>setTimeout(r,1600));job=await api('/api/series/jobs/'+mother.prepareId);}
    if(job.status!=='succeeded'||!job.backgroundSrc){mother.retryable=job.retryable===true;await persist();throw Error(job.error||'母图底图暂不可用，请稍后重试。');}
    return job;
  }
  async function ensureProductBackground(){
    const mother=state.mother;if(!mother||mother.backgroundRevision>=2&&template()?.meta?.seriesLayout?.backgroundRevision>=2)return;
    const changed=state.rows.some(row=>row.productSrc||Object.values(row.products||{}).some(Boolean))||template().layers.some(layer=>layer.role==='series-product'&&layer.visible!==false&&!SeriesLayout.unchanged(template(),layer));if(!changed)return;
    status('正在为这张旧母图升级商品替换底图，仅准备一次，之后各行直接复用。');await service(true);const job=await prepareBackground(mother);
    if(job.backgroundRevision<2)throw Error('商品替换服务已更新，请刷新网页后再生成。');
    const regions=await api('/api/series/preserve',{image:mother.src,background:job.backgroundSrc,slots:mother.analysis.slots});captureTemplate();if(state.mother!==mother)throw Error('当前母图已切换，请重新生成。');
    mother.template=SeriesLayout.upgradePreservation(template(),mother.analysis,mother.analysis,job.backgroundSrc,mother.src,regions);mother.template.meta.seriesLayout.backgroundRevision=2;mother.backgroundRevision=2;
    await saveProject(mother.template);await persist();if(currentWorkId===mother.layoutWorkId){contextSwitchDepth++;try{await loadDocument(clone(mother.template),{save:false});await saveDraft();}finally{contextSwitchDepth--;}}await repairStoredOutputs();
  }
  async function prepareMother(){
    if(!state.mother)throw Error('请先选定母图。');await service(true);await saveBeforeSwitch();const mother=state.mother,originWork=currentWorkId,originFingerprint=historyFingerprint(getDocument());status('正在识别母图中的商品、文案与排版…');
    if(!mother.analysis||mother.analysis.geometryVersion<requiredGeometry(mother.analysis)||mother.analysis.layoutRevision<5){mother.analysis=await api('/api/series/analyze',{image:mother.src});await persist();}
    status('正在准备商品替换底图；母图原画和未改动的文字、图标保持原样。');
    const job=await prepareBackground(mother);
    const health=await api('/api/health'),preserve=health.seriesPreserveVersion===1?await api('/api/series/preserve',{image:mother.src,background:job.backgroundSrc,slots:mother.analysis.slots}):null;
    const doc=SeriesLayout.buildTemplate({...mother.analysis,backgroundSrc:job.backgroundSrc,originalSrc:mother.src,preserve});mother.backgroundRevision=job.backgroundRevision||1;doc.meta.seriesLayout.backgroundRevision=mother.backgroundRevision;mother.layoutWorkId||=uuid();doc.meta={...mother.document.meta,...doc.meta,workId:mother.layoutWorkId,batchId:mother.layoutWorkId,module:'sku',sourceKind:'generated',sourceName:'母图排版',name:'母图排版',sourceOrder:Date.now(),batchAI:null};mother.template=doc;
    const slots=textSlots();for(const r of state.rows){r.values||={};for(const s of slots){if(s.role==='spec'&&r.spec)r.values[s.id]=r.spec;if(s.role==='name'&&r.productName)r.values[s.id]=r.productName;}delete r.spec;delete r.productName;}
    await saveProject(doc);await persist();render();if(currentWorkId===originWork&&activeModule==='sku'&&historyFingerprint(getDocument())===originFingerprint){await loadDocument(clone(doc),{save:false});await saveDraft();}
    status('');toast('排版已固定。请先核对画布，文字和商品可直接拖动、缩放；确认后填写各行并生成。',false,8000);
  }
  async function product(file){status('正在抠除商品背景并核对包装…');const original=await readImageFile(file),src=await cutoutGiftSource(original);let facts=null,warning='';try{await service(true);facts=await api('/api/series/product-facts',{image:original});}catch{warning='包装文字未能自动核对，请核对商品容量后使用。';}return{productSrc:src,productFacts:facts,factWarning:warning};}
  async function importRows(files){if(state.rows.length+files.length>100)throw Error('每批最多 100 行。');const errors=[];for(const file of files){try{state.rows.push({...newRow(),...await product(file),fileName:file.name});await persist();}catch(e){errors.push(file.name+'：'+e.message);}}renderRows();status(errors.length?errors.join('\n'):'商品已添加，请修改需要替换的文案。',!!errors.length);}
  function rowName(row,index){const slots=textSlots(),name=slots.find(s=>s.role==='name'),spec=slots.find(s=>s.role==='spec');return [name?(row.values?.[name.id]??name.text):'',spec?(row.values?.[spec.id]??spec.text):''].filter(Boolean).join(' · ').slice(0,100)||'系列图片 '+(index+1);}
  async function generate(retry){
    await updates.catch(()=>{});if(!template())return prepareMother();finishInlineText();captureTemplate();await saveBeforeSwitch();if(running())return;await refreshStoredTemplate();await ensureProductBackground();
    if(!retry){const typography=SeriesLayout.normalizeTypography(template(),state.rows);if(typography.changed){state.mother.template=typography.project;await saveProject(template());await persist();if(currentWorkId===state.mother.layoutWorkId){contextSwitchDepth++;try{await loadDocument(clone(template()),{save:false});await saveDraft();}finally{contextSwitchDepth--;}}}}
    if(retry){if(!state.batch)return;await repairFrozenBatch();if(state.batch.requiresRegeneration)throw Error('母图文字已自动修复，请点击“按固定排版生成”重新生成整批；原有结果和编辑会保留。');if(templateFingerprint(state.batch.template)!==templateFingerprint(template()))throw Error('母图排版已修改，请重新生成整批，确保每行版式一致。');state.batch.items=state.batch.items.filter(i=>i.status==='succeeded'||state.rows.some(r=>r.id===i.row.id));for(const item of state.batch.items.filter(i=>i.status!=='succeeded')){const index=state.rows.findIndex(r=>r.id===item.row.id),current=state.rows[index];item.row=clone(current);item.name=rowName(current,index);item.status='pending';delete item.error;}}
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
  function planChanged(plan){if(!loaded)return;const candidate=motherPlan(plan)&&state.mode==='free'&&batchMatchesWorkspace(plan)&&plan.id!==state.mother?.planId&&Date.parse(plan.createdAt)>=startedAt;
    if(!candidate&&![state.planId,state.motherPlanId].includes(plan.id))return;updates=updates.catch(()=>{}).then(async()=>{if(candidate&&state.mode==='free'&&batchMatchesWorkspace(plan)){state.pendingMother={planId:plan.id,workId:currentWorkId,scope:referenceBatchId()};await persist();}if([state.planId,state.motherPlanId].includes(plan.id))await handlePlan(plan);}).catch(e=>status('结果读取失败：'+e.message,true));}
  async function handlePlan(plan){
    if(plan.id===state.motherPlanId&&!state.mother){if(plan.items[0]?.status==='succeeded'){await adopt(plan);if(activeModule==='sku'&&state.mode==='series'&&batchMatchesWorkspace(plan))await showOriginalMother(plan);}else if(plan.status==='paused'||plan.items[0]?.status==='failed')status(plan.error||plan.items[0].error||'母图生成失败，请重试。',true);sync();return;}
    if(plan.id!==state.planId||state.batch)return;
    for(const item of batchSuccessfulItems(plan)){if(state.outputs.some(o=>o.workId===item.outputWorkId))continue;const existing=await read('edit-record:'+item.outputWorkId);if(!existing)await saveProject(await batchOutputDocument(plan,item,plan.items.indexOf(item)));if(plan.id!==state.planId)return;state.outputs.push({workId:item.outputWorkId,name:item.name});await persist();}renderResults();sync();
  }
  async function init(){while(!window.appReady)await new Promise(r=>setTimeout(r,50));install();const saved=await read(KEY);if(saved)state={...state,...saved,version:4};else{const old=await read('series-workbench:sku');if(old?.mode==='series')state.mode='series';}if(state.batch?.status==='running')state.batch.status='paused';if(activeModule==='sku')await selectCurrentMother({show:state.mode==='series'});const repaired=activeModule==='sku'?await refreshStoredTemplate():false,regenerate=activeModule==='sku'?await repairFrozenBatch():false;if(reconcileSlots(template()))await persist();loaded=true;render();for(const id of new Set([state.planId,state.motherPlanId].filter(Boolean))){const p=await readImageBatch(id);if(p){backgroundGenerationPlans.set(id,p);planChanged(p);}}if(template())status(regenerate?'母图文字已自动修复；请重新生成整批，原有结果和编辑会保留。':repaired?'母图文字已自动修复，可在画布核对后按行生成。':'排版已固定，可在画布校正后按行生成。');}
  window.SeriesWorkbench={sync,workspaceChanged,flush:()=>{if(!loaded)return Promise.resolve();captureTemplate();return persist();},planChanged};init().catch(e=>{console.error(e);if(el('skuSeriesMode')){loaded=true;render();status('母图处理未完成，原图与编辑已保留：'+e.message,true);}toast('母图批量加载失败：'+e.message,true);});
})();
