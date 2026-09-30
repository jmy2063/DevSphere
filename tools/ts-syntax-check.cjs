const fs=require('fs');
const path=require('path');

function loadTypeScript(){
  const local=path.resolve(__dirname,'../frontend/node_modules/typescript');
  try{return require(local);}catch(localError){
    try{return require('typescript');}catch(globalError){
      console.error('TypeScript compiler module not found. Run "npm install" in frontend first.');
      process.exit(2);
    }
  }
}
const ts=loadTypeScript();
const root=path.resolve(process.argv[2]||path.resolve(__dirname,'../frontend/src'));
if(!fs.existsSync(root)||!fs.statSync(root).isDirectory()){
  console.error(`Frontend source directory not found: ${root}`);
  process.exit(2);
}
function walk(dir){
  return fs.readdirSync(dir,{withFileTypes:true})
    .sort((a,b)=>a.name.localeCompare(b.name))
    .flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
}
const files=walk(root).filter(f=>/\.tsx?$/.test(f));
let errors=0;
for(const file of files){
  const text=fs.readFileSync(file,'utf8');
  const kind=file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS;
  const sf=ts.createSourceFile(file,text,ts.ScriptTarget.ES2020,true,kind);
  for(const d of sf.parseDiagnostics||[]){
    if(d.category===ts.DiagnosticCategory.Error){
      errors++;
      const pos=typeof d.start==='number'?sf.getLineAndCharacterOfPosition(d.start):null;
      const where=pos?`:${pos.line+1}:${pos.character+1}`:'';
      console.error(file+where+': '+ts.flattenDiagnosticMessageText(d.messageText,' '));
    }
  }
}
console.log(`TS_PARSE files=${files.length} errors=${errors}`);
process.exit(errors?1:0);
