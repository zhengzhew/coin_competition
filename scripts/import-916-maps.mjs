import {readFileSync,writeFileSync} from 'node:fs';
const maps=Object.fromEntries([2,3,5].map(n=>[String(n),JSON.parse(readFileSync(new URL(`../docs/maps/916/循环${n}.json`,import.meta.url),'utf8').replace(/^\uFEFF/,''))]));
writeFileSync(new URL('../shared/src/curriculum-map-data.ts',import.meta.url),`// Generated from the supplied map exports by scripts/import-916-maps.mjs.\nimport type { LevelDef } from './types.js';\nexport const curriculumMapData: Record<string,LevelDef> = ${JSON.stringify(maps,null,2)};\n`);
