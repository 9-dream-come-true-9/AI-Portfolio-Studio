/* Gift product sources and reference layouts. */
(() => {
  'use strict';
  const root = document.getElementById('module-gift');
  if (!root) return;
  const $ = id => document.getElementById(id);
  for (const [id,value] of [['giftSourceMode','library'],['giftLayoutMode','template']]) {
    const field=document.createElement('input');field.type='hidden';field.id=id;field.value=value;root.prepend(field);
    formKeys.push(id);newWorkDefaults[id]=value;
  }

  for(const offer of GiftLayout.OFFERS.slice(6))$('giftOffer').append(new Option(offer.label,offer.id));
  $('giftOffer').append(new Option('自定义标题', 'custom'));
  const headingField = document.createElement('label');
  headingField.id = 'giftHeadingCustomField';
  headingField.className = 'hidden';
  headingField.innerHTML = '自定义标题文案<input id="giftHeadingCustom" maxlength="60" placeholder="例如：满400赠、拍250ml送">';
  $('giftOffer').closest('label').after(headingField);

  const emphasisRow = document.createElement('div');
  emphasisRow.className = 'gift-emphasis-row';
  emphasisRow.innerHTML = `<span>要突出显示</span><input id="giftAccentWords" maxlength="120" aria-label="要突出显示的文字" placeholder="填写说明中的词"><span>为</span><input id="giftAccentColor" type="color" value="#D12432" aria-label="突出文字颜色"><span>色</span><input id="giftHeadingColor" type="hidden" value="#FFFFFF">`;

  const styleHeader = [...root.querySelectorAll('.section-label')].find(node => node.textContent.trim() === '赠品样式');
  const exampleButton = document.createElement('button');
  exampleButton.id = 'giftExampleLibraryBtn';
  exampleButton.type = 'button';
  exampleButton.className = 'btn primary gift-library-button';
  exampleButton.textContent = '查看赠品模板库';
  const templateEntry=document.createElement('section');
  templateEntry.className='gift-template-entry';
  templateEntry.setAttribute('aria-label','赠品模板库');
  templateEntry.innerHTML='<strong>赠品模板库</strong>';
  templateEntry.append(exampleButton);
  root.querySelector('.segmented').before(templateEntry);

  const section = document.createElement('section');
  section.className = 'gift-catalog';
  section.innerHTML = `<div class="section-label">从商品图库查找</div>
    <div class="gift-catalog-search"><input id="giftCatalogQuery" maxlength="100" placeholder="输入中文品牌、商品名或规格" aria-label="搜索赠品名称"><button class="btn primary" id="giftCatalogSearch" type="button">AI查找</button><button class="btn primary gift-library-button" id="giftAssetLibraryBtn" type="button">查看商品图</button></div>
    <p id="giftCatalogStatus" class="note" role="status" aria-live="polite"></p><div id="giftCatalogResults" class="gift-catalog-grid"></div>`;
  root.querySelector('#giftImageBtn').before(section);

  const group = (name, className) => {
    const node = document.createElement('section');
    node.className = 'form-section ' + className;
    node.setAttribute('aria-label', name);
    return node;
  };
  const material = group('赠品图片', 'gift-material-section');
  const words = group('赠品文案', 'gift-words-section');
  const appearance = group('赠品样式', 'gift-appearance-section');
  const aiCardEditor=group('赠品整体颜色','gift-ai-card-editor');
  aiCardEditor.id='giftAICardEditor';aiCardEditor.hidden=true;
  aiCardEditor.innerHTML='<div class="section-label">赠品整体</div><label>卡片颜色<input id="giftAICardColor" type="color" aria-label="赠品卡片颜色"></label>';
  const exampleActive=group('已套用赠品版式','gift-example-active');
  exampleActive.id='giftExampleActive';exampleActive.hidden=true;
  exampleActive.innerHTML=`    <label>选择模板内容<select id="giftExamplePartSelect"><option value="">选择文字或商品区域</option></select></label>
    <div id="giftExampleCardEditor" class="gift-example-editor" hidden><div class="section-label">模板图片</div><img id="giftExampleCardPreview" alt="当前赠品模板预览"><p>拖动画布边框可整体移动、缩放；选中图片后可按 Backspace 或 Delete 删除。</p><button id="giftExampleDeleteTemplate" class="btn full" type="button">删除模板图片</button></div>
    <div id="giftExampleTextEditor" class="gift-example-editor gift-example-text-editor" hidden><label>赠品说明<input id="giftExampleTextInput" maxlength="2000" placeholder="如：同款面膜7.5ml × 1件" aria-label="赠品说明"></label><div class="gift-emphasis-row gift-example-emphasis-row"><span>要突出显示</span><input id="giftExampleAccentWords" maxlength="120" placeholder="填写说明中的词" aria-label="要突出显示的文字"><span>为</span><input id="giftExampleAccentColor" type="color" value="#D12432" aria-label="突出文字颜色"><span>色</span></div><div class="gift-example-actions"><button id="giftExampleResetText" class="btn" type="button">恢复原文</button><button id="giftExampleDeleteText" class="btn" type="button">删除这段文字</button></div></div>
    <div id="giftExampleProductEditor" class="gift-example-editor" hidden><div class="section-label">编辑商品图片</div><img id="giftExampleProductPreview" alt="当前选中的商品区域"><p id="giftExampleProductName"></p><div class="gift-example-actions"><button id="giftExampleReplaceProduct" class="btn primary" type="button">替换商品图片</button><button id="giftExampleDeleteProduct" class="btn" type="button">删除商品图片</button></div></div>
    <input id="giftExampleProductFile" type="file" accept="image/png,image/jpeg,image/webp" hidden>
    <div class="gift-example-actions gift-example-main-actions"><button id="giftExampleChange" class="btn primary" type="button">更换赠品版式</button><button id="giftExampleBack" class="btn" type="button">改用商品图制作</button></div>`;
  templateEntry.after(appearance);
  root.querySelector('.segmented').after(exampleActive, aiCardEditor, material, words);
  const materialLabel = [...root.querySelectorAll('.section-label')].find(node => node.textContent.trim().startsWith('赠品素材'));
  materialLabel.firstChild.textContent='赠品商品图 ';
  const sourceChoice=document.createElement('div');sourceChoice.className='gift-source-choice';sourceChoice.setAttribute('role','group');sourceChoice.setAttribute('aria-label','选择商品图来源');
  sourceChoice.innerHTML='<button type="button" data-gift-source="library"><strong>从商品图库选</strong><small>现成透明 PNG，免抠图</small></button><button type="button" data-gift-source="upload"><strong>上传自己的图片</strong><small>图库没有时使用，自动抠图</small></button>';
  const sourcePending=document.createElement('p');sourcePending.className='gift-source-pending';sourcePending.hidden=true;sourcePending.setAttribute('role','status');
  const libraryPanel=document.createElement('div');libraryPanel.id='giftLibrarySource';libraryPanel.append(section);
  const uploadPanel=document.createElement('div');uploadPanel.id='giftUploadSource';
  const uploadStatus = document.createElement('p');
  uploadStatus.id = 'giftUploadStatus';
  uploadStatus.className = 'gift-upload-status';
  uploadStatus.setAttribute('role', 'status');
  uploadStatus.setAttribute('aria-live', 'polite');
  uploadStatus.hidden = true;
  uploadPanel.append($('giftImageBtn'),uploadStatus);
  material.append(materialLabel,sourceChoice,sourcePending,libraryPanel,uploadPanel,$('giftUploadPreview'),$('giftManualPanel'),$('giftQuantityStatus'));
  const wordsHeading = document.createElement('div');
  wordsHeading.className = 'section-label';
  wordsHeading.textContent = '赠品文案';
  words.append(wordsHeading, $('giftOffer').closest('label'), headingField, $('giftOfferCountField'), $('giftTitleText').closest('label'), emphasisRow);
  appearance.append($('giftStyle'), styleHeader, $('giftStyleOptions'), $('giftColors'));

  const backgroundPanel = $('backgroundManualPanel');
  const backgroundStyle = group('背景样式', 'background-style-section');
  const backgroundFiles = group('背景图片文件', 'background-file-section');
  backgroundPanel.append(backgroundStyle, backgroundFiles);
  const backgroundButton = $('bgImageBtn');
  for (const node of [...backgroundPanel.children].filter(node => node !== backgroundStyle && node !== backgroundFiles && node !== backgroundButton)) backgroundStyle.append(node);
  const backgroundFileHeading = document.createElement('div');
  backgroundFileHeading.className = 'section-label';
  backgroundFileHeading.textContent = '导入背景图片';
  backgroundFiles.append(backgroundFileHeading, backgroundButton);

  const gallery = document.createElement('dialog');
  gallery.id = 'giftCatalogGallery';
  gallery.setAttribute('aria-labelledby', 'giftCatalogGalleryTitle');
  gallery.innerHTML = `<div class="gift-catalog-dialog-head"><h2 id="giftCatalogGalleryTitle"></h2><button class="icon-btn" id="giftCatalogGalleryClose" type="button" aria-label="关闭图库">×</button></div>
    <div class="gift-catalog-search gift-gallery-search"><input id="giftGalleryQuery" maxlength="100" placeholder="输入中文名称或关键字" aria-label="图库关键字"><button class="btn primary" id="giftGallerySearch" type="button">搜索</button></div>
    <p id="giftGalleryStatus" class="note" role="status" aria-live="polite"></p><div id="giftExampleDecomposeStatus" class="gift-decompose-status" role="status" aria-live="assertive" hidden>正在拆解赠品模板，识别文字和商品图片，请稍候…</div><div id="giftGalleryGrid" class="gift-catalog-grid gift-gallery-grid"></div><button id="giftGalleryMore" type="button" class="btn full">加载更多</button>`;
  document.body.append(gallery);

  const preview = document.createElement('dialog');
  preview.id = 'giftCatalogPreviewDialog';
  preview.setAttribute('aria-labelledby', 'giftCatalogPreviewTitle');
  preview.innerHTML = `<div class="gift-catalog-dialog-head"><h2 id="giftCatalogPreviewTitle"></h2><button class="icon-btn" id="giftCatalogPreviewClose" type="button" aria-label="关闭赠品预览">×</button></div>
    <div class="gift-catalog-preview-stage"><img id="giftCatalogPreviewImage" alt=""></div><p id="giftCatalogPreviewNote" class="note"></p>
    <div class="gift-catalog-dialog-actions"><button class="btn primary" id="giftCatalogAdd" type="button">选用这张商品图</button><button class="btn" id="giftCatalogPreviewDone" type="button">关闭预览</button></div>`;
  document.body.append(preview);

  const style = document.createElement('style');
  style.textContent = `#giftCatalogPreviewDialog,#giftCatalogGallery{width:min(780px,calc(100vw - 32px));max-height:calc(100vh - 32px);border:1px solid #dce8d9;border-radius:12px;padding:18px;background:#fff;color:#243b34;box-shadow:0 24px 70px #172b2455}#giftCatalogPreviewDialog::backdrop,#giftCatalogGallery::backdrop{background:#142c22a8}.gift-catalog-dialog-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.gift-catalog-dialog-head h2{font-size:18px;margin:0;overflow-wrap:anywhere}.gift-catalog-preview-stage{height:min(52vh,520px);margin:14px 0;display:flex;align-items:center;justify-content:center;overflow:auto;border:1px solid #dce8d9;border-radius:9px;background-color:#f6f8f5;background-image:linear-gradient(45deg,#e9eee8 25%,transparent 25%),linear-gradient(-45deg,#e9eee8 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e9eee8 75%),linear-gradient(-45deg,transparent 75%,#e9eee8 75%);background-size:20px 20px;background-position:0 0,0 10px,10px -10px,-10px 0}.gift-catalog-preview-stage img{max-width:100%;max-height:100%;object-fit:contain}.gift-catalog-dialog-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}.gift-library-button{font-weight:700!important;box-shadow:0 2px 7px #204c3440}.gift-catalog-search{flex-wrap:wrap}.gift-catalog-search #giftCatalogQuery{flex-basis:100%}.gift-catalog-search .btn{flex:1;min-width:0;padding:8px 5px}.gift-gallery-search{margin-top:14px}.gift-gallery-grid{max-height:58vh;grid-template-columns:repeat(4,minmax(0,1fr))}.gift-gallery-grid .gift-catalog-item img{height:132px}.gift-source-choice{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0 12px}.gift-source-choice button{border:1px solid #cfdbcf;border-radius:9px;background:#f9fbf8;padding:10px 6px;min-width:0;text-align:left}.gift-source-choice button.active{border:2px solid #28594a;background:#edf5ef;padding:9px 5px}.gift-source-choice strong,.gift-source-choice small{display:block}.gift-source-choice strong{font-size:12px;color:#285142}.gift-source-choice small{font-size:10px;color:#708878;line-height:1.5;margin-top:3px}.gift-source-pending{font-size:10px;line-height:1.5;color:#8a6435;background:#fff8e9;border-radius:6px;padding:8px;margin:0 0 10px}.gift-source-pending[hidden]{display:none!important}.gift-example-active{padding:13px;border:1px solid #cbdcca;border-radius:9px;background:#f3f8f2}.gift-example-active[hidden],#giftLibrarySource[hidden],#giftUploadSource[hidden]{display:none!important}.gift-example-active strong{display:block;font-size:13px}.gift-example-active p{font-size:11px;line-height:1.6;color:#66806b}.gift-example-actions{display:flex;gap:7px}.gift-example-actions button{flex:1;white-space:normal}.gift-ai-mode #module-gift .gift-words-section,.gift-ai-mode #module-gift .gift-appearance-section,.gift-ai-mode #module-gift .gift-asset-fields,.gift-ai-mode #module-gift #giftQuantityStatus,.gift-ai-mode .ai-card .generation-options,.gift-ai-mode .ai-card #singleNegativeLabel,.gift-ai-mode .ai-card #generationRequests{display:none!important}.gift-catalog #giftCatalogStatus:empty{display:none}`;
  style.textContent += `.gift-template-entry{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px;margin:0 0 14px;border:1px solid #cbdcca;border-radius:9px;background:#f3f8f2}.gift-template-entry[hidden],.gift-ai-card-editor[hidden]{display:none!important}.gift-template-entry strong,.gift-template-entry small{display:block}.gift-template-entry strong{font-size:13px;color:#214b3b}.gift-template-entry small{font-size:10px;color:#66806b;line-height:1.5;margin-top:3px}.gift-template-entry .gift-library-button{margin-left:auto;flex-shrink:0;white-space:nowrap}.gift-edit-hint{padding:8px 10px;background:#e7f1e8;border-left:3px solid #28594a;border-radius:5px;color:#285142!important}
    #giftExamplePartSelect{margin:7px 0 10px;width:100%}
    .gift-example-editor{margin:12px 0;padding:12px;border:1px solid #d3e0d2;border-radius:8px;background:#fff}
    .gift-example-editor[hidden],.gift-decompose-status[hidden]{display:none!important}
    .gift-example-editor .section-label{margin:0 0 10px}
    .gift-example-editor img{display:block;max-width:100%;max-height:150px;object-fit:contain;margin:0 auto 10px;border:1px solid #edf0eb;border-radius:6px;background:#f9faf8}
    .gift-example-editor textarea{min-height:80px;width:100%;resize:vertical}
    .gift-example-editor p{margin:8px 0 12px}
    .gift-example-text-editor{margin:14px 0;padding:0;border:0;background:transparent}
    .gift-example-text-editor>label{display:block;margin:0 0 12px}
    .gift-example-text-editor .gift-emphasis-row{margin:0 0 14px}
    .gift-example-main-actions{margin-top:15px}
    .gift-decompose-status{display:flex;align-items:center;gap:10px;margin:10px 0;padding:12px;border:1px solid #bfd8c6;border-radius:8px;background:#edf6ef;color:#24523a;font-size:12px;font-weight:700}
    .gift-decompose-status::before{content:'';width:16px;height:16px;flex:none;border:2px solid #b0cbb8;border-top-color:#24523a;border-radius:50%;animation:gift-status-spin .8s linear infinite}
    .gift-ai-mode #module-gift .gift-asset-quantity{display:none!important}
    #module-gift .form-section + .form-section,#module-background .form-section + .form-section{border-top:1px solid #dce6da;margin-top:18px;padding-top:20px}
    #module-gift .form-section{min-width:0}
    .tool-scroll>.module-content:not(.hidden):not(#module-gift):not(#module-other){border-top:1px solid #dce6da;margin-top:16px;padding-top:18px}
    #primaryInputCard:not(.hidden){padding-bottom:18px}
    .gift-emphasis-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto 48px auto;align-items:center;gap:6px;margin:2px 0 12px;font-size:11px;color:#526a5b}
    .gift-emphasis-row input[type=text],.gift-emphasis-row input:not([type]){width:100%;min-width:0;margin:0}
    .gift-emphasis-row input[type=color]{width:48px;height:34px;margin:0;padding:3px}
    .gift-upload-status{display:flex;align-items:center;gap:8px;padding:9px 10px;border-radius:7px;background:#edf5ee;color:#2b6244;font-size:11px;line-height:1.5;margin:8px 0 12px}
    .gift-upload-status[hidden]{display:none}
    .gift-upload-status[data-state=busy]::before{content:'';width:13px;height:13px;border:2px solid #a7c4ae;border-top-color:#286347;border-radius:50%;flex:none;animation:gift-status-spin .8s linear infinite}
    .gift-upload-status[data-state=done]::before{content:'✓';font-weight:700}
    .gift-upload-status[data-state=error]{background:#fff0ed;color:#9a3d33}
    .gift-example-shortcuts{margin:0 0 10px}
    #module-gift.gift-example-mode #giftUploadPreview,#module-gift.gift-example-mode #giftQuantityStatus{display:none!important}
    @keyframes gift-status-spin{to{transform:rotate(360deg)}}
    @media(prefers-reduced-motion:reduce){.gift-upload-status[data-state=busy]::before{animation:none}}`;
  document.head.append(style);

  let selected = null, galleryKind = 'asset', galleryOffset = 0, galleryVersion = 0, searchVersion = 0, decomposeBusy = false, galleryLoading = false, galleryHasMore = false, galleryLoadError = false;
  const saveGiftForm=()=>{if(ready&&!suspendSave){clearTimeout(saveTimer);saveTimer=setTimeout(saveDraft,500);}};
  const syncHeading = () => headingField.classList.toggle('hidden', $('giftOffer').value !== 'custom');
  $('giftOffer').addEventListener('change', syncHeading);
  syncHeading();
  for (const id of ['giftHeadingCustom', 'giftHeadingColor', 'giftAccentWords', 'giftAccentColor']) {
    for(const event of ['input','change','compositionend'])$(id).addEventListener(event,e=>{if(!e.isComposing&&ready){scheduleGiftPreview();saveGiftForm();}});
  }
  const applyAICardColor = () => {
    $('giftCardColor').value=$('giftAICardColor').value;
    $('giftCardColor').dispatchEvent(new Event('input',{bubbles:true}));
    saveGiftForm();
  };
  for(const event of ['input','change'])$('giftAICardColor').addEventListener(event,applyAICardColor);
  let exampleFormGroup='',exampleFormSignature='';
  function exampleParts(card){return card?editor.state.layers.filter(layer=>layer.groupId===card.groupId&&['gift-example-text','gift-example-product'].includes(layer.role)):[];}
  function primaryExampleText(parts){
    const texts=parts.filter(part=>part.role==='gift-example-text').sort((a,b)=>a.y-b.y||a.x-b.x);
    const known=texts.find(part=>GiftLayout.OFFERS.some(offer=>part.text.startsWith(offer.label)));
    const heading=known||texts[0]||null;
    const later=texts.filter(part=>part.id!==heading?.id&&part.y>=heading.y+heading.h*.35);
    const description=later.find(part=>/[\u4e00-\u9fff]/.test(part.text)&&!GiftLayout.OFFERS.some(offer=>part.text.startsWith(offer.label)))||later[0]||texts.find(part=>part.id!==heading?.id)||null;
    return {heading,description};
  }
  function syncExampleForms(card,parts){
    if(!card){exampleFormGroup='';exampleFormSignature='';return;}
    const {heading,description}=primaryExampleText(parts);
    const signature=[heading?.id,heading?.text,description?.id,description?.text,description?.giftAccentWords,description?.giftAccentColor].join('|');
    if(exampleFormGroup===card.groupId&&exampleFormSignature===signature)return;
    const offer=GiftLayout.OFFERS.find(item=>heading?.text.startsWith(item.label));
    if(document.activeElement!==$('giftOffer'))$('giftOffer').value=offer?.id||'custom';
    if(document.activeElement!==$('giftHeadingCustom'))$('giftHeadingCustom').value=offer?'':heading?.text||'';
    const count=heading?.text.match(/^买(\d+)送同款/);
    if(document.activeElement!==$('giftOfferCount'))$('giftOfferCount').value=count?.[1]||'';
    if(document.activeElement!==$('giftTitleText'))$('giftTitleText').value=description?.text||'';
    if(document.activeElement!==$('giftAccentWords'))$('giftAccentWords').value=description?.giftAccentWords||'';
    if(document.activeElement!==$('giftAccentColor'))$('giftAccentColor').value=description?.giftAccentColor||'#D12432';
    syncHeading();renderGiftStyles();
    exampleFormGroup=card.groupId;exampleFormSignature=signature;
  }
  function sync() {
    const exampleLayer=editor?.state.layers.find(layer=>layer.role==='gift-example');
    $('giftLayoutMode').value=exampleLayer?'example':'template';
    const exampleMode=giftMode==='manual'&&$('giftLayoutMode').value==='example';
    root.classList.toggle('gift-example-mode',exampleMode);
    templateEntry.hidden=false;
    exampleActive.hidden=!exampleMode;
    aiCardEditor.hidden=giftMode!=='ai'||editor?.selected?.role!=='gift-card'||editor?.selected?.giftAIPreview===true||editor?.selected?.giftAIResult===true;
    if(document.activeElement!==$('giftAICardColor'))$('giftAICardColor').value=$('giftCardColor').value;
    $('giftAICardColor').disabled=aiBusy;
    material.hidden=false;words.hidden=false;appearance.hidden=exampleMode;
    materialLabel.querySelector('.required').textContent=exampleMode?'可替换':'必填';
    const partSelect=$('giftExamplePartSelect'),parts=exampleParts(exampleLayer);
    syncExampleForms(exampleLayer,parts);
    const signature=parts.map(layer=>layer.id+':'+layer.name).join('|');
    if(partSelect.dataset.signature!==signature){partSelect.replaceChildren(new Option('选择原文或商品区域',''),...parts.map(layer=>new Option(layer.name,layer.id)));partSelect.dataset.signature=signature;}
    partSelect.value=parts.some(layer=>layer.id===editor?.selected?.id)?editor.selected.id:'';
    const selectedPart=parts.find(layer=>layer.id===editor?.selected?.id),textPart=selectedPart?.role==='gift-example-text'?selectedPart:null,productPart=selectedPart?.role==='gift-example-product'?selectedPart:null;
    $('giftExampleCardEditor').hidden=!exampleMode||!!selectedPart;
    $('giftExampleTextEditor').hidden=!exampleMode||!textPart;
    $('giftExampleProductEditor').hidden=!exampleMode||!productPart;
    if(exampleLayer&&$('giftExampleCardPreview').src!==exampleLayer.src)$('giftExampleCardPreview').src=exampleLayer.src;
    if(textPart){
      if(document.activeElement!==$('giftExampleTextInput'))$('giftExampleTextInput').value=textPart.text;
      if(document.activeElement!==$('giftExampleAccentWords'))$('giftExampleAccentWords').value=textPart.giftAccentWords||'';
      if(document.activeElement!==$('giftExampleAccentColor'))$('giftExampleAccentColor').value=textPart.giftAccentColor||'#D12432';
      $('giftExampleResetText').disabled=textPart.text===textPart.giftOriginalText&&!textPart.visible;
    }
    if(productPart){if($('giftExampleProductPreview').src!==productPart.src)$('giftExampleProductPreview').src=productPart.src;$('giftExampleProductName').textContent=productPart.name;}
    const source=$('giftSourceMode').value==='upload'?'upload':'library';
    libraryPanel.hidden=source!=='library';uploadPanel.hidden=source!=='upload';
    const pending=giftAssets.some(asset=>asset.source!==source);
    sourcePending.hidden=exampleMode||!pending;
    sourcePending.textContent=pending?(source==='upload'?'当前仍使用图库商品图；上传成功后会替换。':'当前仍使用已上传图片；选中图库商品图后会替换。'):'';
    for(const button of sourceChoice.querySelectorAll('[data-gift-source]')){
      const active=button.dataset.giftSource===source;
      button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
    }
  }
  function setSource(source,save=true){
    $('giftSourceMode').value=source==='upload'?'upload':'library';sync();if(save)saveGiftForm();
  }
  function useAssets(){
    const examples=editor.state.layers.filter(layer=>layer.role==='gift-example');
    if(!examples.length)return;
    const groups=new Set(examples.map(layer=>layer.groupId).filter(Boolean));
    invalidateLivePreviews();
    editor.beginBatch();
    try{for(const layer of [...editor.state.layers])if(layer.role==='gift-example'||groups.has(layer.groupId))editor.remove(layer.id);}finally{editor.endBatch();}
    $('giftLayoutMode').value='template';sync();
  }
  const currentExample=()=>editor.state.layers.find(layer=>layer.role==='gift-example')||null;
  async function replaceExampleProducts(assets){
    const card=currentExample();
    if(!card)throw Error('请先选择赠品模板。');
    const prepared=assets.filter(asset=>asset?.src);
    if(!prepared.length)return 0;
    const products=exampleParts(card).filter(layer=>layer.role==='gift-example-product').sort((a,b)=>a.y-b.y||a.x-b.x);
    const selected=editor.selected?.role==='gift-example-product'&&editor.selected.groupId===card.groupId?editor.selected:null;
    const targets=selected?[selected,...products.filter(layer=>layer.id!==selected.id)]:products;
    const vacantCovers=editor.state.layers.filter(layer=>layer.role==='gift-example-cover'&&layer.groupId===card.groupId&&layer.name.startsWith('原图修补 · 商品区域')&&!products.some(part=>part.id===layer.giftAssetId));
    if(!targets.length&&!vacantCovers.length)throw Error('模板商品未能可靠抠图，已保留原背景；请更换模板或在画布添加图片。');
    for(const [index,asset] of prepared.entries()){
      const src=await GiftLayout.trimTransparent(asset.src),image=await dimensions(src),target=targets[index];
      if(target){
        const box={x:target.x,y:target.y,w:target.w,h:target.h};
        await editor.replaceImage(target.id,src);
        editor.update(target.id,{...GiftLayout.contain(image.w,image.h,box),name:'商品区域 '+(index+1)+' · '+String(asset.name||'已选商品图').slice(0,45)});
        editor.select(target.id);
        continue;
      }
      const cover=vacantCovers.shift();
      const base=cover||targets[0]||{x:card.x+card.w*.08,y:card.y+card.h*.38,w:card.w*.84,h:card.h*.54};
      const extra=index-targets.length;
      const box=cover?{x:cover.x,y:cover.y,w:cover.w,h:cover.h}:{x:base.x+extra*12,y:base.y+extra*12,w:base.w*.8,h:base.h*.8};
      const added=await editor.addImage(src,{...GiftLayout.contain(image.w,image.h,box),name:'商品区域 '+(index+1)+' · '+String(asset.name||'已选商品图').slice(0,45),role:'gift-example-product',groupId:card.groupId});
      if(cover){cover.giftAssetId=added.id;cover.visible=true;editor.commit();}
    }
    sync();await saveDraft();
    return prepared.length;
  }
  function updateExampleWords(kind,value,commit=true){
    const card=currentExample();if(!card||giftMode!=='manual')return;
    const {heading,description}=primaryExampleText(exampleParts(card));
    const target=kind==='heading'?heading:description;
    if(!target)return;
    const patch=kind==='accentWords'?{giftAccentWords:value}:kind==='accentColor'?{giftAccentColor:value}:{text:value};
    if(Object.keys(patch).every(key=>target[key]===patch[key]))return;
    editor.update(target.id,patch,commit);
  }
  $('giftOffer').addEventListener('change',()=>{
    if(!currentExample()||giftMode!=='manual')return;
    if($('giftOffer').value==='custom'){
      $('giftHeadingCustom').value=primaryExampleText(exampleParts(currentExample())).heading?.text||'';
      return;
    }
    updateExampleWords('heading',GiftLayout.offerHeading($('giftOffer').value,$('giftOfferCount').value));
  });
  for(const event of ['input','change'])$('giftOfferCount').addEventListener(event,()=>{
    if(currentExample()&&giftMode==='manual'&&$('giftOffer').value==='same')updateExampleWords('heading',GiftLayout.offerHeading('same',$('giftOfferCount').value),false);
  });
  for(const [id,kind] of [['giftHeadingCustom','heading'],['giftTitleText','description'],['giftAccentWords','accentWords'],['giftAccentColor','accentColor']]){
    const input=$(id);
    input.addEventListener('input',event=>{if(!event.isComposing&&!(id==='giftHeadingCustom'&&$('giftOffer').value!=='custom'))updateExampleWords(kind,input.value,false);});
    input.addEventListener('compositionend',()=>{if(!(id==='giftHeadingCustom'&&$('giftOffer').value!=='custom'))updateExampleWords(kind,input.value,false);});
    input.addEventListener('change',()=>{if(!(id==='giftHeadingCustom'&&$('giftOffer').value!=='custom'))updateExampleWords(kind,input.value,false);if(currentExample()&&giftMode==='manual')editor.commit();});
    input.addEventListener('blur',()=>{if(currentExample()&&giftMode==='manual')editor.commit();});
  }
  async function editableExample(item){
    if(!aiSessionToken)await checkAIService();
    if(!aiSessionToken)throw Error('版式拆解服务未就绪，请刷新页面。');
    const send=()=>fetch('/api/gift/decompose',{method:'POST',headers:{'Content-Type':'application/json','X-Workbench-Token':aiSessionToken},body:JSON.stringify({id:item.id}),signal:AbortSignal.timeout(120000)});
    let response=await send();
    if(response.status===403){await checkAIService();if(aiSessionToken)response=await send();}
    const data=await response.json();
    if(!response.ok)throw Error(data.error||'赠品版式拆解失败，请重试。');
    if(!data.background||!data.bounds||!Array.isArray(data.parts))throw Error('版式拆解结果不完整，请刷新重试。');
    return data;
  }
  async function applyExample(item){
    if(item.kind!=='example'||!canSwitchWorkspace())return;
    const work=currentWorkId;
    $('giftGalleryStatus').textContent='正在裁剪并拆解赠品版式，保留文字与商品的整体排版…';
    const data=await editableExample(item);
    if(!gallery.open)return;
    if(work!==currentWorkId)throw Error('作品已切换，请重新选择赠品版式。');
    const scale=Math.min(editor.state.width/data.sourceWidth,editor.state.height/data.sourceHeight);
    const offsetX=(editor.state.width-data.sourceWidth*scale)/2,offsetY=(editor.state.height-data.sourceHeight*scale)/2;
    const box={x:offsetX+data.bounds.x*scale,y:offsetY+data.bounds.y*scale,w:data.bounds.w*scale,h:data.bounds.h*scale};
    const position=part=>({x:box.x+part.x*scale,y:box.y+part.y*scale,w:part.w*scale,h:part.h*scale});
    const kept=editor.state.layers.filter(layer=>!GiftLayout.isGift(layer));
    if(kept.length+1+data.parts.length*2>150)throw Error('图层数量已达上限，请先删除不需要的图层。');
    const groupId='gift-example-'+ChunRuntime.randomUUID(),layers=[];
    const layer=editor._layer({id:'layer_'+ChunRuntime.randomUUID(),type:'image',src:data.background,...box,name:'赠品版式 · '+item.name,role:'gift-example',groupId,visible:true,locked:false});
    layers.push(layer);
    for(const part of data.parts){
      const childId='layer_'+ChunRuntime.randomUUID(),bounds=position(part.box);
      const cover=editor._layer({id:'layer_'+ChunRuntime.randomUUID(),type:'image',src:part.cover,...position(part.coverBox),name:'原图修补 · '+part.name,role:'gift-example-cover',groupId,giftAssetId:childId,visible:false,locked:true});
      const child=part.kind==='product'
        ?editor._layer({id:childId,type:'image',src:part.src,...bounds,name:part.name,role:'gift-example-product',groupId,visible:part.cutout===true,locked:false})
        :editor._layer({id:childId,type:'text',text:part.text,...bounds,name:part.name+' · '+part.text,color:part.color,giftOriginalText:part.text,giftCharColors:part.charColors||[],fontSize:part.fontSize*scale,fontWeight:bounds.h>22?700:500,textAlign:bounds.w>box.w*.75?'center':'left',textVerticalAlign:'middle',role:'gift-example-text',groupId,visible:false,locked:false});
      layers.push(cover,child);
    }
    await Promise.all(layers.filter(part=>part.type==='image').map(part=>editor._image(part.src)));
    invalidateLivePreviews();$('giftLayoutMode').value='example';
    editor.state.layers=[...kept,...layers];editor.state.selectedId=layer.id;editor.commit();
    setGiftMode('manual',false);sync();
    if(gallery.open)gallery.close();
    await saveDraft();toast(data.warnings?.length?data.warnings[0]:'模板已拆解：右侧图层可编辑，画布双击文字可改字、双击商品区域可替换图片。');
  }

  function showPreview(item) {
    selected = item;
    $('giftCatalogPreviewTitle').textContent = item.name;
    $('giftCatalogPreviewImage').src = item.detailUrl;
    $('giftCatalogPreviewImage').alt = item.name;
    $('giftCatalogPreviewNote').textContent = currentExample()&&giftMode==='manual'
      ? '确认后替换模板中的商品区域，保留原版式和颜色。'
      : '确认后选用这张透明商品图，可继续编辑名称和数量。';
    preview.showModal();
  }

  function renderCards(container, items, append = false) {
    const box = $(container);
    if (!append) box.replaceChildren();
    for (const item of items) {
      const card = document.createElement('button');
      card.type = 'button'; card.className = 'gift-catalog-item';
      card.setAttribute('aria-label', (item.kind==='example'?'套用赠品版式 ':'预览商品图 ') + item.name);
      const image = document.createElement('img');
      image.loading = 'lazy'; image.src = item.previewUrl; image.alt = '';
      const name = document.createElement('span'); name.textContent = item.name;
      card.append(image, name);
      card.addEventListener('click', safe(async()=>{
        if(item.kind==='example'){
          if(decomposeBusy)return;
          decomposeBusy=true;card.disabled=true;$('giftExampleDecomposeStatus').hidden=false;gallery.setAttribute('aria-busy','true');
          try{await applyExample(item);}catch(error){$('giftGalleryStatus').textContent=error.message||'赠品模板拆解失败，请重试。';throw error;}finally{decomposeBusy=false;card.disabled=false;$('giftExampleDecomposeStatus').hidden=true;gallery.removeAttribute('aria-busy');}
        }
        else showPreview(item);
      }));
      box.append(card);
    }
  }

  async function aiSearch(query) {
    if (!aiSessionToken) await checkAIService();
    if (!aiSessionToken) throw Error('工作台服务未就绪。');
    const send = () => fetch(aiAPI + '/api/gift/search', {
      method: 'POST', headers: {'Content-Type':'application/json','X-Workbench-Token':aiSessionToken},
      body: JSON.stringify({name: query}), signal: AbortSignal.timeout(60000)
    });
    let response = await send();
    if(response.status===403){await checkAIService();if(aiSessionToken)response=await send();}
    const data = await response.json();
    if (!response.ok) throw Error(data.error || '查找失败。');
    return data;
  }

  async function searchInline() {
    const query = $('giftCatalogQuery').value.trim();
    if (!query) { $('giftCatalogStatus').textContent = '请先输入商品名称或中文品牌名。'; return; }
    const version = ++searchVersion;
    $('giftCatalogSearch').disabled = true;
    $('giftCatalogStatus').textContent = '小米 MiMo 正在查找商品图…';
    try {
      const data = await aiSearch(query);
      if (version !== searchVersion) return;
      renderCards('giftCatalogResults', data.items);
      $('giftCatalogStatus').textContent = data.items.length
        ? `${data.model} 找到 ${data.items.length} 张候选商品图，点击预览后选择。${data.warning ? ' ' + data.warning : ''}`
        : data.warning || '没有找到明确匹配，可试试品牌别名或查看商品图库。';
    } catch (error) {
      if (version === searchVersion) $('giftCatalogStatus').textContent = error instanceof TypeError
        ? '连接不到工作台服务，请运行 start.cmd 后刷新页面。' : error.message || '查找失败。';
    } finally { if (version === searchVersion) $('giftCatalogSearch').disabled = false; }
  }

  function maybeLoadGallery() {
    const grid=$('giftGalleryGrid');
    if(gallery.open&&!galleryLoading&&galleryHasMore&&!galleryLoadError&&grid.scrollHeight-grid.scrollTop-grid.clientHeight<120)searchGallery();
  }
  async function searchGallery(reset = false) {
    if(!reset&&(galleryLoading||!galleryHasMore||!gallery.open))return;
    if (reset) { galleryOffset = 0; $('giftGalleryGrid').replaceChildren(); $('giftGalleryGrid').scrollTop=0; galleryHasMore=true; galleryLoadError=false; }
    const version = ++galleryVersion, query = $('giftGalleryQuery').value.trim();
    galleryLoading=true;
    $('giftGallerySearch').disabled = true;
    $('giftGalleryMore').disabled=true;
    $('giftGalleryStatus').textContent = '正在查找…';
    try {
      let items, total, label;
      if (galleryKind === 'asset' && query) {
        const data = await aiSearch(query);
        items = data.items; total = items.length; label = data.model + (data.warning ? ' · ' + data.warning : '');
      } else {
        const path = galleryKind === 'asset' ? '/api/gift/assets' : '/api/gift/examples';
        const response = await fetch(path + '?query=' + encodeURIComponent(query) + '&offset=' + galleryOffset);
        if (!response.ok) throw Error('图库暂不可读。');
        const data = await response.json();
        items = data.items; total = data.total; label = galleryKind === 'asset' ? '站内透明 PNG' : '赠品模板库';
      }
      if (version !== galleryVersion) return;
      renderCards('giftGalleryGrid', items, !reset);
      galleryOffset += items.length;
      galleryHasMore=galleryOffset<total&&!(galleryKind==='asset'&&!!query);
      galleryLoadError=false;
      $('giftGalleryMore').hidden = !galleryHasMore;
      $('giftGalleryStatus').textContent = `${label} · 显示 ${galleryOffset} / ${total} 张${query ? ' · 关键字：' + query : ''}`;
    } catch (error) {
      if (version === galleryVersion){galleryLoadError=true;$('giftGalleryStatus').textContent = error.message || '查找失败。';}
    } finally { if (version === galleryVersion){galleryLoading=false;$('giftGallerySearch').disabled=false;$('giftGalleryMore').disabled=false;if(!galleryLoadError)requestAnimationFrame(maybeLoadGallery);} }
  }

  function openGallery(kind) {
    galleryKind = kind;
    $('giftCatalogGalleryTitle').textContent = kind === 'asset' ? '查看商品图 · 透明 PNG' : '查看赠品模板库';
    $('giftGallerySearch').classList.toggle('hidden',kind === 'example');
    $('giftGalleryQuery').value = kind === 'asset' ? $('giftCatalogQuery').value.trim() : '';
    gallery.showModal();
    searchGallery(true);
  }

  $('giftCatalogSearch').addEventListener('click', searchInline);
  $('giftCatalogQuery').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); searchInline(); } });
  sourceChoice.addEventListener('click',event=>{const button=event.target.closest('[data-gift-source]');if(button)setSource(button.dataset.giftSource);});
  $('giftAssetLibraryBtn').addEventListener('click', () => openGallery('asset'));
  exampleButton.addEventListener('click', () => openGallery('example'));
  $('giftExampleChange').addEventListener('click',()=>openGallery('example'));
  $('giftExamplePartSelect').addEventListener('change',event=>editor.select(event.target.value||null));
  const templateTextInput=$('giftExampleTextInput');
  const updateTemplateText=event=>{
    if(event?.isComposing)return;
    const layer=editor.selected;
    if(layer?.role==='gift-example-text'&&layer.text!==templateTextInput.value)editor.update(layer.id,{text:templateTextInput.value},false);
  };
  templateTextInput.addEventListener('input',updateTemplateText);
  templateTextInput.addEventListener('compositionend',updateTemplateText);
  templateTextInput.addEventListener('change',event=>{updateTemplateText(event);editor.commit();});
  templateTextInput.addEventListener('blur',()=>editor.commit());
  const templateAccentWords=$('giftExampleAccentWords'),templateAccentColor=$('giftExampleAccentColor');
  const updateTemplateAccent=(key,value)=>{
    const layer=editor.selected;if(layer?.role!=='gift-example-text'||layer[key]===value)return;
    if(key==='giftAccentColor'&&!layer.giftAccentWords){layer.giftAccentColor=value;editor.commit();return;}
    if(key==='giftAccentWords'&&!value.trim()&&layer.text===layer.giftOriginalText&&!layer.giftColorOverride){
      layer.giftAccentWords='';layer.visible=false;
      const cover=editor.state.layers.find(item=>item.role==='gift-example-cover'&&item.giftAssetId===layer.id);
      if(cover)cover.visible=false;
      editor.commit();return;
    }
    editor.update(layer.id,{[key]:value},false);
  };
  templateAccentWords.addEventListener('input',event=>{if(!event.isComposing)updateTemplateAccent('giftAccentWords',event.target.value);});
  templateAccentWords.addEventListener('compositionend',event=>updateTemplateAccent('giftAccentWords',event.target.value));
  templateAccentWords.addEventListener('change',event=>{updateTemplateAccent('giftAccentWords',event.target.value);editor.commit();});
  templateAccentWords.addEventListener('blur',()=>editor.commit());
  templateAccentColor.addEventListener('input',event=>updateTemplateAccent('giftAccentColor',event.target.value));
  templateAccentColor.addEventListener('change',event=>{updateTemplateAccent('giftAccentColor',event.target.value);editor.commit();});
  $('giftExampleResetText').addEventListener('click',()=>{
    const layer=editor.selected;if(layer?.role!=='gift-example-text')return;
    layer.text=layer.giftOriginalText||layer.text;delete layer.giftColorOverride;delete layer.giftTextEdited;
    layer.name=layer.name.split(' · ')[0]+' · '+layer.text.slice(0,40);
    layer.giftAccentWords='';layer.giftAccentColor='#D12432';
    layer.visible=false;
    const cover=editor.state.layers.find(item=>item.role==='gift-example-cover'&&item.giftAssetId===layer.id);
    if(cover)cover.visible=false;
    editor.commit();
  });
  $('giftExampleDeleteText').addEventListener('click',safe(async()=>{if(editor.selected?.role==='gift-example-text')await removeGiftExampleLayer(editor.selected.id);}));
  $('giftExampleDeleteProduct').addEventListener('click',safe(async()=>{if(editor.selected?.role==='gift-example-product')await removeGiftExampleLayer(editor.selected.id);}));
  $('giftExampleDeleteTemplate').addEventListener('click',safe(async()=>{const layer=editor.state.layers.find(item=>item.role==='gift-example');if(layer)await removeGiftExampleLayer(layer.id);}));
  $('giftExampleReplaceProduct').addEventListener('click',()=>{
    if(editor.selected?.role==='gift-example-product')$('giftExampleProductFile').click();
  });
  $('giftExampleProductFile').addEventListener('change',safe(async event=>{
    const file=event.target.files?.[0],selected=editor.selected;
    event.target.value='';
    if(!file||selected?.role!=='gift-example-product')return;
    await replaceExampleProducts([{src:await readImageFile(file),name:file.name}]);
    toast('商品区域已替换，可拖动边框调整位置和大小。');
  }));
  $('giftExampleBack').addEventListener('click',safe(async()=>{
    useAssets();
    if(giftAssets.length)scheduleGiftPreview();
    await saveDraft();
  }));
  $('giftGallerySearch').addEventListener('click', () => searchGallery(true));
  $('giftGalleryQuery').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); searchGallery(true); } });
  $('giftGalleryMore').addEventListener('click', () => searchGallery());
  $('giftGalleryGrid').addEventListener('scroll',maybeLoadGallery,{passive:true});
  $('giftCatalogGalleryClose').addEventListener('click', () => gallery.close());
  $('giftCatalogPreviewClose').addEventListener('click', () => preview.close());
  $('giftCatalogPreviewDone').addEventListener('click', () => preview.close());
  preview.addEventListener('close', () => { selected = null; });

  $('giftCatalogAdd').addEventListener('click', async () => {
    if (!selected || selected.kind !== 'asset') return;
    if(giftUploading){toast('图片正在抠图，请完成后再选图库商品图。',true);return;}
    const item = selected, button = $('giftCatalogAdd');
    button.disabled = true;
    try {
      const response = await fetch(item.url);
      if (!response.ok) throw Error('透明 PNG 无法读取。');
      const src = await GiftLayout.trimTransparent(await resultAsDataURL(await response.blob()));
      if(currentExample()&&giftMode==='manual'){
        await replaceExampleProducts([{src,name:item.name}]);
        preview.close();if(gallery.open)gallery.close();
        toast('已替换模板中的商品图，保留原版式和颜色。');
        return;
      }
      useAssets();
      if(giftAssets.some(asset=>asset.source!=='library'))giftAssets=[];
      giftAssets.push({id:ChunRuntime.randomUUID(),name:item.name+'.png',label:item.name,src,quantity:1,cutout:true,source:'library'});
      setSource('library',false);
      giftSrc = giftAssets[0].src;
      if (giftMode!=='ai'&&!$('giftTitleText').value.trim()) $('giftTitleText').value = item.name;
      renderGiftUpload(); scheduleGiftPreview();
      preview.close(); if (gallery.open) gallery.close();
      toast('已加入透明赠品素材，可继续编辑名称和数量。');
    } catch (error) { toast(error.message, true); }
    finally { button.disabled = false; }
  });

  window.GiftCatalog = {syncHeading,sync,setSource,useAssets,isExample:()=>!!currentExample()&&giftMode==='manual',replaceExampleProducts,reset() {
    searchVersion++; galleryVersion++;
    $('giftCatalogSearch').disabled = false; $('giftGallerySearch').disabled = false;
    selected = null; if (preview.open) preview.close(); if (gallery.open) gallery.close();
    galleryOffset = 0; $('giftCatalogQuery').value = ''; $('giftGalleryQuery').value = '';
    $('giftCatalogResults').replaceChildren(); $('giftGalleryGrid').replaceChildren();
    $('giftCatalogStatus').textContent = '';
    uploadStatus.hidden = true;uploadStatus.textContent = '';delete uploadStatus.dataset.state;
    syncHeading();sync();
  }};
  sync();
})();
