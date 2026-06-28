/* ============================ STATE / HELPERS ============================ */
var LS_KEY="asiaNomadPlanner_v1";
var state, activeTab="overview";

function load(){ try{var s=localStorage.getItem(LS_KEY); if(s) return JSON.parse(s);}catch(e){} return null; }
function save(){ try{localStorage.setItem(LS_KEY, JSON.stringify(state));}catch(e){} if(typeof cloudPushDebounced==="function") cloudPushDebounced(); }
function uid(p){ return (p||"id")+Math.random().toString(36).slice(2,8); }
function esc(s){ return (s==null?"":String(s)).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];}); }
function kb(city){ return CITIES.find(function(c){return c.city===city;}); }
function curList(){ return Object.keys(state.rates); }
function nightsBetween(a,b){ if(!a||!b) return 0; var d=(new Date(b)-new Date(a))/86400000; return d>0?Math.round(d):0; }
function segNights(s){ return s.nights!=null?s.nights:nightsBetween(s.arrive,s.depart); }
function toHUF(amt,cur){ var r=state.rates[cur]; return (Number(amt)||0)*(r||0); }
function usdToHUF(u){ return (Number(u)||0)*(state.rates.USD||0); }
function fmtHUF(n){ n=Math.round(Number(n)||0); return n.toLocaleString("en-US").replace(/,/g," ")+" Ft"; }
function fmtUSD(n){ return "$"+(Math.round((Number(n)||0)))+""; }
function regName(r){ return r==="SE"?"Southeast Asia":r==="EA"?"East Asia":r==="SA"?"South Asia":r; }

/* ============================ BUDGET ENGINE ============================ */
function computeBudget(){
  var accom=0, live=0, transport=0, extras=0;
  var perSeg=[];
  state.segments.filter(function(s){return s.include!==false;}).forEach(function(s){
    var k=kb(s.city), nn=segNights(s), tier=(s.tier==null?1:s.tier);
    var inc=state.stays.filter(function(st){return st.segId===s.id && st.include;});
    var aHUF, aSrc;
    if(inc.length){
      aHUF=inc.reduce(function(a,st){return a+toHUF(st.ppn,st.cur)*(st.nights!=null?st.nights:nn);},0);
      aSrc="included";
    } else if(k){ aHUF=usdToHUF(k.accom[tier])*nn; aSrc="estimate"; }
    else { aHUF=0; aSrc="none"; }
    var lHUF = k? usdToHUF(k.live[tier])*nn : 0;
    accom+=aHUF; live+=lHUF;
    perSeg.push({seg:s, nights:nn, tier:tier, accom:aHUF, accomSrc:aSrc, live:lHUF, total:aHUF+lHUF, kb:k});
  });
  state.transport.forEach(function(t){ if(t.include) transport+=toHUF(t.price,t.cur); });
  state.extras.forEach(function(e){ if(e.include) extras+=toHUF(e.amount,e.cur); });
  var grand=accom+live+transport+extras;
  var totalNights=state.segments.filter(function(s){return s.include!==false;}).reduce(function(a,s){return a+segNights(s);},0);
  return {accom:accom,live:live,transport:transport,extras:extras,grand:grand,perSeg:perSeg,
          totalNights:totalNights, perPerson:grand/(state.meta.travelers||1),
          perDay: totalNights? grand/totalNights:0};
}
