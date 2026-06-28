/* ============================ EXPORT / IMPORT / RESET ============================ */
function doExport(){
  var blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
  var a=document.createElement("a"); a.href=URL.createObjectURL(blob);
  a.download=(state.meta.tripName||"trip").replace(/[^a-z0-9]+/gi,"-").toLowerCase()+"-"+new Date().toISOString().slice(0,10)+".json";
  a.click();
}
function doImport(ev){
  var f=ev.target.files[0]; if(!f)return;
  var r=new FileReader();
  r.onload=function(){ try{ var d=JSON.parse(r.result); if(!d.meta||!d.segments) throw 0;
    state=d; if(!state.rates) state.rates=DEFAULT_STATE.rates; if(!state.notes) state.notes={};
    save(); render(); alert("Trip loaded.");
  }catch(e){ alert("That file is not a valid trip backup."); } };
  r.readAsText(f); ev.target.value="";
}
function resetAll(){ if(!confirm("Replace everything with the sample trip? Export a backup first if unsure."))return;
  state=JSON.parse(JSON.stringify(DEFAULT_STATE)); save(); render(); }
