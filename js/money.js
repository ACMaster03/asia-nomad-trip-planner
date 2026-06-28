/* ============================ MONEY / INCOME LEDGER ============================ */
/* Stored separately from the trip (its own localStorage key + its own income.json),
   as a flat array of rows shaped to map 1:1 onto a future Supabase `ledger` table:
   { id, date:"YYYY-MM-DD", type:"income"|"expense", category, amount, currency, note } */
var LEDGER_KEY="asiaNomadLedger_v1";
var ledger=[];
function loadLedger(){ try{ var s=localStorage.getItem(LEDGER_KEY); if(s){ var d=JSON.parse(s); return Array.isArray(d)?d:(d.entries||[]); } }catch(e){} return []; }
function saveLedger(){ try{ localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger)); }catch(e){} if(typeof cloudPushDebounced==="function") cloudPushDebounced(); }
ledger=loadLedger();
function ledgerByMonth(){
  var M={},order=[];
  function b(k){ if(!M[k]){ M[k]={inc:0,exp:0}; order.push(k); } return M[k]; }
  ledger.forEach(function(e){ if(!e.date) return; var huf=toHUF(e.amount,e.currency); if(e.type==="expense") b(e.date.slice(0,7)).exp+=huf; else b(e.date.slice(0,7)).inc+=huf; });
  return {M:M,order:order};
}
function plannedByMonth(){
  var M={};
  function add(k,v){ M[k]=(M[k]||0)+v; }
  state.segments.filter(function(s){return s.include!==false;}).forEach(function(s){
    var nn=segNights(s); if(nn<=0) return;
    var k=kb(s.city),tier=(s.tier==null?1:s.tier);
    var chosen=state.stays.filter(function(st){return st.segId===s.id && st.include;});
    var accomTotal=chosen.length?chosen.reduce(function(a,st){return a+toHUF(st.ppn,st.cur)*(st.nights!=null?st.nights:nn);},0):(k?usdToHUF(k.accom[tier])*nn:0);
    var accomPN=accomTotal/nn, livePN=k?usdToHUF(k.live[tier]):0;
    var d=new Date(s.arrive+"T00:00:00");
    for(var i=0;i<nn;i++){ add(d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"), accomPN+livePN); d.setDate(d.getDate()+1); }
  });
  state.transport.filter(function(t){return t.include && t.date;}).forEach(function(t){ add(t.date.slice(0,7), toHUF(t.price,t.cur)); });
  return M;
}
function addLedger(){
  var amt=parseFloat(val("le_amount"));
  if(!isFinite(amt)||amt<=0){ alert("Enter an amount greater than 0."); return; }
  ledger.push({ id:uid("le"), date:val("le_date")||new Date().toISOString().slice(0,10),
    type:(val("le_type")==="expense"?"expense":"income"),
    category:(val("le_cat")||"").trim()||"(uncategorised)",
    amount:amt, currency:val("le_cur")||state.meta.baseCurrency||"HUF", note:(val("le_note")||"").trim() });
  saveLedger(); render();
}
function delLedger(id){ if(!confirm("Delete this entry?")) return; ledger=ledger.filter(function(x){return x.id!==id;}); saveLedger(); render(); }
function exportLedger(){
  var blob=new Blob([JSON.stringify({type:"anp-ledger",version:1,exported:new Date().toISOString().slice(0,10),entries:ledger},null,2)],{type:"application/json"});
  var a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="income.json"; a.click();
}
function importLedger(ev){
  var f=ev.target.files[0]; if(!f) return;
  var r=new FileReader();
  r.onload=function(){ try{
    var d=JSON.parse(r.result); var rows=Array.isArray(d)?d:(d.entries||null); if(!rows) throw 0;
    ledger=rows.map(function(x){ return {id:x.id||uid("le"), date:x.date||"", type:(x.type==="expense"?"expense":"income"), category:x.category||"(uncategorised)", amount:Number(x.amount)||0, currency:x.currency||"HUF", note:x.note||""}; });
    saveLedger(); render(); alert("Loaded "+ledger.length+" ledger entr"+(ledger.length===1?"y":"ies")+".");
  }catch(e){ alert("That file is not a valid income.json ledger."); } };
  r.readAsText(f); ev.target.value="";
}
function exportLedgerCSV(){
  var head=["date","type","category","amount","currency","amount_huf","note"];
  var rows=ledger.slice().sort(function(a,b){return a.date<b.date?-1:1;}).map(function(e){
    return [e.date,e.type,e.category,e.amount,e.currency,Math.round(toHUF(e.amount,e.currency)),e.note||""];
  });
  function cell(c){ c=String(c==null?"":c); return /[",\n]/.test(c)?'"'+c.replace(/"/g,'""')+'"':c; }
  var csv=[head.join(",")].concat(rows.map(function(r){return r.map(cell).join(",");})).join("\n");
  var blob=new Blob([csv],{type:"text/csv"}); var a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="income.csv"; a.click();
}
function viewMoney(){
  var totalInc=0,totalExp=0;
  ledger.forEach(function(e){ var huf=toHUF(e.amount,e.currency); if(e.type==="expense") totalExp+=huf; else totalInc+=huf; });
  var net=totalInc-totalExp, plan=computeBudget().grand;
  var netCol=net>=0?"var(--good)":"var(--bad)";
  var h='<h2>Money — income vs spend</h2><p class="sub">Log what you actually <b>earn</b> and <b>spend</b> on the road to see, month by month, whether you are turning a profit or just making it by. Stored separately from your trip plan (its own <code>income.json</code>); the planned-spend column is your itinerary estimate for comparison.</p>';
  h+='<div class="grid cards">';
  h+=stat("Total income", fmtHUF(totalInc), "~$"+Math.round(totalInc/state.rates.USD));
  h+=stat("Total spend (logged)", fmtHUF(totalExp), "~$"+Math.round(totalExp/state.rates.USD));
  h+='<div class="stat"><div class="k">Net profit / loss</div><div class="v" style="color:'+netCol+'">'+(net>=0?"+":"")+fmtHUF(net)+'</div><div class="muted" style="margin-top:3px;font-size:12px">'+(net>=0?"surplus":"shortfall")+' · ~$'+Math.round(net/state.rates.USD)+'</div></div>';
  h+=stat("Planned trip cost", fmtHUF(plan), "your itinerary estimate (Budget tab)");
  h+='</div>';

  // add-entry form
  h+='<h3>Add an entry</h3><div class="card">';
  h+='<div class="f3">';
  h+='<div class="field"><label>Date</label><input type="date" id="le_date" value="'+new Date().toISOString().slice(0,10)+'"></div>';
  h+='<div class="field"><label>Type</label><select id="le_type"><option value="income">Income</option><option value="expense">Expense</option></select></div>';
  h+='<div class="field"><label>Category</label><input id="le_cat" list="catDL" placeholder="e.g. Freelance, Accommodation"></div>';
  h+='</div><div class="f3">';
  h+='<div class="field"><label>Amount</label><input type="number" id="le_amount" min="0" step="any" placeholder="0"></div>';
  h+='<div class="field"><label>Currency</label>'+curSelect("le_cur",state.meta.baseCurrency||"HUF")+'</div>';
  h+='<div class="field"><label>Note (optional)</label><input id="le_note" placeholder="optional"></div>';
  h+='</div>';
  h+='<datalist id="catDL"><option value="Freelance"><option value="Client"><option value="Salary"><option value="Other income"><option value="Accommodation"><option value="Food"><option value="Transport"><option value="Activities"><option value="Visa"><option value="Insurance"><option value="Gear"><option value="Other"></datalist>';
  h+='<div class="row"><button class="btn acc" onclick="addLedger()">+ Add entry</button>';
  h+='<span class="right"></span>';
  h+='<button class="btn sm" onclick="exportLedger()">⬇ income.json</button>';
  h+='<button class="btn sm" onclick="document.getElementById(\'ledgerFile\').click()">⬆ Import</button>';
  h+='<input type="file" id="ledgerFile" accept="application/json" style="display:none" onchange="importLedger(event)">';
  h+='<button class="btn sm" onclick="exportLedgerCSV()">⬇ CSV</button></div>';
  h+='</div>';

  // monthly P&L
  var lm=ledgerByMonth(), plan2=plannedByMonth();
  var keys={}; lm.order.forEach(function(k){keys[k]=1;}); Object.keys(plan2).forEach(function(k){keys[k]=1;});
  var months=Object.keys(keys).sort();
  h+='<h3>Monthly profit &amp; loss</h3>';
  if(!months.length){
    h+='<div class="note">No data yet. Add an income or expense above, or build your itinerary in the Timeline tab — planned spend will show here automatically.</div>';
  } else {
    h+='<div class="tablewrap"><table><thead><tr><th>Month</th><th>Income</th><th>Spend (logged)</th><th>Net</th><th>Cumulative</th><th>Planned spend</th></tr></thead><tbody>';
    var cum=0;
    months.forEach(function(k){
      var inc=lm.M[k]?lm.M[k].inc:0, exp=lm.M[k]?lm.M[k].exp:0, n=inc-exp; cum+=n;
      var pl=plan2[k]||0;
      var lbl=new Date(k+"-01T00:00:00").toLocaleString("en-US",{month:"long",year:"numeric"});
      h+='<tr><td><b>'+lbl+'</b></td>'
        +'<td>'+(inc?fmtHUF(inc):"—")+'</td>'
        +'<td>'+(exp?fmtHUF(exp):"—")+'</td>'
        +'<td style="color:'+(n>=0?"var(--good)":"var(--bad)")+'">'+(n>=0?"+":"")+fmtHUF(n)+'</td>'
        +'<td style="color:'+(cum>=0?"var(--good)":"var(--bad)")+'">'+(cum>=0?"+":"")+fmtHUF(cum)+'</td>'
        +'<td class="muted">'+(pl?fmtHUF(pl):"—")+'</td></tr>';
    });
    h+='<tr><td><b>Total</b></td><td><b>'+fmtHUF(totalInc)+'</b></td><td><b>'+fmtHUF(totalExp)+'</b></td><td><b style="color:'+netCol+'">'+(net>=0?"+":"")+fmtHUF(net)+'</b></td><td></td><td></td></tr>';
    h+='</tbody></table></div>';
  }

  // entries
  h+='<h3>All entries</h3>';
  if(!ledger.length){
    h+='<div class="note">Nothing logged yet.</div>';
  } else {
    h+='<div class="tablewrap"><table><thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Amount</th><th>In HUF</th><th>Note</th><th></th></tr></thead><tbody>';
    ledger.slice().sort(function(a,b){return a.date<b.date?1:-1;}).forEach(function(e){
      var isInc=e.type!=="expense";
      h+='<tr><td>'+esc(e.date)+'</td>'
        +'<td style="color:'+(isInc?"var(--good)":"var(--bad)")+'">'+(isInc?"income":"expense")+'</td>'
        +'<td>'+esc(e.category)+'</td>'
        +'<td>'+esc(String(e.amount))+' '+esc(e.currency)+'</td>'
        +'<td class="muted">'+fmtHUF(toHUF(e.amount,e.currency))+'</td>'
        +'<td class="muted">'+esc(e.note||"")+'</td>'
        +'<td><span class="seg-edit" onclick="delLedger(\''+e.id+'\')">delete</span></td></tr>';
    });
    h+='</tbody></table></div>';
  }
  return h;
}
