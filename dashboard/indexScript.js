(function(){
"use strict";
/* ---------- settings (per browser) ---------- */
var DEF={refresh:"2",theme:"system",range:"all",imported:"1",feed:"100",tab:"live"};
var S={};
function loadSettings(){try{S=JSON.parse(localStorage.getItem("ear.settings")||"{}")}catch(e){S={}}for(var k in DEF)if(S[k]==null)S[k]=DEF[k];}
function saveSettings(){try{localStorage.setItem("ear.settings",JSON.stringify(S))}catch(e){}}
function loadImported(){try{return JSON.parse(localStorage.getItem("ear.imported")||"[]")}catch(e){return[]}}
function saveImported(a){try{localStorage.setItem("ear.imported",JSON.stringify(a))}catch(e){}}
loadSettings();

/* ---------- helpers ---------- */
function $(id){return document.getElementById(id)}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function txt(html){if(!html)return"";if(!/[<>]/.test(html))return String(html);try{var d=new DOMParser().parseFromString(String(html),"text/html");return(d.body.textContent||"").replace(/\n{3,}/g,"\n\n").trim()}catch(e){return String(html)}}
function bool(v){return v===true||String(v).toLowerCase()==="true"}
function parseT(s){if(!s)return null;var d=new Date(String(s).replace(" ","T"));return isNaN(d)?null:d}
function hms(s){var d=parseT(s);return d?d.toTimeString().slice(0,8):""}
function nice(s){var d=parseT(s);if(!d)return"";var t=new Date();var same=d.toDateString()===t.toDateString();return(same?"Today ":d.toLocaleDateString(undefined,{day:"2-digit",month:"short"})+" ")+d.toTimeString().slice(0,5)}
function dur(a,b){var x=parseT(a),y=parseT(b)||new Date();if(!x)return"";var s=Math.max(0,Math.round((y-x)/1000));return s<60?s+"s":Math.floor(s/60)+"m "+(s%60)+"s"}
function inRange(s){if(S.range==="all")return true;var d=parseT(s);if(!d)return true;var from=new Date();from.setHours(0,0,0,0);from.setDate(from.getDate()-(+S.range-1));return d>=from}

/* outcome -> badge class */
function outcomeClass(st){st=String(st||"").toLowerCase();
  if(st.indexOf("skipped")>=0)return"skip";if(st.indexOf("spam")>=0)return"spam";if(st.indexOf("urgent")>=0)return"urgent";if(st.indexOf("repl")>=0)return"reply";
  if(st.indexOf("processing")>=0)return"run";if(st.indexOf("no keyword")>=0||st.indexOf("not help")>=0||st.indexOf("fallback")>=0)return"skip";if(st.indexOf("error")>=0||st.indexOf("fail")>=0)return"error";return"info"}
function sentClass(s){s=String(s||"").toLowerCase();return s==="angry"?"spam":s==="negative"?"urgent":s==="positive"?"reply":"info"}
function typeClass(t){t=String(t||"").toLowerCase();if(t.indexOf("urgent")>=0)return"urgent";if(t.indexOf("forward")>=0)return"route";if(t.indexOf("summary")>=0)return"run";if(t.indexOf("fallback")>=0||t.indexOf("acknowledg")>=0)return"skip";return"reply"}
var LEVEL_LABEL={info:"Info",spam:"Spam",urgent:"Urgent",ai:"AI",route:"Routed",reply:"Replied",skip:"Skipped",run:"Bot",error:"Error"};

/* ---------- data ---------- */
var D={runs:[],emails:[],events:[],sent:[],rules:null,workbooks:{},lastUpdated:null};
var lastSig="",firstLoad=true,seenEvents=0;
function normalise(raw){
  var d={runs:raw.runs||[],emails:raw.emails||[],events:raw.events||[],sent:raw.sent||[],rules:raw.rules||null,workbooks:raw.workbooks||{},lastUpdated:raw.lastUpdated||null};
  // rows imported in the browser from audit table.xlsx
  var imp=loadImported();
  if(imp.length){
    var have={};d.emails.forEach(function(e){have[e.ticketId+"|"+String(e.receivedAt).slice(0,16)]=1});
    imp.forEach(function(e){if(!have[e.ticketId+"|"+String(e.receivedAt).slice(0,16)])d.emails.push(e)});
    var runIds={};d.runs.forEach(function(r){runIds[r.runId]=1});
    imp.forEach(function(e){if(!runIds[e.runId]){runIds[e.runId]=1;d.runs.push({runId:e.runId,startedAt:e.receivedAt,endedAt:e.receivedAt,status:"Imported",source:"excel"})}});
  }
  return d;
}
function load(){
  var old=document.querySelectorAll("script[data-bot]");
  var s=document.createElement("script");s.setAttribute("data-bot","1");
  s.src="data/bot-data.js?t="+Date.now();
  s.onload=function(){old.forEach(function(o){o.remove()});var raw=window.BOT_DATA;
    $("noData").hidden=!!raw;if(!raw){render();return}
    var sig=(raw.lastUpdated||"")+"|"+(raw.events||[]).length+"|"+(raw.emails||[]).length+"|"+loadImported().length;
    if(sig===lastSig)return;lastSig=sig;D=normalise(raw);render();};
  s.onerror=function(){s.remove();if(!window.BOT_DATA&&lastSig!=="none"){lastSig="none";$("noData").hidden=false;render()}};
  document.head.appendChild(s);firstLoad=false;
}
var timer=null;
function schedule(){if(timer)clearInterval(timer);var n=+S.refresh;if(n>0)timer=setInterval(load,n*1000)}

/* ---------- derived ---------- */
function visibleEmails(){return D.emails.filter(function(e){return(S.imported==="1"||e.source!=="excel")&&inRange(e.receivedAt)})}
function latestRun(){var r=D.runs.filter(function(x){return x.source!=="excel"});return r.length?r[r.length-1]:null}
function runStats(runId){var em=D.emails.filter(function(e){return e.runId===runId});
  var o={n:em.length,replied:0,urgent:0,spam:0,other:0};
  em.forEach(function(e){var st=String(e.status||"").toLowerCase();if(bool(e.isUrgent))o.urgent++;if(bool(e.isSpam))o.spam++;
    if(st.indexOf("repl")>=0)o.replied++;else if(!bool(e.isSpam))o.other++;});return o}

/* ---------- render ---------- */
function render(){
  renderHeader();renderLive();renderFeatures();renderEmails();renderSent();renderExcel();renderHistory();renderRules();renderStats();
  if(openKey)openDetail(openKey,true);
}
function renderHeader(){
  var r=latestRun(),pill=$("botPill"),st=$("botState");pill.className="pill";
  if(!r){st.textContent=D.emails.length?"Idle":"Waiting for data"}
  else if(r.status==="Running"){
    var age=(new Date()-(parseT(D.lastUpdated)||new Date()))/1000;
    if(age>600){st.textContent="No update for "+Math.round(age/60)+" min";pill.classList.add("failed")}
    else{st.textContent="Bot running";pill.classList.add("running")}
  }else if(r.status==="Failed"){st.textContent="Last run failed";pill.classList.add("failed")}
  else{st.textContent="Idle · last run "+nice(r.endedAt||r.startedAt);pill.classList.add("done")}
  $("lastUpd").textContent=D.lastUpdated?"Data updated "+hms(D.lastUpdated):"";
  var ve=visibleEmails();$("cEmails").textContent=ve.length||"";
  $("cSent").textContent=D.sent.filter(function(s){return inRange(s.time)}).length||"";
  $("cRuns").textContent=D.runs.filter(function(r){return S.imported==="1"||r.source!=="excel"}).length||"";
}
function kpi(lbl,color,val,sub){return'<div class="card kpi"><div class="lbl"><i style="background:'+color+'"></i>'+esc(lbl)+'</div><div class="val">'+val+'</div><div class="sub">'+esc(sub)+'</div></div>'}
function renderLive(){
  var r=latestRun(),rs=r?runStats(r.runId):{n:0,replied:0,urgent:0,spam:0,other:0};
  var all=D.emails.filter(function(e){return S.imported==="1"||e.source!=="excel"});
  function cnt(f){return all.filter(f).length}
  var tot={n:all.length,replied:cnt(function(e){return/repl/i.test(e.status||"")}),urgent:cnt(function(e){return bool(e.isUrgent)}),spam:cnt(function(e){return bool(e.isSpam)}),
    other:cnt(function(e){return!/repl/i.test(e.status||"")&&!bool(e.isSpam)})};
  var sentRun=r?D.sent.filter(function(s){return s.runId===r.runId}).length:0;
  $("kpis").innerHTML=
    kpi("Emails this run","var(--run)",rs.n,tot.n+" all time")+
    kpi("Replied","var(--reply)",rs.replied,tot.replied+" all time")+
    kpi("Urgent","var(--urgent)",rs.urgent,tot.urgent+" all time")+
    kpi("Spam","var(--spam)",rs.spam,tot.spam+" all time")+
    kpi("Fallback / not Help Desk","var(--skip)",rs.other,tot.other+" all time")+
    kpi("Emails sent","var(--route)",sentRun,D.sent.length+" all time");
  // current run
  var box=$("runBox");
  if(!r){box.innerHTML='<div class="empty"><b>No run recorded yet</b>Start Main.xaml in UiPath Studio.</div>';$("runTag").textContent="";}
  else{
    $("runTag").textContent=r.runId;
    var cur=D.emails.filter(function(e){return e.runId===r.runId});cur=cur[cur.length-1];
    var h='<dl class="kv"><dt>Status</dt><dd>'+badgeRun(r.status)+'</dd><dt>Started</dt><dd>'+esc(nice(r.startedAt))+'</dd><dt>'+(r.endedAt?"Duration":"Running for")+'</dt><dd>'+esc(dur(r.startedAt,r.endedAt))+'</dd>'+
      (r.error?'<dt>Error</dt><dd style="color:var(--error)">'+esc(r.error)+'</dd>':'')+
      '<dt>Machine</dt><dd>'+esc((r.machine||"")+(r.user?" · "+r.user:""))+'</dd></dl>';
    if(cur){h+='<h4 style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--mut);margin:16px 0 6px">'+(r.status==="Running"?"Now processing":"Last email")+' · '+esc(cur.ticketId)+'</h4>'+
      '<div style="font-weight:600;margin-bottom:6px;word-break:break-word"><a href="#" data-open="'+esc(cur.runId+"|"+cur.ticketId)+'">'+esc(cur.subject||"(no subject)")+'</a></div>'+pipeline(cur)}
    box.innerHTML=h;
  }
  // feed
  var lim=+S.feed,ev=D.events.slice(-lim).reverse(),fresh=D.events.length-seenEvents;
  $("feed").innerHTML=ev.length?ev.map(function(e,i){var lv=e.level||"info";return'<li'+(i<fresh&&seenEvents?' class="new"':'')+'><span class="t">'+esc(hms(e.time))+'</span><span><span class="b '+esc(lv)+'">'+esc(LEVEL_LABEL[lv]||lv)+'</span></span><span class="m">'+esc(e.message)+(e.ticketId?'<span class="tk">'+esc(e.ticketId)+'</span>':'')+'</span></li>'}).join(""):'<li style="display:block" class="empty"><b>Nothing yet</b>Messages like “Spam email detected” and “Urgent email replied” appear here while the bot runs.</li>';
  seenEvents=D.events.length;
  $("feedNote").textContent=D.events.length?"newest first · "+D.events.length+" total":"";
}
function badgeRun(s){var c=s==="Running"?"reply":s==="Failed"?"error":s==="Imported"?"ghost":"run";return'<span class="b '+c+'">'+esc(s||"")+'</span>'}

/* step-by-step pipeline for one email */
function pipeline(e){
  var steps=[],hd=e.isHelpDesk==null?(e.source==="excel"?true:null):bool(e.isHelpDesk);
  var spam=e.isSpam==null?null:bool(e.isSpam),urg=e.isUrgent==null?null:bool(e.isUrgent);
  steps.push(["ok","1","Email received",(e.senderName&&e.senderName!==e.senderEmail?e.senderName+" · ":"")+(e.senderEmail||"")]);
  if(hd===false){steps.push(["skip","2","Subject contains “Help Desk”?","No, so the email is skipped"]);if(/skipped/i.test(e.status||"")){steps.push(["skip","3","No reply sent","Not a Help Desk email, so it is only marked as read"]);return'<ul class="pipe">'+steps.map(function(s){return'<li class="'+s[0]+'"><span class="st">'+(s[0]==="ok"?"✓":s[1])+'</span><div><div class="lb">'+esc(s[2])+'</div><div class="ds">'+esc(s[3])+'</div></div></li>'}).join("")+'</ul>'}}
  else{
    steps.push([hd?"ok":"","2","Subject contains “Help Desk”?",hd?"Yes":"…"]);
    steps.push([spam===null?"":spam?"bad":"ok","3","Spam check",spam===null?"…":spam?"Spam ("+(e.spamKeyword||"keyword")+"), moved to Trash":"Not spam"]);
    steps.push([urg===null?"":urg?"warn":"ok","4","Urgent check",urg===null?"…":urg?"Urgent ("+(e.urgentKeyword||"keyword")+")":"Not urgent"]);
    var kw=e.keyword||null;if(urg===false||kw)steps.push([kw==null?(e.source==="excel"?"skip":""):/none/i.test(kw)?"skip":"ok","5","Help Desk keyword",kw==null?(e.source==="excel"?"Not recorded in Excel":"…"):/none/i.test(kw)?"No keyword matched":"Matched “"+kw+"”"]);
    var ai=e.department||e.sentiment;
    steps.push([ai?"ok":"","6","AI analysis",ai?[e.department,e.sentiment,e.formality].filter(Boolean).join(" · "):"…"]);
    steps.push([e.routedTo?"ok":"","7","Forwarded to department",e.routedTo||"…"]);
  }
  var done=/repl|sent|help desk/i.test(e.status||"")&&!/processing/i.test(e.status||"");
  steps.push([done?"ok":"","8","Reply sent",done?(e.replySubject||e.status):"…"]);
  return'<ul class="pipe">'+steps.map(function(s){return'<li class="'+s[0]+'"><span class="st">'+(s[0]==="ok"?"✓":s[0]==="bad"?"!":s[0]==="warn"?"!":s[1])+'</span><div><div class="lb">'+esc(s[2])+'</div><div class="ds">'+esc(s[3])+'</div></div></li>'}).join("")+'</ul>';
}

/* emails table */
var F={q:"",status:"",dept:"",sent:"",flag:"",run:""};
function fillSelect(sel,vals,keep){var cur=sel.value,first=sel.options[0].outerHTML;sel.innerHTML=first+vals.map(function(v){return'<option>'+esc(v)+'</option>'}).join("");if(vals.indexOf(cur)>=0||keep)sel.value=cur}
function uniq(a){var o={};a.forEach(function(x){if(x!=null&&x!=="")o[x]=1});return Object.keys(o).sort()}
function filteredEmails(){var q=F.q.toLowerCase();return visibleEmails().filter(function(e){
  if(F.status&&e.status!==F.status)return false;if(F.dept&&e.department!==F.dept)return false;if(F.sent&&e.sentiment!==F.sent)return false;
  if(F.flag==="urgent"&&!bool(e.isUrgent))return false;if(F.flag==="spam"&&!bool(e.isSpam))return false;if(F.run&&e.runId!==F.run)return false;
  if(q){var hay=[e.ticketId,e.senderEmail,e.senderName,e.subject,e.keyword,e.department,e.routedTo,e.replyBody,e.status].join(" ").toLowerCase();if(hay.indexOf(q)<0)return false}
  return true}).slice().reverse()}
function renderEmails(){
  var ve=visibleEmails();
  fillSelect($("fStatus"),uniq(ve.map(function(e){return e.status})));
  fillSelect($("fDept"),uniq(ve.map(function(e){return e.department})));
  fillSelect($("fSent"),uniq(ve.map(function(e){return e.sentiment})));
  var rs=$("fRun"),cur=rs.value;rs.innerHTML='<option value="">All runs</option>'+D.runs.slice().reverse().filter(function(r){return S.imported==="1"||r.source!=="excel"}).map(function(r){return'<option value="'+esc(r.runId)+'">'+esc(nice(r.startedAt)+" · "+r.runId)+'</option>'}).join("");rs.value=F.run||cur||"";
  var rows=filteredEmails();
  $("mailRows").innerHTML=rows.length?rows.map(function(e){
    return'<tr data-open="'+esc(e.runId+"|"+e.ticketId)+'"><td class="mono">'+esc(nice(e.receivedAt))+'</td><td class="mono">'+esc(e.ticketId)+'</td><td>'+esc(e.senderName&&e.senderName!==e.senderEmail?e.senderName:e.senderEmail||"")+(e.senderName&&e.senderName!==e.senderEmail?'<div class="muted" style="font-size:12px">'+esc(e.senderEmail)+'</div>':'')+'</td><td class="subj"><span title="'+esc(e.subject)+'">'+esc(e.subject||"(no subject)")+'</span></td><td><span class="b '+outcomeClass(e.status)+'">'+esc(e.status||"")+'</span>'+(e.source==="excel"?' <span class="b ghost" title="Imported from audit table.xlsx">Excel</span>':'')+'</td><td>'+esc(e.department||"")+'</td><td>'+(e.sentiment?'<span class="b '+sentClass(e.sentiment)+'">'+esc(e.sentiment)+'</span>':'')+'</td><td>'+(bool(e.isUrgent)?'<span class="yes">Yes</span>':'<span class="muted">No</span>')+'</td><td>'+(bool(e.isSpam)?'<span class="yes sp">Yes</span>':'<span class="muted">No</span>')+'</td></tr>'}).join("")
    :'<tr><td colspan="9"><div class="empty"><b>No emails match</b>'+(ve.length?"Try clearing the filters.":"Emails appear here as soon as the bot reads them.")+'</div></td></tr>';
  $("mailCount").textContent=rows.length+" of "+ve.length+" emails";
}

/* sent list */
function renderSent(){
  var all=D.sent.filter(function(s){return inRange(s.time)});
  fillSelect($("fType"),uniq(all.map(function(s){return s.type})));
  var q=$("qs").value.toLowerCase(),t=$("fType").value;
  var rows=all.filter(function(s){if(t&&s.type!==t)return false;if(q&&[s.to,s.subject,s.body,s.type,s.ticketId].join(" ").toLowerCase().indexOf(q)<0)return false;return true}).slice().reverse();
  var open={};document.querySelectorAll("#sentList details[open]").forEach(function(d){open[d.dataset.k]=1});
  $("sentList").innerHTML=rows.length?rows.map(function(s){var k=s.time+"|"+s.ticketId+"|"+s.type;
    return'<li><details data-k="'+esc(k)+'"'+(open[k]?" open":"")+'><summary><span class="mono">'+esc(nice(s.time))+'</span><span><span class="b '+typeClass(s.type)+'">'+esc(s.type)+'</span></span><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><b>'+esc(s.subject||"(no subject)")+'</b> <span class="muted">→ '+esc(s.to)+'</span></span><span class="mono muted">'+esc(s.ticketId||"")+'</span></summary><div class="body">'+
      (s.routedTo?'<div class="meta" style="margin-bottom:6px">Department mailbox from Routing sheet: '+esc(s.routedTo)+'</div>':'')+
      '<div class="mail">'+esc(txt(s.body))+'</div>'+(s.ticketId?'<div style="margin-top:8px"><a href="#" data-open="'+esc(s.runId+"|"+s.ticketId)+'">Open the email this answers</a></div>':'')+'</div></details></li>'}).join("")
    :'<li class="empty"><b>No sent emails yet</b>Replies, forwards and the “Automation Complete” email are listed here.</li>';
  $("sentCount").textContent=rows.length+" sent emails";
}

/* history */
function renderHistory(){
  $("hRange").value=S.range;$("hImported").checked=S.imported==="1";
  var runs=D.runs.filter(function(r){return(S.imported==="1"||r.source!=="excel")&&inRange(r.startedAt)}).slice().reverse();
  $("runRows").innerHTML=runs.length?runs.map(function(r){var s=runStats(r.runId);
    return'<tr data-run="'+esc(r.runId)+'"><td class="mono">'+esc(r.runId)+'</td><td class="mono">'+esc(nice(r.startedAt))+'</td><td>'+esc(r.source==="excel"?"":dur(r.startedAt,r.endedAt))+'</td><td>'+badgeRun(r.status)+(r.error?'<div class="muted" style="font-size:12px;max-width:260px">'+esc(r.error)+'</div>':'')+'</td><td>'+s.n+'</td><td>'+s.replied+'</td><td>'+s.urgent+'</td><td>'+s.spam+'</td><td>'+s.other+'</td></tr>'}).join("")
    :'<tr><td colspan="9"><div class="empty"><b>No runs in this range</b>Change the range above or in Settings.</div></td></tr>';
  $("runCount").textContent=runs.length+" runs";
}

/* rules */
function col(rows,name){return(rows||[]).map(function(r){return r[name]!=null?r[name]:r[Object.keys(r)[0]]}).filter(function(x){return x!=null&&String(x).trim()!==""})}
function renderRules(){
  var R=D.rules;$("rulesAt").textContent=R&&R.loadedAt?nice(R.loadedAt):"not loaded yet";
  if(!R){$("rulesGrid").innerHTML='<div class="card"><div class="empty"><b>Rules not loaded yet</b>They appear after the bot handles its first Help Desk email.</div></div>';return}
  function chips(title,sheet,list,cls){return'<div class="card"><div class="hd">'+esc(title)+' <span class="b ghost">'+esc(sheet)+'</span><span class="spacer" style="flex:1"></span><span class="meta">'+list.length+'</span></div><div class="bd"><div class="chips">'+(list.length?list.map(function(k){return'<span class="chip">'+esc(k)+'</span>'}).join(""):'<span class="muted">Empty</span>')+'</div></div></div>'}
  var routing=(R.routing||[]);
  $("rulesGrid").innerHTML=
    chips("Help Desk keywords","Sheet1",col(R.helpDeskKeywords,"Keyword"))+
    chips("Spam keywords","Spam",col(R.spamKeywords,"Keyword"))+
    chips("Urgent keywords","Urgent",col(R.urgentKeywords,"Keyword"))+
    '<div class="card"><div class="hd">Department routing <span class="b ghost">Routing</span></div><div class="tablewrap"><table><thead><tr><th>Department</th><th>Forward to</th></tr></thead><tbody>'+
    (routing.length?routing.map(function(r){return'<tr style="cursor:default"><td>'+esc(r.Department)+'</td><td class="mono">'+esc(r.Email)+'</td></tr>'}).join(""):'<tr><td colspan="2" class="muted">Empty</td></tr>')+'</tbody></table></div></div>';
}
function renderStats(){$("dataStats").textContent=D.runs.length+" runs · "+D.emails.length+" emails · "+D.sent.length+" sent · "+D.events.length+" activity lines";
  var n=loadImported().length;$("impInfo").textContent=n?n+" rows imported":"none";}

/* feature checklist */
function featureCounts(E,S,run){
  var c={},has=function(e,k){return e[k]!=null&&e[k]!==""};
  function brk(k){var o={};E.forEach(function(e){if(has(e,k))o[e[k]]=(o[e[k]]||0)+1});var ks=Object.keys(o);return ks.length?ks.map(function(x){return x+" "+o[x]}).join(" · "):"0"}
  var hd=E.filter(function(e){return e.isHelpDesk==null?e.source==="excel":bool(e.isHelpDesk)}).length;
  var kws=E.filter(function(e){return e.keyword&&!/none/i.test(e.keyword)});
  var aiReplies=E.filter(function(e){return/repl/i.test(e.status||"")&&(e.replyBody||e.source==="excel")});
  var tk=E.map(function(e){return e.ticketId}).filter(Boolean).sort();
  c.read=E.length;
  c.ticket=tk.length?(tk[0]===tk[tk.length-1]?tk[0]:tk[0]+" – "+tk[tk.length-1]):"0";
  c.helpdesk=hd+" Help Desk · "+(E.length-hd)+" other";
  var R=D.rules;c.rules=R?(((R.helpDeskKeywords||[]).length)+" keywords · "+((R.spamKeywords||[]).length)+" spam · "+((R.urgentKeywords||[]).length)+" urgent · "+((R.routing||[]).length)+" routes"):"not loaded";
  c.spam=E.filter(function(e){return bool(e.isSpam)}).length;
  c.urgent=E.filter(function(e){return bool(e.isUrgent)}).length;
  c.keyword=kws.length+(kws.length?" ("+uniq(kws.map(function(e){return e.keyword})).join(", ")+")":"");
  c.dept=brk("department");c.sent=brk("sentiment");c.form=brk("formality");
  c.aireply=aiReplies.length;
  c.personal=E.filter(function(e){return/^\s*dear\s/i.test(txt(e.replyBody||""))}).length;
  c.route=S.filter(function(s){return/forward/i.test(s.type||"")}).length+(run?0:E.filter(function(e){return e.source==="excel"&&e.routedTo}).length);
  c.fallback=S.filter(function(s){return/fallback|acknowledg/i.test(s.type||"")}).length+(run?0:E.filter(function(e){return e.source==="excel"&&/no keyword/i.test(e.status||"")}).length);
  c.read2=E.filter(function(e){return e.status&&!/processing/i.test(e.status)}).length;
  var aud=auditSheet();c.excel=run?(run.excelRows!=null?run.excelRows:"—"):(aud?aud.rows.length:0);
  c.summary=S.filter(function(s){return/summary/i.test(s.type||"")}).length;
  c.dash=run?D.events.filter(function(e){return e.runId===run.runId}).length:D.events.length;
  return c;
}
var FEATURES=[
 ["read","Read unread emails from the Gmail inbox","Main.xaml · For Each Email (Inbox, unread)"],
 ["ticket","Give every email a ticket number","Main.xaml · Multiple Assign (TKT-0001…)"],
 ["helpdesk","Only handle emails whose subject has “Help Desk”","Main.xaml · If subject contains “help desk”"],
 ["rules","Load keywords and routing from KeywordsResponses.xlsx","LoadRules.xaml + Read Range (Sheet1)"],
 ["spam","Spam detection, moved to Trash","CheckKeywords.xaml (Spam) + Move Email"],
 ["urgent","Urgent detection, reply marked [URGENT]","CheckKeywords.xaml (Urgent)"],
 ["keyword","Help Desk keyword match","CheckKeywords.xaml (Sheet1)"],
 ["dept","AI department classification","AnalyseEmail.xaml"],
 ["sent","AI sentiment analysis","AnalyseEmail.xaml"],
 ["form","AI formality detection","AnalyseEmail.xaml"],
 ["aireply","AI-written reply, tone adapted to sentiment","GenerateReply.xaml"],
 ["personal","Personalised reply (“Dear name”) sent","Main.xaml · Assign replyBody + Send Email"],
 ["route","Smart routing, forwarded to department","RouteEmail.xaml + Routing sheet"],
 ["fallback","Fallback reply (no keyword / not Help Desk)","Main.xaml · Send Email"],
 ["read2","Mark email as read","Main.xaml · Mark Email as Read"],
 ["excel","Audit log saved to Excel","Add Data Row + Write Range → audit table.xlsx"],
 ["summary","“Automation Complete” email","Main.xaml · Send Email (end of run)"],
 ["dash","Browser dashboard updated","UpdateDashboard.xaml"]
];
function renderFeatures(){
  var r=latestRun();
  var allE=D.emails.filter(function(e){return S.imported==="1"||e.source!=="excel"});
  var A=featureCounts(allE,D.sent,null);
  var T=r?featureCounts(D.emails.filter(function(e){return e.runId===r.runId}),D.sent.filter(function(s){return s.runId===r.runId}),r):null;
  function on(v){return v!=null&&v!==0&&v!=="0"&&!/^0( |$)/.test(String(v))&&v!=="—"&&v!=="not loaded"}
  $("featRows").innerHTML=FEATURES.map(function(f){var t=T?T[f[0]]:"—";
    return'<tr><td><span class="fd'+(on(t)?" on":"")+'" title="'+(on(t)?"Used in this run":"Not triggered in this run")+'"></span></td><td>'+esc(f[1])+'</td><td class="where">'+esc(f[2])+'</td><td class="num">'+esc(t)+'</td><td class="muted">'+esc(A[f[0]])+'</td></tr>'}).join("");
  $("featNote").textContent=r?"green = used in run "+r.runId:"run the bot to fill in “This run”";
}

/* Excel files (copies of the real workbooks, read by the bot) */
var AUDIT_COLS=["Ticket ID","Date","Sender","Subject","Keyword","Department","RoutedTo","Sentiment","IsUrgent","IsSpam"];
var XS={book:null,sheet:{},col:-1,dir:1};
var XL_ICON='<svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="18" rx="2" fill="#1d6f42"/><path d="M8 8l3 4-3 4M16 8l-3 4 3 4" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';
function bookKeys(){return Object.keys(D.workbooks||{}).sort(function(a,b){return/audit/i.test(a)?-1:/audit/i.test(b)?1:a<b?-1:1})}
function isAudit(k){return/audit table/i.test(k||"")}
function auditSheet(){var k=bookKeys().filter(isAudit)[0],b=k&&D.workbooks[k];if(!b||!b.sheets)return null;return b.sheets.filter(function(s){return s.name==="Sheet 1"})[0]||b.sheets[0]}
function fileName(k){return String(k).split(/[\\\/]/).pop()}
function curSheet(){var b=D.workbooks[XS.book];if(!b||!b.sheets||!b.sheets.length)return null;var nm=XS.sheet[XS.book];
  var sh=b.sheets.filter(function(s){return s.name===nm})[0];if(!sh){sh=b.sheets.filter(function(s){return s.rows.length})[0]||b.sheets[0];XS.sheet[XS.book]=sh.name}return sh}
function colLetter(i){var s="";i++;while(i>0){var m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26)}return s}
function sheetRows(sh,audit){
  var q=$("qx").value.toLowerCase(),mode=audit?$("xRows").value:"all",r=latestRun(),since=r?parseT(r.startedAt):null;
  var rows=sh.rows.map(function(o){var c=o.c||[];return{n:o.n,cells:c,isNew:!!(audit&&since&&parseT(c[1])&&parseT(c[1])>=since),partial:audit&&(c.length<6||!c[5])}});
  rows=rows.filter(function(o){if(mode==="run"&&!o.isNew)return false;if(mode==="full"&&o.partial)return false;if(q&&o.cells.join(" ").toLowerCase().indexOf(q)<0)return false;return true});
  if(XS.col>=0)rows.sort(function(a,b){var x=a.cells[XS.col]||"",y=b.cells[XS.col]||"";return(x<y?-1:x>y?1:a.n-b.n)*XS.dir});
  return rows}
function renderExcel(){
  var keys=bookKeys(),tbl=$("xlTable");
  var aud=auditSheet();$("cExcel").textContent=aud?aud.rows.length:"";
  if(!keys.length){$("xBooks").innerHTML="";$("xSheets").innerHTML="";tbl.innerHTML='<tbody><tr><td><div class="empty"><b>No Excel files loaded yet</b>The bot copies <code>audit table.xlsx</code> and <code>KeywordsResponses.xlsx</code> here when it starts.</div></td></tr></tbody>';$("xInfo").textContent="";return}
  if(keys.indexOf(XS.book)<0)XS.book=keys[0];
  $("xBooks").innerHTML=keys.map(function(k){return'<button class="book" data-book="'+esc(k)+'" aria-pressed="'+(k===XS.book)+'">'+XL_ICON+esc(fileName(k))+'</button>'}).join("");
  var b=D.workbooks[XS.book],audit=isAudit(XS.book);
  $("xOpen").href="../"+String(XS.book).replace(/\\/g,"/").split("/").map(encodeURIComponent).join("/");
  $("xRows").hidden=!audit;
  if(b.missing||!b.sheets){$("xSheets").innerHTML="";tbl.innerHTML='<tbody><tr><td><div class="empty"><b>'+esc(fileName(XS.book))+' was not found</b>The bot looks for it at <code>'+esc(b.path)+'</code> in the project folder.</div></td></tr></tbody>';$("xInfo").textContent="";return}
  var sh=curSheet();
  $("xSheets").innerHTML=b.sheets.map(function(s){return'<button data-sheet="'+esc(s.name)+'" aria-selected="'+(s.name===sh.name)+'">'+esc(s.name)+'</button>'}).join("");
  var auditMain=audit&&sh===auditSheet();
  var n=Math.max(auditMain?AUDIT_COLS.length:1,sh.rows.reduce(function(m,r){return Math.max(m,(r.c||[]).length)},0)),rows=sheetRows(sh,auditMain);
  var h='<thead><tr class="letters"><th class="rn"></th>';for(var i=0;i<n;i++)h+='<th data-col="'+i+'" style="cursor:pointer">'+colLetter(i)+(XS.col===i?'<span class="sortmark">'+(XS.dir>0?"▲":"▼")+'</span>':'')+'</th>';h+='</tr>';
  if(auditMain){h+='<tr class="names"><th class="rn"></th>';for(i=0;i<n;i++)h+='<th data-col="'+i+'">'+esc(AUDIT_COLS[i]||"")+'</th>';h+='</tr>'}
  h+='</thead><tbody>'+rows.map(function(o){var c='';for(var i=0;i<n;i++){var v=o.cells[i]==null?"":String(o.cells[i]);c+='<td class="'+(v==="TRUE"?"t":v==="FALSE"?"f":"")+'" title="'+esc(v)+'">'+esc(v)+'</td>'}
    return'<tr class="'+(o.isNew?"newrow ":"")+(o.partial?"partial ":"")+(!auditMain&&o.n===1?"hdr":"")+'"><td class="rn" title="Row '+o.n+' in Excel'+(o.isNew?' (added in the last run)':'')+'">'+o.n+'</td>'+c+'</tr>'}).join("")+'</tbody>';
  if(!rows.length)h+='<tbody><tr><td colspan="'+(n+1)+'"><div class="empty"><b>'+(sh.rows.length?"No rows match":"This sheet is empty")+'</b></div></td></tr></tbody>';
  tbl.innerHTML=h;
  var r=latestRun(),newCount=auditMain&&r?sh.rows.filter(function(o){var c=o.c||[];return parseT(c[1])&&parseT(c[1])>=parseT(r.startedAt)}).length:0;
  $("xInfo").textContent=b.path+" · sheet “"+sh.name+"” · "+sh.rows.length+" rows"+(auditMain?" ("+newCount+" from the last run)":"")+" · copied "+nice(b.readAt);
  $("xHint").textContent=auditMain?"Grey italic rows are the partial rows the keyword branch writes. Orange row numbers = added in the last run. Click a column letter to sort.":"These are the rules the bot uses. Edit them in Excel; the bot reloads them for every email.";
}
function excelCsv(){var sh=curSheet();if(!sh)return;var auditMain=isAudit(XS.book)&&sh===auditSheet();
  var lines=(auditMain?[AUDIT_COLS.join(",")]:[]).concat(sheetRows(sh,auditMain).map(function(o){return o.cells.map(function(v){return'"'+String(v==null?"":v).replace(/"/g,'""')+'"'}).join(",")}));
  var a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["﻿"+lines.join("\r\n")],{type:"text/csv"}));a.download=fileName(XS.book).replace(/\.xlsx$/i,"")+" - "+sh.name+".csv";document.body.appendChild(a);a.click();a.remove()}

/* detail drawer */
var openKey=null;
function openDetail(key,refresh){
  var p=key.split("|"),e=D.emails.filter(function(x){return x.runId===p[0]&&x.ticketId===p[1]})[0];if(!e)return;openKey=key;
  $("dMeta").textContent=e.ticketId+" · "+(e.source==="excel"?"imported from Excel":e.runId)+" · received "+nice(e.receivedAt);
  $("dTitle").textContent=e.subject||"(no subject)";
  $("dTags").innerHTML='<span class="b '+outcomeClass(e.status)+'">'+esc(e.status)+'</span>'+(bool(e.isUrgent)?'<span class="b urgent">Urgent</span>':'')+(bool(e.isSpam)?'<span class="b spam">Spam</span>':'')+(e.sentiment?'<span class="b '+sentClass(e.sentiment)+'">'+esc(e.sentiment)+'</span>':'')+(e.department?'<span class="b route">'+esc(e.department)+'</span>':'');
  var ev=D.events.filter(function(x){return x.runId===e.runId&&x.ticketId===e.ticketId});
  var sn=D.sent.filter(function(x){return x.runId===e.runId&&x.ticketId===e.ticketId});
  var h='<h4>Steps the bot took</h4>'+pipeline(e)+
    '<h4>Details</h4><dl class="kv"><dt>From</dt><dd>'+esc((e.senderName&&e.senderName!==e.senderEmail?e.senderName+" · ":"")+(e.senderEmail||""))+'</dd>'+
    '<dt>Help Desk</dt><dd>'+(e.isHelpDesk==null?"—":bool(e.isHelpDesk)?"Yes":"No")+'</dd>'+
    '<dt>Spam</dt><dd>'+(bool(e.isSpam)?"Yes"+(e.spamKeyword?" (“"+esc(e.spamKeyword)+"”)":""):"No")+'</dd>'+
    '<dt>Urgent</dt><dd>'+(bool(e.isUrgent)?"Yes"+(e.urgentKeyword?" (“"+esc(e.urgentKeyword)+"”)":""):"No")+'</dd>'+
    '<dt>Keyword</dt><dd>'+esc(e.keyword||"—")+'</dd><dt>Department</dt><dd>'+esc(e.department||"—")+'</dd><dt>Sentiment</dt><dd>'+esc(e.sentiment||"—")+'</dd><dt>Formality</dt><dd>'+esc(e.formality||"—")+'</dd><dt>Routed to</dt><dd>'+esc(e.routedTo||"—")+'</dd><dt>Last update</dt><dd>'+esc(nice(e.updatedAt||e.receivedAt))+'</dd></dl>'+
    (e.body?'<h4>Original email</h4><div class="mail">'+esc(txt(e.body))+'</div>':'')+
    (e.replyBody?'<h4>Reply sent · '+esc(e.replySubject||"")+'</h4><div class="mail">'+esc(txt(e.replyBody))+'</div>':'')+
    (sn.length?'<h4>Emails sent for this ticket ('+sn.length+')</h4>'+sn.map(function(s){return'<div style="margin-bottom:8px"><span class="b '+typeClass(s.type)+'">'+esc(s.type)+'</span> <span class="mono muted">'+esc(hms(s.time))+'</span> → '+esc(s.to)+'<div class="muted" style="font-size:12.5px">'+esc(s.subject||"")+'</div></div>'}).join(""):'')+
    (ev.length?'<h4>Activity log</h4><ul class="feed" style="max-height:none">'+ev.map(function(x){var lv=x.level||"info";return'<li style="padding:6px 0"><span class="t">'+esc(hms(x.time))+'</span><span><span class="b '+esc(lv)+'">'+esc(LEVEL_LABEL[lv]||lv)+'</span></span><span class="m">'+esc(x.message)+'</span></li>'}).join("")+'</ul>':'')+
    (e.source==="excel"?'<p class="note" style="margin-top:14px">This row came from <code>audit table.xlsx</code>, which only stored the columns shown above. Emails processed from now on will have the full email, reply and step log.</p>':'');
  var db=$("dBody"),top=db.scrollTop;db.innerHTML=h;if(refresh)db.scrollTop=top;
  $("drawer").classList.add("on");$("scrim").classList.add("on");$("drawer").setAttribute("aria-hidden","false");
}
function closeDetail(){openKey=null;$("drawer").classList.remove("on");$("scrim").classList.remove("on");$("drawer").setAttribute("aria-hidden","true")}

/* ---------- CSV ---------- */
function csv(){var cols=["receivedAt","ticketId","runId","senderName","senderEmail","subject","status","isHelpDesk","isSpam","spamKeyword","isUrgent","urgentKeyword","keyword","department","sentiment","formality","routedTo","replySubject","replyBody","source"];
  var lines=[cols.join(",")].concat(filteredEmails().map(function(e){return cols.map(function(c){var v=e[c]==null?"":String(c==="replyBody"?txt(e[c]):e[c]);return'"'+v.replace(/"/g,'""')+'"'}).join(",")}));
  var a=document.createElement("a");a.href=URL.createObjectURL(new Blob(["﻿"+lines.join("\r\n")],{type:"text/csv"}));a.download="email-history.csv";document.body.appendChild(a);a.click();a.remove();}

/* ---------- Excel import (audit table.xlsx) - small built-in .xlsx reader, no internet needed ---------- */
function unzip(buf){ // returns Promise<{name:Uint8Array}>
  var dv=new DataView(buf),u8=new Uint8Array(buf),eocd=-1;
  for(var i=u8.length-22;i>=Math.max(0,u8.length-66000);i--){if(dv.getUint32(i,true)===0x06054b50){eocd=i;break}}
  if(eocd<0)return Promise.reject(new Error("not an .xlsx file"));
  var n=dv.getUint16(eocd+10,true),p=dv.getUint32(eocd+16,true),jobs=[],files={},dec=new TextDecoder();
  for(var k=0;k<n;k++){
    var method=dv.getUint16(p+10,true),csize=dv.getUint32(p+20,true),nl=dv.getUint16(p+28,true),el=dv.getUint16(p+30,true),cl=dv.getUint16(p+32,true),off=dv.getUint32(p+42,true);
    var name=dec.decode(u8.subarray(p+46,p+46+nl));p+=46+nl+el+cl;
    if(!/^xl\/(workbook\.xml|sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/.test(name))continue;
    var lo=off+30+dv.getUint16(off+26,true)+dv.getUint16(off+28,true),data=u8.subarray(lo,lo+csize);
    jobs.push((function(name,method,data){
      if(method===0){files[name]=data;return Promise.resolve()}
      return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer().then(function(b){files[name]=new Uint8Array(b)});
    })(name,method,data));
  }
  return Promise.all(jobs).then(function(){return files});
}
function readXlsx(buf){
  return unzip(buf).then(function(f){
    var dec=new TextDecoder(),xml=function(n){return f[n]?new DOMParser().parseFromString(dec.decode(f[n]),"application/xml"):null};
    var ss=[],sx=xml("xl/sharedStrings.xml");
    if(sx)Array.prototype.forEach.call(sx.getElementsByTagName("si"),function(si){var t="";Array.prototype.forEach.call(si.getElementsByTagName("t"),function(x){t+=x.textContent});ss.push(t)});
    var sheets=[];
    Object.keys(f).filter(function(n){return/worksheets\/sheet\d+\.xml$/.test(n)}).sort().forEach(function(n){
      var doc=xml(n),rows=[];
      Array.prototype.forEach.call(doc.getElementsByTagName("row"),function(r){var row=[];
        Array.prototype.forEach.call(r.getElementsByTagName("c"),function(c){
          var ref=c.getAttribute("r")||"",col=0,m=ref.match(/^[A-Z]+/);if(m)for(var i=0;i<m[0].length;i++)col=col*26+(m[0].charCodeAt(i)-64);col--;
          var t=c.getAttribute("t"),v=c.getElementsByTagName("v")[0],val=v?v.textContent:null;
          if(t==="s")val=ss[+val];else if(t==="b")val=val==="1";else if(t==="inlineStr"){var is=c.getElementsByTagName("t")[0];val=is?is.textContent:""}
          else if(t!=="str"&&t!=="e"&&val!=null&&val!==""&&!isNaN(+val))val=+val;
          row[col<0?row.length:col]=val});
        rows.push(row)});
      sheets.push(rows)});
    return sheets;
  });
}
function excelDate(v){if(typeof v==="number"){var ms=Math.round((v-25569)*86400000),d=new Date(ms),o=d.getTimezoneOffset()*60000;d=new Date(ms+o);return d}return parseT(v)}
function importExcel(file){
  file.arrayBuffer().then(readXlsx).then(function(sheets){
    var out=[],runId=null;
    sheets.forEach(function(rows){rows.forEach(function(r){
      if(!r||!r[0]||!/^TKT-/i.test(String(r[0])))return;
      var d=excelDate(r[1]);var ds=d?d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")+" "+d.toTimeString().slice(0,8):String(r[1]||"");
      if(String(r[0]).toUpperCase()==="TKT-0001"&&!(out.length&&out[out.length-1].ticketId==="TKT-0001"&&!out[out.length-1].department))runId="XL-"+ds.replace(/[^0-9]/g,"").slice(0,12);
      var tf=function(x){return x==null||x===""?null:bool(x)};
      var rec={source:"excel",runId:runId||"XL-IMPORT",ticketId:String(r[0]),receivedAt:ds,senderEmail:r[2]||"",subject:r[3]||"",status:r[4]||"",department:r[5]||"",routedTo:r[6]||"",sentiment:r[7]||"",isUrgent:tf(r[8]),isSpam:tf(r[9])};
      var prev=out[out.length-1];
      if(prev&&prev.ticketId===rec.ticketId&&prev.runId===rec.runId&&!prev.department&&rec.department){rec.keyword=prev.status||null;rec.receivedAt=prev.receivedAt;out[out.length-1]=rec;return}
      if(!rec.department&&/none/i.test(rec.status)){rec.keyword="None";rec.status="No keyword - sent to IT Help Desk"}
      out.push(rec)})});
    var cur=loadImported(),seen={};cur.concat(out).forEach(function(e){seen[e.ticketId+"|"+e.receivedAt]=e});
    saveImported(Object.keys(seen).map(function(k){return seen[k]}));lastSig="";load();
    alert("Read "+out.length+" emails from "+file.name+". Rows that were already in the history are not duplicated.");
  }).catch(function(err){alert("Could not read that file: "+err.message)});
}

/* ---------- theme ---------- */
function applyTheme(){var r=document.documentElement;if(S.theme==="system")r.removeAttribute("data-theme");else r.setAttribute("data-theme",S.theme)}

/* ---------- events ---------- */
function showTab(v){S.tab=v;saveSettings();document.querySelectorAll("nav.tabs button").forEach(function(b){b.setAttribute("aria-selected",b.dataset.v===v?"true":"false")});document.querySelectorAll("section.view").forEach(function(s){s.classList.toggle("on",s.id==="v-"+v)})}
document.querySelector("nav.tabs").addEventListener("click",function(ev){var b=ev.target.closest("button");if(b)showTab(b.dataset.v)});
document.addEventListener("click",function(ev){
  var o=ev.target.closest("[data-open]");if(o){ev.preventDefault();openDetail(o.getAttribute("data-open"));return}
  var r=ev.target.closest("tr[data-run]");if(r){F.run=r.getAttribute("data-run");$("fRun").value=F.run;showTab("emails");renderEmails();}
});
$("dClose").onclick=closeDetail;$("scrim").onclick=closeDetail;
document.addEventListener("keydown",function(e){if(e.key==="Escape")closeDetail();if((e.key==="r"||e.key==="R")&&!/input|select|textarea/i.test(document.activeElement.tagName)){lastSig="";load()}});
$("q").oninput=function(){F.q=this.value;renderEmails()};
[["fStatus","status"],["fDept","dept"],["fSent","sent"],["fFlag","flag"],["fRun","run"]].forEach(function(p){$(p[0]).onchange=function(){F[p[1]]=this.value;renderEmails()}});
$("qs").oninput=renderSent;$("fType").onchange=renderSent;
$("csvBtn").onclick=csv;
$("qx").oninput=renderExcel;$("xRows").onchange=renderExcel;$("xCsv").onclick=excelCsv;
$("xlTable").addEventListener("click",function(ev){var th=ev.target.closest("th[data-col]");if(!th)return;var c=+th.dataset.col;if(XS.col===c){if(XS.dir>0)XS.dir=-1;else XS.col=-1}else{XS.col=c;XS.dir=1}renderExcel()});
$("xBooks").addEventListener("click",function(ev){var b=ev.target.closest("[data-book]");if(!b)return;XS.book=b.getAttribute("data-book");XS.col=-1;$("qx").value="";renderExcel()});
$("xSheets").addEventListener("click",function(ev){var b=ev.target.closest("[data-sheet]");if(!b)return;XS.sheet[XS.book]=b.getAttribute("data-sheet");XS.col=-1;renderExcel()});
$("importBtn").onclick=function(){$("importFile").click()};
$("importFile").onchange=function(){if(this.files[0])importExcel(this.files[0]);this.value=""};
$("clearImport").onclick=function(){saveImported([]);lastSig="";load()};
function bindSet(id,key,after){var el=$(id);el.value=S[key];el.onchange=function(){S[key]=this.value;saveSettings();if(after)after();lastSig="";D=D;render()}}
bindSet("sRefresh","refresh",schedule);bindSet("sTheme","theme",applyTheme);bindSet("sRange","range");bindSet("sImported","imported");bindSet("sFeed","feed");
$("hRange").onchange=function(){S.range=this.value;$("sRange").value=S.range;saveSettings();render()};
$("hImported").onchange=function(){S.imported=this.checked?"1":"0";$("sImported").value=S.imported;saveSettings();lastSig="";load()};
$("themeBtn").onclick=function(){var dark=S.theme==="dark"||(S.theme==="system"&&window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches);S.theme=dark?"light":"dark";$("sTheme").value=S.theme;saveSettings();applyTheme()};

applyTheme();showTab(S.tab||"live");load();schedule();
setInterval(function(){if(latestRun()&&latestRun().status==="Running"){renderHeader();}},1000);
})();