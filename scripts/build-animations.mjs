import { mkdirSync, writeFileSync } from 'node:fs';
const colors={red:'#d91335',pink:'#ffe4e9',soft:'#fff1f3',ink:'#261014',white:'#ffffff'};
const frames=60;
function scene(kind){
 const a=[];
 const rect=(x,y,w,h,fill='white',stroke='red')=>a.push({type:'rect',x,y,w,h,fill,stroke});
 const circle=(x,y,r,fill='pink',stroke='red')=>a.push({type:'circle',x,y,r,fill,stroke});
 const line=(points,stroke='red',draw=false)=>a.push({type:'line',points,stroke,draw});
 const person=(x,y)=>{circle(x,y,21,'white','ink');line([[x-17,y+47],[x,y+31],[x+18,y+47]],'ink');rect(x-27,y+28,54,64,'red','red');circle(x-6,y-2,2,'ink','ink');circle(x+6,y-2,2,'ink','ink');line([[x-5,y+8],[x,y+11],[x+5,y+8]],'ink');};
 const pin=(x,y)=>{line([[x-20,y],[x-18,y-18],[x,y-29],[x+18,y-18],[x+20,y],[x,y+30],[x-20,y]],'red');circle(x,y-9,6,'red','red');};
 const check=(x,y)=>line([[x-15,y],[x-3,y+12],[x+21,y-17]],'red',true);
 if(['splash','location','itinerary'].includes(kind)){
  rect(75,68,362,220,'soft','pink');line([[104,234],[175,234],[220,130],[296,130],[335,229],[405,229]],'red',true);pin(142,182);pin(351,153);
  if(kind!=='location'){circle(220,242,17,'red','red');circle(264,242,17,'white','red');}
 }
 if(kind==='discover'){
  circle(256,180,115,'soft','soft');person(218,147);person(288,155);rect(55,75,84,64);circle(97,106,17);rect(371,65,85,64);line([[388,114],[400,91],[414,103],[434,82]]);rect(75,230,93,62);line([[91,270],[151,251]]);rect(355,226,92,64);circle(401,255,15,'pink');
 }
 if(['preferences','concierge','review'].includes(kind)){
  rect(170,55,232,258);rect(209,40,155,32,'red');
  for(let i=0;i<3;i++){circle(206,130+i*57,10,'pink');line([[236,130+i*57],[365,130+i*57]],'pink',true);}
  person(112,175);if(kind==='review'){circle(370,274,43,'white');check(370,274);}
  if(kind==='concierge'){rect(77,70,66,48,'pink');pin(442,177);line([[130,287],[200,306],[344,306]],'red',true);}
 }
 if(kind==='guests'){circle(256,180,119,'soft','soft');person(205,132);person(302,132);line([[175,261],[336,261]],'pink');}
 if(kind==='budget'){rect(99,113,314,157);rect(99,113,314,41,'red');rect(306,167,123,66,'pink');circle(335,199,8,'red');circle(197,82,27,'pink');circle(256,64,27,'white');line([[190,82],[204,82]]);line([[250,64],[263,64]]);}
 if(['calendar','empty'].includes(kind)){
  rect(119,73,276,224);rect(119,73,276,52,'red');line([[166,52],[166,94]],'ink');line([[345,52],[345,94]],'ink');
  if(kind==='calendar'){for(let y=0;y<2;y++)for(let x=0;x<3;x++)circle(175+x*78,173+y*65,10,'pink','pink');circle(253,173,22,'pink');check(252,174);}
  else {line([[185,214],[224,181],[269,231],[312,181],[335,214]],'pink');}
 }
 if(kind==='clock'){circle(256,179,112,'white');circle(256,179,95,'soft','pink');line([[256,109],[256,179],[309,207]],'red',true);circle(256,179,7,'red');circle(256,67,5,'red');circle(367,179,5,'red');circle(256,291,5,'red');circle(145,179,5,'red');}
 if(['success','celebration','error','swap','lock'].includes(kind)){
  circle(256,180,91,'soft','pink');
  if(kind==='error'){line([[256,138],[256,188]],'red',true);circle(256,215,5,'red');}
  else if(kind==='swap'){line([[204,163],[305,163],[286,145]],'red',true);line([[308,203],[204,203],[222,221]],'red',true);}
  else if(kind==='lock'){rect(221,173,70,62);line([[233,173],[233,145],[244,131],[268,131],[280,145],[280,173]],'red',true);circle(256,200,5,'red');}
  else {check(251,179);for(const [x,y] of [[122,109],[390,105],[123,251],[398,246]]){line([[x-8,y],[x+8,y]],'red');line([[x,y-8],[x,y+8]],'red');}}
 }
 return a;
}
const color=(s)=>{const hex=colors[s]||s;return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).concat(1);};
const fixed=(k)=>({a:0,k});
function build(kind){
 const shapes=scene(kind);
 const lottie={v:'5.9.6',fr:30,ip:0,op:frames,w:512,h:360,nm:`Date Atlas ${kind}`,ddd:0,assets:[],layers:shapes.map((p,index)=>{
  let shape;
  if(p.type==='rect')shape={ty:'rc',p:fixed([p.x+p.w/2,p.y+p.h/2]),s:fixed([p.w,p.h]),r:fixed(15)};
  if(p.type==='circle')shape={ty:'el',p:fixed([p.x,p.y]),s:fixed([p.r*2,p.r*2])};
  if(p.type==='line')shape={ty:'sh',ks:fixed({i:p.points.map(()=>[0,0]),o:p.points.map(()=>[0,0]),v:p.points,c:false})};
  const stroke={ty:'st',c:fixed(color(p.stroke)),o:fixed(100),w:fixed(p.type==='line'?5:3),lc:2,lj:2};
  const items=[shape,...(p.fill?[{ty:'fl',c:fixed(color(p.fill)),o:fixed(100),r:1}]:[]),stroke];
  if(p.draw)items.push({ty:'tm',s:fixed(0),e:{a:1,k:[{t:0,s:[0],e:[100],i:{x:[.6],y:[1]},o:{x:[.2],y:[0]}},{t:35,s:[100]}]},o:fixed(0),m:1});
  const dy=p.type==='circle'?6:3;const bounce={a:1,k:[{t:0,s:[0,dy,0],e:[0,-dy,0],i:{x:[.6],y:[1]},o:{x:[.3],y:[0]}},{t:30,s:[0,-dy,0],e:[0,dy,0],i:{x:[.6],y:[1]},o:{x:[.3],y:[0]}},{t:60,s:[0,dy,0]}]};
  return {ddd:0,ind:index+1,ty:4,nm:`${kind} part ${index}`,sr:1,ks:{o:fixed(100),r:fixed(0),p:bounce,a:fixed([0,0,0]),s:fixed([100,100,100])},ao:0,shapes:items,ip:0,op:frames,st:0,bm:0};
 }).reverse()};
 const svg=shapes.map(p=>{const style=`fill="${colors[p.fill]||'none'}" stroke="${colors[p.stroke]}" stroke-width="${p.type==='line'?5:3}" stroke-linecap="round" stroke-linejoin="round"`;if(p.type==='rect')return `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="15" ${style}/>`;if(p.type==='circle')return `<circle cx="${p.x}" cy="${p.y}" r="${p.r}" ${style}/>`;return `<polyline points="${p.points.map(v=>v.join(',')).join(' ')}" ${style}/>`;}).join('');
 writeFileSync(`public/animations/${kind}.json`,JSON.stringify(lottie));writeFileSync(`public/animations/${kind}.svg`,`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 360">${svg}</svg>`);
}
mkdirSync('public/animations',{recursive:true});
for(const kind of ['splash','location','itinerary','discover','preferences','concierge','review','guests','budget','calendar','empty','clock','success','celebration','error','swap','lock'])build(kind);
writeFileSync('public/animations/SOURCES.md','# Original Date Atlas animations\n\nAll JSON, SVG, and dotLottie assets in this directory are original vector illustrations authored for this project. No third-party animation URLs, artwork, or licenses are required. The editable generation source is scripts/build-animations.mjs. Palette: existing Date Atlas brand tokens.\n');
