import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const root=JSON.parse(readFileSync('package.json','utf8'));
mkdirSync('functions/lib',{recursive:true});
await build({ entryPoints:['functions/src/index.ts'], outfile:'functions/lib/index.cjs', bundle:true, platform:'node', target:'node22', format:'cjs', packages:'external', conditions:['react-server'], alias:{'server-only':'./scripts/empty-server-only.mjs'}, tsconfig:'tsconfig.json' });
writeFileSync('functions/package.json',JSON.stringify({name:'date-atlas-functions',private:true,main:'lib/index.cjs',engines:{node:'22'},dependencies:Object.fromEntries(['firebase-functions','firebase-admin','ai','@ai-sdk/deepseek','zod'].map(name=>[name,root.dependencies[name]]))},null,2)+'\n');
