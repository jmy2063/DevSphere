const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const ts=require('../frontend/node_modules/typescript');
const file=path.resolve(__dirname,'../frontend/src/lib/snapshot-report.ts');
const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const mod=new Module(file,module);mod.filename=file;
mod.require=id=>id==='./snapshots'?require('./snapshot-test-support.cjs'):id==='./report'?require('./report-test-support.cjs'):require(id);
mod._compile(js,file);
module.exports=mod.exports;
