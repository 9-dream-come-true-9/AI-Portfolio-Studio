/* SKU-only implementation of the supplied content and visual standard. */
(function(root){
  'use strict';
  const COLORS=['#FFFFFF','#FFDCE9','#DFF5ED','#E6F4FF'];
  const FIELDS=['skuHighlight','skuProductName','skuSpec','skuProof','skuConcern','skuScent','skuSkin','skuVariant','skuBackground','skuDetailCopy'];
  function read(){return Object.fromEntries(FIELDS.map(id=>[id,document.getElementById(id).value.trim()]));}
  function fullImagePrompt(request='',hasReference=false,fields={}){
    const labels={skuHighlight:'主亮点',skuProductName:'商品名称',skuSpec:'规格、容量与数量',skuProof:'可信支撑',skuConcern:'购买顾虑',skuScent:'香型',skuSkin:'适用肤质',skuVariant:'版本差异',skuDetailCopy:'补充资料'};
    const facts=Object.entries(labels).filter(([key])=>fields[key]?.trim()).map(([key,label])=>label+'：'+fields[key].trim());
    return [
      '制作一张可以直接使用的完整电商 SKU 成品图，画面比例为 1:1。商品、文字、店名、背景和整体排版由你统一设计，一次完成。',
      '内容要求：根据本次需求中明确写出的使用场景与购买理由，提炼清楚、自然、中肯的主亮点；只使用下方商品资料、用户文字和本次附带参考图中能确认的信息。品牌、名称、规格、容量、数量、香型、肤质与版本差异仅呈现已确认的部分。',
      '阅读层级：第一眼看到商品和主亮点，第二眼看到成分、技术或可信支撑，最后确认规格与选择信息。主亮点醒目，数量信息适度，留白充分，缩小后仍清楚。具体构图与元素位置根据商品和本次需求灵活安排。',
      '字体统一采用苹方、黑体或阿里巴巴字体方向的无衬线字体，通过字号和字重区分层级。店名采用纯文字“夏天的淳淳”，放在安全边距内的稳定位置，大小克制。',
      '背景可以是单色、柔和渐变或有自然光影层次的背景。浅色方向参考纯白、清透粉 #FFDCE9、浅薄荷 #DFF5ED、浅水蓝 #E6F4FF；也可根据商品与本次需求采用深蓝或深绿方向，让主体明亮、文字清晰。配色与渐变可以自由设计，整体保持干净清透。',
      '视觉要求：装饰克制，让商品和购买理由成为重点，避免灰蒙浑浊、刺眼色块、土金色模板及花草、台座、波光密纹和促销标签堆叠抢走注意力。商品包装原有颜色真实保留。',
      hasReference?'已提供参考图片，保留参考商品的包装、瓶型、比例、品牌和已知规格，并按本次要求设计完整 SKU 图。':'本次没有参考图片，根据本次需求设计商品与完整 SKU 图。',
      '产品信息以用户提供的文字与参考图片为依据。缺少的信息省略，不借用培训案例中的产品数据，不编造成分含量、功效、使用频次或商品件数。',
      facts.length?'本次明确提供的商品资料：\n'+facts.join('\n'):'本次没有额外商品资料，不假定存在其他文档或历史对话。',
      request?'本次具体需求：\n'+request:'请结合参考商品完成文案与版式设计。',
      '直接输出完整成品图片。'
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
  root.SkuLayout={COLORS,FIELDS,read,fullImagePrompt,validate,build,apply,fieldsFromRequest,fingerprint,extractProduct,compose,updateField,syncFields};
})(window);
