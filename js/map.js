/* ============================ MAP (3D GLOBE) ============================ */
/* globe.gl is vendored in vendor/ and loaded on demand (only when the Map tab is
   first opened) so it never slows the rest of the app. Works offline. */
var _globeLib=false,_globeLoading=null,_globeInst=null,_globeBound=false,_basePoints=[];
var GLOBE_NIGHT="vendor/earth-night.jpg", GLOBE_DAY="vendor/earth-day.jpg";
var mapOpts=(function(){ try{ var s=localStorage.getItem("anp_map_opts"); if(s){ var o=JSON.parse(s); return {rotate:o.rotate!==false, day:!!o.day, borders:!!o.borders, hazards:!!o.hazards}; } }catch(e){} return {rotate:true, day:false, borders:false, hazards:false}; })();
function saveMapOpts(){ try{ localStorage.setItem("anp_map_opts", JSON.stringify(mapOpts)); }catch(e){} }
var _countries=null,_countriesLoading=null;
function loadCountries(){
  if(_countries) return Promise.resolve(_countries);
  if(_countriesLoading) return _countriesLoading;
  _countriesLoading=fetch("vendor/countries.geojson").then(function(r){return r.json();})
    .then(function(j){ _countries=(j&&j.features)||[]; return _countries; })
    .catch(function(){ _countries=[]; return _countries; });
  return _countriesLoading;
}
function _normCity(s){ return String(s||"").split(" (")[0].trim().toLowerCase(); }
function _isBookedFlight(t){ return !!(t && (t.status==="booked"||t.status==="chosen")); }
function _flightFor(aCity,bCity){
  var na=_normCity(aCity), nb=_normCity(bCity);
  var m=state.transport.filter(function(t){ return _normCity(t.from)===na && _normCity(t.to)===nb; });
  if(!m.length) return null;
  return m.find(_isBookedFlight) || m.find(function(t){return t.include;}) || m[0];
}
/* Home/origin cities that aren't in the Asia knowledge base but appear on the map */
var HOME_PLACES={ "Budapest":{lat:47.4979,lng:19.0402,country:"Hungary"}, "Vienna":{lat:48.2082,lng:16.3738,country:"Austria"} };
/* the inbound origin = a flight INTO the first stop whose origin isn't itself a stop */
function detectOrigin(stops){
  if(!stops.length) return null;
  var seen={}; stops.forEach(function(s){ seen[_normCity(s.city)]=true; });
  var inbound=state.transport.filter(function(t){return t.include!==false;})
    .find(function(t){ return _normCity(t.to)===_normCity(stops[0].city) && !seen[_normCity(t.from)]; });
  if(!inbound) return null;
  var name=String(inbound.from).split(" (")[0].trim();
  var p=HOME_PLACES[name] || (kb(name)&&kb(name).lat!=null?{lat:kb(name).lat,lng:kb(name).lng,country:kb(name).country}:null);
  if(!p) return null;
  return {city:name, country:p.country||"", lat:p.lat, lng:p.lng, r:null, home:true, arrive:""};
}
/* country panel data */
var COUNTRY_META={
  Thailand:{cur:"THB",name:"Thai baht"}, Vietnam:{cur:"VND",name:"Vietnamese dong"},
  Indonesia:{cur:"IDR",name:"Indonesian rupiah"}, Malaysia:{cur:"MYR",name:"Malaysian ringgit"},
  Cambodia:{cur:"KHR",name:"Cambodian riel"}, Laos:{cur:"LAK",name:"Lao kip"},
  Singapore:{cur:"SGD",name:"Singapore dollar"}, Japan:{cur:"JPY",name:"Japanese yen"},
  "South Korea":{cur:"KRW",name:"South Korean won"}, Taiwan:{cur:"TWD",name:"New Taiwan dollar"},
  "Hong Kong":{cur:"HKD",name:"Hong Kong dollar"}, China:{cur:"CNY",name:"Chinese yuan"},
  India:{cur:"INR",name:"Indian rupee"}, Nepal:{cur:"NPR",name:"Nepalese rupee"},
  "Sri Lanka":{cur:"LKR",name:"Sri Lankan rupee"}, Bangladesh:{cur:"BDT",name:"Bangladeshi taka"}
};
var COUNTRY_ALIAS={ "Lao PDR":"Laos","Republic of Korea":"South Korea","Korea, Rep.":"South Korea","Viet Nam":"Vietnam","Czechia":"Czechia" };
function isoToFlag(iso){ if(!iso||iso.length!==2||iso.indexOf("-")>=0) return "🏳️"; return iso.toUpperCase().replace(/./g,function(c){return String.fromCodePoint(127397+c.charCodeAt(0));}); }
function resolveCountry(neName){
  if(!neName) return "";
  if(COUNTRIES[neName] || CITIES.some(function(c){return c.country===neName;})) return neName;
  if(COUNTRY_ALIAS[neName]) return COUNTRY_ALIAS[neName];
  return neName;
}
function openCountry(feat){
  var props=(feat&&feat.properties)||{};
  var country=resolveCountry(props.name||"");
  var flag=isoToFlag(props.iso||"");
  var co=COUNTRIES[country], meta=COUNTRY_META[country];
  var cities=CITIES.filter(function(c){return c.country===country;})
    .sort(function(a,b){ return (a.live?a.live[1]:1e9)-(b.live?b.live[1]:1e9); });
  var route={}; state.segments.filter(function(s){return s.include!==false;}).forEach(function(s){route[s.city]=true;});
  var h='<h3 style="font-size:20px">'+flag+' '+esc(country||props.name||"Unknown")+'</h3>';
  if(meta) h+='<div class="sub">Currency: <b>'+esc(meta.cur)+'</b> — '+esc(meta.name)+(state.rates[meta.cur]?(' · 1 '+esc(meta.cur)+' ≈ '+fmtHUF(state.rates[meta.cur])):"")+'</div>';
  if(co&&co.visa) h+='<div class="note" style="margin:8px 0"><b>Visa:</b> '+esc(co.visa)+'</div>';
  if(co&&co.best) h+='<div style="margin:4px 0;font-size:12.5px"><b>Best time:</b> '+esc(co.best)+'</div>';
  if(co&&co.safety) h+='<div style="margin:4px 0;font-size:12.5px"><b>Safety:</b> '+esc(co.safety)+'</div>';
  if(cities.length){
    h+='<h4 style="margin:12px 0 6px">Cities — cheapest to priciest (daily living, 2 ppl)</h4><div class="tablewrap"><table><thead><tr><th>City</th><th>Daily</th><th>Stay (mid)</th><th>Rent/mo</th></tr></thead><tbody>';
    cities.forEach(function(c){
      h+='<tr><td>'+(route[c.city]?"📍 ":"")+esc(c.city)+'</td><td>~$'+(c.live?c.live[1]:"?")+'</td><td>~$'+(c.accom?c.accom[1]:"?")+'</td><td>'+(c.rent?("~$"+c.rent):"—")+'</td></tr>';
    });
    h+='</tbody></table></div><div class="muted" style="font-size:11.5px;margin-top:4px">📍 = a stop on your trip</div>';
  } else {
    h+='<div class="muted" style="margin-top:8px">No cities tracked here yet'+(country?"":" (and this isn\'t in your trip data)")+'.</div>';
  }
  h+='<div class="row" style="margin-top:12px"><button class="btn" onclick="closeModal()">Close</button></div>';
  openModal(h);
}
var MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];
function monthName(){ return MONTHS[new Date().getMonth()]; }
function qColor(m){ return m>=6?"#ff4d4d":(m>=5?"#ff7a45":"#ffa270"); }
function quakeSafetyNote(m){
  if(m>=6.5) return "Strong quake — capable of serious damage near the epicentre. If this is on your route, check local news and authorities before travelling there.";
  if(m>=5.5) return "Moderate–strong — can cause damage close to the epicentre; usually localised.";
  if(m>=4.5) return "Light–moderate — widely felt but rarely damaging.";
  return "Minor — generally not damaging.";
}
/* seasonal weather hazards for trip cities in the CURRENT month (heavy-rain/monsoon) */
function seasonalHazards(){
  var mi=new Date().getMonth(), seen={}, out=[];
  state.segments.filter(function(s){return s.include!==false;}).forEach(function(s){
    var k=kb(s.city); if(!k||k.lat==null||!k.weather||!k.weather.months||seen[s.city]) return;
    var m=k.weather.months[mi]; if(m && m.rain>=250){ seen[s.city]=true;
      out.push({lat:k.lat,lng:k.lng,kind:"season",haz:true,city:s.city,rain:m.rain,
        hazardText:(k.weather.hazard||""),
        color:"#f0a83c", radius:0.5+Math.min(0.5,(m.rain-250)/700), alt:0.02,
        maxR: m.rain>=400?6:5, speed:2, period:1400});
    }
  });
  return out;
}
function quakesFromFeed(j){
  return ((j&&j.features)||[]).map(function(f){
    var c=f.geometry&&f.geometry.coordinates, p=f.properties||{}, mag=p.mag||0;
    return c?{lat:c[1],lng:c[0],kind:"quake",haz:true,mag:mag,place:p.place||"",time:p.time,url:p.url,
      color:qColor(mag), radius:Math.min(1.2,0.42+mag*0.11), alt:0.02,
      maxR:Math.min(9,1.5+mag), speed:3, period:900}:null;
  }).filter(Boolean);
}
function setHazInfo(total,quakes){
  var el=document.getElementById("hazInfo"); if(!el) return;
  if(!mapOpts.hazards){ el.style.display="none"; el.textContent=""; return; }
  el.style.display="block";
  el.innerHTML="⚡ "+total+" hazard"+(total===1?"":"s")+(quakes!=null?(' · <span style="color:#ff7a45">'+quakes+" live quake"+(quakes===1?"":"s")+'</span>'):"");
}
function paintHazards(hazards,quakeCount){
  if(!_globeInst) return;
  _globeInst.ringsData(hazards.slice());
  _globeInst.pointsData(_basePoints.concat(hazards));
  setHazInfo(hazards.length, quakeCount);
}
function applyHazards(){
  if(!_globeInst) return;
  if(!mapOpts.hazards){ _globeInst.ringsData([]); _globeInst.pointsData(_basePoints); setHazInfo(0); return; }
  var seasonal=seasonalHazards();
  paintHazards(seasonal);              // instant, offline
  // live earthquakes (USGS feed is CORS-open; fails gracefully offline)
  fetch("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson")
    .then(function(r){ return r.json(); })
    .then(function(j){ if(!mapOpts.hazards||!_globeInst) return; var q=quakesFromFeed(j); paintHazards(seasonal.concat(q), q.length); })
    .catch(function(){ /* offline or CORS: keep the seasonal layer only */ });
}
function hazPointLabel(d){
  var box='<div style="background:#171e26;border:1px solid #2a3642;border-radius:10px;padding:7px 10px;color:#e8edf2;font:12.5px -apple-system,sans-serif">';
  if(d.kind==="quake") return box+'<b style="color:'+qColor(d.mag)+'">M'+(d.mag!=null?d.mag.toFixed(1):"?")+' earthquake</b><br><span style="color:#8fa0b0">'+esc(d.place||"")+'</span><br><span style="color:#37b3a4">click for details</span></div>';
  return box+'<b style="color:#f0a83c">Heavy rain / monsoon</b><br><span style="color:#8fa0b0">'+esc(d.city)+' · ~'+d.rain+'mm this month</span><br><span style="color:#37b3a4">click for details</span></div>';
}
function openHazard(d){
  var h;
  if(d.kind==="quake"){
    var when=d.time? new Date(d.time).toLocaleString() : "recently";
    h='<h3>🔴 Magnitude '+(d.mag!=null?d.mag.toFixed(1):"?")+' earthquake</h3>'
      +'<div class="sub">'+esc(d.place||"")+'</div>'
      +'<div style="margin:6px 0">When: '+esc(when)+'</div>'
      +'<div class="note">'+quakeSafetyNote(d.mag||0)+'</div>'
      +(d.url?'<div style="margin-top:8px"><a href="'+esc(d.url)+'" target="_blank" rel="noopener">Full USGS report ↗</a></div>':"")
      +'<div class="muted" style="font-size:11.5px;margin-top:6px">Live feed: M4.5+ quakes, past 7 days (USGS). This is recent seismic activity, not a forecast.</div>';
  } else {
    h='<h3>🟠 Heavy-rain / monsoon season</h3>'
      +'<div class="sub">'+esc(d.city)+' — '+monthName()+'</div>'
      +'<div style="margin:6px 0">~<b>'+d.rain+' mm</b> of rain expected this month — well into the wet season.</div>'
      +(d.hazardText?'<div class="note">'+esc(d.hazardText)+'</div>':"")
      +'<div class="muted" style="font-size:11.5px;margin-top:6px">From your city climate data — expect frequent downpours and possible flooding/transport disruption; check live forecasts close to your dates.</div>';
  }
  h+='<div class="row" style="margin-top:12px"><button class="btn" onclick="closeModal()">Close</button></div>';
  openModal(h);
}
function loadGlobeLib(){
  if(_globeLib) return Promise.resolve();
  if(_globeLoading) return _globeLoading;
  _globeLoading=new Promise(function(res,rej){
    var s=document.createElement("script"); s.src="vendor/globe.gl.min.js";
    s.onload=function(){ _globeLib=true; res(); };
    s.onerror=function(){ rej(new Error("globe lib failed to load")); };
    document.head.appendChild(s);
  });
  return _globeLoading;
}
function sizeMapFull(){
  var f=document.getElementById("mapFull"); if(!f) return;
  var hdr=(document.querySelector?document.querySelector("header"):null);
  f.style.top=((hdr&&hdr.offsetHeight)||56)+"px";
}
function _globeResize(){ sizeMapFull(); var box=document.getElementById("globeBox"); if(box&&_globeInst){ _globeInst.width(box.clientWidth); _globeInst.height(box.clientHeight); } }
function viewMap(){
  var h='<div id="mapFull" class="map-full">';
  h+='<div id="globeBox" style="width:100%;height:100%"></div>';
  h+='<div id="globeMsg" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--mut);font-size:13px;pointer-events:none">Loading the globe…</div>';
  h+='<div id="mapCtrls" class="map-overlay map-ctrls">'
    +'<button class="btn sm map-gear" onclick="document.getElementById(\'mapCtrls\').classList.toggle(\'open\')">⚙ Map</button>'
    +'<div class="map-toggles">'
    +'<button class="btn sm" id="mapRotate" onclick="toggleMapRotate()"></button>'
    +'<button class="btn sm" id="mapDay" onclick="toggleMapDay()"></button>'
    +'<button class="btn sm" id="mapBorders" onclick="toggleMapBorders()"></button>'
    +'<button class="btn sm" id="mapHaz" onclick="toggleMapHazards()"></button>'
    +'<button class="btn sm" onclick="resetMapView()">⟲ Reset</button>'
    +'</div></div>';
  h+='<div id="hazInfo" class="map-overlay map-hazinfo" style="display:none"></div>';
  h+='<div class="map-overlay map-legend">'+mapLegendHTML()+'</div>';
  h+='</div>';
  return h;
}
function mapLegendHTML(){
  return '<div style="font-weight:700;margin-bottom:3px">Legend</div>'
    +'<div><span class="pill" style="background:var(--se)"></span>SE · <span class="pill" style="background:#6c8ccf"></span>E · <span class="pill" style="background:#cf8a6c"></span>S Asia · <span class="pill" style="background:#f0a83c"></span>booked flight</div>'
    +'<div style="margin-top:2px">⌂ home base · <b>1·2·3…</b> = stop order</div>'
    +'<div style="margin-top:5px;border-top:1px solid var(--line);padding-top:5px;font-weight:700">⚡ Hazards <span class="muted" style="font-weight:400">(toggle on)</span></div>'
    +'<div><span class="pill" style="background:#ff5a4d"></span>Earthquake — <b>bigger = stronger</b> (past 7 days)</div>'
    +'<div><span class="pill" style="background:#f0a83c"></span>Monsoon / heavy rain this month</div>'
    +'<div class="muted" style="margin-top:3px">Tap any marker or country for details.</div>';
}
function setMapBtns(){
  var r=document.getElementById("mapRotate"); if(r) r.textContent="↻ Spin: "+(mapOpts.rotate?"on":"off");
  var d=document.getElementById("mapDay"); if(d) d.textContent=(mapOpts.day?"☀":"🌙")+" View: "+(mapOpts.day?"day":"night");
  var b=document.getElementById("mapBorders"); if(b) b.textContent="🗺 Borders: "+(mapOpts.borders?"on":"off");
  var z=document.getElementById("mapHaz"); if(z) z.textContent="⚡ Hazards: "+(mapOpts.hazards?"on":"off");
}
function initGlobe(){
  var box=document.getElementById("globeBox"); if(!box) return;
  sizeMapFull(); setMapBtns();
  loadGlobeLib().then(function(){
    var msg=document.getElementById("globeMsg"); if(msg) msg.style.display="none";
    buildGlobe();
  }).catch(function(){
    var msg=document.getElementById("globeMsg"); if(msg) msg.innerHTML="Couldn't load the 3D globe (<code>vendor/globe.gl.min.js</code> missing). The rest of the app still works.";
  });
}
function buildGlobe(){
  var box=document.getElementById("globeBox"); if(!box||typeof Globe!=="function") return;
  box.innerHTML="";
  var stops=state.segments.filter(function(s){return s.include!==false;})
    .map(function(s){ var k=kb(s.city); return (k&&k.lat!=null)?{city:s.city,country:s.country,r:k.r,lat:k.lat,lng:k.lng,arrive:s.arrive||""}:null; })
    .filter(Boolean)
    .sort(function(a,b){ return a.arrive<b.arrive?-1:(a.arrive>b.arrive?1:0); });
  var route=stops.slice();
  var origin=detectOrigin(stops);
  if(origin) route.unshift(origin);
  var n=0; route.forEach(function(nd){ nd.num=nd.home?0:(++n); nd.label=nd.home?("⌂ "+nd.city):(nd.num+". "+nd.city); });
  var routeSet={}; stops.forEach(function(s){ routeSet[s.city]=true; });
  var points=CITIES.filter(function(c){return c.lat!=null;}).map(function(c){
    var on=routeSet[c.city];
    return {lat:c.lat,lng:c.lng,city:c.city,country:c.country,r:c.r,kb:c,
      color: on?regColor(c.r):"rgba(178,196,212,0.9)", radius: on?0.6:0.36, alt: on?0.02:0.01};
  });
  if(origin) points.push({lat:origin.lat,lng:origin.lng,city:origin.city,country:origin.country,r:null,kb:null,home:true,color:"#ffffff",radius:0.72,alt:0.025});
  _basePoints=points;
  var arcs=[];
  for(var i=0;i<route.length-1;i++){ var a=route[i],b=route[i+1];
    if(a.lat===b.lat&&a.lng===b.lng) continue;
    var f=_flightFor(a.city,b.city), booked=_isBookedFlight(f);
    var ca=a.home?"#dfe6ee":regColor(a.r), cb=b.home?"#dfe6ee":regColor(b.r);
    arcs.push({startLat:a.lat,startLng:a.lng,endLat:b.lat,endLng:b.lng,
      from:a.city,to:b.city,flight:f,booked:booked,
      color: booked?["#f0a83c","#f6c46a"]:[ca,cb],
      stroke: booked?1.1:(f?0.6:0.45),
      dashLen: booked?1:0.4, dashGap: booked?0:0.18, anim: booked?0:2500});
  }
  var g=Globe()(box)
    .globeImageUrl(mapOpts.day?GLOBE_DAY:GLOBE_NIGHT)
    .backgroundColor("rgba(0,0,0,0)")
    .showAtmosphere(true).atmosphereColor("#37b3a4").atmosphereAltitude(0.16)
    .pointsData(points).pointLat("lat").pointLng("lng").pointColor("color").pointAltitude("alt").pointRadius("radius")
    .pointLabel(mapPointLabel)
    .onPointClick(function(d){ if(d&&d.haz){ openHazard(d); return; } if(d&&d.home) return; go("kb"); })
    .arcsData(arcs).arcStartLat("startLat").arcStartLng("startLng").arcEndLat("endLat").arcEndLng("endLng")
    .arcColor("color").arcStroke("stroke").arcDashLength("dashLen").arcDashGap("dashGap")
    .arcDashAnimateTime(function(d){return d.anim;}).arcLabel(mapArcLabel)
    .polygonsData([]).polygonCapColor(function(){return "rgba(0,0,0,0)";}).polygonSideColor(function(){return "rgba(0,0,0,0)";})
    .polygonStrokeColor(function(){return mapOpts.borders?"rgba(170,190,210,0.6)":"rgba(0,0,0,0)";}).polygonAltitude(0.004)
    .onPolygonClick(function(p){ openCountry(p); })
    .ringsData([]).ringLat("lat").ringLng("lng").ringMaxRadius("maxR").ringPropagationSpeed("speed").ringRepeatPeriod("period")
    .ringColor(function(d){ return d.kind==="quake"?function(t){return "rgba(224,101,92,"+(1-t)+")";}:function(t){return "rgba(240,168,60,"+(1-t)+")";}; })
    .labelsData(route).labelLat("lat").labelLng("lng").labelText("label").labelSize(0.9).labelDotRadius(0.34).labelColor(function(d){return d.home?"#ffffff":"#e8edf2";}).labelResolution(2);
  _globeInst=g;
  g.pointOfView({lat:28,lng:92,altitude:2.4},0);
  setTimeout(_globeResize,0);
  if(!_globeBound){ window.addEventListener("resize",_globeResize); _globeBound=true; }
  try{ var ctl=g.controls(); if(ctl){ ctl.autoRotate=mapOpts.rotate; ctl.autoRotateSpeed=0.55; ctl.enableDamping=true; } }catch(e){}
  applyBorders();
  applyHazards();
  setMapBtns();
}
function mapPointLabel(d){
  if(d&&d.haz) return hazPointLabel(d);
  var c=d.kb||{}, rows="";
  if(c.live) rows+='<div>Daily living: ~$'+c.live[0]+'–$'+c.live[2]+' /day (2 ppl)</div>';
  if(c.accom) rows+='<div>Stay (mid): ~$'+c.accom[1]+' /night</div>';
  if(c.rent) rows+='<div>Rent: ~$'+c.rent+' /mo</div>';
  if(c.net) rows+='<div style="color:#8fa0b0">Wi-Fi: '+esc(c.net)+'</div>';
  if(c.land&&c.land.length) rows+='<div style="color:#8fa0b0">'+c.land.length+' landmark'+(c.land.length>1?"s":"")+' in KB</div>';
  var wx=(c.weather&&c.weather.hazard)?('<div style="color:#8fa0b0;margin-top:3px">'+esc(c.weather.hazard)+'</div>'):"";
  return '<div style="max-width:250px;background:#171e26;border:1px solid #2a3642;border-radius:10px;padding:8px 10px;color:#e8edf2;font:12.5px -apple-system,sans-serif;line-height:1.5">'
    +'<div style="font-weight:700;font-size:13.5px">'+esc(d.city)+'</div>'
    +'<div style="color:#8fa0b0;margin-bottom:4px">'+esc(d.country)+' · '+esc(regName(d.r))+'</div>'
    +rows+wx
    +'<div style="color:#37b3a4;margin-top:5px">Click → Knowledge Base</div></div>';
}
function mapArcLabel(d){
  var head='<b>'+esc(d.from)+' → '+esc(d.to)+'</b>';
  var body;
  if(d.flight){
    var f=d.flight;
    body='<div>'+esc(f.type||"Flight")+' · '+esc(String(f.price))+' '+esc(f.cur)+' <span style="color:#8fa0b0">(~'+fmtHUF(toHUF(f.price,f.cur))+')</span></div>'
      +'<div style="margin-top:2px">'+(d.booked?'<span style="color:#f0a83c">✅ booked</span>':'<span style="color:#8fa0b0">~ estimate</span>')+(f.provider?(' · '+esc(f.provider)):"")+'</div>';
  } else { body='<div style="color:#8fa0b0">no flight logged for this hop</div>'; }
  return '<div style="background:#171e26;border:1px solid #2a3642;border-radius:10px;padding:8px 10px;color:#e8edf2;font:12.5px -apple-system,sans-serif;line-height:1.5">'+head+body+'</div>';
}
/* polygons are always loaded (so countries are clickable); borders toggle only controls
   whether the outlines are visible */
function applyBorders(){
  if(!_globeInst) return;
  loadCountries().then(function(feats){ if(_globeInst) _globeInst.polygonsData(feats.slice()); });
}
function toggleMapRotate(){ mapOpts.rotate=!mapOpts.rotate; saveMapOpts(); try{ if(_globeInst) _globeInst.controls().autoRotate=mapOpts.rotate; }catch(e){} setMapBtns(); }
function toggleMapDay(){ mapOpts.day=!mapOpts.day; saveMapOpts(); if(_globeInst) _globeInst.globeImageUrl(mapOpts.day?GLOBE_DAY:GLOBE_NIGHT); setMapBtns(); }
function toggleMapBorders(){ mapOpts.borders=!mapOpts.borders; saveMapOpts(); if(_globeInst) _globeInst.polygonStrokeColor(function(){return mapOpts.borders?"rgba(170,190,210,0.6)":"rgba(0,0,0,0)";}); setMapBtns(); }
function toggleMapHazards(){ mapOpts.hazards=!mapOpts.hazards; saveMapOpts(); applyHazards(); setMapBtns(); }
function resetMapView(){ if(_globeInst) _globeInst.pointOfView({lat:28,lng:92,altitude:2.4},600); }
