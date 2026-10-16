const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const ts=require('../frontend/node_modules/typescript');
const source=path.resolve(__dirname,'../frontend/src/lib/snapshots.ts');
const js=ts.transpileModule(fs.readFileSync(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const mod=new Module(source,module);mod.filename=source;mod._compile(js,source);
const {fixture}=require('./report-test-support.cjs');
function savedFixture(mode='impact'){
  const f=fixture(),data=f.data;
  if(mode==='comparison'){data.result=null;data.comparison=f.comparison;}
  if(mode==='github'){data.result=null;data.github=f.github;}
  if(mode==='evaluation'){data.result=null;data.evaluation=f.evaluation;}
  const rows=data.result?[data.result]:data.comparison?Object.values(data.comparison):data.github?.results||[f.data.result].filter(Boolean);
  const nodes=new Map();
  for(const result of [...rows,...(mode==='evaluation'?[fixture().data.result]:[])]){
    for(const node of [...result.directImpact,...result.indirectImpact,...result.paths.flatMap(p=>p.steps)]){
      nodes.set(node.id,{id:node.id,name:node.name,type:node.type,sourcePath:node.sourcePath,line:node.line,confidence:node.confidence??1,attributes:node.type==='TEST'?{fqcn:'example.ServiceTest'}:node.id==='method:service'?{ownerFqcn:'example.Service',methodName:'change',parameterTypes:''}:{ownerFqcn:'example.Consumer',methodName:'use',parameterTypes:''}});
    }
  }
  data.project.nodes=[...nodes.values()];data.project.nodeCount=nodes.size;data.project.edges=[];data.project.edgeCount=0;
  data.comparisonKey='example/review';data.formatVersion=1;
  return data;
}
module.exports={...mod.exports,savedFixture};
