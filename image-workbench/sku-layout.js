/* SKU content and visual standard, revised from sku需要换图(3).xlsx (20 reference images). */
(function(root){
  'use strict';
  const COLORS=['#FFFFFF','#FFDCE9','#DFF5ED','#E6F4FF'];
  const FIELDS=['skuHighlight','skuProductName','skuSpec','skuProof','skuConcern','skuScent','skuSkin','skuVariant','skuBackground','skuDetailCopy'];
  const PROMPT_REVISION='2026-10-29-xlsx';
  function read(){return Object.fromEntries(FIELDS.map(id=>[id,document.getElementById(id).value.trim()]));}
  function fullImagePrompt(request='',hasReference=false,fields={}){
    const labels={skuHighlight:'主亮点',skuProductName:'商品名称',skuSpec:'规格、容量与数量',skuProof:'可信支撑',skuConcern:'购买顾虑',skuScent:'香型',skuSkin:'适用肤质',skuVariant:'版本差异',skuDetailCopy:'补充资料'};
    const facts=Object.entries(labels).filter(([key])=>fields[key]?.trim()).map(([key,label])=>label+'：'+fields[key].trim());
    return [
      '制作一张可直接使用的完整电商 SKU 方图，比例 1:1，一次完成商品、文案、品牌、店名与背景的整体设计。不同商品可以采用不同构图；同一商品系列保持统一的背景色系、字体层级、LOGO位置、商品比例与信息区位置。',
      '先判断本次商品品类、真实包装、品牌气质及顾客最需要分辨的差异，再选择适合它的表现方式。若已有好看的主图或实拍，优先延续其构图、光影、底色和真实商品，在留白处补足选款信息；有手持或使用场景时保留其自然关系，不把所有商品机械改成同一张白底模板。本次明确要求重新设计时按本次要求执行。',
      '信息骨架：清楚的品牌LOGO＋纯文字店名“夏天的淳淳”＋清晰商品图＋商品名称＋规格／容量／数量。有明确资料时，再写一个核心购买理由和必要的选款信息；资料不足就省略对应文案，允许只展示已知品牌、名称与规格，不能为了满足骨架补造卖点。品牌LOGO应醒目、与商品品牌一致，优先忠实使用提供的真实标识；无法确认标识外形时只使用已确认的品牌文字，不编造图形。店名用自然清晰的文字排在安全边距内，字号克制，不加图形店标。',
      '阅读层级：第一眼认出商品和核心亮点，第二眼读懂支撑亮点的成分、技术、肤质或使用场景，最后轻松确认规格与版本。把相关信息分成少量对齐的短组，标题、说明、规格有明确主次；既不拥挤堆字，也不只留一瓶商品而缺少购买理由。每个信息区留足空间，文字不盖住包装、色号图、关键数字或其他文案。',
      '文案：优先回答“它解决什么具体需求、适合谁、为什么选这一款”。本次明确指定的文案照排；需要提炼时用资料能支持的具体、自然表达，避免“洗护方便”“高端品质”“多重呵护”等空泛词充当主卖点。一个核心卖点可配几条有根据的短支撑，避免同义反复。',
      '按品类选取以下信息，仅应用与本商品相关的一项，资料未提供的内容省略：',
      '护肤品／面霜／精华：核心功效、适合肤质、商品名与规格。核心成分或浓度在有助于选款且资料明确时展示；滋润／清爽等版本如有配方、肤质差异应分别写清，不能只换质地形容词。画面可用清透浅色、干净临床感或与品牌相符的质地表现。',
      '头发产品／洗护：核心功效、核心成分、适合的头皮／发质、香型、名称与规格。可采用大标题＋清晰商品＋分组说明，品牌和容量易识别；只有已知成分、香气或品牌场景支持时才点缀对应植物，植物不遮挡文字。',
      '身体护理：核心功效、核心特征、使用部位、香型、名称与规格。真实手持或身体护理场景可以作为主体，配短标题、必要的技术／成分说明和独立规格区，不机械照搬面部护肤信息。',
      '彩妆：准确色号／色名、真实颜色展示、妆效、名称与规格；底妆补充已知适合肤质／肤色，帮助选色选效果。商品与色块／试色分区对应，保持包装及颜色真实，不用强烈环境色把色号染偏。',
      '内服／营养补充：补充需求、适合人群、核心成分及对应含量、规格；可吃多久仅在包装总量与用量均明确时计算。用清晰商品搭配有层次的信息组，含量的每份单位、每日用量与总容量分清；不从参考案例借用适用年龄、服用建议、吸收率或健康功效。',
      '居家用品／香氛：用途、使用场景与关键选款信息，按商品选尺寸、材质、香型等；气味产品优先表达香型与嗅觉感受。有完整香调资料时可分前／中／后调，配相符的少量花材、木质或植萃道具，商品、道具和文字形成有留白的整体。没有完整香调表时不杜撰。',
      '配色和质感：从本次商品包装、品牌或已提供主图选择协调色系，色彩可以柔和通透，也可以深邃高级；柔粉、奶油白、浅蓝、薄荷与深蓝、深绿、黑紫、棕金均按商品气质使用，不强制套用固定底色。白色商品与白底也应有细微底色或光影区分轮廓。高端商品用真实的金属、玻璃、材质高光和克制景深；允许恰当的金色、台面与几何层次，避免廉价金边、古早装饰和不相干的满屏植物。',
      '排版与清晰度：商品、背景、道具与字体均需清晰细腻，抠图自然，没有白框、锯齿、灰蒙或过度磨皮。中文说明用清楚的黑体／苹方类字体；标题可以采用与品牌相符的字体气质，保留真实品牌字形，同一张图控制字体种类。通过字号、字重和间距组织信息，缩小预览仍可辨识，文字完整不裁切，不为塞内容把字缩成密密麻麻的小字。',
      '套组、赠品与活动：依据本次资料逐件核对主售商品的名称、规格和数量，主售与赠品分组，可用独立底部信息条承载确认过的加赠或套组明细；单品不要画成多件套。没有明确活动就不添加活动价、优惠券、买赠或促销标签，不把参考图中过期的价格、日期和活动字眼带入新图。',
      '信息真实性：本次用户文字、商品资料与对应商品图片是事实依据。只学习风格参考的配色、质感、层级和信息组织，不借用案例中的品牌、配方、浓度、容量、数量、功效、价格、认证或来源。正品、诊所购、进口和认证标记仅按本次明确提供的事实与要求呈现；不额外添加AI生成字样、平台水印、截图边框或无关文字。',
      hasReference?'本次有参考图片：先区分商品外观依据与风格依据。忠实保留对应商品的瓶型、包装、比例、品牌和已知规格；仅做排版与背景优化时，不擅改瓶身文字和颜色。':'本次没有参考图片：依据明确文字资料设计，不假定存在未附上的商品图、文档或历史资料；未确认的品牌标识与产品细节不要凭空补造。',
      facts.length?'本次明确提供的商品资料：\n'+facts.join('\n'):'本次没有额外商品资料，不假定存在其他文档或历史对话。',
      request?'本次具体需求：\n'+request:'请结合参考商品完成文案与版式设计。',
      '最终文字约束优先于上面的设计建议：画面文字只取本次明确提供的资料和对应包装上清楚可读的信息。不能凭品牌印象、产品外观或精华／面霜等品类名称推断功效；本次没有提供的“紧致、弹润、焕活”等功效也不能当通用文案补入。用户明确要求只写或不写的内容严格执行，缺资料就省略，不画“资料不足”等占位提示。核对品牌、名称、规格数量、选款差异、字词完整性与图片清晰度后，直接输出这一张完整成品图。'
    ].join('\n');
  }
  function validate(editor,fields=read()){
    if(!COLORS.includes(fields.skuBackground))throw Error('请选择规范中的背景色。');
    if(editor.state.width!==editor.state.height)throw Error('SKU 画布必须为 1:1 方图。');
  }
  async function build(editor,fields=read()){
    validate(editor,fields);



    if(!COLORS.includes(fields.skuBackground))throw Error('请选择规范中的背景色。');
    const source=editor.state.layers.find(layer=>layer.type==='image'&&layer.role==='product');
    if(!source)throw Error('请先导入商品图片。');
    const size=editor.state.width;
    if(size!==editor.state.height)throw Error('SKU 画布必须为 1:1 方图。');
    const src=await root.GiftLayout.trimTransparent(source.src),image=new Image();image.src=src;await image.decode();
    const rect=(x,y,w,h)=>({x:x*size,y:y*size,w:w*size,h:h*size});
    const fit=(w,h,box)=>{const k=Math.min(box.w/w,box.h/h);return{x:box.x+(box.w-w*k)/2,y:box.y+(box.h-h*k)/2,w:w*k,h:h*k};};
    const text=(value,role,name,box,fontScale,weight=400,minScale=.019)=>{
      if(!value&&!['sku-highlight','sku-name','sku-info'].includes(role))return null;
      const opts={...box,fontSize:Math.max(8,size*fontScale),fontWeight:weight,lineHeight:1.14,textAlign:'left',textVerticalAlign:'middle'};
      if(value)opts.fontSize=editor.fitText(value,opts);
      let layer={...opts,type:'text',text:value,color:'#243b34',role,name,locked:false,visible:true,opacity:1,rotation:0};
      while(editor.textOverflows(layer)&&layer.fontSize>8)layer.fontSize--;
      if(layer.fontSize<Math.max(8,size*minScale)||editor.textOverflows(layer))throw Error(name+'内容较多，请精简文字后再排版。');
      return layer;
    };
    const choice=[['香型',fields.skuScent],['肤质',fields.skuSkin],['版本',fields.skuVariant]].filter(([,value])=>value).map(([name,value])=>name+'：'+value).join(' · ');
    const layers=[
      {...fit(image.naturalWidth,image.naturalHeight,rect(.51,.32,.41,.48)),type:'image',src,role:'product',name:source.name||'商品原图',locked:false,visible:true,opacity:1,rotation:0},
      text('夏天的淳淳','sku-shop','SKU · 纯文字店名',rect(.72,.045,.20,.04),.019,400,.015),
      text(fields.skuHighlight,'sku-highlight','SKU · 主亮点',rect(.08,.115,.84,.17),.073,700,.047),
      text(fields.skuProductName,'sku-name','SKU · 品牌与名称',rect(.08,.315,.39,.075),.031,600,.023),
      text(fields.skuProof,'sku-proof','SKU · 亮点支撑',rect(.08,.425,.36,.155),.028,400,.020),
      text(fields.skuConcern,'sku-concern','SKU · 顾虑解答',rect(.08,.61,.36,.14),.026,400,.019),
      text((fields.skuSpec?'规格：'+fields.skuSpec:'')+(choice?'\n'+choice:''),'sku-info','SKU · 规格与选择信息',rect(.08,.835,.84,.115),.023,400,.019)
    ].filter(Boolean);
    return {layers,background:{type:'solid',color:fields.skuBackground},fields};
  }
  async function apply(editor,result){
    await Promise.all(result.layers.filter(layer=>layer.type==='image').map(layer=>editor._image(layer.src)));
    const before=JSON.parse(JSON.stringify(editor.state));editor.beginBatch();
    try{
      for(const layer of [...editor.state.layers])editor.remove(layer.id);
      editor.setBackground(result.background);
      for(const layer of result.layers){if(layer.type==='image')await editor.addImage(layer.src,layer);else root.ImageEditor.prototype.addText.call(editor,layer.text,layer);}
      editor.select(null);
    }catch(error){editor.state=before;editor.batchDirty=false;editor.batchNotify=true;throw error;}
    finally{editor.endBatch();}
  }
  function fieldsFromRequest(fields,request=''){
    const result={...fields},names={'主亮点':'skuHighlight','购买理由':'skuHighlight','商品名称':'skuProductName','品牌与名称':'skuProductName','规格':'skuSpec','规格容量与数量':'skuSpec','亮点支撑':'skuProof','顾虑解答':'skuConcern','顾客顾虑与解答':'skuConcern','香型':'skuScent','适用肤质':'skuSkin','SKU差异':'skuVariant'};
    for(const line of request.split(/\r?\n/)){const match=line.match(/^\s*([^：:]+)[：:]\s*(.+)$/);if(match&&names[match[1].trim()]&&!result[names[match[1].trim()]])result[names[match[1].trim()]]=match[2].trim();}
    result.skuDetailCopy=result.skuDetailCopy||request.slice(0,4000);return Object.fromEntries(FIELDS.map(key=>[key,String(result[key]||'').trim()]));
  }
  function fingerprint(project){return JSON.stringify({width:project.width,height:project.height,background:project.background,layers:project.layers});}
  async function extractProduct(src){
    const image=new Image();image.src=src;await image.decode();const w=image.naturalWidth,h=image.naturalHeight,total=w*h;
    if(total>16000000)throw Error('生成素材过大，无法安全处理。');
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
    const frame=ctx.getImageData(0,0,w,h),data=frame.data,border=[];
    for(let x=0;x<w;x++)border.push(x,(h-1)*w+x);for(let y=1;y<h-1;y++)border.push(y*w,y*w+w-1);
    const close=(i,color)=>Math.max(Math.abs(data[i*4]-color[0]),Math.abs(data[i*4+1]-color[1]),Math.abs(data[i*4+2]-color[2]))<65;
    const transparent=border.filter(i=>data[i*4+3]<8).length>border.length*.8;
    const keys=[[255,0,255],[0,255,0]],counts=keys.map(color=>border.filter(i=>close(i,color)).length),color=keys[counts[1]>counts[0]?1:0];
    const background=new Uint8Array(total),queue=new Int32Array(total);let head=0,tail=0;
    const isKey=i=>data[i*4+3]<8||close(i,color);
    if(transparent){for(let i=0;i<total;i++)if(data[i*4+3]<8)background[i]=1;}
    else{
      if(Math.max(...counts)<border.length*.6)throw Error('商品素材背景无法清晰分离，请调整要求后重试；本次不会自动重新生图。');
      const add=i=>{if(!background[i]&&isKey(i)){background[i]=1;queue[tail++]=i;}};for(const i of border)add(i);
      while(head<tail){const i=queue[head++],x=i%w;if(x)add(i-1);if(x<w-1)add(i+1);if(i>=w)add(i-w);if(i<total-w)add(i+w);}
    }
    // Keep all substantial components so multi-item SKUs do not lose the second product.
    const labels=new Int32Array(total),areas=[0];let id=0,largest=0;
    for(let start=0;start<total;start++)if(!background[start]&&!labels[start]&&data[start*4+3]>=8){
      id++;head=0;tail=0;queue[tail++]=start;labels[start]=id;
      const add=i=>{if(!background[i]&&!labels[i]&&data[i*4+3]>=8){labels[i]=id;queue[tail++]=i;}};
      while(head<tail){const i=queue[head++],x=i%w;if(x)add(i-1);if(x<w-1)add(i+1);if(i>=w)add(i-w);if(i<total-w)add(i+w);}
      areas[id]=tail;largest=Math.max(largest,tail);
    }
    if(largest<total*.003)throw Error('未找到清晰商品主体，本次不会自动重新生图。');
    const minimum=Math.max(8,largest*.015,total*.00002);
    for(let i=0;i<total;i++)if(background[i]||areas[labels[i]]<minimum||!labels[i])data[i*4+3]=0;
    ctx.putImageData(frame,0,0);return root.GiftLayout.trimTransparent(canvas.toDataURL('image/png'));
  }
  async function compose(raw,context){
    const src=await extractProduct(raw),canvas=document.createElement('canvas'),editor=new root.ImageEditor(canvas);
    await editor.loadProject(context.document);const product=editor.state.layers.find(layer=>layer.role==='product');
    if(product)await editor.replaceImage(product.id,src);else await editor.addImage(src,{role:'product',name:'AI 商品素材'});const result=await build(editor,context.fields);await apply(editor,result);
    const blob=await editor.exportBlob('png'),composite=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('SKU 合成失败。'));reader.readAsDataURL(blob);});
    return {...result,src:composite,context,project:editor.getProject()};
  }
  function updateField(editor,key,fields){
    if(!editor.state.layers.some(layer=>layer.role==='sku-highlight'))return;
    if(key==='skuBackground'){if(COLORS.includes(fields[key]))editor.setBackground({type:'solid',color:fields[key]});return;}
    const roles={skuHighlight:'sku-highlight',skuProductName:'sku-name',skuSpec:'sku-info'},defaults={skuHighlight:.073,skuProductName:.031,skuSpec:.023},layer=editor.state.layers.find(layer=>layer.role===roles[key]);if(!layer)return;
    const extra=layer.text.split('\n').slice(1).join('\n');
    const text=key==='skuSpec'?(fields.skuSpec?'规格：'+fields.skuSpec:'')+(extra?'\n'+extra:''):fields[key];
    const patch={text,fontSize:editor.fitText(text,{...layer,fontSize:Math.max(layer.fontSize,editor.state.width*defaults[key])})};editor.update(layer.id,patch);
  }
  function syncFields(state){
    if(!state.layers.some(layer=>layer.role==='sku-highlight'))return;
    for(const [id,role] of Object.entries({skuHighlight:'sku-highlight',skuProductName:'sku-name',skuProof:'sku-proof',skuConcern:'sku-concern',skuSpec:'sku-info'})){
      const input=document.getElementById(id),layer=state.layers.find(layer=>layer.role===role);
      if(input&&layer&&document.activeElement!==input)input.value=id==='skuSpec'?layer.text.split('\n')[0].replace(/^规格[：:]\s*/,''):layer.text;
    }
    const background=document.getElementById('skuBackground');if(background&&COLORS.includes(state.background.color)&&document.activeElement!==background)background.value=state.background.color;
  }
  root.SkuLayout={COLORS,FIELDS,PROMPT_REVISION,read,fullImagePrompt,validate,build,apply,fieldsFromRequest,fingerprint,extractProduct,compose,updateField,syncFields};
})(window);
