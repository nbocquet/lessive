// Rejoue les réponses synthétiques archivées dans le moteur de réidentification du produit.
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {buildAll} from '../../corpus.mjs';
import {collect} from '../../score.mjs';
const RUN_DIR=fileURLToPath(new URL('.',import.meta.url));
const {reidentify}=await import(pathToFileURL(`${process.cwd()}/src/core/index.ts`).href);
const tables=buildAll();
const {records}=collect(`${RUN_DIR}reponses`);
const results=[];
for(const record of records){
 const table=tables.get(`${record.texte}|${record.format}`).table;
 const entities=new Map(Object.entries(table).map(([pseudonym,value],i)=>[pseudonym,{id:`synthetic-${i}`,pseudonym,surfaceForms:[value]}]));
 // Table de référence du banc : pas de fusion, scission ou alias dans cette expérience.
 const session={byPseudonym:p=>entities.get(p),entities:()=>[...entities.values()]};
 const answer=readFileSync(`${RUN_DIR}reponses/${record.file}`,'utf8');
 const result=reidentify(answer,session);
 const replaced=new Set(result.replacements.map(r=>r.pseudonym));
 const missing=Object.keys(table).filter(p=>!replaced.has(p));
 const missingOriginals=Object.values(table).filter(value=>!result.text.includes(value));
 results.push({file:record.file,expected:Object.keys(table).length,restored:replaced.size,missing,missingOriginals:missingOriginals.length,unknown:result.unknown.length,ambiguous:result.ambiguous.length});
}
writeFileSync(`${RUN_DIR}roundtrip-results.json`,JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify({responses:results.length,expected:results.reduce((s,r)=>s+r.expected,0),restored:results.reduce((s,r)=>s+r.restored,0),failures:results.filter(r=>r.missing.length||r.missingOriginals||r.unknown||r.ambiguous).length}));
