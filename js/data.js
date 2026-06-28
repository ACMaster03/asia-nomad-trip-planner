/* ===================== KNOWLEDGE BASE DATA (fetched live from cities.json — single source of truth) ===================== */
var CITIES=[], COUNTRIES={};
function applyData(d){
  if(!d) return;
  COUNTRIES={};
  if(d.countries) Object.keys(d.countries).forEach(function(k){ var x=d.countries[k]; COUNTRIES[k]={visa:x.visa,best:x.bestTime,safety:x.safety}; });
  CITIES=(d.cities||[]).map(function(c){
    return {r:c.region,country:c.country,city:c.city,lat:c.lat,lng:c.lng,
      allIn:c.costs.allInDayMid,
      accom:[c.costs.accomPerNight.budget,c.costs.accomPerNight.mid,c.costs.accomPerNight.nice],
      rent:c.costs.rentMonthly,
      live:[c.costs.dailyLiving.low,c.costs.dailyLiving.mid,c.costs.dailyLiving.high],
      meals:c.food,transit:c.transport,net:c.internet,
      land:(c.landmarks||[]).map(function(l){return {n:l.name,w:l.why,t:l.when,h:l.how,c:l.cost,d:l.time};}),
      weather:c.weather};
  });
}
/* data is loaded by the boot loader at the bottom (fetch cities.json) */


/* ============================ DEFAULT STATE ============================ */
var DEFAULT_STATE = {
  meta:{version:1, tripName:"Asia Nomad Trip", travelers:2, baseCurrency:"HUF",
        budgetCap:12000000, startDate:"2026-10-01"},
  rates:{HUF:1, USD:311, EUR:354, GBP:415, THB:9.4, VND:0.0122, IDR:0.0191, MYR:70.7,
         SGD:230, KHR:0.078, JPY:1.94, KRW:0.207, TWD:9.76, HKD:39.9, CNY:45.81,
         INR:3.75, NPR:2.27, LKR:1.03},
  segments:[
    {id:"sg1",country:"Thailand",city:"Bangkok",arrive:"2026-10-01",depart:"2026-10-22",tier:1,color:"#37b3a4",notes:"Land & settle in, sort SIM + bank cards"},
    {id:"sg2",country:"Thailand",city:"Chiang Mai",arrive:"2026-10-22",depart:"2026-11-19",tier:1,color:"#3aa893",notes:"Nomad base month, coworking"},
    {id:"sg3",country:"Vietnam",city:"Hanoi",arrive:"2026-11-19",depart:"2026-12-10",tier:1,color:"#4a9bd1",notes:"Ha Long Bay trip"},
    {id:"sg4",country:"Vietnam",city:"Da Nang",arrive:"2026-12-10",depart:"2026-12-31",tier:1,color:"#5a8fd1",notes:"Beach + Hoi An day trips"},
    {id:"sg5",country:"Indonesia",city:"Canggu",arrive:"2026-12-31",depart:"2027-02-04",tier:1,color:"#37b3a4",notes:"Bali co-living, surf"},
    {id:"sg6",country:"Malaysia",city:"Kuala Lumpur",arrive:"2027-02-04",depart:"2027-02-25",tier:1,color:"#2f9b88",notes:"Visa run hub + city break"},
    {id:"sg7_bj",country:"China",city:"Beijing",arrive:"2026-08-31",depart:"2026-09-05",tier:1,color:"#cf6c6c",notes:"REAL BOOKING: East Sacred Hotel via Booking.com. Free cancel until Aug 29; pay at property in CNY. Stay straddles Sep 3 (Victory Day) - check Tiananmen/Forbidden City closures nearer the time."}
  ],
  stays:[
    {id:"st1",segId:"sg1",name:"The Quarter Silom (example)",platform:"Booking.com",url:"https://www.booking.com",cur:"THB",ppn:1500,nights:null,rating:8.9,status:"shortlist",notes:"Near BTS, walkable"},
    {id:"st2",segId:"sg5",name:"Canggu co-living villa (example)",platform:"Airbnb",url:"https://www.airbnb.com",cur:"USD",ppn:38,nights:null,rating:0,status:"chosen",notes:"Monthly rate, pool + desk"},
    {id:"st_bj",segId:"sg7_bj",name:"East Sacred Hotel (2 min to Metro, near Forbidden City)",platform:"Booking.com",url:"https://secure.booking.com/myreservations.html",cur:"CNY",ppn:580.58,nights:null,rating:0,status:"chosen",notes:"REAL BOOKING. Conf# 6796474396, PIN 5948. Superior double, breakfast incl, 12% Genius, 2 adults. FREE cancellation until 2026-08-29 23:59; after Aug 30 penalty CNY 580.58 (1 night), dates not changeable. Pay at property in CNY. Card ending 1779. Hotel tel +86 186 1093 7125."}
  ],
  transport:[
    {id:"tr1",type:"Flight",from:"Chiang Mai",to:"Hanoi",date:"2026-11-19",provider:"Google Flights",url:"https://www.google.com/travel/flights",cur:"USD",price:95,status:"shortlist",notes:"VietJet / AirAsia, ~2h"},
    {id:"tr2",type:"Flight",from:"Da Nang",to:"Bali (DPS)",date:"2026-12-31",provider:"Google Flights",url:"https://www.google.com/travel/flights",cur:"USD",price:180,status:"idea",notes:"1 stop via KL/SIN"},
    {id:"tr_budpvg",type:"Flight",from:"Budapest (BUD)",to:"Shanghai (PVG)",date:"2026-09-03",provider:"Shanghai Airlines / China Eastern FM870",url:"https://www.google.com/travel/flights/booking?tfs=CBwQAhpJEgoyMDI2LTA5LTAzIh8KA0JVRBIKMjAyNi0wOS0wMxoDUFZHKgJGTTIDODcwagwIAhIIL20vMDk1d19yDAgCEggvbS8wNndqZkABQAFIAXABggELCP___________wGYAQI",cur:"HUF",price:262316,status:"shortlist",notes:"Inbound from Europe. Dep BUD 12:30, arr PVG 05:35+1 (Sep 4), nonstop 11h05m, economy, 2 pax. Lowest fare via Mytrip/Gotogate (Booking 266,012 Ft). 1 carry-on free, checked bag extra. CONFLICT: arrival Sep 4 vs Beijing hotel Aug 31-Sep 5 - needs reconciling."}
  ],
  extras:[
    {id:"ex1",label:"Vietnam e-visa x2",cur:"USD",amount:50,category:"Visa"},
    {id:"ex2",label:"Annual travel insurance (2 ppl)",cur:"EUR",amount:900,category:"Insurance"},
    {id:"ex3",label:"Backpacks + gear",cur:"EUR",amount:400,category:"Gear"}
  ],
  notes:{}
};
