/* ============================ INIT ============================ */
function init(){
  state=load();
  if(!state){ state=JSON.parse(JSON.stringify(DEFAULT_STATE)); save(); }
  if(!state.notes) state.notes={};
  if(!state.rates) state.rates=JSON.parse(JSON.stringify(DEFAULT_STATE.rates));
  // one-time inject of the confirmed Beijing booking (non-destructive; runs once, respects later deletion)
  if(state.meta && !state.meta._inj_beijing){
    if(!state.segments.some(function(s){return s.city==="Beijing";})){
      state.segments.push({id:"sg7_bj",country:"China",city:"Beijing",arrive:"2026-08-31",depart:"2026-09-05",tier:1,color:"#cf6c6c",notes:"REAL BOOKING: East Sacred Hotel via Booking.com. Free cancel until Aug 29; pay at property in CNY. Stay straddles Sep 3 (Victory Day) - check Tiananmen/Forbidden City closures nearer the time."});
      state.stays.push({id:"st_bj",segId:"sg7_bj",name:"East Sacred Hotel (2 min to Metro, near Forbidden City)",platform:"Booking.com",url:"https://secure.booking.com/myreservations.html",cur:"CNY",ppn:580.58,nights:null,rating:0,status:"chosen",notes:"REAL BOOKING. Conf# 6796474396, PIN 5948. Superior double, breakfast incl, 12% Genius, 2 adults. FREE cancellation until 2026-08-29 23:59; after Aug 30 penalty CNY 580.58 (1 night), dates not changeable. Pay at property in CNY. Card ending 1779. Hotel tel +86 186 1093 7125."});
    }
    if(!state.rates.CNY) state.rates.CNY=45.81;
    state.meta._inj_beijing=true; save();
  }
  if(state.meta && !state.meta._inj_budpvg){
    if(!state.transport.some(function(t){return t.id==="tr_budpvg";})){
      state.transport.push({id:"tr_budpvg",type:"Flight",from:"Budapest (BUD)",to:"Shanghai (PVG)",date:"2026-09-03",provider:"Shanghai Airlines / China Eastern FM870",url:"https://www.google.com/travel/flights/booking?tfs=CBwQAhpJEgoyMDI2LTA5LTAzIh8KA0JVRBIKMjAyNi0wOS0wMxoDUFZHKgJGTTIDODcwagwIAhIIL20vMDk1d19yDAgCEggvbS8wNndqZkABQAFIAXABggELCP___________wGYAQI",cur:"HUF",price:262316,status:"shortlist",notes:"Inbound from Europe. Dep BUD 12:30, arr PVG 05:35+1 (Sep 4), nonstop 11h05m, economy, 2 pax. Lowest fare via Mytrip/Gotogate (Booking 266,012 Ft). 1 carry-on free, checked bag extra. CONFLICT: arrival Sep 4 vs Beijing hotel Aug 31-Sep 5 - needs reconciling."});
    }
    state.meta._inj_budpvg=true; save();
  }
  // fill the include flag (pick-and-choose what counts in the plan/budget)
  state.segments.forEach(function(s){ if(s.include===undefined) s.include=true; });
  state.stays.forEach(function(s){ if(s.include===undefined) s.include=(s.status==="chosen"); });
  state.transport.forEach(function(t){ if(t.include===undefined) t.include=(t.status==="booked"||t.status==="chosen"); });
  state.extras.forEach(function(e){ if(e.include===undefined) e.include=true; });
  save();
  // one-time restructure to the September plan (Shanghai entry -> Osaka -> long-stay SE Asia bases)
  if(state.meta && !state.meta._plan_sept){
    var delS=["sg1","sg2","sg3","sg4","sg5","sg6"];
    state.segments=state.segments.filter(function(s){return delS.indexOf(s.id)<0;});
    state.stays=state.stays.filter(function(s){return ["st1","st2"].indexOf(s.id)<0;});
    state.transport=state.transport.filter(function(t){return ["tr1","tr2"].indexOf(t.id)<0;});
    var bj=state.segments.find(function(s){return s.id==="sg7_bj";}); if(bj) bj.include=false;
    var bjs=state.stays.find(function(s){return s.id==="st_bj";}); if(bjs) bjs.include=false;
    var fl=state.transport.find(function(t){return t.id==="tr_budpvg";});
    if(fl){ fl.include=true; fl.notes="Inbound from Europe. Dep BUD 12:30, arr PVG 05:35+1 (Sep 4), nonstop 11h05m, economy, 2 pax. Lowest fare via Mytrip/Gotogate."; }
    var addSeg=function(o){ if(!state.segments.some(function(s){return s.id===o.id;})) state.segments.push(o); };
    var addTrip=function(o){ if(!state.transport.some(function(t){return t.id===o.id;})) state.transport.push(o); };
    addSeg({id:"sg_sh",country:"China",city:"Shanghai",arrive:"2026-09-04",depart:"2026-09-11",tier:1,color:"#cf6c6c",include:true,notes:"Entry into Asia (BUD->PVG lands Sep 4). City + Suzhou/Hangzhou/Zhujiajiao day trips. China 30-day visa-free (verify - expires end-2026)."});
    addSeg({id:"sg_osa",country:"Japan",city:"Osaka",arrive:"2026-09-11",depart:"2026-09-20",tier:1,color:"#6c8ccf",include:true,notes:"CONCERT Sep 19. Base for Kyoto + Nara day trips. Japan 90-day visa-free."});
    addSeg({id:"sg_cm",country:"Thailand",city:"Chiang Mai",arrive:"2026-09-21",depart:"2026-10-18",tier:1,color:"#3aa893",include:true,notes:"Work base #1 (27n) - cheapest top nomad hub + coworking. Oct = rainy-season tail (low-season prices). Thailand visa-free 30 days; extend +30 if staying longer."});
    addSeg({id:"sg_bali",country:"Indonesia",city:"Ubud",arrive:"2026-10-18",depart:"2026-11-15",tier:1,color:"#37b3a4",include:true,notes:"Work base #2 (28n) - great-value nomad base. Short rains build late Nov. Indonesia VOA 30d, extend +30."});
    addSeg({id:"sg_hk",country:"Hong Kong",city:"Hong Kong",arrive:"2026-11-19",depart:"2026-11-23",tier:1,color:"#cf6c6c",include:false,notes:"PENCILLED for later - HK is best Oct-early Dec (cool, dry), 4 nights. Tick In plan when you slot it."});
    addTrip({id:"tr_shosa",type:"Flight",from:"Shanghai (PVG)",to:"Osaka (KIX)",date:"2026-09-11",provider:"Spring/Peach/China Eastern - to book",url:"https://www.google.com/travel/flights",cur:"USD",price:300,status:"shortlist",include:true,notes:"ESTIMATE for 2 (~2h). Replace once you pick a fare."});
    addTrip({id:"tr_osacm",type:"Flight",from:"Osaka (KIX)",to:"Chiang Mai (CNX)",date:"2026-09-21",provider:"AirAsia/Thai via BKK - to book",url:"https://www.google.com/travel/flights",cur:"USD",price:430,status:"shortlist",include:true,notes:"ESTIMATE for 2 (1 stop). Replace once booked."});
    addTrip({id:"tr_cmbali",type:"Flight",from:"Chiang Mai (CNX)",to:"Bali (DPS)",date:"2026-10-18",provider:"AirAsia via BKK/KL - to book",url:"https://www.google.com/travel/flights",cur:"USD",price:260,status:"shortlist",include:true,notes:"ESTIMATE for 2 (1 stop). Replace once booked."});
    if(!state.extras.some(function(e){return e.id==="ex_concert";})) state.extras.push({id:"ex_concert",label:"Osaka concert tickets x2 (Sep 19)",cur:"HUF",amount:0,category:"Other",include:true});
    state.meta._plan_sept=true; save();
  }
  // extend Japan (warm month) + prioritise big cities through Nov-Dec on monthly rates; Bali saved for later
  if(state.meta && !state.meta._plan_extend){
    var cmx=state.segments.find(function(s){return s.id==="sg_cm";});
    if(cmx){ cmx.include=false; cmx.notes="Parked - prioritising big cities. Re-tick for a Chiang Mai stint (Nov-Feb is its best season)."; }
    var balix=state.segments.find(function(s){return s.id==="sg_bali";});
    if(balix){ balix.include=false; balix.arrive="2027-05-02"; balix.depart="2027-05-30"; balix.notes="PENCILLED for later - Bali is best in the Apr-Oct dry season. Tick In plan when you slot it."; }
    state.transport=state.transport.filter(function(t){return ["tr_osacm","tr_cmbali"].indexOf(t.id)<0;});
    var addSeg2=function(o){ if(!state.segments.some(function(s){return s.id===o.id;})) state.segments.push(o); };
    var addTrip2=function(o){ if(!state.transport.some(function(t){return t.id===o.id;})) state.transport.push(o); };
    var addStay2=function(o){ if(!state.stays.some(function(s){return s.id===o.id;})) state.stays.push(o); };
    addSeg2({id:"sg_oka",country:"Japan",city:"Naha (Okinawa)",arrive:"2026-09-20",depart:"2026-10-20",tier:1,color:"#6c8ccf",include:true,notes:"Warm Japan month (subtropical - no coat). Monthly rental to cut cost. Japan 90-day visa-free (entered Sep 11; cap ~Dec 10)."});
    addSeg2({id:"sg_bkk",country:"Thailand",city:"Bangkok",arrive:"2026-10-20",depart:"2026-11-17",tier:1,color:"#3aa893",include:true,notes:"Big-city work base (28n). Nov = start of the cool-dry best season. Thailand visa-free 30 days."});
    addSeg2({id:"sg_sgn",country:"Vietnam",city:"Ho Chi Minh City",arrive:"2026-11-17",depart:"2026-12-31",tier:1,color:"#4a9bd1",include:true,notes:"Long base (44n). Vietnam visa-free 45 days just covers it - mind the exact day count, or use the 90-day e-visa. Warm year-round."});
    addStay2({id:"st_oka",segId:"sg_oka",name:"Naha monthly rental (est.)",platform:"monthly",url:"",cur:"USD",ppn:27,nights:null,rating:0,status:"chosen",include:true,notes:"Monthly furnished estimate (~$800/mo) - far cheaper than nightly. Replace with a real listing."});
    addStay2({id:"st_bkk",segId:"sg_bkk",name:"Bangkok monthly rental (est.)",platform:"monthly",url:"",cur:"USD",ppn:22,nights:null,rating:0,status:"chosen",include:true,notes:"Monthly condo estimate (~$650/mo). Replace with a real listing."});
    addStay2({id:"st_sgn",segId:"sg_sgn",name:"Saigon monthly rental (est.)",platform:"monthly",url:"",cur:"USD",ppn:20,nights:null,rating:0,status:"chosen",include:true,notes:"Monthly apartment estimate (~$600/mo). Replace with a real listing."});
    addTrip2({id:"tr_osaoka",type:"Flight",from:"Osaka (KIX)",to:"Naha (OKA)",date:"2026-09-20",provider:"Peach/Jetstar/ANA - to book",url:"https://www.google.com/travel/flights",cur:"USD",price:100,status:"shortlist",include:true,notes:"ESTIMATE for 2 (~2h domestic LCC)."});
    addTrip2({id:"tr_okabkk",type:"Flight",from:"Naha (OKA)",to:"Bangkok (BKK)",date:"2026-10-20",provider:"via Taipei/Tokyo - to book",url:"https://www.google.com/travel/flights",cur:"USD",price:440,status:"shortlist",include:true,notes:"ESTIMATE for 2 (1 stop)."});
    addTrip2({id:"tr_bkksgn",type:"Flight",from:"Bangkok (BKK)",to:"Ho Chi Minh City (SGN)",date:"2026-11-17",provider:"AirAsia/VietJet - to book",url:"https://www.google.com/travel/flights",cur:"USD",price:150,status:"shortlist",include:true,notes:"ESTIMATE for 2 (~1.5h)."});
    state.meta._plan_extend=true; save();
  }
  // budget-tier daily living for the long bases + real Airbnb monthly rents (user-checked)
  if(state.meta && !state.meta._plan_budget){
    ["sg_oka","sg_bkk","sg_sgn"].forEach(function(id){var s=state.segments.find(function(x){return x.id===id;}); if(s) s.tier=0;});
    var sb=state.stays.find(function(s){return s.id==="st_bkk";});
    if(sb){ sb.platform="Airbnb"; sb.ppn=36; sb.notes="Airbnb monthly (~$1,000 / 28 nights, your quote). Airbnb usually beats Booking for long stays."; }
    var ss=state.stays.find(function(s){return s.id==="st_sgn";});
    if(ss){ ss.platform="Airbnb"; ss.ppn=33; ss.notes="Airbnb monthly (~$1,000/mo, your quote; 44 nights ~1.5 months). Airbnb usually beats Booking for long stays."; }
    state.meta._plan_budget=true; save();
  }
  // drop the Japan extension; go south sooner (Osaka -> Bangkok -> Saigon -> KL)
  if(state.meta && !state.meta._plan_south){
    state.segments=state.segments.filter(function(s){return s.id!=="sg_oka";});
    state.stays=state.stays.filter(function(s){return s.id!=="st_oka";});
    state.transport=state.transport.filter(function(t){return ["tr_osaoka","tr_okabkk"].indexOf(t.id)<0;});
    var bkk=state.segments.find(function(s){return s.id==="sg_bkk";});
    if(bkk){ bkk.arrive="2026-09-20"; bkk.depart="2026-10-18"; bkk.notes="Big-city base (28n). Sep-Oct is the rainy tail but cheap. Thailand visa-free 30 days."; }
    var sgn=state.segments.find(function(s){return s.id==="sg_sgn";});
    if(sgn){ sgn.arrive="2026-10-18"; sgn.depart="2026-12-01"; sgn.notes="Long base (44n) - Vietnam visa-free 45 days. Warm year-round; dry season Dec-Mar."; }
    var bs=state.transport.find(function(t){return t.id==="tr_bkksgn";}); if(bs){ bs.date="2026-10-18"; }
    var addSeg3=function(o){ if(!state.segments.some(function(s){return s.id===o.id;})) state.segments.push(o); };
    var addTrip3=function(o){ if(!state.transport.some(function(t){return t.id===o.id;})) state.transport.push(o); };
    var addStay3=function(o){ if(!state.stays.some(function(s){return s.id===o.id;})) state.stays.push(o); };
    addTrip3({id:"tr_osabkk",type:"Flight",from:"Osaka (KIX)",to:"Bangkok (BKK)",date:"2026-09-20",provider:"AirAsia/Thai - to book",url:"https://www.google.com/travel/flights",cur:"USD",price:360,status:"shortlist",include:true,notes:"ESTIMATE for 2 (~5.5h). Replace once booked."});
    addSeg3({id:"sg_kl",country:"Malaysia",city:"Kuala Lumpur",arrive:"2026-12-01",depart:"2026-12-31",tier:0,color:"#3aa893",include:true,notes:"December big-city base (30n). Malaysia visa-free 90 days (easiest for long stays). Warm, some afternoon rain."});
    addStay3({id:"st_kl",segId:"sg_kl",name:"KL monthly rental (est.)",platform:"Airbnb",url:"",cur:"USD",ppn:30,nights:null,rating:0,status:"chosen",include:true,notes:"Airbnb monthly estimate (~$900/mo). Replace with a real listing."});
    addTrip3({id:"tr_sgnkl",type:"Flight",from:"Ho Chi Minh City (SGN)",to:"Kuala Lumpur (KUL)",date:"2026-12-01",provider:"AirAsia/VietJet - to book",url:"https://www.google.com/travel/flights",cur:"USD",price:150,status:"shortlist",include:true,notes:"ESTIMATE for 2 (~2h). Replace once booked."});
    state.meta._plan_south=true; save();
  }
  // Hanoi for Vietnam (prime in Nov); Bangkok moved to its cool-dry December; KL opens the leg
  if(state.meta && !state.meta._plan_hanoi){
    state.segments=state.segments.filter(function(s){return s.id!=="sg_sgn";});
    state.stays=state.stays.filter(function(s){return s.id!=="st_sgn";});
    state.transport=state.transport.filter(function(t){return ["tr_osabkk","tr_bkksgn","tr_sgnkl"].indexOf(t.id)<0;});
    var kl2=state.segments.find(function(s){return s.id==="sg_kl";});
    if(kl2){ kl2.arrive="2026-09-20"; kl2.depart="2026-10-20"; kl2.notes="Opens the SE Asia leg (30n). Hot/humid + some haze in Sep-Oct (all lowland SE Asia is), but a big work-friendly city with Malaysia's easy 90-day visa."; }
    var bk2=state.segments.find(function(s){return s.id==="sg_bkk";});
    if(bk2){ bk2.arrive="2026-12-01"; bk2.depart="2026-12-31"; bk2.notes="December = Bangkok's cool-dry best season (warm days, low humidity). Thailand visa-free 30 days."; }
    var addSeg4=function(o){ if(!state.segments.some(function(s){return s.id===o.id;})) state.segments.push(o); };
    var addTrip4=function(o){ if(!state.transport.some(function(t){return t.id===o.id;})) state.transport.push(o); };
    var addStay4=function(o){ if(!state.stays.some(function(s){return s.id===o.id;})) state.stays.push(o); };
    addSeg4({id:"sg_han",country:"Vietnam",city:"Hanoi",arrive:"2026-10-20",depart:"2026-12-01",tier:0,color:"#4a9bd1",include:true,notes:"Vietnam base (42n). Late Oct-Nov is Hanoi's prime autumn (mild, dry). Gateway to Ha Long Bay + Ninh Binh. Vietnam visa-free 45 days."});
    addStay4({id:"st_han",segId:"sg_han",name:"Hanoi monthly rental (est.)",platform:"Airbnb",url:"",cur:"USD",ppn:30,nights:null,rating:0,status:"chosen",include:true,notes:"Airbnb monthly estimate (~$900/mo, Old Quarter / Tay Ho). Replace with a real listing."});
    addTrip4({id:"tr_osakl",type:"Flight",from:"Osaka (KIX)",to:"Kuala Lumpur (KUL)",date:"2026-09-20",provider:"AirAsia - to book",url:"https://www.google.com/travel/flights",cur:"USD",price:420,status:"shortlist",include:true,notes:"ESTIMATE for 2 (~6.5h)."});
    addTrip4({id:"tr_klhan",type:"Flight",from:"Kuala Lumpur (KUL)",to:"Hanoi (HAN)",date:"2026-10-20",provider:"AirAsia/VietJet - to book",url:"https://www.google.com/travel/flights",cur:"USD",price:200,status:"shortlist",include:true,notes:"ESTIMATE for 2 (~3.5h)."});
    addTrip4({id:"tr_hanbkk",type:"Flight",from:"Hanoi (HAN)",to:"Bangkok (BKK)",date:"2026-12-01",provider:"AirAsia/VietJet/Thai - to book",url:"https://www.google.com/travel/flights",cur:"USD",price:150,status:"shortlist",include:true,notes:"ESTIMATE for 2 (~2h)."});
    state.meta._plan_hanoi=true; save();
  }
  // northern autumn leg: Sapporo + Seoul (Sep-Oct), Hanoi shifts to November
  if(state.meta && !state.meta._plan_north){
    var klp=state.segments.find(function(s){return s.id==="sg_kl";});
    if(klp){ klp.include=false; klp.notes="Parked - swapped for a northern autumn leg. Re-tick to use KL later (Malaysia 90-day visa)."; }
    state.transport=state.transport.filter(function(t){return ["tr_osakl","tr_klhan"].indexOf(t.id)<0;});
    var hanp=state.segments.find(function(s){return s.id==="sg_han";});
    if(hanp){ hanp.arrive="2026-11-01"; hanp.depart="2026-12-01"; hanp.notes="Vietnam base (30n) - November is Hanoi's prime autumn. Gateway to Ha Long Bay + Ninh Binh. Vietnam visa-free 45 days."; }
    var addSeg5=function(o){ if(!state.segments.some(function(s){return s.id===o.id;})) state.segments.push(o); };
    var addTrip5=function(o){ if(!state.transport.some(function(t){return t.id===o.id;})) state.transport.push(o); };
    var addStay5=function(o){ if(!state.stays.some(function(s){return s.id===o.id;})) state.stays.push(o); };
    addSeg5({id:"sg_sap",country:"Japan",city:"Sapporo",arrive:"2026-09-20",depart:"2026-10-08",tier:0,color:"#6c8ccf",include:true,notes:"Hokkaido autumn (18n) - crisp, near typhoon-free, early foliage. Light jacket by early Oct. Within Japan's 90-day visa."});
    addStay5({id:"st_sap",segId:"sg_sap",name:"Sapporo stay (est.)",platform:"Airbnb/hotel",url:"",cur:"USD",ppn:55,nights:null,rating:0,status:"chosen",include:true,notes:"Nightly est. ~$55 (18n is below Airbnb's 28-night monthly discount). Replace with a real listing."});
    addSeg5({id:"sg_seo",country:"South Korea",city:"Seoul",arrive:"2026-10-08",depart:"2026-11-01",tier:0,color:"#6c8ccf",include:true,notes:"Korea base (24n) - October is Seoul's best month (crisp, foliage, low typhoon). Visa-free 90 days, no K-ETA for Hungary."});
    addStay5({id:"st_seo",segId:"sg_seo",name:"Seoul monthly rental (est.)",platform:"Airbnb",url:"",cur:"USD",ppn:40,nights:null,rating:0,status:"chosen",include:true,notes:"Airbnb est. ~$960-1,200 (your quote). Replace with a real listing."});
    addTrip5({id:"tr_osasap",type:"Flight",from:"Osaka (KIX)",to:"Sapporo (CTS)",date:"2026-09-20",provider:"Peach/Jetstar/ANA - to book",url:"https://www.google.com/travel/flights",cur:"USD",price:120,status:"shortlist",include:true,notes:"ESTIMATE for 2 (~2h domestic)."});
    addTrip5({id:"tr_sapseo",type:"Flight",from:"Sapporo (CTS)",to:"Seoul (ICN)",date:"2026-10-08",provider:"Jin Air/Peach - to book",url:"https://www.google.com/travel/flights",cur:"USD",price:250,status:"shortlist",include:true,notes:"ESTIMATE for 2 (~2.5h)."});
    addTrip5({id:"tr_seohan",type:"Flight",from:"Seoul (ICN)",to:"Hanoi (HAN)",date:"2026-11-01",provider:"VietJet/Korean Air - to book",url:"https://www.google.com/travel/flights",cur:"USD",price:300,status:"shortlist",include:true,notes:"ESTIMATE for 2 (~5h)."});
    state.meta._plan_north=true; save();
  }
  // optimize stay lengths: each is either a short hotel stop or a 28+ monthly base, within visas
  if(state.meta && !state.meta._plan_opt){
    var setSeg=function(id,a,d){var s=state.segments.find(function(x){return x.id===id;}); if(s){s.arrive=a;s.depart=d;}};
    setSeg("sg_sap","2026-09-20","2026-10-04");
    setSeg("sg_seo","2026-10-04","2026-11-01");
    setSeg("sg_han","2026-11-01","2026-12-03");
    setSeg("sg_bkk","2026-12-03","2026-12-31");
    var setTripDate=function(id,d){var t=state.transport.find(function(x){return x.id===id;}); if(t) t.date=d;};
    setTripDate("tr_sapseo","2026-10-04");
    setTripDate("tr_seohan","2026-11-01");
    setTripDate("tr_hanbkk","2026-12-03");
    var seo=state.stays.find(function(s){return s.id==="st_seo";}); if(seo) seo.notes="Airbnb monthly (~$1,000-1,200, your quote). 28n unlocks the monthly discount. Replace with a real listing.";
    var sap=state.segments.find(function(s){return s.id==="sg_sap";}); if(sap) sap.notes="Hokkaido SHORT hotel stay (14n) - crisp early autumn, near typhoon-free. Below 28n on purpose (weather + pricey Japan); move hotel-to-hotel here.";
    var han=state.stays.find(function(s){return s.id==="st_han";}); if(han) han.notes="Airbnb monthly (~$900/mo). 32n - well past the monthly discount. Replace with a real listing.";
    state.meta._plan_opt=true; save();
  }
  // extend into 2027 (Jan-Mar) + slot Hong Kong into its early-Dec prime; cheap carry-on hops
  if(state.meta && !state.meta._plan_2027){
    var seg=function(id){return state.segments.find(function(x){return x.id===id;});};
    var h=seg("sg_han"); if(h){ h.depart="2026-12-01"; }
    var hk=seg("sg_hk");
    if(hk){ hk.include=true; hk.arrive="2026-12-01"; hk.depart="2026-12-06"; hk.tier=1; hk.notes="Short hotel stop (5n) in HK's prime season (late Oct-early Dec: cool, dry, low typhoon). Pricey, so kept short."; }
    if(!state.stays.some(function(s){return s.id==="st_hk";})) state.stays.push({id:"st_hk",segId:"sg_hk",name:"HK hotel (est.)",platform:"Booking/Agoda",url:"",cur:"USD",ppn:100,nights:null,rating:0,status:"chosen",include:true,notes:"Nightly est. ~$100 (short stay; HK rooms are small). Replace with a real listing."});
    var bk=seg("sg_bkk"); if(bk){ bk.arrive="2026-12-06"; bk.depart="2027-01-03"; }
    var addSeg6=function(o){ if(!seg(o.id)) state.segments.push(o); };
    var addTrip6=function(o){ if(!state.transport.some(function(t){return t.id===o.id;})) state.transport.push(o); };
    var addStay6=function(o){ if(!state.stays.some(function(s){return s.id===o.id;})) state.stays.push(o); };
    addSeg6({id:"sg_pp",country:"Cambodia",city:"Phnom Penh",arrive:"2027-01-03",depart:"2027-01-31",tier:0,color:"#cf8a6c",include:true,notes:"Jan base (28n) - dry season, cheap + workable. Angkor/Siem Reap doable as a side trip. Cambodia 30-day visa."});
    addStay6({id:"st_pp",segId:"sg_pp",name:"Phnom Penh monthly (est.)",platform:"Airbnb",url:"",cur:"USD",ppn:22,nights:null,rating:0,status:"chosen",include:true,notes:"Airbnb monthly est. ~$660/mo. Replace with a real listing."});
    addSeg6({id:"sg_sgn2",country:"Vietnam",city:"Ho Chi Minh City",arrive:"2027-01-31",depart:"2027-02-28",tier:0,color:"#4a9bd1",include:true,notes:"Feb base (28n) - south Vietnam dry season (Dec-Mar), warm big city. Fresh Vietnam 45-day visa."});
    addStay6({id:"st_sgn2",segId:"sg_sgn2",name:"Saigon monthly (est.)",platform:"Airbnb",url:"",cur:"USD",ppn:33,nights:null,rating:0,status:"chosen",include:true,notes:"Airbnb monthly est. ~$1,000/mo. Replace with a real listing."});
    var kl=seg("sg_kl");
    if(kl){ kl.include=true; kl.arrive="2027-02-28"; kl.depart="2027-03-28"; kl.tier=0; kl.notes="Mar base (28n) - big city, Malaysia 90-day visa. March gets hot in mainland SE Asia; KL is warm but workable."; }
    state.transport=state.transport.filter(function(t){return t.id!=="tr_hanbkk";});
    addTrip6({id:"tr_hanhk",type:"Flight",from:"Hanoi (HAN)",to:"Hong Kong (HKG)",date:"2026-12-01",provider:"VietJet/HK Express - to book",url:"https://www.google.com/travel/flights",cur:"USD",price:220,status:"shortlist",include:true,notes:"ESTIMATE for 2 (~2h, carry-on)."});
    addTrip6({id:"tr_hkbkk",type:"Flight",from:"Hong Kong (HKG)",to:"Bangkok (BKK)",date:"2026-12-06",provider:"AirAsia/HK Express - to book",url:"https://www.google.com/travel/flights",cur:"USD",price:240,status:"shortlist",include:true,notes:"ESTIMATE for 2 (~2.5h, carry-on)."});
    addTrip6({id:"tr_bkkpp",type:"Flight",from:"Bangkok (BKK)",to:"Phnom Penh (PNH)",date:"2027-01-03",provider:"AirAsia - to book",url:"https://www.google.com/travel/flights",cur:"USD",price:120,status:"shortlist",include:true,notes:"ESTIMATE for 2 (~1h, carry-on)."});
    addTrip6({id:"tr_ppsgn",type:"Flight",from:"Phnom Penh (PNH)",to:"Ho Chi Minh City (SGN)",date:"2027-01-31",provider:"flight ~45min or bus ~6h - to book",url:"https://www.google.com/travel/flights",cur:"USD",price:120,status:"shortlist",include:true,notes:"ESTIMATE for 2. Bus is ~$30 for two if you have time."});
    addTrip6({id:"tr_sgnkl2",type:"Flight",from:"Ho Chi Minh City (SGN)",to:"Kuala Lumpur (KUL)",date:"2027-02-28",provider:"AirAsia/VietJet - to book",url:"https://www.google.com/travel/flights",cur:"USD",price:120,status:"shortlist",include:true,notes:"ESTIMATE for 2 (~2h, carry-on)."});
    state.meta._plan_2027=true; save();
  }
  // per-stop weather (day/night degC + what to wear)
  if(state.meta && !state.meta._plan_weather){
    var wx={
      sg_sh:"Warm/humid ~29-31°C day, 23-25°C night - T-shirt",
      sg_osa:"Warm/humid ~28-30°C day, 22-24°C night - T-shirt",
      sg_sap:"Cool ~15-19°C day, 7-11°C night - sweater + light jacket",
      sg_seo:"Crisp autumn ~16-22°C day, 8-13°C night - sweater/light jacket",
      sg_han:"Mild ~25-28°C day, 19-22°C night - light layers",
      sg_hk:"Mild ~23-25°C day, 18-20°C night - light layers",
      sg_bkk:"Warm & dry ~31-32°C day, 22-24°C night - T-shirt",
      sg_pp:"Warm & dry ~31-33°C day, 21-23°C night - T-shirt",
      sg_sgn2:"Hot & dry ~33-34°C day, 22-24°C night - T-shirt",
      sg_kl:"Hot/humid ~32-33°C day, 24-25°C night - T-shirt",
      sg7_bj:"Warm ~28-31°C day, 20-23°C night - T-shirt (early Sept)",
      sg_cm:"Rainy-season tail ~30-32°C day, 22-24°C night - T-shirt + rain layer",
      sg_bali:"Dry season ~28-31°C day, 22-24°C night - T-shirt"
    };
    Object.keys(wx).forEach(function(id){ var s=state.segments.find(function(x){return x.id===id;}); if(s) s.weather=wx[id]; });
    state.meta._plan_weather=true; save();
  }
  // found Shanghai hotel (added as the Shanghai stay)
  if(state.meta && !state.meta._sh_hotel){
    if(!state.stays.some(function(s){return s.id==="st_sh1";})){
      state.stays.push({id:"st_sh1",segId:"sg_sh",name:"Shanghai city-centre hotel (found)",platform:"",url:"",cur:"HUF",ppn:14286,nights:7,rating:0,status:"shortlist",include:true,notes:"FOUND: ~100,000 Ft total for 7 nights (Sep 3-10). Free cancellation until Sep 1. Central + work desk. Breakfast +30,000 Ft/stay (toggle in Budget extras); lunch ~2,600 Ft on site. NOTE: hotel runs Sep 3-10 but your flight lands Sep 4 (Sep 3 night = guaranteed early check-in) and your Osaka flight is Sep 11 - one night (Sep 10) to reconcile."});
    }
    if(!state.extras.some(function(e){return e.id==="ex_sh_bfast";})){
      state.extras.push({id:"ex_sh_bfast",label:"Shanghai hotel breakfast (7n)",cur:"HUF",amount:30000,category:"Other",include:false});
    }
    state.meta._sh_hotel=true; save();
  }
  var ht=_hashTab(); if(ht) activeTab=ht;
  window.addEventListener("hashchange",function(){ var t=_hashTab(); if(t&&t!==activeTab){ activeTab=t; render(); } });
  render();
  cloudInit();
}

/* ============================ BOOT (Vercel-served) ============================ */
/* cities.json is the single source of truth — loaded live, then the app starts.
   No embedded snapshot to keep in sync. */
fetch("cities.json")
  .then(function(r){ if(!r.ok) throw new Error("HTTP "+r.status); return r.json(); })
  .then(function(d){ applyData(d); })
  .catch(function(e){ console.error("Could not load cities.json:", e); })
  .then(function(){ init(); });
