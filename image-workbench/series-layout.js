/* Reuse one approved layout. Only explicitly supplied slot contents change. */
(function(root){
  'use strict';
  const IMAGE=/^data:image\/(?:png|jpeg|webp);base64,/i;
  const PREFIX='series-slot:';
  const cache=new WeakMap();
  const copy=value=>JSON.parse(JSON.stringify(value));
  const owns=(value,key)=>Object.prototype.hasOwnProperty.call(value||{},key);
  const shown=layer=>layer.visible!==false&&Number(layer.opacity??1)>0;
  const boxValid=box=>['x','y','w','h'].every(key=>Number.isFinite(box[key]))&&box.w>0&&box.h>0;
  const text=value=>String(value??'');
  const unique=values=>[...new Set(values.filter(Boolean).map(text))];
  const warningText=value=>typeof value==='string'?value:text(value?.message||value?.label);
  function dimensions(value){
    if(!Number.isInteger(value?.width)||!Number.isInteger(value?.height)||value.width<64||value.height<64||value.width>4096||value.height>4096)throw Error('母图画布尺寸须在 64 到 4096 像素之间。');
  }
  function imageSource(value,label){
    if(!IMAGE.test(text(value)))throw Error((label||'图片')+'无效，请重新上传 PNG、JPEG 或 WebP 图片。');
    return value;
  }
  function slotId(layer){return text(layer.groupId).startsWith(PREFIX)?layer.groupId.slice(PREFIX.length):null;}
  function specs(project){
    const metadata=project.meta?.seriesLayout?.slots||[];
    return project.layers.filter(layer=>slotId(layer)).map(layer=>{
      const id=slotId(layer),saved=metadata.find(slot=>slot.id===id||slot.layerId===layer.id)||{};
      return {...saved,id,layerId:layer.id,kind:layer.type==='image'?(saved.kind==='image'||layer.role==='series-image'?'image':'product'):'text',label:saved.label||layer.name||id,layer};
    });
  }
  function buildTemplate(layout){
    dimensions(layout);
    if(!Array.isArray(layout.slots)||!layout.slots.length)throw Error('没有识别到可替换内容，请重新解析母图。');
    if(layout.slots.length>149)throw Error('母图内容过多，请将替换位置减少到 149 个以内。');
    const warnings=(layout.warnings||[]).map(warningText),ids=new Set(),bindings=[];
    const layers=[{id:'series_background',type:'image',role:'series-background',name:'固定背景',src:imageSource(layout.backgroundSrc,'母图背景'),x:0,y:0,w:layout.width,h:layout.height,rotation:0,opacity:1,visible:true,locked:true}];
    layout.slots.forEach((slot,index)=>{
      const id=text(slot.id||'slot_'+(index+1));
      if(id.length>80||ids.has(id))throw Error('母图的替换位置编号重复或过长，请重新解析。');
      ids.add(id);
      if(!['product','text','image'].includes(slot.kind)||!boxValid(slot))throw Error('“'+text(slot.label||id)+'”的位置或类型无效，请重新解析母图。');
      if(slot.x<0||slot.y<0||slot.x+slot.w>layout.width+.5||slot.y+slot.h>layout.height+.5)throw Error('“'+text(slot.label||id)+'”超出画布，请在母图中校正。');
      const binding={id,layerId:'series_content_'+index,kind:slot.kind,role:text(slot.role),label:text(slot.label||((slot.kind==='product'?'商品':'文字')+(index+1))),confidence:Number.isFinite(slot.confidence)?slot.confidence:null};
      if(slot.kind==='text')binding.maxLines=Number.isInteger(slot.maxLines)&&slot.maxLines>0?slot.maxLines:Math.max(1,text(slot.text).split('\n').length);
      binding.minFontScale=Number.isFinite(slot.minFontScale)?Math.max(.75,Math.min(1,slot.minFontScale)):.85;
      if(slot.productFacts)binding.productFacts=copy(slot.productFacts);
      if(binding.confidence!==null&&binding.confidence<.8)warnings.push('“'+binding.label+'”识别置信度较低，请在画布核对内容和位置。');
      const layer={id:binding.layerId,groupId:PREFIX+id,name:binding.label,type:slot.kind==='text'?'text':'image',role:slot.kind==='product'?'series-product':slot.kind==='image'?'series-image':'series-text',x:slot.x,y:slot.y,w:slot.w,h:slot.h,rotation:Number(slot.rotation)||0,opacity:1,visible:true,locked:false};
      if(slot.kind!=='text'){
        layer.src=imageSource(slot.productSrc||slot.imageSrc||slot.src,'“'+binding.label+'”素材');
        if(slot.sourceBox){
          if(!boxValid(slot.sourceBox))throw Error('“'+binding.label+'”商品裁切位置无效，请重新解析。');
          for(const key of ['x','y','w','h'])layer[key]=slot.sourceBox[key];
        }
      }
      else {
        const fontSize=Number(slot.fontSize)||Math.min(64,slot.h/1.25);
        if(fontSize<8||fontSize>1000)throw Error('“'+binding.label+'”的字号无效，请重新解析。');
        Object.assign(layer,{text:text(slot.text),fontSize,color:/^#[a-f0-9]{6}$/i.test(slot.color)?slot.color:'#24453e',fontWeight:slot.fontWeight||600,textAlign:['left','center','right'].includes(slot.align||slot.textAlign)?slot.align||slot.textAlign:'left',textVerticalAlign:['top','middle','bottom'].includes(slot.verticalAlign)?slot.verticalAlign:'top',lineHeight:Math.max(.8,Math.min(3,Number(slot.lineHeight)||1.25))});
      }
      bindings.push(binding);layers.push(layer);
    });
    // OCR gives ink bounds, while canvas fonts need their own line metrics. Resolve
    // those differences once, before the approved editable template is displayed.
    if(typeof root.ImageEditor!=='function')throw Error('画布尚未就绪，请稍后重试。');
    const measuring=new root.ImageEditor(document.createElement('canvas'));
    for(const binding of bindings){
      if(binding.kind!=='text')continue;
      const layer=layers.find(item=>item.id===binding.layerId);
      const original=copy(layer);
      try{fitSlotText(measuring,layer,binding,original);}
      catch(error){
        if(error.code!=='SERIES_TEXT_FIT_OVERFLOW')throw error;
        // Keep a repairable mother document even when OCR's first text bounds
        // are too small. The strict final compose check still blocks export.
        layer.fontSize=original.fontSize;
        binding.initialOverflowWarning='“'+binding.label+'”文字超出识别范围，已保留可编辑文字；请在母图画布扩大文字框或调整文案后再批量生成。';
        warnings.push(binding.initialOverflowWarning);
      }
      binding.initialTextHeight=layer.h;
    }
    return {app:'ChunImageStudio',version:1,width:layout.width,height:layout.height,background:{type:'transparent',color:'#ffffff'},layers,selectedId:null,meta:{module:'sku',seriesLayout:{version:2,slots:bindings,warnings:unique(warnings),...(layout.productFacts?{productFacts:copy(layout.productFacts)}:{})}}};
  }
  function validateTemplate(project){
    dimensions(project);
    if(!Array.isArray(project.layers)||!project.layers.length||project.layers.length>150)throw Error('母图图层无效，请重新解析母图。');
    const bindings=specs(project),ids=new Set();
    if(!bindings.length)throw Error('当前画布没有母图替换位置，请先解析母图。');
    for(const slot of bindings){
      if(ids.has(slot.id))throw Error('母图有重复的替换位置，请删除重复图层后重试。');
      ids.add(slot.id);
      if(!boxValid(slot.layer))throw Error('“'+slot.label+'”尺寸无效，请在画布调整。');
      if(slot.kind!=='text')imageSource(slot.layer.src,'“'+slot.label+'”素材');
      else if(slot.layer.type!=='text'||!Number.isFinite(slot.layer.fontSize)||slot.layer.fontSize<8)throw Error('“'+slot.label+'”文字格式无效，请在画布调整。');
    }
    return bindings;
  }
  // Preserve the lower centre even when the editable product was rotated.
  function fitProductBox(width,height,box){
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||!boxValid(box))throw Error('商品图片尺寸无效，请重新上传。');
    const scale=Math.min(box.w/width,box.h/height),w=width*scale,h=height*scale;
    const angle=(Number(box.rotation)||0)*Math.PI/180,shift=(box.h-h)/2;
    return {x:box.x+(box.w-w)/2-Math.sin(angle)*shift,y:box.y+(box.h-h)/2+Math.cos(angle)*shift,w,h};
  }
  function fitImageBox(width,height,box){
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||!boxValid(box))throw Error('图标图片尺寸无效，请重新上传。');
    const scale=Math.min(box.w/width,box.h/height),w=width*scale,h=height*scale;
    return {x:box.x+(box.w-w)/2,y:box.y+(box.h-h)/2,w,h};
  }
  function fitSlotText(editor,layer,binding,original){
    if(!layer.text)return;
    const base=original.fontSize,min=Math.max(8,base*(binding.minFontScale||.85));
    const originalLines=Math.max(1,text(original.text).split('\n').length);
    const addedLines=binding.initialTextHeight?Math.max(0,Math.floor((original.h-binding.initialTextHeight+.01)/(base*(original.lineHeight||1.25)))):0;
    const maxLines=Math.max(binding.maxLines||1,originalLines)+addedLines;
    const fits=()=>!editor.textOverflows(layer)&&editor.textLayout(layer).lines.length<=maxLines;
    layer.fontSize=base;
    if(fits())return;
    // Only a small font adjustment is allowed; never rewrite text or move other slots.
    layer.fontSize=min;
    if(!fits()){
      const error=Error('“'+binding.label+'”文字放不下：请精简文案，或在母图画布扩大这个文字框（最多 '+maxLines+' 行，字号最低 '+Math.round(min)+'）。');
      error.code='SERIES_TEXT_FIT_OVERFLOW';error.slotId=binding.id;throw error;
    }
    let low=min,high=base;
    for(let iteration=0;iteration<12;iteration++){
      const mid=(low+high)/2;layer.fontSize=mid;
      if(fits())low=mid;else high=mid;
    }
    layer.fontSize=Math.floor(low*100)/100;
  }
  function capacity(textValue){
    const value=text(textValue).toLowerCase().replace(/ｍｌ/g,'ml').replace(/[×✕*]/g,'x');
    const matches=[...value.matchAll(/(\d+(?:\.\d+)?)\s*(毫升|ml|升|l)(?![a-z])/g)];
    const volumes=matches.map(match=>Number(match[1])*(match[2]==='l'||match[2]==='升'?1000:1));
    const counts=[...value.matchAll(/(\d+)\s*(?:瓶|支|件|袋|盒|套)/g)].map(match=>Number(match[1]));
    const before=value.match(/(\d+)\s*x\s*\d+(?:\.\d+)?\s*(?:ml|毫升|l|升)(?![a-z])/);
    const after=value.match(/\d+(?:\.\d+)?\s*(?:ml|毫升|l|升)\s*x\s*(\d+)(?![\d.])/);
    if(before)counts.unshift(Number(before[1]));else if(after)counts.unshift(Number(after[1]));
    const units=counts.find(count=>count>0)||null;
    return {volumes,units,total:/(?:总量|合计|总净含量|total|共\s*\d+(?:\.\d+)?\s*(?:ml|毫升|l|升))/.test(value)};
  }
  function factCapacity(facts){
    if(!facts||typeof facts!=='object')return null;
    const direct=Number(facts.unitCapacityMl??facts.perUnitMl??facts.capacityMl??facts.volumeMl);
    if(Number.isFinite(direct)&&direct>0)return direct;
    const parsed=capacity(facts.capacity||facts.capacityText||facts.labelCapacity||'');
    return parsed.volumes.length===1&&!parsed.total?parsed.volumes[0]:null;
  }
  function checkProductFacts(template,row,bindings){
    bindings=bindings||validateTemplate(template);
    const warnings=[],productBindings=bindings.filter(slot=>slot.kind==='product');
    const productChanged=!!row.productSrc||Object.values(row.products||{}).some(Boolean);
    const facts=row.productFacts||(productChanged?null:template.meta?.seriesLayout?.productFacts||productBindings[0]?.productFacts);
    const known=factCapacity(facts),reliable=known!==null&&Number(facts.confidence)>=.8;
    const specSlots=bindings.filter(slot=>slot.kind==='text'&&/(?:spec|capacity|volume|规格|容量|净含量)/i.test(slot.role+' '+slot.label));
    const changedSpecs=specSlots.filter(slot=>productChanged||(owns(row.values,slot.id)&&row.values[slot.id]!=null&&text(row.values[slot.id])!==slot.layer.text));
    if(productBindings.length===1)for(const slot of specSlots){
      const wanted=capacity(owns(row.values,slot.id)&&row.values[slot.id]!=null?row.values[slot.id]:slot.layer.text);
      if(wanted.units>1||(wanted.total&&wanted.volumes.length&&(!reliable||wanted.volumes.some(value=>value>known+.01))))warnings.push('“'+slot.label+'”使用多件或总量表述，但母图只有 1 个商品展示位置；请核对展示件数，图片不会自动复制商品。');
    }
    if(productBindings.length>1&&(changedSpecs.length||productChanged))return ['母图含多件商品，请分别核对每件容量、件数与组合规格；未用单件容量替代组合总量。'];
    for(const slot of changedSpecs){
      const wanted=capacity(owns(row.values,slot.id)&&row.values[slot.id]!=null?row.values[slot.id]:slot.layer.text);
      if(!wanted.volumes.length)continue;
      if(!reliable){warnings.push('“'+slot.label+'”已变更；尚不能确认商品包装容量，请核对瓶身与本行规格。');continue;}
      const distinct=unique(wanted.volumes).map(Number);
      if(distinct.length!==1){
        if(wanted.units&&distinct.every(value=>Math.abs(value-known)<.01||Math.abs(value-known*wanted.units)<.01))continue;
        warnings.push('“'+slot.label+'”包含多个容量，请核对每件容量、件数与总量。');continue;
      }
      const desired=distinct[0];
      if(wanted.total){
        if(!wanted.units){warnings.push('“'+slot.label+'”填写了总量，需核对件数以及每件包装容量。');continue;}
        if(Math.abs(desired-known*wanted.units)<.01)continue;
      }else if(Math.abs(desired-known)<.01)continue;
      if(wanted.units&&Math.abs(desired-known*wanted.units)<.01){warnings.push('“'+slot.label+'”可能表示总量，请确认每件 '+known+'ml × '+wanted.units+' 件，并注明总量。');continue;}
      const error=Error('“'+slot.label+'”与商品素材记录的每件 '+known+'ml 不一致：请核对包装，或上传对应 SKU 商品图后再生成。');
      error.code='SERIES_PRODUCT_CAPACITY_MISMATCH';error.slotId=slot.id;throw error;
    }
    if(productChanged&&!row.productFacts)warnings.push('已使用新商品原图；包装上的名称、容量和单位尚未自动核验，请核对对应 SKU。');
    return unique(warnings);
  }
  async function dataURL(blob){
    return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('合成预览读取失败，请重试。'));reader.readAsDataURL(blob);});
  }
  async function compose(template,row={}, {preview=true}={}){
    const bindings=validateTemplate(template),values=row.values||{},products=row.products||{},images=row.images||{};
    if(typeof values!=='object'||Array.isArray(values))throw Error('本行替换内容无效，请重新填写。');
    for(const [kind,sources] of [['product',products],['image',images]]){
      if(typeof sources!=='object'||Array.isArray(sources))throw Error('本行替换图片无效，请重新上传。');
      for(const [id,source] of Object.entries(sources))if(source&&!bindings.some(slot=>slot.id===id&&slot.kind===kind))throw Error('替换图片“'+id+'”找不到对应位置，请重新读取母图。');
    }
    for(const [id,value] of Object.entries(values)){
      const slot=bindings.find(item=>item.id===id&&item.kind==='text');
      if(!slot&&value!=null&&value!=='')throw Error('本行内容“'+id+'”找不到对应文字位置，请重新读取母图。');
      if(value!=null&&typeof value!=='string')throw Error('替换文案须为文字。');
      if(text(value).length>10000)throw Error('替换文案过长，请精简后重试。');
    }
    if(typeof root.ImageEditor!=='function')throw Error('画布尚未就绪，请稍后重试。');
    await document.fonts?.ready;
    const editor=new root.ImageEditor(document.createElement('canvas')),project=copy(template);
    const fixedImages=cache.get(template)||new Map();cache.set(template,fixedImages);editor.images=new Map(fixedImages);
    const warnings=[...(template.meta?.seriesLayout?.warnings||[]),...checkProductFacts(template,{...row,values},bindings)];
    const firstProduct=bindings.find(slot=>slot.kind==='product');
    if(row.productSrc&&!firstProduct)throw Error('这张母图没有商品替换位置，请在画布中确认商品图层。');
    for(const slot of bindings){
      const layer=project.layers.find(item=>item.id===slot.layerId);
      if(slot.kind==='text'&&owns(values,slot.id)&&values[slot.id]!=null)layer.text=values[slot.id];
      const source=owns(products,slot.id)?products[slot.id]:(slot===firstProduct?row.productSrc:null);
      if(slot.kind==='product'&&source){
        const image=await editor._image(imageSource(source,'替换商品'));
        Object.assign(layer,fitProductBox(image.naturalWidth,image.naturalHeight,slot.layer),{src:source});delete layer.backgroundCutoutSrc;
        if(layer.w/image.naturalWidth>2)warnings.push('商品素材分辨率偏低，放大后可能模糊，请换用高清原图。');
      }
      if(slot.kind==='image'&&images[slot.id]){
        const image=await editor._image(imageSource(images[slot.id],'替换图标'));
        Object.assign(layer,fitImageBox(image.naturalWidth,image.naturalHeight,slot.layer),{src:images[slot.id]});delete layer.backgroundCutoutSrc;
        if(layer.w/image.naturalWidth>2)warnings.push('“'+slot.label+'”素材分辨率偏低，放大后可能模糊，请换用高清原图。');
      }
    }
    for(const layer of project.layers)if(layer.role==='series-background')layer.locked=true;
    project.selectedId=null;
    await editor.loadProject(project);
    for(const slot of bindings){
      if(slot.kind!=='text'||!owns(values,slot.id)||values[slot.id]==null||values[slot.id]===slot.layer.text)continue;
      const layer=editor.state.layers.find(item=>item.id===slot.layerId);
      if(shown(layer))fitSlotText(editor,layer,slot,slot.layer);
    }
    // Canvas edits may have made an inherited or newly added text layer too long.
    // Validate every visible layer without changing content that this row inherits.
    for(const layer of editor.state.layers){
      if(layer.type!=='text'||!shown(layer)||!editor.textOverflows(layer))continue;
      const binding=bindings.find(slot=>slot.layerId===layer.id);
      const error=Error('“'+(binding?.label||layer.name||'文字')+'”在母图画布中超出文字框，请精简文字或扩大文字框后再生成。');
      error.code='SERIES_TEXT_OVERFLOW';error.slotId=binding?.id||null;throw error;
    }
    // A successful final check resolves first-build text warnings after a canvas repair.
    for(const binding of template.meta?.seriesLayout?.slots||[]){
      const index=warnings.indexOf(binding.initialOverflowWarning);
      if(index>=0)warnings.splice(index,1);
    }
    for(const layer of template.layers)if(layer.type==='image'&&editor.images.has(layer.src))fixedImages.set(layer.src,editor.images.get(layer.src));
    const result=editor.getProject();
    result.meta={...(project.meta||{}),seriesLayout:{...(project.meta?.seriesLayout||{}),version:2,slots:bindings.map(({layer,...slot})=>slot),warnings:unique(warnings)},seriesRowId:text(row.id)};
    return {project:result,src:preview?await dataURL(await editor.exportBlob('png')):null,warnings:unique(warnings)};
  }
  root.SeriesLayout={buildTemplate,validateTemplate,compose,fitProductBox,fitImageBox,checkProductFacts,capacity,slotId,slots:project=>validateTemplate(project).map(({layer,...slot})=>slot)};
})(window);
