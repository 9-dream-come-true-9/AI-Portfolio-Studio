/* Per-module workspaces and one persisted job per uploaded image. */
var imageBatchExecution=null,imageBatchPlans={},imageBatchPreview=null,imageBatchPreviewIndex=0,aiIdempotentJobs=false;
var imageBatchQueue=[],generationPreparing=new Set(),backgroundGenerationPlans=new Map(),generationPlanByScope=new Map(),generationSettingsCache={},generationSettingsLoaded=new Set();
const IMAGE_BATCH_ACTIVE='chun-active-image-batch';
const copyBatchValue=value=>JSON.parse(JSON.stringify(value));
function imageBatchKey(module){return 'chun-image-batch:'+module;}
function pendingImageBatch(){try{return localStorage.getItem(IMAGE_BATCH_ACTIVE)||'';}catch{return '';}}
async function readImageBatch(id){if(!id)return null;return historyDB('readonly',(store,done)=>{const r=store.get('image-batch:'+id);r.onsuccess=()=>done(r.result||null);});}
async function saveImageBatch(plan){await historyDB('readwrite',store=>store.put(plan,'image-batch:'+plan.id));imageBatchPlans[plan.module]=plan;generationPlanByScope.set(plan.module+':'+plan.sourceBatchId,plan);backgroundGenerationPlans.set(plan.id,plan);window.SeriesWorkbench?.planChanged?.(plan);}
async function loadModuleBatch(module,batchId=null){if(module===activeModule&&batchId===currentBatchId)batchId=referenceBatchId();const until=Date.now()+10000;while(!db&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,25));if(!db)throw Error('浏览器存储未就绪。');let id='';try{id=localStorage.getItem(batchId?imageBatchKey(module)+':'+batchId:imageBatchKey(module))||'';}catch{}imageBatchPlans[module]=await readImageBatch(id);const plan=imageBatchPlans[module];if(plan){generationPlanByScope.set(module+':'+plan.sourceBatchId,plan);backgroundGenerationPlans.set(plan.id,plan);}if(batchId)await loadGenerationSettings(module,batchId);return plan;}
function batchMatchesWorkspace(plan){return plan&&plan.module===activeModule&&plan.sourceBatchId===referenceBatchId();}
function imageBatchSummary(plan){const completed=plan.items.filter(item=>item.status==='succeeded').length,failed=plan.items.filter(item=>item.status==='failed').length;return{completed,failed,total:plan.items.length};}

async function switchModuleWorkspace(module){
  if(module===activeModule)return;
  if(!canSwitchWorkspace())return;
  historyRestoring=true;setWorkspaceLocked(true);
  try{
    await saveBeforeSwitch();
    const doc=await historyDB('readonly',(store,done)=>{const r=store.get('module-workspace:'+module);r.onsuccess=()=>done(r.result);});
    await loadModuleBatch(module);
    if(doc&&doc.meta?.module===module&&(!doc.layers.length||editRecords.some(record=>record.id===doc.meta.workId&&recordBelongsToModule(record,module))))await loadDocument(doc,{save:false});
    else{await emptyWorkspace();setModule(module);await saveDraft();}
    localStorage.setItem('chun-active-module',module);await loadModuleBatch(module,currentBatchId);renderSources();
  }finally{historyRestoring=false;setWorkspaceLocked(false);renderEditHistory();renderSources();}
}
async function initializeModuleWorkspaces(){
  const until=Date.now()+10000;while(!window.appReady&&!window.workbenchStorageReady&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,25));
  if(!db)return;let module=activeModule,remembered=null;
  try{remembered=localStorage.getItem('chun-active-module');}catch{}
  if(modules[remembered])module=remembered;
  else{const recent=editRecords.find(record=>Object.keys(modules).some(key=>recordBelongsToModule(record,key)));if(recent)module=Object.keys(modules).find(key=>recordBelongsToModule(recent,key))||module;}
  let doc=await historyDB('readonly',(store,done)=>{const r=store.get('module-workspace:'+module);r.onsuccess=()=>done(r.result);});
  const available=value=>value?.meta?.module===module&&(!value.layers.length||editRecords.some(record=>record.id===value.meta.workId&&recordBelongsToModule(record,module)));
  if(!available(doc)){
    const recent=editRecords.find(record=>recordBelongsToModule(record,module));
    if(recent)doc=await historyDB('readonly',(store,done)=>{const r=store.get('edit-record:'+recent.id);r.onsuccess=()=>done(r.result);});
  }
  if(available(doc))await loadDocument(doc,{save:false});else setModule(module);
  renderEditHistory();
}

function renderImageNavigation(){
  const records=batchImages(),index=records.findIndex(record=>record.id===currentWorkId),multiple=records.length>1,locked=imageRemovalDisabled();
  $('previousImage').classList.toggle('hidden',!multiple);$('nextImage').classList.toggle('hidden',!multiple);$('imagePager').classList.toggle('hidden',!multiple);
  $('previousImage').disabled=locked||index<=0;$('nextImage').disabled=locked||index<0||index>=records.length-1;
  $('imagePager').textContent=multiple?(index+1)+' / '+records.length:'';
  renderBatchControls();
}
async function moveWorkspaceImage(offset){
  const records=batchImages(),index=records.findIndex(record=>record.id===currentWorkId),target=records[index+offset];
  if(!target||!canSwitchWorkspace())return;
  const module=activeModule,modes={gift:giftMode,...creationModes};
  historyRestoring=true;setWorkspaceLocked(true);
  try{
    await saveBeforeSwitch();const doc=await historyDB('readonly',(store,done)=>{const r=store.get('edit-record:'+target.id);r.onsuccess=()=>done(r.result);});
    if(!doc||doc.meta?.module!==module)throw Error('这张图片不属于当前功能。');
    await loadDocument(doc,{save:false});giftMode=modes.gift;for(const key of Object.keys(creationModes))creationModes[key]=modes[key];setModule(module);await saveDraft();
  }finally{historyRestoring=false;setWorkspaceLocked(false);renderEditHistory();renderSources();}
}
function referenceBatchId(){return currentReferenceBatchId||currentBatchId;}
function sourceImages(){if(activeModule==='gift')return [];return editRecords.filter(r=>r.batchId===referenceBatchId()&&r.sourceKind!=='generated'&&r.hasSource!==false&&recordBelongsToModule(r,activeModule)).sort((a,b)=>(a.sourceOrder||new Date(a.createdAt).getTime())-(b.sourceOrder||new Date(b.createdAt).getTime()));}
function generationScope(module=activeModule,batch=referenceBatchId()){return module+':'+batch;}
function generationSettings(){
  const key=generationScope(),sources=sourceImages();let settings=generationSettingsCache[key];
  if(!settings)settings=generationSettingsCache[key]={mode:'auto',enabled:sources.length>1,count:Math.max(1,sources.length),drafts:[]};
  if(settings.mode==='auto'){const wasBatch=settings.enabled;settings.count=Math.max(1,sources.length);if(!wasBatch&&settings.count>1&&settings.drafts[0])settings.drafts[0].prompt=$('aiRequest').value;else if(wasBatch&&settings.count===1&&settings.drafts[0])$('aiRequest').value=settings.drafts[0].prompt;}
  if(settings.mode!=='auto'&&settings.drafts[0]){if(settings.enabled&&settings.count===1)$('aiRequest').value=settings.drafts[0].prompt;else if(!settings.enabled&&settings.count>1)settings.drafts[0].prompt=$('aiRequest').value;}
  settings.enabled=settings.count>1;
  const valid=new Set(sources.map(r=>r.id));
  for(let i=0;i<settings.count;i++){
    if(!settings.drafts[i])settings.drafts[i]={prompt:i===0?$('aiRequest').value:'',referenceId:sources.length?sources[i%sources.length].id:'none'};
    else if(!settings.drafts[i].referenceChosen)settings.drafts[i].referenceId=sources.length?sources[i%sources.length].id:'none';
    else if(settings.drafts[i].referenceId!=='none'&&!valid.has(settings.drafts[i].referenceId))settings.drafts[i].referenceId=sources.length?sources[i%sources.length].id:'none';
  }
  return settings;
}
async function persistGenerationSettings(){const key=generationScope(),value=copyBatchValue(generationSettings());generationSettingsLoaded.add(key);await historyDB('readwrite',store=>store.put(value,'generation-settings:'+key));}
async function loadGenerationSettings(module,batch){
  if(!batch)return;const key=generationScope(module,batch);if(generationSettingsLoaded.has(key))return;
  const saved=await historyDB('readonly',(store,done)=>{const r=store.get('generation-settings:'+key);r.onsuccess=()=>done(r.result);});
  if(!generationSettingsLoaded.has(key)){if(saved&&Array.isArray(saved.drafts))generationSettingsCache[key]=saved;generationSettingsLoaded.add(key);$('generationRequests').dataset.renderKey='';}
}
function renderGenerationForm(){
  if(typeof aiBusy==='undefined'||!db)return;
  const settings=generationSettings(),sources=sourceImages();$('generationCount').disabled=false;$('generationCount').value=settings.count;
  $('singleGenerationRequest').classList.toggle('hidden',settings.enabled);$('singleNegativeLabel').classList.toggle('hidden',settings.enabled);$('generationRequests').classList.toggle('hidden',!settings.enabled);
  const singleNegative=$('singleNegativePrompt'),scope=generationScope();if(document.activeElement!==singleNegative||singleNegative.dataset.scope!==scope)singleNegative.value=String(settings.drafts[0]?.negativePrompt||'');singleNegative.dataset.scope=scope;
  const list=$('generationRequests'),key=JSON.stringify([generationScope(),settings.enabled,settings.count,sources.map(r=>[r.id,r.fileName])]);
  if(list.dataset.renderKey!==key){
    list.dataset.renderKey=key;list.replaceChildren();
    if(settings.enabled)for(let i=0;i<settings.count;i++){
      const row=document.createElement('div');row.className='generation-request';const label=document.createElement('label');label.textContent='第'+(i+1)+'张生成要求';const input=document.createElement('textarea');input.rows=3;input.maxLength=8000;input.dataset.outputPrompt=String(i);input.value=settings.drafts[i].prompt;input.setAttribute('aria-label',label.textContent);
      input.addEventListener('input',()=>{generationSettings().drafts[i].prompt=input.value;persistGenerationSettings().catch(e=>toast(e.message,true));});label.append(input);row.append(label);
      const negativeLabel=document.createElement('label');negativeLabel.textContent='不希望生成的内容（反面提示词）';const negative=document.createElement('textarea');negative.rows=3;negative.maxLength=2000;negative.placeholder='例如：模糊、变形、多余文字';negative.dataset.outputNegative=String(i);negative.value=String(settings.drafts[i].negativePrompt||'');negative.setAttribute('aria-label','第'+(i+1)+'张不希望生成的内容（反面提示词）');negative.addEventListener('input',()=>{generationSettings().drafts[i].negativePrompt=negative.value;persistGenerationSettings().catch(e=>toast(e.message,true));});negativeLabel.append(negative);row.append(negativeLabel);
      const refLabel=document.createElement('label');refLabel.className='generation-reference-label';if(activeModule==='gift')refLabel.classList.add('hidden');refLabel.textContent='参考图片';const select=document.createElement('select');select.dataset.outputReference=String(i);select.setAttribute('aria-label','第'+(i+1)+'张参考图片');
      select.add(new Option('不使用参考图','none'));sources.forEach((source,index)=>select.add(new Option('第'+(index+1)+'张 · '+source.fileName,source.id)));select.value=settings.drafts[i].referenceId;
      select.addEventListener('change',()=>{const draft=generationSettings().drafts[i];draft.referenceChosen=true;draft.referenceId=select.value;persistGenerationSettings().catch(e=>toast(e.message,true));});refLabel.append(select);row.append(refLabel);list.append(row);
    }
  }
}
function currentGenerationPlan(){return generationPlanByScope.get(generationScope())||null;}
function renderBatchControls(){
  const button=$('generateBtn');if(!button||typeof aiBusy==='undefined'||!db)return;
  renderGenerationForm();const plan=currentGenerationPlan(),matching=batchMatchesWorkspace(plan),settings=generationSettings();
  const busy=matching&&['queued','running'].includes(plan.status)||generationPreparing.has(generationScope());
  button.disabled=!aiConnected||!!busy||(activeModule==='gift'&&giftUploading>0);button.textContent=busy?'正在生成 '+imageBatchSummary(plan||{items:[]}).completed+' / '+(plan?.items.length||settings.count):matching&&plan.status==='paused'?'继续生成任务':settings.enabled?'生成 '+settings.count+' 张图片':'生成图片';button.textContent+='🎯';
  if(matching&&plan){const s=imageBatchSummary(plan);$('aiProgress').textContent=plan.status==='finished'?`生成完成：成功 ${s.completed} / ${s.total} 张${s.failed?'，失败 '+s.failed+' 张。'+plan.items.filter(i=>i.status==='failed').map(i=>i.name+'：'+i.error).join('；'):''}`:plan.status==='paused'?'任务已暂停：'+plan.error:`后台生成：已完成 ${s.completed} / ${s.total} 张，可继续编辑或切换功能。`;}
  else $('aiProgress').textContent='';
  if(matching&&plan.items.some(i=>i.status==='succeeded')){$('viewAIResult').classList.remove('hidden');$('viewAIResult').textContent='查看AI生成结果';}
  else if(!aiLastResult||aiLastResult.batchId){$('viewAIResult').classList.add('hidden');}
  renderBackgroundTasks();
}
function activeGenerationIds(){let ids=[];try{ids=JSON.parse(localStorage.getItem('chun-active-image-batches')||'[]');const old=localStorage.getItem(IMAGE_BATCH_ACTIVE);if(old)ids.push(old);}catch{}return[...new Set(ids)].filter(id=>typeof id==='string'&&/^[a-f0-9]{32}$/.test(id));}
function registerGenerationPlan(plan){
  const active=activeGenerationIds();if(!active.includes(plan.id))active.push(plan.id);localStorage.setItem('chun-active-image-batches',JSON.stringify(active));localStorage.removeItem(IMAGE_BATCH_ACTIVE);
  let history=[];try{history=JSON.parse(localStorage.getItem('chun-image-batch-history')||'[]');}catch{}localStorage.setItem('chun-image-batch-history',JSON.stringify([plan.id,...history.filter(id=>id!==plan.id)].slice(0,100)));
  backgroundGenerationPlans.set(plan.id,plan);
}
function finishGenerationPlan(plan){localStorage.setItem('chun-active-image-batches',JSON.stringify(activeGenerationIds().filter(id=>id!==plan.id)));localStorage.removeItem(IMAGE_BATCH_ACTIVE);}
function renderBackgroundTasks(){
  const plans=[...backgroundGenerationPlans.values()],active=plans.filter(p=>['queued','running'].includes(p.status)).length;
  $('backgroundTasksBtn').textContent=active?'AI生成记录（'+active+'）':'AI生成记录';
  if(!$('backgroundTasksDialog').open)return;const list=$('backgroundTasksList');list.replaceChildren();
  if(!plans.length){const p=document.createElement('p');p.className='note';p.textContent='暂无生成任务';list.append(p);}
  for(const plan of [...plans].reverse()){
    const row=document.createElement('div');row.className='background-task';const s=imageBatchSummary(plan),text=document.createElement('div');const title=document.createElement('strong');title.textContent=modules[plan.module][0]+' · '+s.total+'张';const detail=document.createElement('p');detail.textContent=(plan.status==='paused'?'已暂停':plan.status==='queued'?'排队中':plan.status==='running'?'生成中':'已完成')+' · 成功 '+s.completed+' / '+s.total+(s.failed?'，失败 '+s.failed:'');text.append(title,detail);row.append(text);
    if(s.completed){const view=document.createElement('button');view.className='btn';view.textContent='查看结果';view.onclick=safe(()=>{$('backgroundTasksDialog').close();showImageBatchResults(plan);});row.append(view);}
    if(plan.status==='paused'){const resume=document.createElement('button');resume.className='btn';resume.textContent='继续任务🎯';resume.onclick=safe(()=>runImageBatch(plan));row.append(resume);}list.append(row);
  }
}
async function showBackgroundTasks(){
  let ids=[];try{ids=JSON.parse(localStorage.getItem('chun-image-batch-history')||'[]');}catch{}
  for(const id of ids.reverse()){if(!backgroundGenerationPlans.has(id)){const plan=await readImageBatch(id);if(plan)backgroundGenerationPlans.set(id,plan);}}
  $('backgroundTasksDialog').showModal();renderBackgroundTasks();
}
on('singleNegativePrompt','input',()=>{generationSettings().drafts[0].negativePrompt=$('singleNegativePrompt').value;persistGenerationSettings().catch(e=>toast(e.message,true));});
on('generationCount','change',async()=>{const value=Number($('generationCount').value);if(!Number.isInteger(value)||value<1||value>100){$('generationCount').value=generationSettings().count;throw Error('生成数量请输入 1–100 的整数。');}const s=generationSettings();const wasBatch=s.enabled;if(!wasBatch&&value>1){if(!s.drafts[0])s.drafts[0]={referenceId:sourceImages()[0]?.id||'none'};s.drafts[0].prompt=$('aiRequest').value;}else if(wasBatch&&value===1&&s.drafts[0])$('aiRequest').value=s.drafts[0].prompt;s.mode='manual';s.count=value;s.enabled=value>1;await persistGenerationSettings();renderBatchControls();});
on('backgroundTasksBtn','click',showBackgroundTasks);
function batchImagePayload(item,module){
  if(Array.isArray(item.references))return item.references;
  if(module==='gift')return [];
  const layer=item.document.layers.find(layer=>['product','series-product'].includes(layer.role))||item.document.layers.find(layer=>layer.type==='image');
  return layer?[layer.src]:[];
}
function batchOutputSize(doc,module){if(module==='gift')return '1024*1024';if(module==='sku')return doc.width>1536?'2048*2048':'1024*1024';const ratio=doc.width/doc.height;return ratio<.85?'1024*1536':ratio>1.18?'1536*1024':Math.max(doc.width,doc.height)>1536?'2048*2048':'1024*1024';}
async function createImageBatch(){
  if(activeModule==='gift')await giftUploadTask;
  await saveBeforeSwitch();
  const module=activeModule,scopeBatch=referenceBatchId(),settings=copyBatchValue(generationSettings()),template=copyBatchValue(getDocument()),sources=sourceImages().map(copyBatchValue),giftSource=giftSrc;
  const drafts=settings.enabled?settings.drafts.slice(0,settings.count):[{prompt:$('aiRequest').value,referenceId:sources.find(s=>s.id===currentWorkId)?.id||sources[0]?.id||'none'}];
  for(let i=0;i<drafts.length;i++)if(!drafts[i].prompt.trim())throw Error('请填写'+(settings.enabled?'第'+(i+1)+'张':'')+'生成要求。');
  const items=[],docs=new Map();
  for(const ref of new Set(drafts.map(d=>d.referenceId).filter(id=>id!=='none'))){
    if(!sources.some(source=>source.id===ref))throw Error('所选参考图不属于当前功能，请重新选择。');
    const doc=await historyDB('readonly',(store,done)=>{const r=store.get('edit-record:'+ref);r.onsuccess=()=>done(r.result);});if(!doc||doc.meta?.module!==module)throw Error('参考图片记录不可用，请重新导入。');docs.set(ref,doc);
  }
  const preparedGiftAssets=module==='gift'?await prepareGiftAssets(giftAssets):[],preparedGift=preparedGiftAssets[0]?.src||null;
  const giftReferences=preparedGiftAssets.length?await GiftLayout.referenceImages(preparedGiftAssets):[];
  for(let i=0;i<drafts.length;i++){
    const draft=drafts[i],source=docs.get(draft.referenceId),doc=copyBatchValue(source||{...template,layers:[]});doc.meta={...template.meta,...doc.meta,forms:{...template.meta.forms,aiRequest:draft.prompt.trim()},giftSrc:giftSource};if(module==='sku')doc.height=doc.width;
    const item={workId:source?.meta.workId||null,outputWorkId:ChunRuntime.randomUUID(),name:'第'+(i+1)+'张'+(source?' · '+(source.meta.sourceName||'参考图'):''),request:draft.prompt.trim(),referenceId:draft.referenceId,referenceName:sources.find(s=>s.id===draft.referenceId)?.fileName||'无参考图',document:doc,status:'pending',requestId:ChunRuntime.randomUUID().replaceAll('-',''),size:batchOutputSize(doc,module)};
    const layer=source?.layers.find(l=>['product','series-product'].includes(l.role))||source?.layers.find(l=>l.type==='image');item.references=module==='gift'?giftReferences:layer?[layer.src]:[];
    if(item.references.some(src=>imageBytes(src)>10*1024*1024))throw Error(item.referenceName+'超过参考图 10 MB 限制，请先压缩。');
    const defaultPrompt=buildGenerationPrompt(module,item.request,doc,item.references.length>0,preparedGift),savedPrompt=settings.drafts[i];
    const positivePrompt=savedPrompt?.promptBase===defaultPrompt&&savedPrompt?.customPrompt?.trim()?savedPrompt.customPrompt:defaultPrompt;
    item.negativePrompt=String(savedPrompt?.negativePrompt||'').trim();
    item.prompt=withNegativePrompt(positivePrompt,item.negativePrompt);
    if(item.prompt.length>16000)throw Error('第'+(i+1)+'张提示词和反面提示词总长度不能超过 16000 字。');
    if(module==='gift'){
      const context={version:1,workId:item.outputWorkId,document:doc,region:GiftLayout.defaultRegion(doc.width,doc.height),style:template.meta.forms.giftStyle,offer:template.meta.forms.giftOffer,offerCount:template.meta.forms.giftOfferCount,giftAssets:GiftLayout.resolveAssets(preparedGiftAssets,template.meta.forms.giftTitleText.trim(),item.request),request:item.request,giftSrc:preparedGift,assetMode:preparedGift?'uploaded':'generated',title:template.meta.forms.giftTitleText.trim()||GiftLayout.offerHeading(template.meta.forms.giftOffer,template.meta.forms.giftOfferCount),description:'',cardColor:template.meta.forms.giftCardColor,textColor:template.meta.forms.giftTextColor};
      if(!context.title)throw Error('请填写赠品文字。');if(!preparedGift)GiftLayout.generatedQuantity(context.title,item.request);await GiftLayout.build(context,null);item.giftContext=context;
    }
    items.push(item);
  }
  const plan={version:2,id:ChunRuntime.randomUUID().replaceAll('-',''),resultBatchId:ChunRuntime.randomUUID(),module,sourceBatchId:scopeBatch,status:'queued',items,createdAt:new Date().toISOString()};
  await saveImageBatch(plan);localStorage.setItem(imageBatchKey(module),plan.id);localStorage.setItem(imageBatchKey(module)+':'+scopeBatch,plan.id);return plan;
}
function buildGenerationPrompt(module,request,doc,hasReference,giftSource){
  if(module==='sku')return SkuLayout.fullImagePrompt(request,hasReference,doc.meta?.forms||{});
  if(module==='gift')return giftSource?['生成一张仅包含材质底纹的设计素材，用于赠品卡片背景。','使用平整清晰的底色和极浅的色彩层次，保持充分留白；不使用模糊纹理、颗粒或噪点。' ,'样式方向：'+GiftLayout.stylePrompt(doc.meta?.forms?.giftStyle,doc.meta?.forms?.giftOffer,doc.meta?.forms?.giftOfferCount),'参考附件为已去背景的赠品素材，可参考其包装颜色协调底色。','底纹风格参考：'+request,'输出一张完整底纹图片。'].join('\n'):['生成一件赠品商品的独立产品素材。','用户要求：'+request,'单件完整赠品主体，不画卡片、标题或独立文字，保留安全边距。','背景必须是完全均匀的纯荧光绿色 RGB(0,255,0)，软件会去除背景并固定位置。输出一张 PNG。'].join('\n');
  return ['任务：'+modules[module][0],`画布：${doc.width} × ${doc.height} 像素`,'本张生成要求：\n'+request,hasReference?'以本张指定的参考图片为依据，保留真实商品的包装、瓶型、品牌和已知规格。':'本张没有参考图片，根据描述设计画面。',module==='logo'?'按要求添加 LOGO，位置与大小以本张描述为准。':module==='background'?'按本张要求设计背景与光影，保留参考商品的真实外观。':'完成本张描述的画面改动。','商品信息使用已提供资料，不编造成分、功效、规格或数量。'].join('\n');
}
async function submitBatchItem(plan,item){
  item.status='submitting';await saveImageBatch(plan);
  const response=await fetch(aiAPI+'/api/jobs',{method:'POST',headers:{'Content-Type':'application/json','X-Workbench-Token':aiSessionToken},body:JSON.stringify({request_id:item.requestId,prompt:item.prompt,size:item.size,images:batchImagePayload(item,plan.module)}),signal:AbortSignal.timeout(30000)});
  const job=await response.json();
  if(!response.ok){if(response.status>=500||response.status===403)throw Error(job.error||'服务连接中断，请刷新后继续原任务。');item.status='failed';item.error=job.error||'本张图片提交失败。';await saveImageBatch(plan);return null;}
  if(job.id!==item.requestId)throw Error('服务未确认本张图片的唯一任务编号，请先更新服务。');
  item.jobId=job.id;item.status='running';await saveImageBatch(plan);return job;
}
async function finishBatchItem(plan,item,job){
  if(job.status==='failed'){item.status='failed';item.error=job.error?.message||'本张图片生成失败。';await saveImageBatch(plan);return;}
  if(!/^\/results\/[0-9]{8}-[0-9]{6}-[a-f0-9]{8}\.png$/.test(job.result?.image_url||''))throw Error('生成结果地址不正确，请联系管理员。');
  item.resultUrl=job.result.image_url;await saveImageBatch(plan);
  const response=await fetch(aiAPI+item.resultUrl,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('图片已生成，暂时无法读取；继续任务会读取原结果。');
  const blob=await response.blob();if(blob.size>40*1024*1024)throw Error('生成图片过大，无法读取。');
  const src=await resultAsDataURL(blob);await dimensions(src);
  try{
    const gift=plan.module==='gift'?await prepareGiftResult(src,item.giftContext):null;
    item.result={src:gift?.src||src,module:plan.module,prompt:item.prompt,size:item.size,gift,batchId:plan.id,workId:item.workId};item.status='succeeded';delete item.error;
  }catch(error){item.status='failed';item.error=error.message;}
  await saveImageBatch(plan);
}
async function processBatchItem(plan,item){
  if(['succeeded','failed'].includes(item.status))return;
  let job=null;
  if(item.jobId||item.status==='submitting'){
    const response=await fetch(aiAPI+'/api/jobs/'+(item.jobId||item.requestId),{cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(response.ok)job=await response.json();
    else if(response.status!==404||item.jobId)throw Error('暂时无法读取原任务，请稍后继续；不会重复生成。');
  }
  if(!job)job=await submitBatchItem(plan,item);if(!job)return;
  if(job.id!==item.requestId)throw Error('任务编号不匹配，请联系管理员确认。');
  item.jobId=job.id;item.status='running';await saveImageBatch(plan);
  const started=Date.now();
  while(!['succeeded','failed'].includes(job.status)){
    if(Date.now()-started>15*60*1000)throw Error('本张图片仍在处理，稍后继续任务即可读取结果。');
    const response=await fetch(aiAPI+'/api/jobs/'+item.requestId,{cache:'no-store',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error('暂时无法读取任务状态，稍后继续即可。');job=await response.json();
    if(!['succeeded','failed'].includes(job.status))await pauseAI(1200);
  }
  await finishBatchItem(plan,item,job);
}
async function runImageBatch(plan=null){
  if(!aiIdempotentJobs)throw Error('生成服务尚未就绪，请刷新后重试。');
  const scope=plan?generationScope(plan.module,plan.sourceBatchId):generationScope();if(generationPreparing.has(scope))return;generationPreparing.add(scope);renderBatchControls();
  try{
    if(!plan){const existing=currentGenerationPlan();if(existing&&['queued','running'].includes(existing.status))return;plan=await createImageBatch();}
    if(imageBatchExecution?.id===plan.id||imageBatchQueue.some(p=>p.id===plan.id))return;
    plan.status='queued';await saveImageBatch(plan);registerGenerationPlan(plan);imageBatchQueue.push(plan);renderBatchControls();
    void pumpImageBatches().catch(error=>toast(error.message,true));toast('已提交 '+plan.items.length+' 张，可继续使用其他功能。');
  }finally{generationPreparing.delete(scope);renderBatchControls();}
}
async function pumpImageBatches(){
  if(imageBatchExecution)return;
  while(imageBatchQueue.length){
    const plan=imageBatchQueue.shift();imageBatchExecution=plan;
    try{
      plan.status='running';await saveImageBatch(plan);renderBatchControls();
      for(const item of plan.items){await processBatchItem(plan,item);renderBatchControls();}
      plan.status='finished';await saveImageBatch(plan);finishGenerationPlan(plan);const s=imageBatchSummary(plan);
      if(!['series-mother','series-edit'].includes(plan.kind)&&batchMatchesWorkspace(plan)&&!document.querySelector('dialog[open]')&&!document.activeElement?.matches('input,textarea,select,[contenteditable]'))showImageBatchResults(plan);
      toast(modules[plan.module][0]+'：完成 '+s.completed+' / '+s.total+' 张'+(s.failed?'，失败 '+s.failed+' 张':'')+'，可在AI生成记录查看。',!!s.failed);
    }catch(error){plan.status='paused';plan.error=error.message;await saveImageBatch(plan);toast(modules[plan.module][0]+'任务暂停：'+error.message,true);}
    finally{imageBatchExecution=null;renderBatchControls();}
  }
}
async function resumeActiveImageBatch(){
  const until=Date.now()+10000;while(!window.appReady&&Date.now()<until)await pauseAI(50);
  for(const id of activeGenerationIds()){
    const plan=await readImageBatch(id);if(!plan)continue;backgroundGenerationPlans.set(plan.id,plan);
    if(plan.status==='finished'){finishGenerationPlan(plan);continue;}
    imageBatchPlans[plan.module]=plan;await runImageBatch(plan);
  }
  return false;
}
async function migrateLegacyGeneration(){
  const pending=aiPending();if(!pending)return;
  let context=null;if(pending.giftContextKey)context=await loadGiftAIContext(pending.giftContextKey);else if(pending.skuContextKey)context=await loadSkuAIContext(pending.skuContextKey);
  const doc=context?.document||copyBatchValue(getDocument()),item={workId:doc.meta?.workId,outputWorkId:ChunRuntime.randomUUID(),name:'第1张',request:pending.prompt,prompt:pending.prompt,referenceId:'legacy',referenceName:'原任务参考图',document:doc,status:'running',requestId:pending.id,jobId:pending.id,size:pending.size,legacyGiftContextKey:pending.giftContextKey,legacySkuContextKey:pending.skuContextKey};
  if(pending.module==='gift')item.giftContext=context;
  const plan={version:2,id:ChunRuntime.randomUUID().replaceAll('-',''),resultBatchId:ChunRuntime.randomUUID(),module:pending.module,sourceBatchId:doc.meta?.referenceBatchId||doc.meta?.batchId||currentBatchId,status:'queued',items:[item],createdAt:new Date().toISOString()};await saveImageBatch(plan);registerGenerationPlan(plan);storeAIPending(null);await runImageBatch(plan);
}
function batchSuccessfulItems(plan){return plan.items.filter(item=>item.status==='succeeded'&&item.result);}
function showImageBatchResults(plan){
  if(!batchSuccessfulItems(plan).length)return;imageBatchPreview=plan;imageBatchPreviewIndex=0;paintImageBatchPreview();openAIResult();
}
function paintImageBatchPreview(){
  const items=batchSuccessfulItems(imageBatchPreview);imageBatchPreviewIndex=Math.max(0,Math.min(items.length-1,imageBatchPreviewIndex));aiLastResult=items[imageBatchPreviewIndex].result;
  $('aiResultPreview').src=aiLastResult.src;$('aiResultBox').classList.remove('hidden');$('viewAIResult').classList.remove('hidden');$('downloadAIResult').textContent='下载当前图片🎯';syncBatchResultControls();
}
function syncBatchResultControls(){
  const active=!!imageBatchPreview&&aiLastResult?.batchId===imageBatchPreview.id;
  const multiple=active&&batchSuccessfulItems(imageBatchPreview).length>1;$('batchResultNavigation').classList.toggle('hidden',!multiple);$('downloadBatchResults').classList.toggle('hidden',!multiple);$('removeAIResult').classList.toggle('hidden',active);
   if(active){const items=batchSuccessfulItems(imageBatchPreview),s=imageBatchSummary(imageBatchPreview);$('batchResultPager').textContent=(imageBatchPreviewIndex+1)+' / '+items.length+' · '+items[imageBatchPreviewIndex].name;$('batchPreviewPrevious').disabled=imageBatchPreviewIndex===0;$('batchPreviewNext').disabled=imageBatchPreviewIndex>=items.length-1;}
}
async function batchOutputDocument(plan,item,index=0){
  const canvas=document.createElement('canvas'),editing=new ImageEditor(canvas);await editing.loadProject(item.document);
  if(item.result.gift)await GiftLayout.apply(editing,item.result.gift.layers);
  else if(plan.module==='sku')await SkuLayout.apply(editing,{background:editing.state.background,layers:[{type:'image',src:item.result.src,x:0,y:0,w:editing.state.width,h:editing.state.width,role:'product',name:'AI SKU 成品',visible:true,opacity:1,rotation:0,locked:false}]});
  else{const d=await dimensions(item.result.src);await editing.addImage(item.result.src,{...contain(d.w,d.h,0,0,editing.state.width,editing.state.height),role:'ai-result',name:'AI · '+modules[plan.module][0]});}
  if(!plan.resultBatchId)plan.resultBatchId=ChunRuntime.randomUUID();if(!item.outputWorkId)item.outputWorkId=ChunRuntime.randomUUID();
  const giftMeta=item.result.gift?{giftAssets:item.result.gift.context.giftAssets,giftSrc:item.result.gift.context.giftSrc}:{};
  return{...editing.getProject(),meta:{...item.document.meta,...giftMeta,...(plan.kind==='series-edit'?{name:item.name}:{}),workId:item.outputWorkId,module:plan.module,batchId:plan.resultBatchId,referenceBatchId:plan.sourceBatchId,imageKey:'generated-'+item.requestId,sourceOrder:new Date(plan.createdAt).getTime()+index,sourceKind:'generated',sourceName:item.name,batchAI:{planId:plan.id,jobId:item.jobId,sourceWorkId:item.workId,request:item.request}}};
}
async function insertImageBatchResults(plan,selectedItems=batchSuccessfulItems(plan)){
  if(historyRestoring)return;historyRestoring=true;setWorkspaceLocked(true);
  try{
    finishInlineText();await saveBeforeSwitch();const successful=selectedItems;let first=null;
    for(let i=0;i<successful.length;i++){
      const item=successful[i],current=item.outputWorkId?await historyDB('readonly',(store,done)=>{const r=store.get('edit-record:'+item.outputWorkId);r.onsuccess=()=>done(r.result);}):null;
      if(current?.meta?.batchAI?.jobId===item.jobId){if(!first)first=current;continue;}
      const doc=await batchOutputDocument(plan,item,plan.items.indexOf(item));if(!await saveEditRecord(doc))throw Error('结果保存失败：'+(lastSaveError||'浏览器存储不可用')+'；不会重新生图。');if(!first)first=doc;
    }
    if(first){await loadDocument(first,{save:false});localStorage.setItem('chun-active-module',plan.module);await saveDraft();}plan.inserted=batchSuccessfulItems(plan).every(item=>!!item.outputWorkId);await saveImageBatch(plan);$('aiResultDialog').close();toast('已将当前生成结果应用到画布。');
  }finally{historyRestoring=false;setWorkspaceLocked(false);renderEditHistory();renderSources();}
}
// Store rendered images in a ZIP without recompression.
async function downloadImageArchive(files,archiveName){
  const entries=[],encoder=new TextEncoder();let offset=0;const locals=[],central=[];
  const u32=(view,offset,value)=>view.setUint32(offset,value>>>0,true),u16=(view,offset,value)=>view.setUint16(offset,value,true);
  const crc32=bytes=>{let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;};
  for await(const file of files){
    const bytes=new Uint8Array(await file.blob.arrayBuffer()),name=encoder.encode(file.name),crc=crc32(bytes);
    const header=new Uint8Array(30+name.length),v=new DataView(header.buffer);u32(v,0,0x04034b50);u16(v,4,20);u16(v,6,0x800);u32(v,14,crc);u32(v,18,bytes.length);u32(v,22,bytes.length);u16(v,26,name.length);header.set(name,30);locals.push(header,bytes);
    const record=new Uint8Array(46+name.length),r=new DataView(record.buffer);u32(r,0,0x02014b50);u16(r,4,20);u16(r,6,20);u16(r,8,0x800);u32(r,16,crc);u32(r,20,bytes.length);u32(r,24,bytes.length);u16(r,28,name.length);u32(r,42,offset);record.set(name,46);central.push(record);offset+=header.length+bytes.length;entries.push(file.name);
  }
  const end=new Uint8Array(22),v=new DataView(end.buffer),centralSize=central.reduce((sum,a)=>sum+a.length,0);u32(v,0,0x06054b50);u16(v,8,entries.length);u16(v,10,entries.length);u32(v,12,centralSize);u32(v,16,offset);download(new Blob([...locals,...central,end],{type:'application/zip'}),archiveName);
}
async function downloadImageBatch(plan){
  async function* files(){let index=0;for(const item of batchSuccessfulItems(plan))yield{name:String(++index).padStart(2,'0')+'_'+filename(item.name.replace(/\.[^.]+$/,''))+'.png',blob:await(await fetch(item.result.src)).blob()};}
  return downloadImageArchive(files(),filename(modules[plan.module][0]+'_批量结果')+'.zip');
}

on('applyAIResult','click',async()=>{
  if(!canSwitchWorkspace())throw Error('正在处理图片，请稍后应用。');
  if(!aiLastResult?.src)throw Error('请先生成图片。');
  const button=$('applyAIResult');button.disabled=true;
  try{
    let plan=imageBatchPreview&&aiLastResult.batchId===imageBatchPreview.id?imageBatchPreview:null;
    if(plan){
      const item=batchSuccessfulItems(plan)[imageBatchPreviewIndex];
      if(!item)throw Error('当前生成结果已不可用，请重新打开AI生成记录。');
      await insertImageBatchResults(plan,[item]);
    }else{
      // Older single-image jobs can still be opened from saved generation records.
      plan=aiLastResult.applyPlanId?await readImageBatch(aiLastResult.applyPlanId):null;
      if(!plan){
        const result=aiLastResult,doc=result.gift?.context?.document||result.sku?.context?.document||getDocument(),id=ChunRuntime.randomUUID();
        plan={id,module:result.module||activeModule,createdAt:new Date().toISOString(),sourceBatchId:doc.meta?.referenceBatchId||doc.meta?.batchId,items:[{requestId:ChunRuntime.randomUUID(),jobId:result.jobId||id,workId:doc.meta?.workId,name:doc.meta?.sourceName||'生成图片',status:'succeeded',document:doc,result}]};
        result.applyPlanId=id;await saveImageBatch(plan);
      }
      await insertImageBatchResults(plan);
    }
  }finally{button.disabled=false;}
});
on('previousImage','click',()=>moveWorkspaceImage(-1));on('nextImage','click',()=>moveWorkspaceImage(1));
on('batchPreviewPrevious','click',()=>{imageBatchPreviewIndex--;paintImageBatchPreview();});on('batchPreviewNext','click',()=>{imageBatchPreviewIndex++;paintImageBatchPreview();});
on('downloadBatchResults','click',()=>imageBatchPreview&&downloadImageBatch(imageBatchPreview));
document.querySelectorAll('[data-module]').forEach(button=>button.onclick=safe(()=>switchModuleWorkspace(button.dataset.module)));

function withNegativePrompt(prompt,negative){const value=String(negative||'').trim();return value?String(prompt).trim()+'\n\n不希望生成的内容（反面提示词）：\n'+value:String(prompt);}

async function promptEditorEntries(){
  const module=activeModule,settings=copyBatchValue(generationSettings()),template=copyBatchValue(getDocument()),sources=sourceImages(),giftSource=giftSrc;
  const drafts=settings.enabled?settings.drafts.slice(0,settings.count):[{prompt:$('aiRequest').value,referenceId:sources.find(s=>s.id===currentWorkId)?.id||sources[0]?.id||'none'}];
  const entries=[];
  for(let i=0;i<drafts.length;i++){
    const draft=drafts[i],doc=draft.referenceId!=='none'?await historyDB('readonly',(store,done)=>{const r=store.get('edit-record:'+draft.referenceId);r.onsuccess=()=>done(r.result);}):null;
    const promptDoc={...(doc||template),meta:{...(doc||template).meta,forms:{...template.meta.forms,aiRequest:draft.prompt.trim()}}};
    const base=buildGenerationPrompt(module,draft.prompt.trim(),promptDoc,!!doc,giftSource),saved=settings.drafts[i];
    entries.push({base,text:saved?.promptBase===base&&saved?.customPrompt?.trim()?saved.customPrompt:base,negative:String(saved?.negativePrompt||'')});
  }
  return entries;
}
let promptEditorScope='',promptEditorBases=[];
async function openPromptEditor(){
  const scope=generationScope(),entries=await promptEditorEntries();if(scope!==generationScope())throw Error('当前作品已切换，请重新打开提示词。');
  promptEditorScope=scope;promptEditorBases=entries.map(e=>e.base);const container=$('promptEditors');container.replaceChildren();
  entries.forEach((entry,index)=>{const label=document.createElement('label');label.textContent='第'+(index+1)+'张生成提示词';const area=document.createElement('textarea');area.rows=8;area.value=entry.text;area.dataset.promptEditor=String(index);area.setAttribute('aria-label',label.textContent);label.append(area);container.append(label);});
  $('promptDialog').showModal();
}
function promptEditorText(){const container=$('promptEditors'),settings=generationSettings();return [...container.querySelectorAll('[data-prompt-editor]')].map((area,index)=>'第'+(index+1)+'张生成提示词\n'+withNegativePrompt(area.value,settings.drafts[index]?.negativePrompt)).join('\n\n');}
function resetPromptEditor(){[...$('promptEditors').querySelectorAll('[data-prompt-editor]')].forEach((area,i)=>area.value=promptEditorBases[i]);}
async function savePromptEditor(){
  if(promptEditorScope!==generationScope())throw Error('当前作品已切换，请重新打开提示词。');
  const areas=[...$('promptEditors').querySelectorAll('[data-prompt-editor]')],entries=await promptEditorEntries(),settings=generationSettings();
  if(entries.length!==areas.length||entries.some((entry,i)=>entry.base!==promptEditorBases[i]))throw Error('生成设置已更改，请重新打开提示词。');
  if(areas.some(area=>!area.value.trim()))throw Error('提示词不能为空。');
  if(areas.some((area,i)=>withNegativePrompt(area.value,settings.drafts[i]?.negativePrompt).length>16000))throw Error('提示词和反面提示词总长度不能超过 16000 字。');
  areas.forEach((area,i)=>{settings.drafts[i].promptBase=promptEditorBases[i];settings.drafts[i].customPrompt=area.value;});
  await persistGenerationSettings();$('promptDialog').close();toast('提示词已保存，将用于生成图片。');
}
