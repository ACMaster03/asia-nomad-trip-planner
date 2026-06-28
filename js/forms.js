/* ============================ MODALS / FORMS ============================ */
function openModal(html){ document.getElementById("modal").innerHTML=html; document.getElementById("modalBg").classList.add("on"); }
function closeModal(){ document.getElementById("modalBg").classList.remove("on"); }
function opt(v,sel){ return '<option value="'+esc(v)+'"'+(v===sel?" selected":"")+'>'+esc(v)+'</option>'; }
function curSelect(id,sel){ return '<select id="'+id+'">'+curList().map(function(c){return opt(c,sel);}).join("")+'</select>'; }
function cityDatalist(){ return '<datalist id="cityDL">'+CITIES.map(function(c){return '<option value="'+esc(c.city)+'">';}).join("")+'</datalist>'; }

function editSeg(id){
  var s=id?state.segments.find(function(x){return x.id===id;}):{id:uid("sg"),country:"",city:"",arrive:state.meta.startDate||"",depart:"",tier:1,color:"",notes:"",weather:""};
  openModal('<h3>'+(id?"Edit stop":"Add stop")+'</h3>'+cityDatalist()
    +'<div class="field"><label>City</label><input id="m_city" list="cityDL" value="'+esc(s.city)+'" oninput="autoCountry()"></div>'
    +'<div class="f2"><div class="field"><label>Country</label><input id="m_country" value="'+esc(s.country)+'"></div>'
    +'<div class="field"><label>Comfort tier</label><select id="m_tier">'+[["0","Budget"],["1","Mid"],["2","Comfort"]].map(function(t){return '<option value="'+t[0]+'"'+((s.tier==null?1:s.tier)==+t[0]?" selected":"")+'>'+t[1]+'</option>';}).join("")+'</select></div></div>'
    +'<div class="f2">'+fldI("Arrive","date","m_arrive",s.arrive)+fldI("Depart","date","m_depart",s.depart)+'</div>'
    +'<div class="field"><label>Weather (day/night, what to wear)</label><input id="m_weather" value="'+esc(s.weather||"")+'"></div>'
    +'<div class="field"><label>Notes</label><textarea id="m_notes" rows="2">'+esc(s.notes||"")+'</textarea></div>'
    +modalBtns("saveSeg('"+s.id+"')"));
}
function autoCountry(){ var c=kb(document.getElementById("m_city").value); if(c){ var cc=document.getElementById("m_country"); if(!cc.value) cc.value=c.country; } }
function saveSeg(id){
  var s=state.segments.find(function(x){return x.id===id;});
  var data={id:id,city:val("m_city"),country:val("m_country"),tier:+val("m_tier"),arrive:val("m_arrive"),depart:val("m_depart"),notes:val("m_notes"),weather:val("m_weather"),color:(s&&s.color)||""};
  if(!data.city){ alert("Enter a city"); return; }
  if(s) Object.assign(s,data); else { data.include=true; state.segments.push(data); }
  save(); closeModal(); render();
}
function delSeg(id){ if(!confirm("Delete this stop?"))return; state.segments=state.segments.filter(function(x){return x.id!==id;}); save(); render(); }

function editStay(id){
  var st=id?state.stays.find(function(x){return x.id===id;}):{id:uid("st"),segId:(state.segments[0]||{}).id,name:"",platform:"Booking.com",url:"",cur:"USD",ppn:"",nights:null,rating:"",status:"idea",notes:""};
  var segOpts=state.segments.map(function(s){return '<option value="'+s.id+'"'+(s.id===st.segId?" selected":"")+'>'+esc(s.city)+' ('+esc(s.arrive)+')</option>';}).join("");
  openModal('<h3>'+(id?"Edit option":"Add accommodation option")+'</h3>'
    +'<div class="field"><label>Stop</label><select id="m_seg">'+segOpts+'</select></div>'
    +'<div class="field"><label>Name</label><input id="m_name" value="'+esc(st.name)+'"></div>'
    +'<div class="f2"><div class="field"><label>Platform</label><input id="m_plat" value="'+esc(st.platform||"")+'"></div>'+fldI("Rating","number","m_rating",st.rating)+'</div>'
    +'<div class="field"><label>Link (Booking/Airbnb URL)</label><input id="m_url" value="'+esc(st.url||"")+'"></div>'
    +'<div class="f3"><div class="field"><label>Price / night</label><input id="m_ppn" type="number" step="any" value="'+esc(st.ppn)+'"></div>'
    +'<div class="field"><label>Currency</label>'+curSelect("m_cur",st.cur)+'</div>'
    +'<div class="field"><label>Status</label><select id="m_status">'+["idea","shortlist","chosen"].map(function(o){return opt(o,st.status);}).join("")+'</select></div></div>'
    +'<div class="field"><label>Nights (blank = use stop length)</label><input id="m_nights" type="number" value="'+(st.nights==null?"":esc(st.nights))+'"></div>'
    +'<div class="field"><label>Notes</label><textarea id="m_notes" rows="2">'+esc(st.notes||"")+'</textarea></div>'
    +modalBtns("saveStay('"+st.id+"')"));
}
function saveStay(id){
  var st=state.stays.find(function(x){return x.id===id;});
  var nn=val("m_nights");
  var data={id:id,segId:val("m_seg"),name:val("m_name"),platform:val("m_plat"),url:val("m_url"),
    cur:val("m_cur"),ppn:+val("m_ppn")||0,nights:nn===""?null:+nn,rating:val("m_rating"),status:val("m_status"),notes:val("m_notes")};
  if(!data.name){ alert("Enter a name"); return; }
  if(st) Object.assign(st,data); else { data.include=false; state.stays.push(data); }
  save(); closeModal(); render();
}
function delStay(id){ if(!confirm("Delete this option?"))return; state.stays=state.stays.filter(function(x){return x.id!==id;}); save(); render(); }

function editTrip(id){
  var t=id?state.transport.find(function(x){return x.id===id;}):{id:uid("tr"),type:"Flight",from:"",to:"",date:"",provider:"Google Flights",url:"https://www.google.com/travel/flights",cur:"USD",price:"",status:"idea",notes:""};
  openModal('<h3>'+(id?"Edit leg":"Add transport leg")+'</h3>'
    +'<div class="f2"><div class="field"><label>Type</label><select id="m_type">'+["Flight","Train","Bus","Ferry","Other"].map(function(o){return opt(o,t.type);}).join("")+'</select></div>'+fldI("Date","date","m_date",t.date)+'</div>'
    +'<div class="f2">'+fldI("From","text","m_from",t.from)+fldI("To","text","m_to",t.to)+'</div>'
    +'<div class="f2"><div class="field"><label>Provider</label><input id="m_prov" value="'+esc(t.provider||"")+'"></div>'
    +'<div class="field"><label>Status</label><select id="m_status">'+["idea","shortlist","booked"].map(function(o){return opt(o,t.status);}).join("")+'</select></div></div>'
    +'<div class="field"><label>Link (Google Flights / 12Go URL)</label><input id="m_url" value="'+esc(t.url||"")+'"></div>'
    +'<div class="f2"><div class="field"><label>Price</label><input id="m_price" type="number" step="any" value="'+esc(t.price)+'"></div>'
    +'<div class="field"><label>Currency</label>'+curSelect("m_cur",t.cur)+'</div></div>'
    +'<div class="field"><label>Notes</label><textarea id="m_notes" rows="2">'+esc(t.notes||"")+'</textarea></div>'
    +modalBtns("saveTrip('"+t.id+"')"));
}
function saveTrip(id){
  var t=state.transport.find(function(x){return x.id===id;});
  var data={id:id,type:val("m_type"),from:val("m_from"),to:val("m_to"),date:val("m_date"),provider:val("m_prov"),url:val("m_url"),cur:val("m_cur"),price:+val("m_price")||0,status:val("m_status"),notes:val("m_notes")};
  if(!data.from||!data.to){ alert("Enter from and to"); return; }
  if(t) Object.assign(t,data); else { data.include=false; state.transport.push(data); }
  save(); closeModal(); render();
}
function delTrip(id){ if(!confirm("Delete this leg?"))return; state.transport=state.transport.filter(function(x){return x.id!==id;}); save(); render(); }

function editExtra(id){
  var e=id?state.extras.find(function(x){return x.id===id;}):{id:uid("ex"),label:"",cur:"USD",amount:"",category:"Visa"};
  openModal('<h3>'+(id?"Edit cost":"Add one-off cost")+'</h3>'
    +'<div class="field"><label>Item</label><input id="m_label" value="'+esc(e.label)+'"></div>'
    +'<div class="f3"><div class="field"><label>Category</label><select id="m_cat">'+["Visa","Insurance","Vaccines","Gear","Flights (intl)","SIM/eSIM","Other"].map(function(o){return opt(o,e.category);}).join("")+'</select></div>'
    +'<div class="field"><label>Amount</label><input id="m_amt" type="number" step="any" value="'+esc(e.amount)+'"></div>'
    +'<div class="field"><label>Currency</label>'+curSelect("m_cur",e.cur)+'</div></div>'
    +modalBtns("saveExtra('"+e.id+"')"));
}
function saveExtra(id){
  var e=state.extras.find(function(x){return x.id===id;});
  var data={id:id,label:val("m_label"),category:val("m_cat"),amount:+val("m_amt")||0,cur:val("m_cur")};
  if(!data.label){ alert("Enter an item"); return; }
  if(e) Object.assign(e,data); else { data.include=true; state.extras.push(data); }
  save(); closeModal(); render();
}
function delExtra(id){ if(!confirm("Delete?"))return; state.extras=state.extras.filter(function(x){return x.id!==id;}); save(); render(); }

function fldI(label,type,id,val){ return '<div class="field"><label>'+label+'</label><input type="'+type+'" id="'+id+'" value="'+esc(val==null?"":val)+'"></div>'; }
function modalBtns(saveCall){ return '<div class="row" style="margin-top:8px"><button class="btn acc" onclick="'+saveCall+'">Save</button><button class="btn" onclick="closeModal()">Cancel</button></div>'; }
function val(id){ var el=document.getElementById(id); return el?el.value:""; }
