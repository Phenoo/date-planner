import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const value=p=>p?.a===1?p.k.at(-1).s:p?.k;
const color=a=>`rgb(${a.slice(0,3).map(v=>Math.round(v*255)).join(',')})`;
function shapes(items){
 const fill=items.find(s=>s.ty==='fl'),stroke=items.find(s=>s.ty==='st');
 const style=`fill="${fill?color(value(fill.c)):'none'}" stroke="${stroke?color(value(stroke.c)):'none'}" stroke-width="${stroke?value(stroke.w):0}" stroke-linecap="round" stroke-linejoin="round"`;
 return items.map(s=>{
  if(s.ty==='el'){const p=value(s.p),size=value(s.s);return `<ellipse cx="${p[0]}" cy="${p[1]}" rx="${size[0]/2}" ry="${size[1]/2}" ${style}/>`;}
  if(s.ty==='rc'){const p=value(s.p),size=value(s.s);return `<rect x="${p[0]-size[0]/2}" y="${p[1]-size[1]/2}" width="${size[0]}" height="${size[1]}" rx="${value(s.r)}" ${style}/>`;}
  if(s.ty==='sh'){const p=value(s.ks);let d=`M${p.v[0].join(' ')}`;for(let n=1;n<p.v.length+(p.c?1:0);n++){const prev=(n-1)%p.v.length,i=n%p.v.length;d+=` C${p.v[prev][0]+p.o[prev][0]} ${p.v[prev][1]+p.o[prev][1]} ${p.v[i][0]+p.i[i][0]} ${p.v[i][1]+p.i[i][1]} ${p.v[i].join(' ')}`;}return `<path d="${d}${p.c?'Z':''}" ${style}/>`;}
  return '';
 }).join('');
}
const directory=process.argv[2] || 'public/animations/atlas';
for(const file of readdirSync(directory,{recursive:true}).filter(f=>f.endsWith('.json'))){
 const data=JSON.parse(readFileSync(directory+'/'+file));
 function transform(layer,inner){const k=layer.ks,p=value(k.p)||[0,0],a=value(k.a)||[0,0],s=value(k.s)||[100,100],r=value(k.r)||0,o=value(k.o)??100;let markup=`<g opacity="${(Array.isArray(o)?o[0]:o)/100}" transform="translate(${p[0]},${p[1]}) rotate(${Array.isArray(r)?r[0]:r}) scale(${s[0]/100},${s[1]/100}) translate(${-a[0]},${-a[1]})">${inner}</g>`;if(layer.parent)markup=transform(data.layers.find(l=>l.ind===layer.parent),markup);return markup;}
 const svg=data.layers.slice().reverse().filter(l=>l.ty===4).map(l=>transform(l,shapes(l.shapes))).join('');
 writeFileSync(directory+'/'+file.replace('.json','.svg'),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${data.w} ${data.h}">${svg}</svg>`);
}
