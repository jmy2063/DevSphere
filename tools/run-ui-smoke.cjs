// Starts its own Vite server and stops only its child processes. No backend required.
const {spawn}=require('node:child_process');
const path=require('node:path');const net=require('node:net');
const root=path.resolve(__dirname,'..');
const frontend=path.join(root,'frontend');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function freePort(){
  const server=net.createServer();
  await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
  const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;
}
async function main(){
  const script=process.argv[2]||'ui-smoke.cjs';
  if(!/^[a-z0-9-]+\.cjs$/.test(script))throw new Error('Expected a browser test filename in tools/');
  const port=await freePort();const url='http://127.0.0.1:'+port;
  const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:frontend,stdio:'inherit',windowsHide:true});
  let stopped=false,smoke;vite.once('exit',()=>{stopped=true;});
  const shutdown=()=>{smoke?.kill();vite.kill();};
  process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
  try{
    let ready=false;const deadline=Date.now()+30000;
    while(Date.now()<deadline&&!stopped){
      try{ready=(await fetch(url,{signal:AbortSignal.timeout(1000)})).ok;}catch{}
      if(ready)break;await pause(250);
    }
    if(!ready||stopped)throw new Error('UI smoke Vite server failed to start');
    smoke=spawn(process.execPath,[path.join(root,'tools',script)],{cwd:root,stdio:'inherit',windowsHide:true,
      env:{...process.env,UI_URL:url,NODE_PATH:[path.join(frontend,'node_modules'),process.env.NODE_PATH].filter(Boolean).join(path.delimiter)}});
    const timeout=setTimeout(()=>smoke.kill(),120000);
    let code;
    try{code=await new Promise((resolve,reject)=>{smoke.once('error',reject);smoke.once('exit',resolve);});}finally{clearTimeout(timeout);}
    if(code!==0)throw new Error('Browser smoke failed or exceeded 120 seconds');
  }finally{
    shutdown();
    if(!stopped)await new Promise(resolve=>{vite.once('exit',resolve);setTimeout(resolve,3000).unref();});
    process.removeListener('SIGINT',shutdown);process.removeListener('SIGTERM',shutdown);
  }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
