import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL,fileURLToPath} from 'node:url';
const RUN_DIR=fileURLToPath(new URL('.',import.meta.url));
const fromRoot=(path)=>pathToFileURL(`${process.cwd()}/${path}`).href;
const {createAnalyzer,PackRegistry}=await import(fromRoot('src/core/index.ts'));
const {bundledPackDirs,loadPackDir}=await import(fromRoot('packs/_tools/load.ts'));
const {TransformersNerEngine}=await import(fromRoot('src/ner/transformers-engine.ts'));
const registry=new PackRegistry();for(const dir of bundledPackDirs())registry.register(loadPackDir(dir));
const rules=registry.activeRules();
const before=createAnalyzer(rules.filter(r=>r.globalId!=='lang-fr-en/courriel-nom-affiche'));
const after=createAnalyzer(rules);
const engine=new TransformersNerEngine({modelId:'Xenova/camembert-ner',localModelPath:`${process.cwd()}/models/`,device:'cpu'});
await engine.load();
const results=[];
try{
for(const author of ['gpt','claude','gemini']){
 const corpus=JSON.parse(readFileSync(`${RUN_DIR}mails-${author}.json`,'utf8'));
 for(const c of corpus.cases){
  for(const [mode,analyzer,ner] of [['packs_before',before],['packs_after',after],['packs_after_ner',after,engine]]){
   const analysis=await analyzer.analyze(c.text,{language:'fr',...(ner?{ner}:{})});
   if(ner && analysis.warnings.length)throw new Error('Analyse NER incomplète');
   const names=c.persons.map(name=>{const start=c.text.indexOf(name),end=start+name.length;return {name,covered:analysis.detections.some(d=>d.entityType==='PERSON'&&d.start<=start&&d.end>=end)};});
   results.push({author,id:c.id,mode,expected:names.length,covered:names.filter(n=>n.covered).length,missing:names.filter(n=>!n.covered).map(n=>n.name)});
  }
 }
}
}finally{await engine.dispose();}
writeFileSync(`${RUN_DIR}detection-results.json`,JSON.stringify(results,null,2));
for(const author of ['gpt','claude','gemini'])for(const mode of ['packs_before','packs_after','packs_after_ner']){
 const rows=results.filter(r=>r.author===author&&r.mode===mode);
 console.log(JSON.stringify({author,mode,covered:rows.reduce((s,r)=>s+r.covered,0),expected:rows.reduce((s,r)=>s+r.expected,0),missing:rows.flatMap(r=>r.missing)}));
}
