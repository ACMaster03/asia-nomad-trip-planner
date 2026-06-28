/* ============================ CLOUD SYNC (Supabase, optional) ============================ */
/* Document model: the whole trip `state` and the `ledger` are stored as JSON on one
   row in the `trips` table (columns state jsonb, ledger jsonb). localStorage stays the
   working/offline store; the cloud is the sync layer between devices/people. If the
   Supabase client or config is missing (e.g. offline file://), everything below no-ops
   and the app runs exactly as the local-only version. */
var cloud = { client:null, user:null, tripId:null, pushTimer:null, applyingRemote:false, status:"local" };
var ACTIVE_TRIP_KEY="asiaNomadActiveTrip";
function cloudReady(){ return !!(cloud.client && cloud.user); }
function myEmail(){ return ((cloud.user&&cloud.user.email)||"").toLowerCase(); }
function activeTrip(){ try{ return localStorage.getItem(ACTIVE_TRIP_KEY)||null; }catch(e){ return null; } }
function setActiveTripId(id){ try{ if(id) localStorage.setItem(ACTIVE_TRIP_KEY,id); }catch(e){} }
function cloudInit(){
  if(typeof supabase==="undefined" || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY){ updateCloudBtn(); return; }
  try{ cloud.client = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY); }
  catch(e){ cloud.client=null; updateCloudBtn(); return; }
  cloud.status="signed-out";
  cloud.client.auth.onAuthStateChange(function(_evt, session){
    cloud.user = session ? session.user : null;
    cloud.status = cloud.user ? "syncing" : "signed-out";
    updateCloudBtn();
    if(cloud.user) cloudLoad();
  });
  cloud.client.auth.getSession().then(function(res){
    cloud.user = (res.data && res.data.session) ? res.data.session.user : null;
    cloud.status = cloud.user ? "syncing" : "signed-out";
    updateCloudBtn();
    if(cloud.user) cloudLoad();
  }).catch(function(){ updateCloudBtn(); });
}
function cloudErr(e){ cloud.status="error"; updateCloudBtn(); console.warn("cloud:", (e&&e.message)||e); }
function applyTripRow(row){
  cloud.tripId=row.id; setActiveTripId(row.id);
  if(row.state && row.state.meta){
    cloud.applyingRemote=true;
    state=row.state; if(!state.notes) state.notes={}; if(!state.rates) state.rates=JSON.parse(JSON.stringify(DEFAULT_STATE.rates)); save();
    ledger=Array.isArray(row.ledger)?row.ledger:[]; saveLedger();
    cloud.applyingRemote=false;
    render();
  } else {
    cloudPush(true); // row exists but empty -> seed from local
  }
  cloud.status="synced"; updateCloudBtn();
}
function cloudLoad(){
  if(!cloudReady()) return;
  cloud.status="syncing"; updateCloudBtn();
  var COLS="id,state,ledger,updated_at";
  var loadLatest=function(){
    cloud.client.from("trips").select(COLS).order("updated_at",{ascending:false}).limit(1)
      .then(function(res){
        if(res.error){ cloudErr(res.error); return; }
        var rows=res.data||[];
        if(rows.length){ applyTripRow(rows[0]); }
        else { cloudPush(true); cloud.status="synced"; updateCloudBtn(); } // no accessible trip -> seed from local
        cloudCheckIncoming();
      }, cloudErr);
  };
  var active=activeTrip();
  if(active){
    cloud.client.from("trips").select(COLS).eq("id",active).limit(1)
      .then(function(res){
        if(res.error){ cloudErr(res.error); return; }
        if(res.data && res.data.length){ applyTripRow(res.data[0]); cloudCheckIncoming(); }
        else { loadLatest(); } // active trip no longer accessible -> fall back
      }, cloudErr);
  } else { loadLatest(); }
}
function setActiveTrip(id){ setActiveTripId(id); cloudLoad(); }
/* surface any pending invitations addressed to me (badge on the cloud button) */
function cloudCheckIncoming(){
  if(!cloudReady()) return;
  cloud.client.from("trip_invites").select("id").eq("email",myEmail()).eq("status","pending")
    .then(function(res){ cloud.incoming=(res.data&&res.data.length)||0; updateCloudBtn(); }, function(){});
}
function cloudPush(immediate){
  if(!cloudReady() || cloud.applyingRemote) return;
  function doPush(){
    var payload={ state:state, ledger:ledger, name:(state.meta&&state.meta.tripName)||"Trip", updated_at:new Date().toISOString() };
    var done=function(res){ if(res&&res.error){ cloud.status="error"; console.warn("cloud push:", res.error.message); } else { cloud.status="synced"; } updateCloudBtn(); };
    if(cloud.tripId){
      cloud.client.from("trips").update(payload).eq("id",cloud.tripId).then(done,done);
    } else {
      payload.owner=cloud.user.id;
      cloud.client.from("trips").insert(payload).select("id").then(function(res){ if(res.data&&res.data[0]){ cloud.tripId=res.data[0].id; setActiveTripId(cloud.tripId); } done(res); }, done);
    }
  }
  cloud.status="syncing"; updateCloudBtn();
  if(cloud.pushTimer){ clearTimeout(cloud.pushTimer); cloud.pushTimer=null; }
  if(immediate) doPush(); else cloud.pushTimer=setTimeout(doPush, 1200);
}
function cloudPushDebounced(){ cloudPush(false); }
function updateCloudBtn(){
  var b=document.getElementById("cloudBtn"); if(!b) return;
  if(!cloud.client){ b.textContent="☁ Local"; b.title="Cloud not configured — running local-only"; return; }
  if(!cloud.user){ b.textContent="☁ Sign in"; b.title="Sign in to sync across devices"; return; }
  var icon = cloud.status==="error"?"⚠":(cloud.status==="syncing"?"⟳":"✓");
  var badge = cloud.incoming ? " · "+cloud.incoming+" invite"+(cloud.incoming>1?"s":"") : "";
  b.textContent="☁ "+icon+" "+(cloud.user.email||"Synced")+badge;
  b.title = cloud.status==="error"?"Sync error — see console; your data is safe locally":(cloud.incoming?"You have a pending trip invite":(cloud.status==="syncing"?"Syncing…":"Synced"));
}
function openCloud(){
  if(!cloud.client){
    openModal('<h3>Cloud sync</h3><p class="muted">Cloud sync isn\'t available here. This happens when you open the file directly (offline) or the Supabase config is missing. The app works fully local-only — open the <b>served</b> site (localhost or your Vercel URL) to sign in and sync.</p><div class="row" style="margin-top:8px"><button class="btn" onclick="closeModal()">Close</button></div>');
    return;
  }
  if(!cloud.user){
    openModal('<h3>Sign in to sync</h3><p class="sub">Enter your email — we\'ll send a one-time <b>magic link</b> (no password). Open it on this device to sign in. Your trip and money ledger then sync automatically.</p>'
      +'<div class="field"><label>Email</label><input id="cl_email" type="email" placeholder="you@example.com"></div>'
      +'<div id="cl_msg" class="muted" style="min-height:16px"></div>'
      +'<div class="row" style="margin-top:8px"><button class="btn acc" onclick="cloudSendLink()">Send magic link</button><button class="btn" onclick="closeModal()">Cancel</button></div>');
    setTimeout(function(){ var el=document.getElementById("cl_email"); if(el) el.focus(); },0);
  } else {
    var h='<h3>Cloud sync &amp; sharing</h3>';
    h+='<p class="sub">Signed in as <b>'+esc(cloud.user.email||"")+'</b> · <b>'+esc(cloud.status)+'</b>. Trip + money ledger sync automatically; localStorage is the offline cache.</p>';
    h+='<div id="cloudIncoming"></div>';
    h+='<h4 style="margin:14px 0 6px">Invite someone to this trip</h4>';
    h+='<div class="f2"><div class="field"><label>Their email</label><input id="inv_email" type="email" placeholder="partner@example.com"></div>'
      +'<div class="field"><label>Role</label><select id="inv_role"><option value="editor">Editor (can edit)</option><option value="viewer">Viewer (read-only)</option></select></div></div>';
    h+='<div id="inv_msg" class="muted" style="min-height:16px"></div>';
    h+='<div class="row"><button class="btn acc" onclick="cloudInviteSend()">Send invite</button></div>';
    h+='<div class="muted" style="font-size:12px;margin-top:4px">They sign in to this site with that email to accept — no account needed in advance.</div>';
    h+='<div id="cloudSent"></div>';
    h+='<h4 style="margin:16px 0 6px">Your trips</h4><div id="cloudTrips" class="muted">Loading…</div>';
    h+='<div class="row" style="margin-top:14px"><button class="btn" onclick="cloudLoad()">↺ Pull latest</button><button class="btn" onclick="cloudSignOut()">Sign out</button><button class="btn" onclick="closeModal()">Close</button></div>';
    openModal(h);
    cloudRenderIncoming(); cloudRenderSent(); cloudRenderTrips();
  }
}
/* --- sharing: incoming invites addressed to me --- */
function cloudRenderIncoming(){
  var el=document.getElementById("cloudIncoming"); if(!el||!cloudReady()) return;
  cloud.client.from("trip_invites").select("id,trip_id,role,invited_by").eq("email",myEmail()).eq("status","pending")
    .then(function(res){
      var rows=(res.data)||[]; cloud.incoming=rows.length; updateCloudBtn();
      if(!rows.length){ el.innerHTML=""; return; }
      var h='<div class="note" style="border-left-color:var(--good)"><b>You\'ve been invited to '+rows.length+' trip'+(rows.length>1?"s":"")+':</b>';
      rows.forEach(function(r){
        h+='<div class="row" style="margin-top:6px"><span class="grow">Trip <code>'+esc(r.trip_id.slice(0,8))+'…</code> · role: '+esc(r.role)+'</span>'
          +'<button class="btn sm acc" onclick="cloudAcceptInvite(\''+r.trip_id+'\',\''+esc(r.role)+'\')">Accept &amp; switch</button></div>';
      });
      h+='</div>'; el.innerHTML=h;
    }, function(){ el.innerHTML=""; });
}
/* --- sharing: invites I've sent for the current trip --- */
function cloudRenderSent(){
  var el=document.getElementById("cloudSent"); if(!el||!cloudReady()||!cloud.tripId){ if(el) el.innerHTML=""; return; }
  cloud.client.from("trip_invites").select("id,email,role,status").eq("trip_id",cloud.tripId).neq("status","revoked")
    .then(function(res){
      var rows=(res.data)||[]; if(!rows.length){ el.innerHTML=""; return; }
      var h='<div style="margin-top:8px"><div class="tag">Invites on this trip</div>';
      rows.forEach(function(r){
        h+='<div class="row" style="margin-top:4px"><span class="grow">'+esc(r.email)+' · '+esc(r.role)+' · <span class="muted">'+esc(r.status)+'</span></span>'
          +(r.status==="pending"?'<span class="seg-edit" onclick="cloudRevokeInvite(\''+r.id+'\')">revoke</span>':"")+'</div>';
      });
      h+='</div>'; el.innerHTML=h;
    }, function(){ el.innerHTML=""; });
}
/* --- sharing: trips I can access, with a switcher --- */
function cloudRenderTrips(){
  var el=document.getElementById("cloudTrips"); if(!el||!cloudReady()) return;
  cloud.client.from("trips").select("id,name,updated_at").order("updated_at",{ascending:false})
    .then(function(res){
      var rows=(res.data)||[]; if(!rows.length){ el.innerHTML='<span class="muted">No trips yet.</span>'; return; }
      var act=activeTrip()||cloud.tripId;
      var h="";
      rows.forEach(function(r){
        var on=(r.id===act);
        h+='<div class="row" style="margin:4px 0"><span class="grow">'+(on?"<b>":"")+esc(r.name||"Trip")+(on?" ✓</b>":"")+' <code class="muted">'+esc(r.id.slice(0,8))+'…</code></span>'
          +(on?'<span class="tag">active</span>':'<button class="btn sm" onclick="setActiveTrip(\''+r.id+'\');closeModal()">Use this</button>')+'</div>';
      });
      el.innerHTML=h;
    }, function(){ el.innerHTML='<span class="muted">Couldn\'t load trips.</span>'; });
}
function cloudInviteSend(){
  var m=document.getElementById("inv_msg");
  var email=((val("inv_email")||"").trim().toLowerCase());
  var role=val("inv_role")||"editor";
  if(!email){ if(m) m.textContent="Enter their email."; return; }
  if(!cloud.tripId){ if(m) m.textContent="No active trip yet — make any edit first, then invite."; return; }
  if(email===myEmail()){ if(m) m.textContent="That's your own email 🙂"; return; }
  if(m) m.textContent="Sending…";
  cloud.client.from("trip_invites").insert({ trip_id:cloud.tripId, email:email, role:role, invited_by:cloud.user.id })
    .then(function(r){
      if(r.error){ if(m) m.textContent="Error: "+r.error.message; }
      else { if(m) m.textContent="✓ Invited "+email+"."; cloudRenderSent(); var i=document.getElementById("inv_email"); if(i) i.value=""; }
    }, function(e){ if(m) m.textContent="Error: "+((e&&e.message)||e); });
}
function cloudRevokeInvite(id){
  if(!cloudReady()) return;
  cloud.client.from("trip_invites").update({status:"revoked"}).eq("id",id).then(function(){ cloudRenderSent(); }, function(){});
}
function cloudAcceptInvite(tripId, role){
  if(!cloudReady()) return;
  cloud.client.from("trip_members").insert({ trip_id:tripId, user_id:cloud.user.id, role:role||"editor" })
    .then(function(r){
      if(r.error){ alert("Could not accept invite: "+r.error.message); return; }
      cloud.client.from("trip_invites").update({ status:"accepted", accepted_by:cloud.user.id, accepted_at:new Date().toISOString() })
        .eq("trip_id",tripId).eq("email",myEmail()).then(function(){},function(){});
      cloud.incoming=0; setActiveTripId(tripId); closeModal(); cloudLoad();
    }, function(e){ alert("Could not accept invite: "+((e&&e.message)||e)); });
}
function cloudSendLink(){
  var email=((val("cl_email")||"").trim()); var m=document.getElementById("cl_msg");
  if(!email){ if(m) m.textContent="Enter your email first."; return; }
  if(m) m.textContent="Sending…";
  var redirect=location.href.split("#")[0];
  cloud.client.auth.signInWithOtp({ email:email, options:{ emailRedirectTo:redirect } }).then(function(r){
    if(m) m.textContent = r.error ? ("Error: "+r.error.message) : "✓ Check your email for the sign-in link.";
  }, function(e){ if(m) m.textContent="Error: "+e; });
}
function cloudSignOut(){
  if(!cloud.client) return;
  cloud.client.auth.signOut().then(function(){ cloud.user=null; cloud.tripId=null; cloud.status="signed-out"; updateCloudBtn(); closeModal(); });
}
