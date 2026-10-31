// Run from repo root: node spiders/tools/run-gameplay-regressions.cjs
// Minimal browser asset-loading shims; gameplay classes and physics are real.
global.Image=class { constructor(){this.complete=false;this.naturalWidth=0;} addEventListener(){} };
global.window={};
Object.defineProperty(global,'navigator',{value:{getGamepads:()=>[]},configurable:true});
global.fetch=async()=>({ok:true,json:async()=>({images:[],music:[]})});
(async()=>{
  const {runRegressions}=await import('./gameplay-regressions.mjs');
  const results=runRegressions();
  for(const r of results)console.log(`${r.pass?'PASS':'FAIL'} ${r.name}${r.error?'\n'+r.error:''}`);
  const failed=results.filter(r=>!r.pass).length;
  console.log(`${results.length-failed}/${results.length} passed`);
  process.exitCode=failed?1:0;
})().catch(e=>{console.error(e);process.exitCode=1;});
