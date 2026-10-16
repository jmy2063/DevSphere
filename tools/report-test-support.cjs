const fs=require('node:fs');const path=require('node:path');const Module=require('node:module');
const ts=require('../frontend/node_modules/typescript');
const file=path.resolve(__dirname,'../frontend/src/lib/report.ts');
const compiled=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const mod=new Module(file,module);mod.filename=file;mod._compile(compiled,file);
const base='a'.repeat(40),head='b'.repeat(40);
function fixture(){
  const test={id:'test:check',name:'ServiceTest',type:'TEST',sourcePath:'archive/test/ServiceTest.java',line:8,endLine:12,depth:1,relation:'TESTS',direction:'UPSTREAM',confidence:.9};
  const other={...test,id:'method:other',name:'Consumer.use()',type:'METHOD',sourcePath:'archive/src/Consumer.java',line:12};
  const result={changedNode:'method:service',changedNodeName:'Service.change()',scope:'FEATURE',directImpact:[test,other],indirectImpact:[],apis:[],entities:[],tests:[test.name],areas:[],riskScore:42,riskLevel:'MEDIUM',riskReasons:['Fixture evidence'],riskBreakdown:{'Test Gap':6,'Blast Radius':10},evidenceConfidence:.9,blastRadius:1,maxDepth:4,exploredNodes:4,paths:[{targetId:test.id,targetName:test.name,targetType:test.type,hopCount:1,pathConfidence:.9,steps:[{id:'method:service',name:'Service.change()',type:'METHOD',sourcePath:'archive/src/Service.java',line:3,endLine:7,viaRelation:'CHANGED',direction:'CHANGED'},{...test,viaRelation:'TESTS'}]}],explanation:'검토 설명\n두 번째 줄'};
  const project={projectId:'report-fixture',analyzedClasses:2,nodeCount:4,edgeCount:3,analysisDurationMs:10,controllers:0,services:1,repositories:0,entities:0,methods:2,apis:0,tests:1,nodes:[],edges:[],warnings:[]};
  const github={kind:'PR',owner:'example',repo:'review',reference:'7',baseSha:base,headSha:head,declaredRevision:'',revisionStatus:'VERIFIED_JAVA_HEAD',mappingSide:'HEAD',warnings:['Java 소스만 검증했습니다.'],files:[{filename:'src/Service.java',previousFilename:'',changeStatus:'modified',mappingStatus:'MAPPED_METHOD',reason:'HEAD 줄 좌표',startNodeIds:[result.changedNode]}],results:[result],summary:{changedFiles:1,javaFiles:1,methodMappedFiles:1,fallbackFiles:0,unmappedJavaFiles:0,changedStarts:1,uniqueImpactNodes:2,uniqueStructuralNodes:1,maxStartRiskScore:42,tests:[{id:test.id,name:test.name,sourcePath:test.sourcePath,line:test.line,depth:1,confidence:.9,changedStarts:[result.changedNodeName]}]},sourceVerification:{status:'VERIFIED',revision:head,zipPrefix:'archive/',localFiles:2,repositoryFiles:2,matchedFiles:2,changedFiles:0,missingFiles:0,extraFiles:0,message:'Java 내용 일치',differences:[]}};
  const evaluation={changedNode:result.changedNode,scope:'FEATURE',expectedCount:2,predictedCount:2,truePositive:1,falsePositive:1,falseNegative:1,precision:.5,recall:.5,f1:.5,topK:5,topKRecall:.5,matched:['test:check'],missed:['missing'],unexpected:['method:other']};
  const comparison={LOCAL:{...result,scope:'LOCAL',directImpact:[test],riskScore:22},FEATURE:result,SYSTEM:{...result,scope:'SYSTEM',riskScore:55}};
  return {data:{generatedAt:'2026-10-15T13:00:00.000Z',project,result,comparison:null,github:null,evaluation:null},github,comparison,evaluation};
}
module.exports={buildHtmlReport:mod.exports.buildHtmlReport,reportDocument:mod.exports.reportDocument,reviewBlock:mod.exports.reviewBlock,fixture,base,head};
