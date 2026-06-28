/* ============================ RENDER ============================ */
var TABS=[["overview","Overview"],["timeline","Timeline"],["map","Map"],["stays","Stays"],
          ["transport","Transport"],["budget","Budget"],["monthly","Monthly"],["money","Money"],["kb","Knowledge Base"],["data","Data"],["settings","Settings"]];

function render(){
  document.getElementById("tripNameLbl").textContent=" — "+state.meta.tripName;
  var nav=document.getElementById("nav");
  nav.innerHTML=TABS.map(function(t){return '<button class="'+(activeTab===t[0]?"active":"")+'" onclick="go(\''+t[0]+'\')">'+t[1]+'</button>';}).join("");
  var v=document.getElementById("view");
  if(activeTab==="overview") v.innerHTML=viewOverview();
  else if(activeTab==="timeline") v.innerHTML=viewTimeline();
  else if(activeTab==="map"){ v.innerHTML=viewMap(); initGlobe(); }
  else if(activeTab==="stays") v.innerHTML=viewStays();
  else if(activeTab==="transport") v.innerHTML=viewTransport();
  else if(activeTab==="budget") v.innerHTML=viewBudget();
  else if(activeTab==="monthly") v.innerHTML=viewMonthly();
  else if(activeTab==="money") v.innerHTML=viewMoney();
  else if(activeTab==="kb") v.innerHTML=viewKB();
  else if(activeTab==="data") v.innerHTML=viewData();
  else if(activeTab==="settings") v.innerHTML=viewSettings();
  try{ window.scrollTo(0,0); }catch(e){}
}
function go(t){ activeTab=t; try{ if(location.hash!=="#"+t) location.hash=t; }catch(e){} render(); }
function _hashTab(){ var t=(typeof location!=="undefined"?(location.hash||""):"").replace(/^#\/?/,""); return (t&&TABS.some(function(x){return x[0]===t;}))?t:null; }

function toggleInc(kind,id){
  var arr = kind==="seg"?state.segments : kind==="stay"?state.stays : kind==="trip"?state.transport : state.extras;
  var item=arr.find(function(x){return x.id===id;}); if(!item) return;
  item.include=!item.include;
  if(kind==="stay" && item.include){ state.stays.forEach(function(st){ if(st!==item && st.segId===item.segId) st.include=false; }); }
  save(); render();
}
function incBox(kind,id,on){ return '<input type="checkbox" title="Include in plan &amp; budget" '+(on?"checked":"")+' onclick="toggleInc(\''+kind+'\',\''+id+'\')">'; }

function statusChip(s){ return '<span class="chip '+s+'">'+s+'</span>'; }

/* ---------- OVERVIEW ---------- */
function viewOverview(){
  var b=computeBudget();
  var cap=state.meta.budgetCap||0;
  var pct=cap? Math.min(100, b.grand/cap*100):0;
  var over=b.grand>cap && cap>0;
  var today=new Date();
  var upcoming=state.segments.slice().sort(function(a,c){return new Date(a.arrive)-new Date(c.arrive);})
     .filter(function(s){return new Date(s.depart)>=today;})[0];
  var cheats=CITIES.slice().sort(function(a,c){return (a.allIn[0]+a.allIn[1])-(c.allIn[0]+c.allIn[1]);});
  var cheap=cheats.slice(0,4), dear=cheats.slice(-3).reverse();
  var h='<h2>Trip overview</h2><p class="sub">'+state.segments.length+' stops · '+b.totalNights+' nights · '+(state.meta.travelers||2)+' travellers · base currency HUF (Ft)</p>';
  h+='<div class="grid cards">';
  h+=stat("Total estimated budget", fmtHUF(b.grand), "≈ "+fmtUSD(b.grand/state.rates.USD)+" · "+fmtHUF(b.perPerson)+" / person");
  h+=stat("Per-day burn rate", fmtHUF(b.perDay), "across "+b.totalNights+" nights");
  h+=stat("Stops in plan", state.segments.filter(function(s){return s.include!==false;}).length+"", (state.stays.filter(function(s){return s.include;}).length)+" stays · "+(state.transport.filter(function(t){return t.include;}).length)+" transport included");
  h+=stat("Budget cap", cap?fmtHUF(cap):"—", cap?(over?"⚠ over by "+fmtHUF(b.grand-cap):"✓ "+fmtHUF(cap-b.grand)+" left"):"set in Settings");
  h+='</div>';
  if(cap){ h+='<div class="card" style="margin-top:14px"><div class="row"><b>Budget used</b><span class="right '+(over?"":"muted")+'">'+Math.round(pct)+'%</span></div>'
    +'<div class="bar '+(over?"over":"")+'" style="margin-top:8px"><span style="width:'+pct+'%"></span></div></div>'; }
  if(upcoming){ var k=kb(upcoming.city);
    h+='<h3>Next stop</h3><div class="card"><b class="reg-'+(k?k.r:"")+'">'+esc(upcoming.city)+', '+esc(upcoming.country)+'</b>'
      +' <span class="muted">'+esc(upcoming.arrive)+' → '+esc(upcoming.depart)+' ('+segNights(upcoming)+' nights)</span>';
    if(upcoming.weather){ h+='<div style="margin-top:6px"><b>Weather:</b> '+esc(upcoming.weather)+'</div>'; }
    if(k){ h+='<div class="muted" style="margin-top:6px">'+esc(k.meals)+'</div>'; }
    h+='</div>'; }
  h+='<h3>Region cost cheat-sheet <span class="tag">(mid-range, all-in $/day for 2)</span></h3>';
  h+='<div class="grid cards">';
  h+='<div class="card"><b>Cheapest bases</b>'+cheap.map(function(c){return '<div class="row" style="margin-top:6px"><span class="pill" style="background:'+regColor(c.r)+'"></span>'+esc(c.city)+'<span class="right muted">$'+c.allIn[0]+'-'+c.allIn[1]+'</span></div>';}).join("")+'</div>';
  h+='<div class="card"><b>Priciest</b>'+dear.map(function(c){return '<div class="row" style="margin-top:6px"><span class="pill" style="background:'+regColor(c.r)+'"></span>'+esc(c.city)+'<span class="right muted">$'+c.allIn[0]+'-'+c.allIn[1]+'</span></div>';}).join("")+'</div>';
  h+='<div class="card"><b>How the budget works</b><div class="muted" style="margin-top:6px">Each stop estimates <b>accommodation</b> + <b>daily living</b> (food, local transport, activities) from the knowledge base at your chosen comfort tier. Mark a stay <span class="chip chosen">chosen</span> to override accommodation with a real price. Add flights (mark <span class="chip booked">booked</span>) and one-off costs under Budget.</div></div>';
  h+='</div>';
  h+=dataNote();
  return h;
}
function regColor(r){ return r==="SE"?"#37b3a4":r==="EA"?"#6c8ccf":"#cf8a6c"; }
function stat(k,v,sub){ return '<div class="stat"><div class="k">'+k+'</div><div class="v">'+v+'</div>'+(sub?'<div class="muted" style="margin-top:3px;font-size:12px">'+sub+'</div>':"")+'</div>'; }
function dataNote(){ return '<div class="note" style="margin-top:18px">Prices are <b>approximate mid-2026 estimates</b> and FX moves daily — update rates in <b>Settings</b>. Always re-check <b>visa rules</b> and <b>live safety/weather advisories</b> before booking: '
  +'<a href="https://konzuliszolgalat.kormany.hu" target="_blank">Hungarian MFA advisories</a> · '
  +'<a href="https://www.gov.uk/foreign-travel-advice" target="_blank">UK FCDO</a> · '
  +'<a href="https://www.accuweather.com" target="_blank">Weather</a>.</div>'; }

/* ---------- TIMELINE ---------- */
function viewTimeline(){
  var segs=state.segments.slice().sort(function(a,b){return new Date(a.arrive)-new Date(b.arrive);});
  var h='<h2>Timeline</h2><p class="sub">Your route over time. Untick <b>In plan</b> to park a stop without deleting it (it leaves the bars &amp; budget). Click a bar or row to edit. <button class="btn sm acc" onclick="editSeg()">+ Add stop</button></p>';
  if(!segs.length){ return h+'<div class="card muted">No stops yet — add your first destination.</div>'; }
  var inc=segs.filter(function(s){return s.include!==false;});
  if(inc.length){
    var min=new Date(inc[0].arrive), max=new Date(inc[inc.length-1].depart);
    inc.forEach(function(s){ var a=new Date(s.arrive),d=new Date(s.depart); if(a<min)min=a; if(d>max)max=d; });
    var span=(max-min)||1;
    var months=[]; var cur=new Date(min.getFullYear(),min.getMonth(),1);
    while(cur<=max){ months.push(new Date(cur)); cur.setMonth(cur.getMonth()+1); }
    var mlbl=months.map(function(m){return '<div>'+m.toLocaleString("en-US",{month:"short"})+" '"+String(m.getFullYear()).slice(2)+'</div>';}).join("");
    h+='<div class="tl"><div class="tl-months">'+mlbl+'</div>';
    inc.forEach(function(s){
      var a=new Date(s.arrive),d=new Date(s.depart);
      var left=(a-min)/span*100, width=Math.max(((d-a)/span*100),5);
      var k=kb(s.city);
      h+='<div class="tl-track"><div class="tl-seg" style="left:'+left+'%;width:'+width+'%;background:'+(s.color||regColor(k?k.r:"SE"))+'" onclick="editSeg(\''+s.id+'\')" title="'+esc(s.city)+(s.weather?" — "+esc(s.weather):"")+'">'+esc(s.city)+' · '+segNights(s)+'n</div></div>';
    });
    h+='</div>';
  }
  h+='<div class="tablewrap" style="margin-top:16px"><table><thead><tr><th>In plan</th><th>Stop</th><th>Country</th><th>Dates</th><th>Nights</th><th>Tier</th><th>Weather</th><th>Notes</th><th></th></tr></thead><tbody>';
  segs.forEach(function(s){ var k=kb(s.city); var off=(s.include===false);
    h+='<tr'+(off?' class="offrow"':'')+'><td>'+incBox("seg",s.id,!off)+'</td><td><b class="reg-'+(k?k.r:"")+'">'+esc(s.city)+'</b></td><td>'+esc(s.country)+'</td><td>'+esc(s.arrive)+' → '+esc(s.depart)+'</td><td>'+segNights(s)+'</td><td>'+["Budget","Mid","Comfort"][s.tier==null?1:s.tier]+'</td><td class="muted" style="min-width:170px">'+esc(s.weather||"")+'</td><td class="muted">'+esc(s.notes||"")+'</td>'
     +'<td><button class="btn sm" onclick="editSeg(\''+s.id+'\')">Edit</button> <button class="btn sm danger" onclick="delSeg(\''+s.id+'\')">✕</button></td></tr>';
  });
  h+='</tbody></table></div>';
  return h;
}

/* ---------- STAYS ---------- */
function viewStays(){
  var h='<h2>Accommodation options</h2><p class="sub">Paste Booking.com / Airbnb links and compare. Tick <b>In plan</b> on the option you want for that stop (one per stop) and the budget updates live. Untick all to fall back to the estimate. <button class="btn sm acc" onclick="editStay()">+ Add option</button></p>';
  if(!state.stays.length) h+='<div class="card muted">No options yet.</div>';
  var bySeg={};
  state.stays.forEach(function(st){ (bySeg[st.segId]=bySeg[st.segId]||[]).push(st); });
  state.segments.forEach(function(s){
    var list=bySeg[s.id]; if(!list||!list.length) return;
    h+='<h3>'+esc(s.city)+' <span class="tag">'+esc(s.arrive)+' → '+esc(s.depart)+' · '+segNights(s)+' nights</span></h3>';
    h+='<div class="tablewrap"><table><thead><tr><th>In plan</th><th>Option</th><th>Platform</th><th>Per night</th><th>Total ('+segNights(s)+'n)</th><th>Rating</th><th>Status</th><th></th></tr></thead><tbody>';
    list.forEach(function(st){ var nn=st.nights!=null?st.nights:segNights(s); var tot=toHUF(st.ppn,st.cur)*nn;
      h+='<tr'+(st.include?' class="inrow"':'')+'><td>'+incBox("stay",st.id,st.include)+'</td><td><b>'+esc(st.name)+'</b>'+(st.url?' <a href="'+esc(st.url)+'" target="_blank" class="tag">link ↗</a>':"")+(st.notes?'<div class="muted">'+esc(st.notes)+'</div>':"")+'</td>'
       +'<td>'+esc(st.platform||"")+'</td><td>'+esc(st.ppn)+' '+esc(st.cur)+'<div class="tag">'+fmtHUF(toHUF(st.ppn,st.cur))+'</div></td>'
       +'<td>'+fmtHUF(tot)+'</td><td>'+(st.rating?esc(st.rating):"—")+'</td><td>'+statusChip(st.status)+'</td>'
       +'<td><button class="btn sm" onclick="editStay(\''+st.id+'\')">Edit</button> <button class="btn sm danger" onclick="delStay(\''+st.id+'\')">✕</button></td></tr>';
    });
    h+='</tbody></table></div>';
  });
  var orphan=state.stays.filter(function(st){return !state.segments.find(function(s){return s.id===st.segId;});});
  if(orphan.length){ h+='<h3 class="muted">Unlinked options</h3><div class="card muted">'+orphan.map(function(st){return esc(st.name)+' <button class="btn sm" onclick="editStay(\''+st.id+'\')">fix</button>';}).join(" · ")+'</div>'; }
  return h;
}

/* ---------- TRANSPORT ---------- */
function viewTransport(){
  var h='<h2>Transport &amp; flights</h2><p class="sub">Flights, trains, buses, ferries between stops. Paste Google Flights / 12Go links. Tick <b>In plan</b> on the option you want to count in the budget (handy for comparing alternatives for the same leg). <button class="btn sm acc" onclick="editTrip()">+ Add leg</button></p>';
  var legs=state.transport.slice().sort(function(a,b){return new Date(a.date)-new Date(b.date);});
  if(!legs.length) return h+'<div class="card muted">No legs yet.</div>';
  h+='<div class="tablewrap"><table><thead><tr><th>In plan</th><th>Date</th><th>Type</th><th>Route</th><th>Provider</th><th>Price</th><th>Status</th><th></th></tr></thead><tbody>';
  legs.forEach(function(t){
    h+='<tr'+(t.include?' class="inrow"':'')+'><td>'+incBox("trip",t.id,t.include)+'</td><td>'+esc(t.date||"")+'</td><td>'+esc(t.type)+'</td><td><b>'+esc(t.from)+' → '+esc(t.to)+'</b>'+(t.notes?'<div class="muted">'+esc(t.notes)+'</div>':"")+'</td>'
     +'<td>'+esc(t.provider||"")+(t.url?' <a href="'+esc(t.url)+'" target="_blank" class="tag">link ↗</a>':"")+'</td>'
     +'<td>'+esc(t.price)+' '+esc(t.cur)+'<div class="tag">'+fmtHUF(toHUF(t.price,t.cur))+'</div></td><td>'+statusChip(t.status)+'</td>'
     +'<td><button class="btn sm" onclick="editTrip(\''+t.id+'\')">Edit</button> <button class="btn sm danger" onclick="delTrip(\''+t.id+'\')">✕</button></td></tr>';
  });
  h+='</tbody></table></div>';
  return h;
}

/* ---------- BUDGET ---------- */
function viewBudget(){
  var b=computeBudget();
  var h='<h2>Budget</h2><p class="sub">Everything totalled in HUF (Ft) at the FX rates from Settings. Only items ticked <b>In plan</b> count here — tick/untick stays, flights and costs to compare scenarios live. A stop with no stay ticked uses the knowledge-base estimate.</p>';
  h+='<div class="grid cards">';
  h+=stat("Grand total", fmtHUF(b.grand), "≈ "+fmtUSD(b.grand/state.rates.USD));
  h+=stat("Accommodation", fmtHUF(b.accom), Math.round(b.accom/b.grand*100||0)+"% of total");
  h+=stat("Daily living", fmtHUF(b.live), "food · local transport · activities");
  h+=stat("Transport (booked)", fmtHUF(b.transport), state.transport.filter(function(t){return t.status==="booked";}).length+" legs");
  h+=stat("One-off / extras", fmtHUF(b.extras), "visas, insurance, gear");
  h+=stat("Per person", fmtHUF(b.perPerson), (state.meta.travelers||2)+" travellers");
  h+='</div>';
  // breakdown bar
  var parts=[["Accommodation",b.accom,"#37b3a4"],["Daily living",b.live,"#6c8ccf"],["Transport",b.transport,"#cf8a6c"],["Extras",b.extras,"#e0a13a"]];
  h+='<div class="card" style="margin-top:14px"><b>Where the money goes</b><div class="bar" style="display:flex;height:16px;margin-top:8px">';
  parts.forEach(function(p){ var w=b.grand?p[1]/b.grand*100:0; h+='<span style="width:'+w+'%;background:'+p[2]+'" title="'+p[0]+'"></span>'; });
  h+='</div><div class="row" style="margin-top:8px;gap:14px">'+parts.map(function(p){return '<span class="tag"><span class="pill" style="background:'+p[2]+'"></span>'+p[0]+' '+fmtHUF(p[1])+'</span>';}).join("")+'</div></div>';
  // per-stop table
  h+='<h3>By stop</h3><div class="tablewrap"><table><thead><tr><th>Stop</th><th>Nights</th><th>Tier</th><th>Accommodation</th><th>Daily living</th><th>Subtotal</th></tr></thead><tbody>';
  b.perSeg.forEach(function(p){
    h+='<tr><td><b>'+esc(p.seg.city)+'</b></td><td>'+p.nights+'</td><td>'+["Budget","Mid","Comfort"][p.tier]+'</td>'
     +'<td>'+fmtHUF(p.accom)+' <span class="tag">'+(p.accomSrc==="included"?"included stay":"estimate")+'</span></td>'
     +'<td>'+fmtHUF(p.live)+'</td><td><b>'+fmtHUF(p.total)+'</b></td></tr>';
  });
  h+='<tr><td colspan="5" style="text-align:right"><b>Stops subtotal</b></td><td><b>'+fmtHUF(b.accom+b.live)+'</b></td></tr>';
  h+='</tbody></table></div>';
  // extras editor
  h+='<h3>One-off &amp; recurring costs <button class="btn sm acc" onclick="editExtra()">+ Add</button></h3><div class="tablewrap"><table><thead><tr><th>In plan</th><th>Item</th><th>Category</th><th>Amount</th><th>In HUF</th><th></th></tr></thead><tbody>';
  state.extras.forEach(function(e){ h+='<tr'+(e.include?' class="inrow"':'')+'><td>'+incBox("extra",e.id,e.include)+'</td><td>'+esc(e.label)+'</td><td>'+esc(e.category||"")+'</td><td>'+esc(e.amount)+' '+esc(e.cur)+'</td><td>'+fmtHUF(toHUF(e.amount,e.cur))+'</td><td><button class="btn sm" onclick="editExtra(\''+e.id+'\')">Edit</button> <button class="btn sm danger" onclick="delExtra(\''+e.id+'\')">✕</button></td></tr>'; });
  if(!state.extras.length) h+='<tr><td colspan="6" class="muted">None yet — add visas, insurance, vaccines, gear…</td></tr>';
  h+='</tbody></table></div>';
  return h;
}

/* ---------- MONTHLY ---------- */
function viewMonthly(){
  var M={}, order=[];
  function bucket(key){ if(!M[key]){ M[key]={nights:0,accom:0,live:0,transport:0}; order.push(key); } return M[key]; }
  state.segments.filter(function(s){return s.include!==false;}).forEach(function(s){
    var nn=segNights(s); if(nn<=0) return;
    var k=kb(s.city), tier=(s.tier==null?1:s.tier);
    var chosen=state.stays.filter(function(st){return st.segId===s.id && st.include;});
    var accomTotal = chosen.length ? chosen.reduce(function(a,st){return a+toHUF(st.ppn,st.cur)*(st.nights!=null?st.nights:nn);},0) : (k?usdToHUF(k.accom[tier])*nn:0);
    var accomPN=accomTotal/nn, livePN=k?usdToHUF(k.live[tier]):0;
    var d=new Date(s.arrive+"T00:00:00");
    for(var i=0;i<nn;i++){ var key=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"); var b=bucket(key); b.nights++; b.accom+=accomPN; b.live+=livePN; d.setDate(d.getDate()+1); }
  });
  state.transport.filter(function(t){return t.include && t.date;}).forEach(function(t){ var b=bucket(t.date.slice(0,7)); b.transport+=toHUF(t.price,t.cur); });
  order.sort();
  var extrasTotal=state.extras.filter(function(e){return e.include;}).reduce(function(a,e){return a+toHUF(e.amount,e.cur);},0);
  var totalNights=0,totA=0,totL=0,totT=0;
  order.forEach(function(key){ var b=M[key]; totalNights+=b.nights; totA+=b.accom; totL+=b.live; totT+=b.transport; });
  var recMonthly=(totalNights?(totA+totL)/totalNights:0)*365/12;
  var allInMonthly=(totalNights?(totA+totL+totT)/totalNights:0)*365/12;
  var h='<h2>Monthly spending</h2><p class="sub">How much cash goes out each calendar month, so you can set an earning target while you work on the road. Rent &amp; daily living are spread across the nights of each stay; flights land in the month they happen; one-off costs are listed separately (they are not monthly).</p>';
  h+='<div class="grid cards">';
  h+=stat("Earn target / month", fmtHUF(recMonthly), "~$"+Math.round(recMonthly/state.rates.USD)+" - covers rent + daily living");
  h+=stat("All-in / month", fmtHUF(allInMonthly), "~$"+Math.round(allInMonthly/state.rates.USD)+" - incl. flights, excl. one-offs");
  h+=stat("One-off costs (upfront)", fmtHUF(extrasTotal), "insurance, gear, visas, tickets");
  h+='</div>';
  h+='<div class="tablewrap" style="margin-top:14px"><table><thead><tr><th>Month</th><th>Nights</th><th>Rent</th><th>Daily living</th><th>Flights</th><th>Month total</th></tr></thead><tbody>';
  order.forEach(function(key){ var b=M[key]; var mt=b.accom+b.live+b.transport; var lbl=new Date(key+"-01T00:00:00").toLocaleString("en-US",{month:"long",year:"numeric"});
    h+='<tr><td><b>'+lbl+'</b></td><td>'+b.nights+'</td><td>'+fmtHUF(b.accom)+'</td><td>'+fmtHUF(b.live)+'</td><td>'+(b.transport?fmtHUF(b.transport):"—")+'</td><td><b>'+fmtHUF(mt)+'</b></td></tr>';
  });
  h+='<tr><td><b>Total</b></td><td>'+totalNights+'</td><td>'+fmtHUF(totA)+'</td><td>'+fmtHUF(totL)+'</td><td>'+fmtHUF(totT)+'</td><td><b>'+fmtHUF(totA+totL+totT)+'</b></td></tr>';
  h+='</tbody></table></div>';
  var max=0; order.forEach(function(key){ var b=M[key]; max=Math.max(max,b.accom+b.live+b.transport); });
  h+='<h3>Monthly cash-out</h3><div class="card">';
  order.forEach(function(key){ var b=M[key]; var mt=b.accom+b.live+b.transport; var lbl=new Date(key+"-01T00:00:00").toLocaleString("en-US",{month:"short",year:"2-digit"});
    h+='<div class="row" style="margin:6px 0"><span style="width:62px" class="tag">'+lbl+'</span><div class="bar" style="flex:1"><span style="width:'+(max?mt/max*100:0)+'%"></span></div><span style="width:115px;text-align:right">'+fmtHUF(mt)+'</span></div>';
  });
  h+='</div>';
  h+='<div class="note" style="margin-top:14px"><b>Earning target:</b> to cover day-to-day costs while travelling, aim to earn at least <b>'+fmtHUF(recMonthly)+'/month</b> (~$'+Math.round(recMonthly/state.rates.USD)+') between the two of you. Flights and the '+fmtHUF(extrasTotal)+' of one-off costs sit on top - ideally saved before you go, or spread as ~'+fmtHUF(order.length?extrasTotal/order.length:0)+'/month. Months containing a long-haul flight will spike (see the table).</div>';
  return h;
}

/* ---------- DATA TABLE ---------- */
var dataRegion="ALL",dataSearch="",dataSort="city",dataDir=1,dataOpen={};
function setDataR(r){ dataRegion=r; render(); }
function setDataSort(k){ if(dataSort===k) dataDir=-dataDir; else {dataSort=k;dataDir=1;} rerenderData(); }
function toggleDataRow(i){ dataOpen[i]=!dataOpen[i]; rerenderData(); }
function rerenderData(){ var el=document.getElementById("dataList"); if(el) el.innerHTML=dataTableHTML(); }
function viewData(){
  var h='<h2>Data table</h2><p class="sub">All '+CITIES.length+' cities: average costs, food, transport and month-by-month weather. Click a column to sort, a row to expand. Loaded from cities.json (offline: embedded copy).</p>';
  h+='<div class="row noprint" style="margin-bottom:12px">';
  ["ALL","SE","EA","SA"].forEach(function(r){ h+='<button class="btn sm '+(dataRegion===r?"acc":"")+'" onclick="setDataR(\''+r+'\')">'+(r==="ALL"?"All regions":regName(r))+'</button>'; });
  h+='<input style="max-width:220px" placeholder="Search city/country…" value="'+esc(dataSearch)+'" oninput="dataSearch=this.value;rerenderData()"></div>';
  h+='<div id="dataList">'+dataTableHTML()+'</div>';
  h+='<div class="row noprint" style="margin-top:10px"><button class="btn sm" onclick="exportCSV()">⬇ Export table as CSV</button></div>';
  return h;
}
function dataTableHTML(){
  var q=dataSearch.toLowerCase();
  var list=CITIES.filter(function(c){return (dataRegion==="ALL"||c.r===dataRegion) && (!q||(c.city+" "+c.country).toLowerCase().indexOf(q)>=0);});
  var keyf={city:function(c){return c.city;},country:function(c){return c.country;},day:function(c){return (c.allIn[0]+c.allIn[1])/2;},accom:function(c){return c.accom[1];},rent:function(c){return c.rent;},live:function(c){return c.live[1];}};
  var kf=keyf[dataSort]||keyf.city;
  list=list.slice().sort(function(a,b){var x=kf(a),y=kf(b); if(typeof x==="string") return x.localeCompare(y)*dataDir; return (x-y)*dataDir;});
  function th(k,label){ return '<th style="cursor:pointer;white-space:nowrap" onclick="setDataSort(\''+k+'\')">'+label+(dataSort===k?(dataDir>0?" ▲":" ▼"):"")+'</th>'; }
  var h='<div class="tablewrap"><table><thead><tr>'+th("city","City")+th("country","Country")+'<th>Reg</th>'+th("day","All-in $/day")+th("accom","Accom $/night b·m·n")+th("rent","Rent $/mo")+th("live","Living $/day")+'<th>Best / hazard</th></tr></thead><tbody>';
  if(!list.length) h+='<tr><td colspan="8" class="muted">No matches.</td></tr>';
  list.forEach(function(c){ var ci=CITIES.indexOf(c);
    h+='<tr style="cursor:pointer" onclick="toggleDataRow('+ci+')"><td><b>'+esc(c.city)+'</b></td><td>'+esc(c.country)+'</td><td><span class="pill" style="background:'+regColor(c.r)+'"></span>'+esc(c.r)+'</td>'
     +'<td>$'+c.allIn[0]+'-'+c.allIn[1]+'</td><td>'+c.accom[0]+' / '+c.accom[1]+' / '+c.accom[2]+'</td><td>$'+c.rent+'</td><td>$'+c.live[0]+'-'+c.live[2]+'</td><td class="muted" style="max-width:300px">'+esc((c.weather&&c.weather.hazard)||"")+'</td></tr>';
    if(dataOpen[ci]) h+='<tr><td colspan="8" style="background:#141c25">'+dataDetail(c)+'</td></tr>';
  });
  h+='</tbody></table></div>';
  return h;
}
function dataDetail(c){
  var h='<div class="f2"><div><b>Food:</b> <span class="muted">'+esc(c.meals)+'</span><br><b>Transport:</b> <span class="muted">'+esc(c.transit)+'</span><br><b>Internet:</b> <span class="muted">'+esc(c.net)+'</span><br><b>Rent (furnished 1-BR):</b> $'+c.rent+'/mo</div>';
  h+='<div><b>Landmarks:</b><ul style="margin:4px 0 0 16px;padding:0">'+(c.land||[]).map(function(l){return '<li class="muted">'+esc(l.n)+' — '+esc(l.c)+', '+esc(l.d)+'</li>';}).join("")+'</ul></div></div>';
  if(c.weather&&c.weather.months&&c.weather.months.length){
    h+='<div style="margin-top:8px;overflow-x:auto"><b>Monthly weather (avg °C / rain mm):</b><table style="margin-top:4px;font-size:12px"><thead><tr><th></th>'+c.weather.months.map(function(m){return '<th>'+esc(m.m)+'</th>';}).join("")+'</tr></thead><tbody>'
     +'<tr><td class="muted">High °C</td>'+c.weather.months.map(function(m){return '<td>'+m.hi+'</td>';}).join("")+'</tr>'
     +'<tr><td class="muted">Low °C</td>'+c.weather.months.map(function(m){return '<td>'+m.lo+'</td>';}).join("")+'</tr>'
     +'<tr><td class="muted">Rain mm</td>'+c.weather.months.map(function(m){return '<td>'+m.rain+'</td>';}).join("")+'</tr>'
     +'</tbody></table></div>';
  }
  h+='<div class="note" style="margin-top:8px"><b>Season:</b> '+esc((c.weather&&c.weather.hazard)||"")+'</div>';
  return h;
}
function exportCSV(){
  var rows=[["City","Country","Region","AllIn_low","AllIn_high","Accom_budget","Accom_mid","Accom_nice","Rent_mo","Living_low","Living_mid","Living_high","Hazard"]];
  CITIES.forEach(function(c){ rows.push([c.city,c.country,c.r,c.allIn[0],c.allIn[1],c.accom[0],c.accom[1],c.accom[2],c.rent,c.live[0],c.live[1],c.live[2],(c.weather&&c.weather.hazard)||""]); });
  var csv=rows.map(function(r){return r.map(function(x){return '"'+String(x).replace(/"/g,'""')+'"';}).join(",");}).join("\n");
  var a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"})); a.download="asia-cities-data.csv"; a.click();
}

/* ---------- KNOWLEDGE BASE ---------- */

var kbRegion="ALL", kbSearch="";
function viewKB(){
  var h='<h2>Knowledge base</h2><p class="sub">Living costs, transit, city passes, landmarks, visas &amp; seasons for '+CITIES.length+' hubs. Filter and search below.</p>';
  h+='<div class="row noprint" style="margin-bottom:14px">';
  ["ALL","SE","EA","SA"].forEach(function(r){ h+='<button class="btn sm '+(kbRegion===r?"acc":"")+'" onclick="setKBR(\''+r+'\')">'+(r==="ALL"?"All regions":regName(r))+'</button>'; });
  h+='<input style="max-width:240px" placeholder="Search city or country…" value="'+esc(kbSearch)+'" oninput="kbSearch=this.value;rerenderKB()"></div>';
  h+='<div id="kbList">'+kbCards()+'</div>';
  return h;
}
function setKBR(r){ kbRegion=r; render(); }
function rerenderKB(){ var el=document.getElementById("kbList"); if(el) el.innerHTML=kbCards(); }
function kbCards(){
  var q=kbSearch.toLowerCase();
  var list=CITIES.filter(function(c){ return (kbRegion==="ALL"||c.r===kbRegion) && (!q || (c.city+" "+c.country).toLowerCase().indexOf(q)>=0); });
  // group by country
  var byC={}; list.forEach(function(c){ (byC[c.country]=byC[c.country]||[]).push(c); });
  var h="";
  Object.keys(byC).forEach(function(country){
    var co=COUNTRIES[country]||{};
    h+='<h3 class="reg-'+byC[country][0].r+'">'+esc(country)+'</h3>';
    h+='<div class="note" style="margin-bottom:10px"><b>Visa (HU/EU):</b> '+esc(co.visa||"check")+'<br><b>Best time / weather:</b> '+esc(co.best||"")+'<br><b>Safety:</b> '+esc(co.safety||"")+'</div>';
    h+='<div class="kb-grid">';
    byC[country].forEach(function(c){
      h+='<div class="card kb-card"><h4>'+esc(c.city)+'</h4>';
      h+='<div class="tag">All-in ~$'+c.allIn[0]+'-'+c.allIn[1]+'/day (2) · Rent ~$'+c.rent+'/mo</div>';
      h+='<div style="margin-top:8px"><b>Stay/night:</b> $'+c.accom[0]+' / $'+c.accom[1]+' / $'+c.accom[2]+' <span class="tag">budget·mid·nice</span></div>';
      h+='<div style="margin-top:4px"><b>Meals:</b> <span class="muted">'+esc(c.meals)+'</span></div>';
      h+='<div style="margin-top:4px"><b>Transit:</b> <span class="muted">'+esc(c.transit)+'</span></div>';
      h+='<div style="margin-top:4px"><b>Internet:</b> <span class="muted">'+esc(c.net)+'</span></div>';
      h+='<details><summary>Top landmarks &amp; how to visit</summary>';
      c.land.forEach(function(l){ h+='<div class="land"><b>'+esc(l.n)+'</b> — '+esc(l.w)+'<br><span class="muted">When: '+esc(l.t)+' · How: '+esc(l.h)+' · '+esc(l.c)+' · '+esc(l.d)+'</span></div>'; });
      h+='</details>';
      var note=(state.notes&&state.notes[c.city])||"";
      h+='<div style="margin-top:8px"><label>Your notes</label><textarea rows="2" oninput="setNote(\''+esc(c.city)+'\',this.value)" placeholder="bookings, ideas, dates…">'+esc(note)+'</textarea></div>';
      h+='</div>';
    });
    h+='</div>';
  });
  if(!list.length) h='<div class="card muted">No matches.</div>';
  return h;
}
function setNote(city,val){ state.notes=state.notes||{}; state.notes[city]=val; save(); }

/* ---------- SETTINGS ---------- */
function viewSettings(){
  var m=state.meta;
  var h='<h2>Settings</h2><p class="sub">Trip basics, budget cap, and the FX rates used everywhere (Forint per 1 unit of each currency).</p>';
  h+='<div class="card"><div class="f2">'
    +fld("Trip name","text","setMeta('tripName',this.value)",m.tripName)
    +fld("Travellers","number","setMeta('travelers',+this.value)",m.travelers)
    +fld("Trip start date","date","setMeta('startDate',this.value)",m.startDate)
    +fld("Budget cap (HUF)","number","setMeta('budgetCap',+this.value)",m.budgetCap)
    +'</div></div>';
  h+='<h3>Exchange rates <span class="tag">Ft per 1 unit · edit when rates move</span></h3>';
  h+='<div class="card"><div class="f3">';
  curList().forEach(function(c){ if(c==="HUF")return;
    h+='<div class="field"><label>'+c+'</label><input type="number" step="any" value="'+esc(state.rates[c])+'" oninput="setRate(\''+c+'\',this.value)"></div>'; });
  h+='</div><div class="tag">USD '+state.rates.USD+' · EUR '+state.rates.EUR+' (seeded late-June 2026). 1 unit of currency = this many Ft.</div></div>';
  h+='<h3>Data</h3><div class="card"><div class="row">'
    +'<button class="btn" onclick="doExport()">⬇ Export trip (JSON backup)</button>'
    +'<button class="btn" onclick="document.getElementById(\'importFile\').click()">⬆ Import / load backup</button>'
    +'<button class="btn danger" onclick="resetAll()">↺ Reset to sample data</button></div>'
    +'<div class="note" style="margin-top:10px"><b>Two-traveller sync:</b> there is no cloud here — keep one shared <b>JSON</b> in a synced Drive/Dropbox folder. Whoever edits clicks <b>Export</b> to save it back; the other clicks <b>Import</b> to load the latest. Your data also auto-saves in this browser.</div></div>';
  return h;
}
function fld(label,type,handler,val){ return '<div class="field"><label>'+label+'</label><input type="'+type+'" value="'+esc(val)+'" oninput="'+handler+'"></div>'; }
function setMeta(k,v){ state.meta[k]=v; save(); if(k==="tripName")document.getElementById("tripNameLbl").textContent=" — "+v; }
function setRate(c,v){ state.rates[c]=Number(v)||0; save(); }
