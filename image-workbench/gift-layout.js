/* Gift geometry is applied by the compositor, never inferred from model pixels. */
(function (root) {
  'use strict';
  const BASE = Object.freeze({width:1440,height:1920,x:110,y:612,w:314,h:388});
  const copy = value => JSON.parse(JSON.stringify(value));
  const isGift = layer => /^gift-/.test(layer.role || '');
  const MAX_GIFTS = 60;
  const STYLES=Object.freeze([
    {id:'white',name:'纯白留白',color:'#FFFFFF',text:'#233D35',header:'#446052',note:'墨绿标题带，纯白商品展示区'},
    {id:'rose',name:'清透粉',color:'#FFF0F5',text:'#4D2F3D',header:'#9A526D',note:'莓粉标题带，清透浅粉商品展示区'},
    {id:'mint',name:'浅薄荷',color:'#EDF8F2',text:'#224A3B',header:'#38745D',note:'森林绿标题带，浅薄荷商品展示区'},
    {id:'blue',name:'浅水蓝',color:'#EDF6FF',text:'#264C69',header:'#477A9F',note:'水蓝标题带，清透浅蓝商品展示区'},
    {id:'navy',name:'深蓝光感',color:'#F2F5FA',text:'#243D5B',header:'#263F66',note:'海军蓝标题带，明亮浅蓝灰商品展示区'},
    {id:'forest',name:'深绿层次',color:'#F0F5F0',text:'#244737',header:'#254D3C',note:'深绿标题带，清浅乳白绿商品展示区'}
  ]);
  const OFFERS=Object.freeze([
    {id:'gift',label:'买就送',design:'经典赠礼标题带'},
    {id:'brand',label:'品牌加赠',design:'精致双线品牌铭牌'},
    {id:'order',label:'下单就送',design:'平直通栏标题带'},
    {id:'threshold',label:'满件条件',design:'完整卡片与虚线分隔'},
    {id:'same',label:'买N送同款',design:'双礼盒与通栏缎带'},
    {id:'loyal',label:'老客福利',design:'通栏标题与爱心装饰'}
  ]);
  function offerKind(text){const t=String(text||'');return /^品牌加赠/.test(t)?'brand':/^(?:下单就送|下单赠)/.test(t)?'order':/^满件条件/.test(t)?'threshold':/^买(?:N|\d+)送同款/.test(t)?'same':/^老客福利/.test(t)?'loyal':'gift';}
  function offerHeading(id,n=''){
    const offer=OFFERS.find(o=>o.id===id)||OFFERS[0];
    if(offer.id!=='same')return offer.label;
    if(String(n).trim()==='')return offer.label;
    if(!Number.isInteger(Number(n))||Number(n)<1||Number(n)>99)throw Error('购买件数 N 请输入 1–99 的整数。');
    return '买'+Number(n)+'送同款';
  }
  function offerDescription(text){return String(text||'').trim().replace(/^(?:(?:买就送|品牌加赠|下单就送|下单赠礼?|满件条件|买(?:N|\d+)送同款|老客福利|赠品|赠送)[：:\s]*)+/,'');}
  const getStyle=id=>STYLES.find(s=>s.id===id)||STYLES[2];
  function stylePrompt(id,offer='gift',n=''){return '标题：'+offerHeading(offer,n)+'；版式：'+(OFFERS.find(o=>o.id===offer)||OFFERS[0]).design+'；'+getStyle(id).note+'；顶部赠礼标题、下方居中商品说明与大幅商品主体。背景干净平整，不使用模糊纹理或噪点，保留包装真实颜色。';}
  function lightColor(color){const hex=String(color).replace('#','');if(!/^[a-f0-9]{6}$/i.test(hex))return false;const rgb=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16));return rgb[0]*.299+rgb[1]*.587+rgb[2]*.114>190;}
  function giftColor(header){
    const rgb=[1,3,5].map(i=>parseInt(header.slice(i,i+2),16)),high=Math.max(...rgb),low=Math.min(...rgb),range=high-low;
    // Preserve the template hue while deepening its value and strengthening chroma.
    // The reference pairs a brown header (#885e2e) with a deep brown gift (#431d00).
    const value=high*.56,saturation=high?Math.min(.98,range/high+.28):0,floor=value*(1-saturation);
    return '#'+rgb.map(channel=>Math.round(range?floor+(channel-low)/range*(value-floor):value).toString(16).padStart(2,'0')).join('');
  }
  function cardOutline(ctx){ctx.beginPath();ctx.roundRect(.8,19.8,312.4,367.4,[0,28,30,30]);}
  function paintStyle(ctx,w,h,id,color,offer='gift'){
    const style=getStyle(id);ctx.save();ctx.scale(w/314,h/388);
    const body=color||style.color,header=style.header;
    ctx.save();cardOutline(ctx);ctx.clip();
    ctx.fillStyle=body;ctx.fillRect(0,19,314,369);
    ctx.fillStyle=header;
    ctx.fillRect(0,19,314,80);
    ctx.restore();
    if(offer==='brand'){ctx.strokeStyle=body+'95';ctx.lineWidth=1;ctx.strokeRect(12,29,290,62);}
    if(offer==='threshold'){ctx.save();ctx.strokeStyle=header;ctx.lineWidth=1.5;ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(15,103);ctx.lineTo(299,103);ctx.stroke();ctx.restore();}
    if(offer==='loyal'){ctx.fillStyle=body;for(const x of [32,282]){ctx.beginPath();ctx.moveTo(x,67);ctx.bezierCurveTo(x-14,57,x-5,49,x,55);ctx.bezierCurveTo(x+5,49,x+14,57,x,67);ctx.fill();}}
    ctx.strokeStyle=header+'80';ctx.lineWidth=1.4;cardOutline(ctx);ctx.stroke();
    // Gift and ribbon use the same hue family as the title band, as in the reference.
    const giftInk=giftColor(header);
    const drawGift=(offset=0,scale=1)=>{ctx.save();ctx.translate(157+offset,0);ctx.scale(scale,scale);ctx.translate(-157,0);
    ctx.strokeStyle=giftInk;ctx.lineWidth=4;ctx.lineCap='round';ctx.lineJoin='round';
    ctx.beginPath();ctx.moveTo(157,14);ctx.bezierCurveTo(133,-5,135,17,157,12);ctx.bezierCurveTo(179,-5,181,17,157,14);ctx.stroke();
    ctx.fillStyle=giftInk;ctx.strokeStyle=giftInk;ctx.lineWidth=1.2;
    ctx.beginPath();ctx.roundRect(139,24,36,19,2);ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.roundRect(135,14,44,11,2);ctx.fill();ctx.stroke();
    ctx.fillStyle=header;ctx.fillRect(139,25,36,1.5);ctx.fillRect(154.5,14,5,29);
    ctx.restore();};
    if(offer==='same'){drawGift(-19,.8);drawGift(19,.8);}else drawGift();
    ctx.fillStyle='#ffffff';for(const [x,y,r] of [[252,32,7],[267,21,4]]){ctx.beginPath();ctx.moveTo(x,y-r);ctx.quadraticCurveTo(x+1,y-1,x+r,y);ctx.quadraticCurveTo(x+1,y+1,x,y+r);ctx.quadraticCurveTo(x-1,y+1,x-r,y);ctx.quadraticCurveTo(x-1,y-1,x,y-r);ctx.fill();}
    ctx.restore();
  }
  function stylePreview(id,offer='gift'){const s=getStyle(id),c=document.createElement('canvas');c.width=314;c.height=388;const ctx=c.getContext('2d');paintStyle(ctx,314,388,id,null,offer);ctx.fillStyle='#fff';ctx.fillRect(85,58,144,14);ctx.fillStyle=s.text;ctx.globalAlpha=.65;ctx.fillRect(65,118,184,8);for(let i=0;i<3;i++){ctx.beginPath();ctx.roundRect(72+i*62,161,46,193,7);ctx.fill();}return c.toDataURL('image/png');}
  async function referenceImages(assets){
    if(assets.length<=3)return assets.map(a=>a.src);
    const c=document.createElement('canvas');c.width=1024;c.height=1024;const ctx=c.getContext('2d'),cols=Math.ceil(Math.sqrt(assets.length)),rows=Math.ceil(assets.length/cols);
    for(let i=0;i<assets.length;i++){const img=await image(assets[i].src),box={x:i%cols*1024/cols+16,y:Math.floor(i/cols)*1024/rows+16,w:1024/cols-32,h:1024/rows-32},r=contain(img.naturalWidth,img.naturalHeight,box);ctx.drawImage(img,r.x,r.y,r.w,r.h);}
    return [c.toDataURL('image/png')];
  }
  function quantity(value) {
    const n=Number(value ?? 1);
    if(!Number.isInteger(n)||n<1||n>MAX_GIFTS)throw Error('每种赠品数量必须是 1–60 的整数。');
    return n;
  }
  function normalizeName(value) {return String(value||'').replace(/(?:同款|同品牌|品牌随机|随机|下单赠|买就送|赠品|赠送|注意|图片|数量)|[\s：:，,。.!！]/g,'').toLowerCase();}
  function quantityEntries(text) {
    const entries=[];
    // Capacity is part of the product name, never a product count (50ml × 2).
    const pattern=/([^+＋\n，,。；;：:]+?)\s*[*＊×xX]\s*(\d+)(?!\d)(?:\s*(?:瓶|片|支|袋|个|件|盒|份))?/g;
    const normalized=String(text||'').replace(/([一二两三四五六七八九十]+)(?=\s*[瓶片支袋个件盒份])/g,value=>{const digit={'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9};const parts=value.split('十');return String(parts.length===2?(digit[parts[0]]||1)*10+(digit[parts[1]]||0):digit[value]||value);});
    const rest=normalized.replace(pattern,(_,name,count)=>{entries.push({name:name.trim(),quantity:quantity(count)});return '';});
    for(const clause of rest.split(/[+＋\n，,。；;：:]/)){
      let match=clause.trim().match(/^(.+?)\s*(\d+)\s*(瓶|片|支|袋|个|件|盒|份)(?:[。！!\s]*)$/);
      if(match&&!/^(?:共|合计|总计|总共|一共)$/.test(match[1]))entries.push({name:match[1].trim(),quantity:quantity(match[2])});
      else if((match=clause.trim().match(/^(\d+)\s*(?:瓶|片|支|袋|个|件|盒|份)\s*(.+)$/)))entries.push({name:match[2].trim(),quantity:quantity(match[1])});
    }
    return entries;
  }
  function resolveAssets(assets,title='',request='') {
    const result=assets.map(asset=>({...asset,quantity:quantity(asset.quantity)}));
    if(!result.length)return result;
    // Uploaded quantities remain editable even when free-form copy cannot be matched.
    let entries=[];try{entries=quantityEntries(title+'\n'+request);}catch{}
    const assigned=new Map(),conflicted=new Set();
    const number=value=>/^\d+$/.test(value)?Number(value):({'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10}[value]);
    const aliases=[];
    for(const match of request.matchAll(/([^\n，,。；;：:]+?)(?:是|对应|用|使用)\s*(?:图片|图|第)\s*([一二三四五六七八九十\d]+)(?:张)?/g))aliases.push({name:normalizeName(match[1]),index:number(match[2])-1});
    const unresolved=[];
    for(const entry of entries){
      const name=normalizeName(entry.name);
      let matches=result.map((asset,index)=>({asset,index})).filter(({asset,index})=>{
        const labels=[asset.label,...aliases.filter(a=>a.index===index).map(a=>a.name),asset.name?.replace(/\.[^.]+$/,'')].map(normalizeName).filter(Boolean);
        return labels.some(label=>name===label||(label.length>=2&&name.length>=2&&(name.includes(label)||label.includes(name))))||new RegExp('(?:图片|图)\\s*(?:'+(index+1)+'|'+['一','二','三','四','五','六','七','八','九','十'][index]+')').test(entry.name);
      });
      if(result.length===1)matches=[{index:0}];
      if(matches.length===1){
        const i=matches[0].index,previous=assigned.get(i);
        if(previous&&previous.quantity!==entry.quantity)conflicted.add(i);
        assigned.set(i,entry);
      }else unresolved.push(entry);
    }
    const remaining=result.map((_,i)=>i).filter(i=>!assigned.has(i));
    if(unresolved.length===1&&remaining.length===1)assigned.set(remaining[0],unresolved.pop());
    for(const [i,entry] of assigned){
      if(result[i].quantitySource==='manual'||conflicted.has(i))continue;
      result[i].quantity=entry.quantity;
      if(!result[i].label)result[i].label=entry.name;
    }
    if(result.reduce((sum,a)=>sum+a.quantity,0)>MAX_GIFTS){
      const originals=assets.map(asset=>({...asset,quantity:quantity(asset.quantity)}));
      if(originals.reduce((sum,a)=>sum+a.quantity,0)>MAX_GIFTS)throw Error('赠品总数量最多 60 件，请减少数量。');
      return originals;
    }
    return result;
  }
  function generatedQuantity(title,request='') {
    const entries=quantityEntries(title+'\n'+request);
    if(new Set(entries.map(e=>normalizeName(e.name))).size>1)throw Error('多种赠品请分别上传单件素材并设置数量，以保证每种赠品的数量准确。');
    if(new Set(entries.map(e=>e.quantity)).size>1)throw Error('赠品文字与生成要求中的数量不一致。');
    return entries[0]?.quantity||1;
  }
  function defaultRegion(width,height) {
    const scale=Math.min(width/BASE.width,height/BASE.height);
    return {x:Math.round(BASE.x*width/BASE.width),y:Math.round(BASE.y*height/BASE.height),w:Math.round(BASE.w*scale),h:Math.round(BASE.h*scale)};
  }
  function validateRegion(region,width,height) {
    const r=Object.fromEntries(['x','y','w','h'].map(key=>[key,Number(region?.[key])]));
    if(!Object.values(r).every(Number.isFinite)||!Object.values(r).every(Number.isInteger)||r.x<0||r.y<0||r.w<64||r.h<80||r.x+r.w>width||r.y+r.h>height)
      throw Error('赠品区域须在画布内，宽至少 64、高至少 80 像素。');
    return r;
  }
  function slots(region) {
    const sx=region.w/314,sy=region.h/388,fontScale=Math.min(sx,sy);
    const rect=(x,y,w,h)=>({x:region.x+x*sx,y:region.y+y*sy,w:w*sx,h:h*sy});
    return {card:{...region},image:rect(100,153,114,223),title:{...rect(20,39,274,58),fontSize:44*fontScale},description:{...rect(18,108,278,44),fontSize:28*fontScale}};
  }
  function contain(width,height,box) {
    const scale=Math.min(box.w/width,box.h/height);
    return {x:box.x+(box.w-width*scale)/2,y:box.y+(box.h-height*scale)/2,w:width*scale,h:height*scale};
  }
  function baseProject(project) {
    const result=copy(project);result.layers=result.layers.filter(layer=>!isGift(layer));result.selectedId=null;return result;
  }
  function fingerprint(project) {
    const p=baseProject(project);return JSON.stringify({width:p.width,height:p.height,background:p.background,layers:p.layers});
  }
  async function image(src) {const img=new Image();img.src=src;await img.decode();return img;}
  async function trimTransparent(src) {
    const img=await image(src),w=img.naturalWidth,h=img.naturalHeight;
    if(w*h>16000000)throw Error('赠品素材分辨率过大，请缩小至 1600 万像素以内。');
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
    const data=ctx.getImageData(0,0,w,h).data;let left=w,top=h,right=-1,bottom=-1;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(data[(y*w+x)*4+3]>0){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}
    if(right<0)throw Error('赠品图片完全透明，请重新导入。');
    if(left===0&&top===0&&right===w-1&&bottom===h-1)return src;
    const cropped=document.createElement('canvas');cropped.width=right-left+1;cropped.height=bottom-top+1;
    cropped.getContext('2d').drawImage(img,left,top,cropped.width,cropped.height,0,0,cropped.width,cropped.height);
    return cropped.toDataURL('image/png');
  }
  async function extractGeneratedGift(src) {
    const img=await image(src),w=img.naturalWidth,h=img.naturalHeight,total=w*h;
    if(total>16000000)throw Error('生成素材尺寸过大，无法自动排版。');
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
    const frame=ctx.getImageData(0,0,w,h),data=frame.data;
    const border=[];for(let x=0;x<w;x++)border.push(x,(h-1)*w+x);for(let y=1;y<h-1;y++)border.push(y*w,y*w+w-1);
    const transparent=border.filter(i=>data[i*4+3]<8).length>border.length*.8;
    // Only edge-connected key color is removed; product pixels are never placed
    // according to their original position inside the model's output canvas.
    const isKey=i=>data[i*4+3]<8||(data[i*4+1]>70&&data[i*4+1]-data[i*4]>40&&data[i*4+1]-data[i*4+2]>40);
    const visited=new Uint8Array(total),queue=new Int32Array(total);let head=0,tail=0;
    if(transparent){for(let i=0;i<total;i++)if(data[i*4+3]<8)visited[i]=1;}
    else{
      if(border.filter(isKey).length<border.length*.6)throw Error('生成素材未能清晰分离赠品，请补充外观描述或上传赠品图片后再生成。');
      const enqueue=i=>{if(!visited[i]&&isKey(i)){visited[i]=1;queue[tail++]=i;}};
      for(const i of border)enqueue(i);
      while(head<tail){const i=queue[head++],x=i%w;if(x)enqueue(i-1);if(x<w-1)enqueue(i+1);if(i>=w)enqueue(i-w);if(i<total-w)enqueue(i+w);}
      if(tail<total*.15)throw Error('生成素材的背景不够清晰，请补充外观描述或上传赠品图片后再生成。');
    }
    const seen=new Uint8Array(total);let largest=[],area=0;
    for(let start=0;start<total;start++)if(!visited[start]&&!seen[start]&&data[start*4+3]>8){
      head=0;tail=0;queue[tail++]=start;seen[start]=1;
      const add=i=>{if(!visited[i]&&!seen[i]&&data[i*4+3]>8){seen[i]=1;queue[tail++]=i;}};
      while(head<tail){const i=queue[head++],x=i%w;if(x)add(i-1);if(x<w-1)add(i+1);if(i>=w)add(i-w);if(i<total-w)add(i+w);}
      if(tail>area){area=tail;largest=Array.from(queue.subarray(0,tail));}
    }
    if(area<total*.003)throw Error('未识别到清晰的赠品主体，请补充外观描述或上传赠品图片后再生成。');
    const keep=new Uint8Array(total);for(const i of largest)keep[i]=1;
    for(let i=0;i<total;i++)if(!keep[i])data[i*4+3]=0;
    ctx.putImageData(frame,0,0);return trimTransparent(canvas.toDataURL('image/png'));
  }
  async function cardImage(region,color,texture,style,offer) {
    const canvas=document.createElement('canvas');canvas.width=region.w;canvas.height=region.h;
    const ctx=canvas.getContext('2d');paintStyle(ctx,region.w,region.h,style,color,offer);
    if(texture){const img=await image(texture);ctx.save();ctx.scale(region.w/314,region.h/388);cardOutline(ctx);ctx.clip();ctx.beginPath();ctx.rect(0,99,314,289);ctx.clip();ctx.globalAlpha=.07;ctx.drawImage(img,0,99,314,289);ctx.restore();}
    return canvas.toDataURL('image/png');
  }
  function preserveLayout(layers,previous){
    const occurrences=new Map();
    for(const layer of layers){
      if(!['gift-image','gift-title','gift-description'].includes(layer.role))continue;
      const keys=['x','y','w','h','rotation',...(layer.type==='text'?['fontSize']:[])];
      if(!layer.giftLayoutBase)layer.giftLayoutBase=Object.fromEntries(keys.map(key=>[key,layer[key]]));
      layer.locked=false;
      const matches=previous.filter(old=>old.role===layer.role&&(layer.role!=='gift-image'||old.giftAssetId===layer.giftAssetId));
      const key=layer.role+':'+(layer.giftAssetId||''),index=occurrences.get(key)||0;occurrences.set(key,index+1);
      const old=layer.role==='gift-image'?(matches.find(item=>item.giftCopyNumber===layer.giftCopyNumber&&item.giftCopyNumber!=null)||matches[index]):matches[0];
      if(!old)continue;
      layer.id=old.id;
      if(old.giftLayoutBase&&keys.some(key=>Math.abs((old[key]||0)-(old.giftLayoutBase[key]||0))>.01))for(const key of keys)layer[key]=old[key];
    }
    return layers;
  }
  async function apply(editor,layers,{preserveEdits=false}={}) {
    if(editor.state.layers.filter(layer=>!isGift(layer)).length+layers.length>150)throw Error('图层过多，请先减少图层。');
    await Promise.all(layers.filter(layer=>layer.type==='image').map(layer=>editor._image(layer.src)));
    if(preserveEdits)preserveLayout(layers,editor.state.layers);
    const before=copy(editor.state);editor.beginBatch();
    try {
      for(const layer of [...editor.state.layers])if(isGift(layer))editor.remove(layer.id);
      const usedIds=new Set(editor.state.layers.map(layer=>layer.id));
      for(const layer of layers){
        const added=editor._layer(layer,usedIds);layer.id=added.id;editor.state.layers.push(added);
      }
      editor.commit();
      editor.select(preserveEdits&&layers.some(layer=>layer.id===before.selectedId)?before.selectedId:null);
    }catch(error){editor.state=before;editor.batchDirty=false;editor.batchNotify=true;throw error;}
    finally{editor.endBatch();}
  }
  async function build(context,texture) {
    const {document:project,region,title,description,giftSrc,cardColor,textColor}=context;
    const style=getStyle(context.style||project.meta?.forms?.giftStyle),offer=context.offer||project.meta?.forms?.giftOffer||offerKind(title),offerCount=context.offerCount??project.meta?.forms?.giftOfferCount??'';
    validateRegion(region,project.width,project.height);
    const canvas=document.createElement('canvas'),editor=new root.ImageEditor(canvas);
    await editor.loadProject(baseProject(project));
    const request=context.request||project.meta?.forms?.aiRequest||'';
    const originals=Array.isArray(context.giftAssets)&&context.giftAssets.length?resolveAssets(context.giftAssets,title,request):(giftSrc?[{src:giftSrc,quantity:generatedQuantity(title,request)}]:[]);
    const assets=originals.flatMap(asset=>Array.from({length:quantity(asset.quantity)},(_,index)=>({...asset,copyNumber:index+1})));
    const layout=slots(region),images=await Promise.all(assets.map(asset=>image(asset.src))),groupId='gift_'+ChunRuntime.randomUUID();
    const count=assets.length,cols=count<=3?Math.max(1,count):Math.ceil(Math.sqrt(count*1.3)),rows=Math.ceil(count/cols)||1,area={x:region.x+region.w*.08,y:region.y+region.h*.415,w:region.w*.84,h:region.h*.55},gap=5*Math.min(region.w/314,region.h/388);
    const common={locked:false,visible:true,rotation:0,opacity:1,groupId};
    const imageLayers=assets.map((asset,i)=>{const row=Math.floor(i/cols),rowCount=Math.min(cols,count-row*cols),offset=(cols-rowCount)*area.w/cols/2;const cell={x:area.x+offset+(i%cols)*area.w/cols+gap,y:area.y+row*area.h/rows+gap,w:area.w/cols-2*gap,h:area.h/rows-2*gap};return {...common,type:'image',src:asset.src,...contain(images[i].naturalWidth,images[i].naturalHeight,cell),giftAssetId:asset.id,giftCopyNumber:asset.copyNumber,name:context.assetMode==='generated'?'赠品 · AI 生成图片':'赠品 · '+(asset.name||'原始图片'),role:'gift-image'};});
    const textLayer=(text,slot,color,role,name)=>{
      const opts={...slot,fontSize:Math.max(8,slot.fontSize),fontWeight:role==='gift-title'?700:500,lineHeight:1.2,textAlign:'center',textVerticalAlign:'middle'};
      opts.fontSize=editor.fitText(text,opts);
      const layer={...common,...opts,type:'text',text,color,role,name};
      while(layer.fontSize>8&&editor.textOverflows(layer))layer.fontSize--;
      if(editor.textOverflows(layer))throw Error('赠品文字过长，固定区域无法完整显示，请适当缩短。');
      return layer;
    };
    const heading=offerHeading(offer,offerCount);
    const detail=description?.trim()||offerDescription(title);
    const scale=Math.min(region.w/314,region.h/388);
    const titleSlot={x:region.x+region.w*.08,y:region.y+region.h*.106,w:region.w*.84,h:region.h*.14,fontSize:(offer==='same'?34:38)*scale};
    const detailSlot={x:titleSlot.x,y:region.y+region.h*.267,w:titleSlot.w,h:region.h*.135,fontSize:24*scale};
    const bodyColor=cardColor||style.color;
    const detailColor=textColor||(lightColor(bodyColor)?style.text:'#FFFFFF');
    const layers=[
      {...common,locked:true,type:'image',src:await cardImage(region,cardColor||style.color,texture,style.id,offer),giftTexture:texture||null,giftStyle:style.id,giftOffer:offer,giftOfferCount:String(offerCount),giftDesignVersion:8,...layout.card,name:'赠品 · '+style.name,role:'gift-card'},
      ...imageLayers,
      textLayer(heading,titleSlot,'#FFFFFF','gift-title','赠品 · 标题'),
      ...(detail?[textLayer(detail,detailSlot,detailColor,'gift-description','赠品 · 描述文字')]:[])
    ];
    preserveLayout(layers,project.layers);
    await apply(editor,layers);
    const blob=await editor.exportBlob('png');
    const src=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('赠品合成失败。'));reader.readAsDataURL(blob);});
    return {src,layers,project:editor.getProject()};
  }
  root.GiftLayout={BASE,STYLES,OFFERS,offerKind,offerHeading,offerDescription,stylePreview,stylePrompt,referenceImages,quantity,quantityEntries,resolveAssets,generatedQuantity,defaultRegion,validateRegion,slots,contain,isGift,baseProject,fingerprint,trimTransparent,extractGeneratedGift,build,apply};
  if(typeof module!=='undefined')module.exports=root.GiftLayout;
})(typeof window!=='undefined'?window:globalThis);
