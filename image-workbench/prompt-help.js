/* Draft prompt text with Xiaomi MiMo, then let the user apply it explicitly. */
(()=>{
  'use strict';
  const dialog=document.getElementById('promptHelpDialog');
  if(!dialog)return;
  const $=id=>document.getElementById(id);
  let target=null,negativeTarget=null,scope='',kind='pair',running=false;
  const matches=area=>area.matches('#aiRequest,[data-output-prompt],[data-prompt-editor]');
  const fieldKind=area=>area.matches('[data-prompt-editor]')?'final':'pair';
  const pairedNegative=area=>area.id==='aiRequest'?$('singleNegativePrompt'):area.dataset.outputPrompt!==undefined?document.querySelector('[data-output-negative="'+area.dataset.outputPrompt+'"]'):null;
  const visible=area=>!!area&&!!area.isConnected&&getComputedStyle(area.closest('label')).display!=='none';
  const candidateLabel=$('promptHelpCandidate').closest('label');
  const negativeLabel=document.createElement('label');negativeLabel.id='promptHelpNegativeLabel';negativeLabel.className='hidden';negativeLabel.textContent='反面建议';
  const negativeCandidate=document.createElement('textarea');negativeCandidate.id='promptHelpNegativeCandidate';negativeCandidate.rows=5;negativeCandidate.maxLength=16000;negativeLabel.append(negativeCandidate);candidateLabel.after(negativeLabel);
  const negativeHeading=/(?:^|[\r\n。；;])\s*(?:[-*]\s*|#{1,4}\s*)?(?:\*\*)?(?:不希望生成的内容(?:[（(]反面提示词[）)])?|反面提示词|负面提示词|negative\s*prompt)(?:\*\*)?\s*[：:]\s*/i;
  const positiveHeading=/^\s*(?:[-*]\s*|#{1,4}\s*)?(?:\*\*)?(?:正面提示词|正向提示词|生成要求|positive\s*prompt)(?:\*\*)?\s*[：:]\s*/i;
  function suggestionForField(value,field){
    const full=String(value||'').trim(),split=negativeHeading.exec(full);
    const positiveEnd=split?split.index+(/[。；;]/.test(split[0][0])?1:0):full.length;
    const section=field==='negative'?(split?full.slice(split.index+split[0].length):full):full.slice(0,positiveEnd);
    const text=section.replace(positiveHeading,'').replace(/^\s*(?:反面提示词|负面提示词|不希望生成的内容(?:[（(]反面提示词[）)])?)\s*[：:]\s*/,'').trim();
    return {text,split:!!split};
  }
  function decorate(){
    document.querySelectorAll('textarea').forEach(area=>{
      if(!matches(area)||area.dataset.aiHelpReady)return;
      const label=area.closest('label');if(!label)return;
      area.dataset.aiHelpReady='1';
      const button=document.createElement('button');button.type='button';button.className='prompt-help-trigger';button.textContent='✦ AI帮写';button.setAttribute('aria-label',fieldKind(area)==='pair'?'AI帮写正面和反面提示词':'AI帮写完整提示词');
      button.addEventListener('click',event=>{
        event.preventDefault();event.stopPropagation();
        target=area;scope=typeof generationScope==='function'?generationScope():'';kind=fieldKind(area);
        const other=kind==='pair'?pairedNegative(area):null;negativeTarget=visible(other)?other:null;
        $('promptHelpInstruction').value='';$('promptHelpCandidate').value='';negativeCandidate.value='';$('promptHelpStatus').textContent='';
        negativeLabel.classList.toggle('hidden',!negativeTarget);dialog.classList.toggle('pair-help',!!negativeTarget);
        candidateLabel.firstChild.textContent=negativeTarget?'正面建议':'AI 建议';
        $('promptHelpApply').disabled=true;$('promptHelpApply').textContent=negativeTarget?'应用到两个输入框':'应用到输入框';
        $('promptHelpTitle').textContent='AI帮写 · '+(kind==='final'?'完整提示词':negativeTarget?'正面与反面提示词':'生成要求');
        dialog.showModal();
      });
      label.append(button);
    });
  }
  new MutationObserver(decorate).observe(document.body,{childList:true,subtree:true});decorate();

  function imageData(src){return typeof src==='string'&&/^data:image\/(png|jpeg|webp);base64,/i.test(src)&&src.length<6*1024*1024?src:null;}
  async function references(area){
    if(activeModule==='gift'&&giftMode==='ai'){const selected=await GiftLayout.referenceImages(giftAssets);return selected.map(imageData).filter(Boolean);}
    const images=[];
    const index=area.dataset.outputPrompt??area.dataset.outputNegative??area.dataset.promptEditor;
    if(index!==undefined&&typeof generationSettings==='function'){
      const id=generationSettings().drafts[Number(index)]?.referenceId;
      if(id&&id!=='none'){
        const doc=await historyDB('readonly',(store,done)=>{const request=store.get('edit-record:'+id);request.onsuccess=()=>done(request.result);});
        const source=doc?.layers?.find(layer=>layer.type==='image'&&(layer.role==='product'||layer.role==='source'||layer.role==='base'))||doc?.layers?.find(layer=>layer.type==='image');
        const src=imageData(source?.src);if(src)images.push(src);
      }
    }
    const scene=editor?.state?.layers?.some(layer=>layer.type==='image'&&layer.visible);
    if(scene&&images.length<2){
      const canvas=$('editorCanvas'),preview=document.createElement('canvas'),scale=Math.min(1,900/Math.max(canvas.width,canvas.height));
      preview.width=Math.max(1,Math.round(canvas.width*scale));preview.height=Math.max(1,Math.round(canvas.height*scale));
      preview.getContext('2d').drawImage(canvas,0,0,preview.width,preview.height);
      const src=imageData(preview.toDataURL('image/jpeg',.78));if(src&&src!==images[0])images.push(src);
    }
    if(!images.length&&typeof sourceImages==='function'){
      const source=sourceImages()[0];if(source){const doc=await historyDB('readonly',(store,done)=>{const request=store.get('edit-record:'+source.id);request.onsuccess=()=>done(request.result);});const src=imageData(doc?.layers?.find(layer=>layer.type==='image')?.src);if(src)images.push(src);}
    }
    return images;
  }
  $('promptHelpGenerate').addEventListener('click',async()=>{
    if(running||!target?.isConnected)return;
    running=true;$('promptHelpGenerate').disabled=true;$('promptHelpApply').disabled=true;$('promptHelpStatus').textContent='小米 MiMo 正在帮写…';
    try{
      if(scope!==generationScope())throw Error('作品已切换，请重新打开 AI 帮写。');
      const images=await references(target);
      if(!aiSessionToken)await checkAIService();
      if(!aiSessionToken)throw Error('图片工作台服务尚未就绪。');
      const draft=async(field,area)=>{
        const response=await fetch(aiAPI+'/api/prompt-help',{method:'POST',headers:{'Content-Type':'application/json','X-Workbench-Token':aiSessionToken},body:JSON.stringify({module:activeModule,kind:field,current:suggestionForField(area.value,field).text,instruction:$('promptHelpInstruction').value,images}),signal:AbortSignal.timeout(75000),cache:'no-store'});
        const data=await response.json();if(!response.ok)throw Error(data.error||'AI 帮写失败。');
        const suggestion=suggestionForField(data.text,field);
        if(!suggestion.text)throw Error('AI 建议未包含'+(field==='negative'?'反面':'正面')+'提示词，请重新生成。');
        return {data,suggestion};
      };
      const first=await draft(kind==='final'?'final':'request',target);
      if(scope!==generationScope())throw Error('作品已切换，请重新打开 AI 帮写。');
      $('promptHelpCandidate').value=first.suggestion.text;
      if(negativeTarget){
        $('promptHelpStatus').textContent='正面建议已生成，正在生成反面建议…';
        const second=await draft('negative',negativeTarget);
        if(scope!==generationScope())throw Error('作品已切换，请重新打开 AI 帮写。');
        negativeCandidate.value=second.suggestion.text;
      }
      $('promptHelpApply').disabled=false;
      $('promptHelpStatus').textContent='已生成 · '+first.data.model+(first.data.usedImages?' · 已参考 '+first.data.usedImages+' 张图片':' · 文字模式')+(negativeTarget?' · 正反面已分别生成':'');
    }catch(error){$('promptHelpStatus').textContent=error instanceof TypeError?'连接不到工作台服务，请运行 start.cmd 后刷新页面。':error.message||'AI 帮写失败。';}
    finally{running=false;$('promptHelpGenerate').disabled=false;}
  });
  $('promptHelpApply').addEventListener('click',()=>{
    if(!target?.isConnected||(negativeTarget&&!negativeTarget.isConnected)||scope!==generationScope()){$('promptHelpStatus').textContent='作品已切换，请重新打开 AI 帮写。';return;}
    const value=suggestionForField($('promptHelpCandidate').value,kind==='final'?'final':'request').text;if(!value){$('promptHelpStatus').textContent='正面建议内容为空。';return;}
    const negative=negativeTarget?suggestionForField(negativeCandidate.value,'negative').text:'';
    if(negativeTarget&&!negative){$('promptHelpStatus').textContent='反面建议内容为空。';return;}
    if(target.maxLength>0&&value.length>target.maxLength){$('promptHelpStatus').textContent='建议超过当前输入框的 '+target.maxLength+' 字限制，请先精简。';return;}
    if(negativeTarget&&negativeTarget.maxLength>0&&negative.length>negativeTarget.maxLength){$('promptHelpStatus').textContent='反面建议超过 '+negativeTarget.maxLength+' 字限制，请先精简。';return;}
    target.value=value;target.dispatchEvent(new Event('input',{bubbles:true}));target.dispatchEvent(new Event('change',{bubbles:true}));
    if(negativeTarget){negativeTarget.value=negative;negativeTarget.dispatchEvent(new Event('input',{bubbles:true}));negativeTarget.dispatchEvent(new Event('change',{bubbles:true}));}
    dialog.close();target.focus();
  });
  $('promptHelpClose').addEventListener('click',()=>dialog.close());
})();
