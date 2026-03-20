import { useState, useEffect, useCallback, useRef, createContext, useContext } from "react";

const BASE = "http://localhost:8000";

// ── API ───────────────────────────────────────────────────────────────────────
const tok = () => localStorage.getItem("fm_token");
const ah  = () => { const t = tok(); return t ? { Authorization: `Bearer ${t}` } : {}; };
async function req(path, opts = {}) {
  const r = await fetch(`${BASE}${path}`, { ...opts, headers: { ...ah(), ...(opts.headers || {}) } });
  if (!r.ok) { const e = await r.json().catch(() => ({ detail: r.statusText })); throw new Error(e.detail || "Error"); }
  return r.status === 204 ? null : r.json();
}
const api = {
  auth: {
    register:      d  => req("/api/auth/register",       { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(d) }),
    login:         async(e,p) => { const d=await req("/api/auth/login",{ method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({email:e,password:p}) }); localStorage.setItem("fm_token",d.access_token); return d; },
    me:            () => req("/api/auth/me"),
    logout:        () => localStorage.removeItem("fm_token"),
    updateProfile: d  => req("/api/auth/profile",        { method:"PUT",  headers:{"Content-Type":"application/json"}, body:JSON.stringify(d) }),
    forgotPw:      e  => req("/api/auth/forgot-password",{ method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({email:e}) }),
    resetPw:       d  => req("/api/auth/reset-password", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(d) }),
  },
  items: {
    list:   (p={}) => { const qs=new URLSearchParams(Object.fromEntries(Object.entries(p).filter(([,v])=>v))).toString(); return req(`/api/items/${qs?"?"+qs:""}`); },
    mine:   () => req("/api/items/mine"),
    create: fd => req("/api/items/",{method:"POST",body:fd}),
    update: (id,d) => req(`/api/items/${id}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(d)}),
    delete: id => req(`/api/items/${id}`,{method:"DELETE"}),
    match:  id => req(`/api/items/${id}/match`,{method:"POST"}),
  },
  matches: {
    mine:    () => req("/api/matches/"),
    confirm: (id,body) => req(`/api/matches/${id}/confirm`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}),
  },
  chat: {
    get:  matchId => req(`/api/chat/${matchId}`),
    send: (matchId,text) => req(`/api/chat/${matchId}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text})}),
  },
  experiences: {
    list:   () => req("/api/experiences"),
    post:   d  => req("/api/experiences",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(d)}),
    delete: id => req(`/api/experiences/${id}`,{method:"DELETE"}),
  },
  notifications: { mine: () => req("/api/notifications/") },
  leaderboard:   () => req("/api/leaderboard"),
};

// ── AUTH CONTEXT ──────────────────────────────────────────────────────────────
const Ctx = createContext(null);
function AuthProvider({ children }) {
  const [user,setUser]=useState(null); const [rdy,setRdy]=useState(false);
  useEffect(()=>{
    if(!tok()){setRdy(true);return;}
    api.auth.me().then(setUser).catch(()=>localStorage.removeItem("fm_token")).finally(()=>setRdy(true));
  },[]);
  const login=useCallback(async(e,p)=>{await api.auth.login(e,p);const u=await api.auth.me();setUser(u);return u;},[]);
  const register=useCallback(async d=>{await api.auth.register(d);return login(d.email,d.password);},[login]);
  const logout=useCallback(()=>{api.auth.logout();setUser(null);},[]);
  const refreshUser=useCallback(async()=>{const u=await api.auth.me();setUser(u);},[]);
  if(!rdy) return <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#080818"}}><Spin s={44} c="#a78bfa"/></div>;
  return <Ctx.Provider value={{user,login,register,logout,refreshUser}}>{children}</Ctx.Provider>;
}
const useAuth=()=>useContext(Ctx);

// ── PALETTE ───────────────────────────────────────────────────────────────────
const P={
  bg:"#080818",panel:"#0f0f23",card:"#141428",border:"#2a2a4a",
  ink:"#f0eeff",ink2:"#b8b4d8",ink3:"#6b6890",
  violet:"#a78bfa",pink:"#f472b6",cyan:"#22d3ee",
  lime:"#a3e635",amber:"#fbbf24",coral:"#fb7185",
  gMain: "linear-gradient(135deg,#a78bfa,#f472b6)",
  gCyan: "linear-gradient(135deg,#22d3ee,#a78bfa)",
  gLime: "linear-gradient(135deg,#a3e635,#22d3ee)",
  gAmber:"linear-gradient(135deg,#fbbf24,#fb7185)",
  gCoral:"linear-gradient(135deg,#fb7185,#f472b6)",
  gGold: "linear-gradient(135deg,#fbbf24,#f59e0b)",
  gHero: "linear-gradient(135deg,#a78bfa 0%,#f472b6 40%,#fb7185 70%,#fbbf24 100%)",
  sh:"0 4px 24px rgba(167,139,250,.12)",shLg:"0 12px 48px rgba(167,139,250,.22)",r:14,
};
const CARD_ACC=[
  {bar:"linear-gradient(135deg,#a78bfa,#f472b6)",glow:"#a78bfa",tint:"#a78bfa10"},
  {bar:"linear-gradient(135deg,#22d3ee,#a78bfa)",glow:"#22d3ee",tint:"#22d3ee10"},
  {bar:"linear-gradient(135deg,#a3e635,#22d3ee)",glow:"#a3e635",tint:"#a3e63510"},
  {bar:"linear-gradient(135deg,#fbbf24,#fb7185)",glow:"#fbbf24",tint:"#fbbf2410"},
  {bar:"linear-gradient(135deg,#fb7185,#f472b6)",glow:"#fb7185",tint:"#fb718510"},
];
const TAG_COLORS=["#a78bfa","#22d3ee","#a3e635","#f472b6","#fbbf24","#fb7185"];
const CAT_ICONS={Electronics:"💻",Clothing:"👕",Accessories:"👜",Keys:"🔑",Bags:"🎒",Books:"📚",Sports:"⚽",Stationery:"✏️",Other:"📦"};
const CATS=["Electronics","Clothing","Accessories","Keys","Bags","Books","Sports","Stationery","Other"];
const RANK_ICONS=["🥇","🥈","🥉"];
const RANK_COLORS=[P.gGold,"linear-gradient(135deg,#94a3b8,#64748b)","linear-gradient(135deg,#fb7185,#f59e0b)"];
const STORY_EMOJIS=["🎒","📱","🔑","📚","✏️","🎧","💻","👜","⚽","🌟","💜","🙏"];

// ── PRIMITIVES ─────────────────────────────────────────────────────────────────
const Spin=({s=20,c=P.violet})=>(
  <div style={{width:s,height:s,borderRadius:"50%",border:`2.5px solid ${c}33`,borderTopColor:c,animation:"spin .6s linear infinite",flexShrink:0}}/>
);

function Btn({children,g=P.gMain,col="#fff",sz="md",loading,full,icon,onClick,disabled,sx={}}){
  const [hov,setHov]=useState(false);
  const pad={sm:"8px 18px",md:"11px 24px",lg:"14px 32px"}[sz];
  const fs={sm:12,md:13,lg:15}[sz];
  return(
    <button onClick={onClick} disabled={disabled||loading}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:7,border:"none",borderRadius:50,fontFamily:"inherit",fontWeight:800,cursor:(disabled||loading)?"not-allowed":"pointer",opacity:(disabled||loading)?.5:1,transition:"all .18s",transform:hov&&!disabled&&!loading?"translateY(-2px) scale(1.02)":"none",background:g,color:col,padding:pad,fontSize:fs,letterSpacing:".01em",boxShadow:hov?P.shLg:P.sh,width:full?"100%":undefined,...sx}}>
      {loading?<Spin s={sz==="sm"?13:15} c={col}/>:icon}{children}
    </button>
  );
}

function Inp({label,error,icon,required,...p}){
  const [foc,setFoc]=useState(false);
  return(
    <div style={{display:"flex",flexDirection:"column",gap:5}}>
      {label&&<label style={{fontSize:11,fontWeight:800,color:P.ink2,letterSpacing:".08em",textTransform:"uppercase"}}>
        {label}{required&&<span style={{color:P.coral,marginLeft:3}}>*</span>}
      </label>}
      <div style={{position:"relative"}}>
        {icon&&<span style={{position:"absolute",left:13,top:"50%",transform:"translateY(-50%)",fontSize:15,pointerEvents:"none"}}>{icon}</span>}
        <input onFocus={()=>setFoc(true)} onBlur={()=>setFoc(false)}
          style={{width:"100%",padding:icon?"11px 14px 11px 40px":"11px 15px",background:P.panel,border:`2px solid ${error?P.coral:foc?P.violet:P.border}`,borderRadius:P.r,color:P.ink,fontSize:14,fontFamily:"inherit",outline:"none",boxSizing:"border-box",transition:"border .15s, box-shadow .15s",boxShadow:foc?`0 0 0 4px ${P.violet}18`:"none"}}
          {...p}/>
      </div>
      {error&&<span style={{fontSize:11,color:P.coral,fontWeight:700}}>⚠ {error}</span>}
    </div>
  );
}

const Chip=({children,color=P.violet})=>(
  <span style={{display:"inline-flex",alignItems:"center",padding:"3px 10px",borderRadius:50,background:color+"18",color,fontSize:11,fontWeight:700,border:`1.5px solid ${color}33`,whiteSpace:"nowrap"}}>{children}</span>
);

const GT=({children,g=P.gMain,style:sx={},tag="span"})=>{
  const T=tag; return <T style={{background:g,WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",...sx}}>{children}</T>;
};

function ScoreRing({score,size=64}){
  const r=size/2-5,c=2*Math.PI*r,fill=(score/100)*c;
  const g=score>=70?["#22d3ee","#a3e635"]:score>=45?["#fbbf24","#fb7185"]:["#fb7185","#f472b6"];
  const id=useRef("sr"+Math.random().toString(36).slice(2));
  return(
    <div style={{position:"relative",width:size,height:size,flexShrink:0}}>
      <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
        <defs><linearGradient id={id.current} x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor={g[0]}/><stop offset="100%" stopColor={g[1]}/></linearGradient></defs>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={P.border} strokeWidth={4}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={`url(#${id.current})`} strokeWidth={4.5} strokeDasharray={`${fill} ${c}`} strokeLinecap="round" style={{transition:"stroke-dasharray .8s ease"}}/>
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
        <GT g={`linear-gradient(135deg,${g[0]},${g[1]})`} style={{fontSize:size*.25,fontWeight:900}}>{Math.round(score)}</GT>
        <span style={{fontSize:size*.13,color:P.ink3,fontWeight:700}}>%</span>
      </div>
    </div>
  );
}

function UploadZone({onFile,preview,onClear}){
  const [drag,setDrag]=useState(false);
  const id=useRef("uz"+Math.random().toString(36).slice(2));
  return(
    <div>
      <label htmlFor={id.current}
        style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,border:`2.5px dashed ${drag?P.violet:P.border}`,borderRadius:P.r,background:drag?P.violet+"08":P.panel,cursor:"pointer",transition:"all .18s",overflow:"hidden",minHeight:150,position:"relative",boxShadow:drag?`0 0 0 5px ${P.violet}18`:"none"}}
        onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)}
        onDrop={e=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f)onFile(f)}}>
        <input id={id.current} type="file" accept="image/*" style={{display:"none"}} onChange={e=>e.target.files[0]&&onFile(e.target.files[0])}/>
        {preview
          ?<img src={preview} alt="preview" style={{width:"100%",maxHeight:220,objectFit:"cover",borderRadius:P.r-2}}/>
          :<><div style={{width:64,height:64,borderRadius:"50%",background:P.gMain,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,boxShadow:`0 6px 20px ${P.violet}44`}}>📷</div>
            <div style={{textAlign:"center"}}>
              <div style={{fontWeight:800,fontSize:14,color:P.ink2,marginBottom:3}}><span style={{color:P.violet}}>Click to upload</span> or drag & drop</div>
              <div style={{fontSize:11,color:P.ink3}}>JPG, PNG, WebP · max 10 MB</div>
            </div></>}
      </label>
      {preview&&<button onClick={onClear} style={{marginTop:7,background:"none",border:"none",fontSize:12,color:P.coral,cursor:"pointer",fontFamily:"inherit",fontWeight:800}}>✕ Remove photo</button>}
    </div>
  );
}

function Modal({open,onClose,children,wide}){
  if(!open) return null;
  return(
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(8,8,24,.82)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:2000,padding:16,backdropFilter:"blur(8px)"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:P.card,border:`2px solid ${P.border}`,borderRadius:22,padding:28,width:"100%",maxWidth:wide?640:520,maxHeight:"92vh",overflowY:"auto",boxShadow:P.shLg,animation:"popIn .28s cubic-bezier(.34,1.56,.64,1)"}}>
        {children}
      </div>
    </div>
  );
}

function Toast({toasts,remove}){
  return(
    <div style={{position:"fixed",bottom:22,right:22,zIndex:9999,display:"flex",flexDirection:"column",gap:9}}>
      {toasts.map(t=>(
        <div key={t.id} onClick={()=>remove(t.id)} style={{background:t.type==="error"?P.gCoral:P.gMain,color:"#fff",padding:"13px 20px",borderRadius:50,fontSize:13,fontWeight:800,cursor:"pointer",maxWidth:310,boxShadow:P.shLg,animation:"slideIn .3s cubic-bezier(.34,1.56,.64,1)",display:"flex",alignItems:"center",gap:9}}>
          {t.type==="error"?"❌":"✅"} {t.msg}
        </div>
      ))}
    </div>
  );
}
function useToast(){
  const [ts,setTs]=useState([]);
  const toast=(msg,type="info")=>{const id=Date.now();setTs(p=>[...p,{id,msg,type}]);setTimeout(()=>setTs(p=>p.filter(t=>t.id!==id)),4200);};
  const remove=id=>setTs(p=>p.filter(t=>t.id!==id));
  return{ts,toast,remove};
}

const STATUS={lost:{g:P.gCoral,icon:"🔍",label:"Lost"},found:{g:P.gCyan,icon:"📦",label:"Found"},matched:{g:P.gAmber,icon:"🤝",label:"Matched"},claimed:{g:"linear-gradient(135deg,#475569,#1e293b)",icon:"✅",label:"Claimed"}};
const SPill=({status})=>{const s=STATUS[status]||{g:P.gMain,icon:"•",label:status};return <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 12px",borderRadius:50,background:s.g,color:"#fff",fontSize:11,fontWeight:800,whiteSpace:"nowrap"}}>{s.icon} {s.label}</span>;};

// ── SIGN OUT CONFIRM MODAL ────────────────────────────────────────────────────
function SignOutModal({open,onClose,onConfirm}){
  return(
    <Modal open={open} onClose={onClose}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:52,marginBottom:14,animation:"float 2s ease-in-out infinite"}}>👋</div>
        <GT g={P.gMain} tag="h2" style={{fontFamily:"'Syne',sans-serif",fontSize:22,fontWeight:900,display:"block",marginBottom:8}}>Sign out?</GT>
        <p style={{color:P.ink3,fontSize:14,marginBottom:24,lineHeight:1.65}}>You'll need to sign in again to post items or view your matches.</p>
        <div style={{display:"flex",gap:10}}>
          <Btn g={`linear-gradient(135deg,${P.border},${P.panel})`} col={P.ink2} full onClick={onClose} sx={{border:`2px solid ${P.border}`}}>Cancel</Btn>
          <Btn g={P.gCoral} full onClick={onConfirm} sz="lg">Yes, Sign Out</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ── CONFIRM POST MODAL ────────────────────────────────────────────────────────
function ConfirmModal({open,onClose,onConfirm,form,preview,loading}){
  const isFound=form.status==="found";
  const tags=form.tags?form.tags.split(",").map(t=>t.trim()).filter(Boolean):[];
  const warns=[!form.name&&"Item name missing",!form.location&&"Location missing",!form.category&&"Category not set",!preview&&"No photo"].filter(Boolean);
  return(
    <Modal open={open} onClose={onClose}>
      <div style={{textAlign:"center",marginBottom:20}}>
        <div style={{width:58,height:58,borderRadius:"50%",background:isFound?P.gCyan:P.gCoral,margin:"0 auto 12px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:24}}>{isFound?"📦":"🔍"}</div>
        <GT g={isFound?P.gCyan:P.gCoral} tag="h2" style={{fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:900,display:"block",marginBottom:4}}>Review before posting</GT>
        <p style={{fontSize:12,color:P.ink3}}>Check carefully — students will see this.</p>
      </div>
      {warns.length>0&&<div style={{background:P.amber+"15",border:`2px solid ${P.amber}44`,borderRadius:12,padding:"10px 14px",marginBottom:14,fontSize:12,color:P.amber,fontWeight:700}}>⚠️ {warns.join(" · ")}</div>}
      <div style={{background:P.panel,border:`2px solid ${isFound?P.cyan:P.coral}44`,borderRadius:P.r,overflow:"hidden",marginBottom:16}}>
        <div style={{height:4,background:isFound?P.gCyan:P.gCoral}}/>
        <div style={{padding:16,display:"flex",flexDirection:"column",gap:11}}>
          {preview?<img src={preview} alt="item" style={{width:"100%",maxHeight:160,objectFit:"cover",borderRadius:10}}/>
            :<div style={{height:56,background:P.card,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",border:`2px dashed ${P.border}`}}><span style={{fontSize:11,color:P.ink3,fontWeight:700}}>📷 No photo uploaded</span></div>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            {[["Status",<SPill status={form.status}/>],["Item Name",form.name||"—"],["📍 Location",form.location||"—"],["🏷️ Category",form.category?`${CAT_ICONS[form.category]} ${form.category}`:"Not set"]].map(([l,v])=>(
              <div key={l} style={{background:P.card,border:`2px solid ${P.border}`,borderRadius:10,padding:"8px 11px"}}>
                <div style={{fontSize:10,fontWeight:800,color:P.ink3,letterSpacing:".07em",marginBottom:2}}>{String(l).toUpperCase()}</div>
                <div style={{fontSize:13,fontWeight:700,color:P.ink}}>{v}</div>
              </div>
            ))}
          </div>
          {form.description&&<p style={{fontSize:12,color:P.ink2,background:P.card,padding:"8px 11px",borderRadius:10,lineHeight:1.6}}>{form.description}</p>}
          {tags.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:5}}>{tags.map((t,i)=><Chip key={t} color={TAG_COLORS[i%TAG_COLORS.length]}>{t}</Chip>)}</div>}
        </div>
      </div>
      <div style={{display:"flex",gap:10}}>
        <Btn g={`linear-gradient(135deg,${P.border},${P.panel})`} col={P.ink2} onClick={onClose} full sx={{border:`2px solid ${P.border}`}}>← Edit</Btn>
        <Btn g={isFound?P.gCyan:P.gCoral} full loading={loading} onClick={onConfirm} sz="lg">✅ Confirm & Post</Btn>
      </div>
    </Modal>
  );
}

// ── OUTCOME MODAL ─────────────────────────────────────────────────────────────
function OutcomeModal({open,onClose,onSubmit,match,loading}){
  const [outcome,setOutcome]=useState(null);
  const opts=[
    {id:"returned",g:P.gCyan,icon:"🎉",title:"Yes! Got it back",sub:"Item returned. Finder earns leaderboard credit."},
    {id:"not_mine",g:P.gCoral,icon:"❌",title:"Not my item",sub:"Wrong match. Item stays active."},
    {id:"already_found",g:P.gAmber,icon:"🔄",title:"Already found it",sub:"Mark resolved, no leaderboard credit."},
  ];
  return(
    <Modal open={open} onClose={onClose}>
      <div style={{textAlign:"center",marginBottom:20}}>
        <div style={{fontSize:40,marginBottom:10}}>🤔</div>
        <GT g={P.gMain} tag="h2" style={{fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:900,display:"block",marginBottom:4}}>Update Outcome</GT>
        <p style={{fontSize:12,color:P.ink3}}>Did this match work out?</p>
      </div>
      {match&&<div style={{background:P.panel,border:`2px solid ${P.border}`,borderRadius:P.r,padding:"12px 14px",marginBottom:16,display:"flex",gap:10,alignItems:"center"}}>
        <ScoreRing score={match.score} size={48}/>
        <div style={{flex:1}}><div style={{fontSize:13,fontWeight:800,color:P.ink}}>{match.lost_item?.name} ↔ {match.found_item?.name}</div>{match.finder_name&&<div style={{fontSize:11,color:P.cyan,fontWeight:700}}>Found by: {match.finder_name}</div>}</div>
      </div>}
      <div style={{display:"flex",flexDirection:"column",gap:9,marginBottom:16}}>
        {opts.map(o=>(
          <button key={o.id} onClick={()=>setOutcome(o.id)}
            style={{display:"flex",gap:13,alignItems:"center",padding:"13px 15px",borderRadius:P.r,border:`2.5px solid ${outcome===o.id?P.violet:P.border}`,background:outcome===o.id?P.violet+"15":P.panel,cursor:"pointer",fontFamily:"inherit",transition:"all .15s",textAlign:"left"}}>
            <div style={{width:42,height:42,borderRadius:12,background:o.g,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{o.icon}</div>
            <div style={{flex:1}}><div style={{fontWeight:800,fontSize:13,color:outcome===o.id?P.violet:P.ink,marginBottom:2}}>{o.title}</div><div style={{fontSize:11,color:P.ink3}}>{o.sub}</div></div>
            {outcome===o.id&&<div style={{fontSize:18,flexShrink:0}}>✓</div>}
          </button>
        ))}
      </div>
      <div style={{display:"flex",gap:10}}>
        <Btn g={`linear-gradient(135deg,${P.border},${P.panel})`} col={P.ink2} onClick={onClose}>Cancel</Btn>
        <Btn g={P.gMain} full loading={loading} disabled={!outcome} onClick={()=>onSubmit(outcome)} sz="lg">Submit</Btn>
      </div>
    </Modal>
  );
}

// ── CHAT WIDGET ───────────────────────────────────────────────────────────────
function ChatWidget({matchId,currentUserId,onClose}){
  const [msgs,setMsgs]=useState([]); const [text,setText]=useState(""); const [sending,setSending]=useState(false);
  const bottomRef=useRef(null);
  const load=useCallback(async()=>{try{const m=await api.chat.get(matchId);setMsgs(m);}catch(e){}},[matchId]);
  useEffect(()=>{load();const iv=setInterval(load,4000);return()=>clearInterval(iv);},[load]);
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[msgs]);
  const send=async()=>{
    if(!text.trim()) return;
    setSending(true);
    try{const m=await api.chat.send(matchId,text);setMsgs(p=>[...p,m]);setText("");}
    catch(e){}
    finally{setSending(false);}
  };
  return(
    <div style={{position:"fixed",bottom:24,right:24,width:340,zIndex:3000,borderRadius:20,overflow:"hidden",boxShadow:"0 20px 60px rgba(0,0,0,.5)",border:`2px solid ${P.border}`,display:"flex",flexDirection:"column",animation:"popIn .28s cubic-bezier(.34,1.56,.64,1)"}}>
      {/* Header */}
      <div style={{background:P.gMain,padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontFamily:"'Syne',sans-serif",fontWeight:900,fontSize:14,color:"#fff"}}>💬 Match Chat</div>
        <button onClick={onClose} style={{background:"rgba(255,255,255,.2)",border:"none",color:"#fff",borderRadius:"50%",width:26,height:26,cursor:"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
      </div>
      {/* Messages */}
      <div style={{background:P.panel,flex:1,overflowY:"auto",padding:"14px 12px",display:"flex",flexDirection:"column",gap:8,minHeight:240,maxHeight:340}}>
        {msgs.length===0&&<div style={{textAlign:"center",color:P.ink3,fontSize:12,padding:"20px 0"}}>No messages yet. Say hi! 👋</div>}
        {msgs.map(m=>{
          const mine=m.sender_id===currentUserId;
          return(
            <div key={m._id} style={{display:"flex",flexDirection:"column",alignItems:mine?"flex-end":"flex-start"}}>
              {!mine&&<div style={{fontSize:10,color:P.ink3,fontWeight:700,marginBottom:2}}>{m.sender_name}</div>}
              <div style={{background:mine?P.gMain:P.card,color:"#fff",padding:"9px 13px",borderRadius:mine?"16px 16px 4px 16px":"16px 16px 16px 4px",maxWidth:"82%",fontSize:13,lineHeight:1.55,boxShadow:P.sh}}>
                {m.text}
              </div>
              <div style={{fontSize:9,color:P.ink3,marginTop:3}}>{new Date(m.created_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div>
            </div>
          );
        })}
        <div ref={bottomRef}/>
      </div>
      {/* Input */}
      <div style={{background:P.card,padding:"10px 12px",display:"flex",gap:8,alignItems:"center",borderTop:`2px solid ${P.border}`}}>
        <input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()}
          placeholder="Type a message…"
          style={{flex:1,background:P.panel,border:`2px solid ${P.border}`,borderRadius:50,padding:"9px 14px",color:P.ink,fontSize:13,fontFamily:"inherit",outline:"none"}}/>
        <button onClick={send} disabled={sending||!text.trim()}
          style={{width:38,height:38,borderRadius:"50%",background:P.gMain,border:"none",color:"#fff",fontSize:16,cursor:text.trim()?"pointer":"not-allowed",opacity:text.trim()?1:.5,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
          {sending?<Spin s={14} c="#fff"/>:"→"}
        </button>
      </div>
    </div>
  );
}

// ── NAVBAR ─────────────────────────────────────────────────────────────────────
function Navbar({page,setPage}){
  const {user,logout}=useAuth();
  const [mob,setMob]=useState(false);
  const [showSignOut,setShowSignOut]=useState(false);
  const doLogout=()=>{logout();setShowSignOut(false);setPage("board");};
  const links=user
    ?[["board","🏠 Browse"],["post","📤 Post"],["matches","🔗 Matches"],["mine","📋 Mine"],["leaderboard","🏆"],["experiences","✨ Stories"],["notifs","🔔"]]
    :[["board","🏠 Browse"],["post","📤 Post"],["leaderboard","🏆"],["experiences","✨ Stories"]];
  return(
    <>
    <nav style={{position:"sticky",top:0,zIndex:500,background:"rgba(8,8,24,.92)",backdropFilter:"blur(20px)",borderBottom:`2px solid ${P.border}`}}>
      <div style={{height:4,background:P.gHero}}/>
      <div style={{maxWidth:1200,margin:"0 auto",padding:"0 20px",height:60,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <button onClick={()=>setPage("board")} style={{background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:9}}>
          <div style={{width:34,height:34,borderRadius:10,background:P.gHero,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,boxShadow:`0 4px 16px ${P.violet}44`}}>🎒</div>
          <div>
            <GT g={P.gHero} style={{fontFamily:"'Syne',sans-serif",fontSize:19,fontWeight:900,display:"block",lineHeight:1.1}}>FINDME</GT>
            <div style={{fontSize:8,color:P.ink3,letterSpacing:".15em",fontWeight:700}}>CAMPUS LOST & FOUND</div>
          </div>
        </button>
        <div style={{display:"flex",alignItems:"center",gap:2}} className="fm-desk">
          {links.map(([id,l])=>(
            <button key={id} onClick={()=>setPage(id)}
              style={{background:page===id?P.violet+"18":"none",border:`2px solid ${page===id?P.violet+"44":"transparent"}`,padding:"7px 12px",fontSize:12,fontWeight:700,borderRadius:50,color:page===id?P.violet:P.ink2,cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}>
              {l}
            </button>
          ))}
          <div style={{width:1,height:22,background:P.border,margin:"0 4px"}}/>
          {user
            ?<div style={{display:"flex",alignItems:"center",gap:8}}>
                <button onClick={()=>setPage("profile")} style={{display:"flex",alignItems:"center",gap:7,background:"none",border:"none",cursor:"pointer"}}>
                  <div style={{width:32,height:32,borderRadius:"50%",background:P.gMain,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:900,boxShadow:`0 4px 14px ${P.violet}44`}}>{user.full_name?.[0]?.toUpperCase()||"U"}</div>
                  <span style={{fontSize:12,fontWeight:700,color:P.ink2}}>{user.full_name?.split(" ")[0]}</span>
                </button>
                <button onClick={()=>setShowSignOut(true)} style={{background:P.panel,border:`2px solid ${P.border}`,borderRadius:50,padding:"6px 12px",fontSize:12,fontWeight:700,color:P.ink3,cursor:"pointer",fontFamily:"inherit"}}>Out</button>
              </div>
            :<div style={{display:"flex",gap:8}}>
                <button onClick={()=>setPage("login")} style={{background:"none",border:`2px solid ${P.border}`,borderRadius:50,padding:"7px 14px",fontSize:12,fontWeight:700,color:P.ink2,cursor:"pointer",fontFamily:"inherit"}}>Sign in</button>
                <Btn g={P.gHero} sz="sm" onClick={()=>setPage("register")}>🚀 Join</Btn>
              </div>
          }
        </div>
        <button onClick={()=>setMob(o=>!o)} style={{display:"none",width:38,height:38,borderRadius:11,background:P.gMain,border:"none",color:"#fff",fontSize:18,cursor:"pointer",alignItems:"center",justifyContent:"center"}} className="fm-mob">☰</button>
      </div>
      {mob&&(
        <div style={{borderTop:`2px solid ${P.border}`,padding:"10px 20px 14px",background:P.panel,display:"flex",flexDirection:"column",gap:4}}>
          {links.map(([id,l])=><button key={id} onClick={()=>{setPage(id);setMob(false)}} style={{background:page===id?P.violet+"15":"none",border:"none",padding:"10px 14px",textAlign:"left",fontSize:14,fontWeight:700,borderRadius:12,color:page===id?P.violet:P.ink2,cursor:"pointer",fontFamily:"inherit"}}>{l}</button>)}
          {user
            ?<><button onClick={()=>{setPage("profile");setMob(false)}} style={{background:"none",border:"none",padding:"10px 14px",textAlign:"left",fontSize:13,color:P.ink3,cursor:"pointer",fontFamily:"inherit"}}>⚙️ Edit Profile</button>
               <button onClick={()=>{setShowSignOut(true);setMob(false)}} style={{background:"none",border:"none",padding:"10px 14px",textAlign:"left",fontSize:13,color:P.coral,cursor:"pointer",fontFamily:"inherit"}}>Sign out</button></>
            :<div style={{display:"flex",gap:8,paddingTop:8}}>
                <button onClick={()=>{setPage("login");setMob(false)}} style={{flex:1,padding:10,background:"none",border:`2px solid ${P.border}`,borderRadius:50,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit",color:P.ink2}}>Sign in</button>
                <Btn g={P.gHero} full onClick={()=>{setPage("register");setMob(false)}}>Join</Btn>
              </div>
          }
        </div>
      )}
    </nav>
    <SignOutModal open={showSignOut} onClose={()=>setShowSignOut(false)} onConfirm={doLogout}/>
    </>
  );
}

// ── HERO ───────────────────────────────────────────────────────────────────────
function Hero({setPage,user,count}){
  return(
    <div style={{position:"relative",overflow:"hidden",borderRadius:22,marginBottom:32,padding:"clamp(36px,5vw,60px) clamp(24px,5vw,52px)",background:P.gHero}}>
      {[{t:-60,r:-60,s:220,o:.12},{b:-40,l:30,s:160,o:.1},{t:20,l:"48%",s:90,o:.09}].map((b,i)=>(
        <div key={i} style={{position:"absolute",width:b.s,height:b.s,borderRadius:"50%",background:`rgba(255,255,255,${b.o})`,top:b.t,bottom:b.b,left:b.l,right:b.r,pointerEvents:"none"}}/>
      ))}
      {["🎒","📱","🔑","🎧","✏️","👟"].map((e,i)=>(
        <div key={i} style={{position:"absolute",fontSize:"clamp(18px,2.5vw,26px)",opacity:.2,animation:`float ${3+i*.35}s ease-in-out infinite alternate`,top:`${8+i*13}%`,right:`${2+i*4}%`,pointerEvents:"none",animationDelay:`${i*.28}s`}}>{e}</div>
      ))}
      <div style={{position:"relative",zIndex:1,color:"#fff"}}>
        <div style={{display:"inline-flex",alignItems:"center",gap:6,background:"rgba(255,255,255,.2)",backdropFilter:"blur(8px)",borderRadius:50,padding:"5px 14px",fontSize:11,fontWeight:800,letterSpacing:".1em",marginBottom:16,border:"1px solid rgba(255,255,255,.3)"}}>
          🎓 CAMPUS LOST & FOUND · {count} ITEMS LISTED
        </div>
        <h1 style={{fontFamily:"'Syne',sans-serif",fontSize:"clamp(28px,5vw,56px)",fontWeight:900,marginBottom:14,lineHeight:1.05,letterSpacing:"-.02em"}}>
          Lost something?<br/><span style={{opacity:.9}}>We'll find it. 🔍</span>
        </h1>
        <p style={{fontSize:"clamp(13px,1.5vw,15px)",opacity:.9,maxWidth:500,marginBottom:28,lineHeight:1.7}}>
          Post your item with a photo. Smart matching finds it automatically. Top finders earn leaderboard glory!
        </p>
        <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
          <Btn g="linear-gradient(135deg,rgba(255,255,255,.95),rgba(240,236,255,.95))" col={P.violet} sz="lg" onClick={()=>setPage("post")} icon="📤">Post an Item</Btn>
          <Btn g="rgba(255,255,255,.18)" col="#fff" sz="lg" onClick={()=>setPage("leaderboard")} sx={{border:"2px solid rgba(255,255,255,.4)"}}>🏆 Leaderboard</Btn>
        </div>
        <div style={{display:"flex",gap:10,marginTop:26,flexWrap:"wrap"}}>
          {[["🧠","Smart Matching"],["🔔","Email + SMS"],["🏆","Leaderboard"],["💬","In-App Chat"],["✨","Stories"]].map(([ic,lb])=>(
            <div key={lb} style={{display:"flex",alignItems:"center",gap:5,background:"rgba(255,255,255,.15)",backdropFilter:"blur(8px)",border:"1px solid rgba(255,255,255,.25)",borderRadius:50,padding:"5px 13px",fontSize:11,fontWeight:700}}>{ic} {lb}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── BOARD PAGE ─────────────────────────────────────────────────────────────────
function BoardPage({setPage,toast}){
  const {user}=useAuth();
  const [items,setItems]=useState([]); const [loading,setLoading]=useState(true);
  const [sf,setSf]=useState(""); const [q,setQ]=useState("");
  const [sel,setSel]=useState(null); const [mres,setMres]=useState(null); const [matching,setMatching]=useState(false);
  const [chatMatchId,setChatMatchId]=useState(null);
  const load=useCallback(async()=>{setLoading(true);try{setItems(await api.items.list({item_status:sf}));}catch(e){toast(e.message,"error");}finally{setLoading(false);};},[sf]);
  useEffect(()=>{load();},[load]);
  const filtered=items.filter(i=>!q||[i.name,i.description,...(i.tags||[])].some(s=>s?.toLowerCase().includes(q.toLowerCase())));
  const runMatch=async()=>{
    if(!user){toast("Sign in to find matches","error");return;}
    setMatching(true);setMres(null);setChatMatchId(null);
    try{const r=await api.items.match(sel._id);setMres(r.results||[]);toast(`Found ${r.results?.length||0} potential matches!`);}
    catch(e){toast(e.message,"error");}
    finally{setMatching(false);}
  };
  return(
    <div style={{maxWidth:1120,margin:"0 auto",padding:"28px 20px"}}>
      <Hero setPage={setPage} user={user} count={items.length}/>
      <div style={{display:"flex",flexWrap:"wrap",gap:10,marginBottom:24,alignItems:"center"}}>
        <div style={{flex:"1 1 220px"}}><Inp icon="🔍" placeholder="Search items, tags, location..." value={q} onChange={e=>setQ(e.target.value)}/></div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {[["","🌈 All"],["lost","🔍 Lost"],["found","📦 Found"],["matched","🤝 Matched"],["claimed","✅ Claimed"]].map(([v,l])=>(
            <button key={v} onClick={()=>setSf(v)} style={{padding:"9px 15px",borderRadius:50,border:`2px solid ${sf===v?P.violet:P.border}`,background:sf===v?P.gMain:P.panel,color:sf===v?"#fff":P.ink2,fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"inherit",transition:"all .15s",boxShadow:sf===v?P.shLg:"none"}}>{l}</button>
          ))}
        </div>
        <Btn g={P.gCoral} sz="sm" onClick={()=>setPage("post")} icon="＋">Post</Btn>
      </div>
      {loading?<CLoad/>:filtered.length===0?<Empty icon="📭" title="Nothing here yet" sub="Be the first to post!"/>
        :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(230px,1fr))",gap:20}}>
          {filtered.map((item,i)=><ICard key={item._id} item={item} i={i} onClick={()=>{setSel(item);setMres(null);}}/>)}
        </div>}
      <Modal open={!!sel} onClose={()=>setSel(null)}>
        {sel&&(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <GT g={P.gMain} tag="h3" style={{fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:900}}>{sel.name}</GT>
              <button onClick={()=>setSel(null)} style={{width:32,height:32,borderRadius:"50%",border:"none",background:P.border,color:P.ink2,fontSize:16,cursor:"pointer"}}>✕</button>
            </div>
            <SPill status={sel.status}/>
            {sel.image_path&&<img src={`${BASE}/${sel.image_path}`} alt="" style={{width:"100%",maxHeight:230,objectFit:"cover",borderRadius:P.r,border:`2px solid ${P.border}`}}/>}
            {sel.description&&<p style={{fontSize:14,color:P.ink2,lineHeight:1.7,background:P.panel,padding:"12px 15px",borderRadius:P.r}}>{sel.description}</p>}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              {sel.location&&<IBox lbl="📍 Location" val={sel.location} col={P.cyan}/>}
              {sel.category&&<IBox lbl="🏷️ Category" val={`${CAT_ICONS[sel.category]||"📦"} ${sel.category}`} col={P.violet}/>}
            </div>
            {sel.tags?.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:5}}>{sel.tags.map((t,i)=><Chip key={t} color={TAG_COLORS[i%TAG_COLORS.length]}>{t}</Chip>)}</div>}
            {sel.status==="lost"&&(
              <Btn g={user?P.gMain:P.gCyan} full loading={matching} onClick={user?runMatch:()=>setPage("register")} icon={user?"🔍":"🔐"}>
                {user?"Find Matches":"Sign in to find matches"}
              </Btn>
            )}
            {mres&&(
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={{fontSize:11,fontWeight:800,letterSpacing:".1em",color:P.ink3}}>
                    MATCH RESULTS ({mres.length} found ≥ 20%)
                  </div>
                  {chatMatchId&&<button onClick={()=>setChatMatchId(null)} style={{fontSize:11,color:P.coral,background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:800}}>✕ Close Chat</button>}
                </div>
                {mres.length===0
                  ?<div style={{textAlign:"center",color:P.ink3,fontSize:13,padding:20,background:P.panel,borderRadius:P.r}}>No matches found. Try posting more details or tags.</div>
                  :mres.map((r,i)=>(
                    <div key={i}>
                      <MRow r={r} onChat={()=>setChatMatchId(chatMatchId===r.match_id?null:r.match_id)} chatOpen={chatMatchId===r.match_id}/>
                      {chatMatchId===r.match_id&&user&&r.match_id&&(
                        <div style={{marginBottom:12,marginTop:-4,borderRadius:"0 0 14px 14px",overflow:"hidden",border:`2px solid ${P.violet}44`,borderTop:"none"}}>
                          <InlineChatPanel matchId={r.match_id} currentUserId={String(user._id)}/>
                        </div>
                      )}
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function ICard({item,i,onClick}){
  const [hov,setHov]=useState(false);
  const acc=CARD_ACC[i%CARD_ACC.length];
  return(
    <div onClick={onClick} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{background:hov?acc.tint:P.card,border:`2px solid ${hov?acc.glow+"66":P.border}`,borderRadius:20,overflow:"hidden",cursor:"pointer",boxShadow:hov?`0 16px 48px ${acc.glow}30`:P.sh,transform:hov?"translateY(-5px) scale(1.015)":"none",transition:"all .22s",animation:"fadeUp .45s ease",animationDelay:`${i*.05}s`,animationFillMode:"both"}}>
      <div style={{height:5,background:acc.bar}}/>
      <div style={{height:136,background:acc.tint,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",position:"relative"}}>
        {item.image_path&&<img src={`${BASE}/${item.image_path}`} alt={item.name} style={{width:"100%",height:"100%",objectFit:"cover",position:"absolute",inset:0}} onError={e=>e.target.style.display="none"}/>}
        <span style={{fontSize:50,filter:"drop-shadow(0 4px 10px rgba(0,0,0,.4))"}}>{CAT_ICONS[item.category]||"📦"}</span>
        <div style={{position:"absolute",top:9,right:9}}><SPill status={item.status}/></div>
      </div>
      <div style={{padding:"13px 15px 14px"}}>
        <div style={{fontWeight:900,fontSize:14.5,marginBottom:5,fontFamily:"'Syne',sans-serif",color:P.ink,lineHeight:1.2}}>{item.name}</div>
        {item.location&&<div style={{fontSize:11,color:P.ink3,marginBottom:7,fontWeight:700}}>📍 {item.location}</div>}
        {item.tags?.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:7}}>{item.tags.slice(0,3).map((t,ti)=><Chip key={t} color={TAG_COLORS[ti%TAG_COLORS.length]}>{t}</Chip>)}{item.tags.length>3&&<Chip color={P.ink3}>+{item.tags.length-3}</Chip>}</div>}
        <div style={{fontSize:10,color:P.ink3,paddingTop:8,borderTop:`1.5px solid ${P.border}`,fontWeight:700}}>{new Date(item.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</div>
      </div>
    </div>
  );
}

function MRow({r, onChat, chatOpen}){
  const fi=r.found_item;
  const score=r.combined_score;
  const col=score>=70?P.cyan:score>=45?P.amber:P.coral;
  return(
    <div style={{background:col+"12",borderRadius:chatOpen?"14px 14px 0 0":14,padding:"12px 14px",marginBottom:chatOpen?0:8,border:`2px solid ${col}33`,borderBottom:chatOpen?"none":""}}>
      <div style={{display:"flex",gap:12,alignItems:"center"}}>
        <ScoreRing score={score} size={52}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:800,fontSize:13,color:P.ink}}>{fi?.name}</div>
          {fi?.location&&<div style={{fontSize:11,color:P.ink3,fontWeight:700}}>📍 {fi.location}</div>}
          <div style={{display:"flex",gap:5,marginTop:5,flexWrap:"wrap"}}>
            {r.image_score!=null&&<Chip color={P.cyan}>📷 {Math.round(r.image_score)}%</Chip>}
            {r.text_score!=null&&<Chip color={P.violet}>📝 {Math.round(r.text_score)}%</Chip>}
            <Chip color={col}>{r.confidence}</Chip>
          </div>
        </div>
        {onChat&&r.match_id&&(
          <button onClick={onChat}
            style={{flexShrink:0,display:"inline-flex",alignItems:"center",gap:5,padding:"7px 14px",borderRadius:50,border:`2px solid ${chatOpen?P.violet:P.violet+"44"}`,background:chatOpen?P.gMain:P.violet+"18",color:chatOpen?"#fff":P.violet,fontWeight:800,fontSize:11,cursor:"pointer",fontFamily:"inherit",transition:"all .15s",whiteSpace:"nowrap"}}>
            💬 {chatOpen?"Close":"Chat"}
          </button>
        )}
      </div>
    </div>
  );
}

// Compact inline chat panel — used inside the match result list
function InlineChatPanel({matchId, currentUserId}){
  const [msgs,setMsgs]=useState([]); const [text,setText]=useState(""); const [sending,setSending]=useState(false);
  const bottomRef=useRef(null);
  const load=useCallback(async()=>{try{const m=await api.chat.get(matchId);setMsgs(m);}catch(e){}},[matchId]);
  useEffect(()=>{load();const iv=setInterval(load,4000);return()=>clearInterval(iv);},[load]);
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[msgs]);
  const send=async()=>{
    if(!text.trim())return;
    setSending(true);
    try{const m=await api.chat.send(matchId,text);setMsgs(p=>[...p,m]);setText("");}
    catch(e){}
    finally{setSending(false);}
  };
  return(
    <div style={{background:P.panel}}>
      {/* messages */}
      <div style={{padding:"12px",display:"flex",flexDirection:"column",gap:7,maxHeight:220,overflowY:"auto"}}>
        {msgs.length===0&&<div style={{textAlign:"center",color:P.ink3,fontSize:11,padding:"12px 0"}}>No messages yet — introduce yourself! 👋</div>}
        {msgs.map(m=>{
          const mine=m.sender_id===currentUserId;
          return(
            <div key={m._id} style={{display:"flex",flexDirection:"column",alignItems:mine?"flex-end":"flex-start"}}>
              {!mine&&<div style={{fontSize:10,color:P.ink3,fontWeight:700,marginBottom:1}}>{m.sender_name}</div>}
              <div style={{background:mine?P.gMain:P.card,color:"#fff",padding:"8px 12px",borderRadius:mine?"14px 14px 4px 14px":"14px 14px 14px 4px",maxWidth:"80%",fontSize:12,lineHeight:1.5}}>
                {m.text}
              </div>
              <div style={{fontSize:9,color:P.ink3,marginTop:2}}>{new Date(m.created_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div>
            </div>
          );
        })}
        <div ref={bottomRef}/>
      </div>
      {/* input */}
      <div style={{padding:"8px 12px",display:"flex",gap:7,alignItems:"center",borderTop:`1.5px solid ${P.border}`}}>
        <input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()}
          placeholder="Message the finder…"
          style={{flex:1,background:P.card,border:`2px solid ${P.border}`,borderRadius:50,padding:"8px 13px",color:P.ink,fontSize:12,fontFamily:"inherit",outline:"none"}}/>
        <button onClick={send} disabled={sending||!text.trim()}
          style={{width:34,height:34,borderRadius:"50%",background:P.gMain,border:"none",color:"#fff",fontSize:15,cursor:text.trim()?"pointer":"not-allowed",opacity:text.trim()?1:.5,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
          {sending?<Spin s={12} c="#fff"/>:"→"}
        </button>
      </div>
    </div>
  );
}
const IBox=({lbl,val,col})=>(<div style={{background:col+"12",border:`2px solid ${col}30`,borderRadius:P.r,padding:"10px 13px"}}><div style={{fontSize:10,fontWeight:800,color:col,letterSpacing:".07em",marginBottom:3}}>{lbl}</div><div style={{fontSize:13,fontWeight:800,color:P.ink}}>{val}</div></div>);

// ── POST PAGE ──────────────────────────────────────────────────────────────────
function PostPage({setPage,toast}){
  const {user}=useAuth();
  const [form,setForm]=useState({name:"",status:"lost",description:"",category:"",location:"",tags:""});
  const [file,setFile]=useState(null); const [preview,setPreview]=useState(null);
  const [posting,setPosting]=useState(false); const [errors,setErrors]=useState({});
  const [showConfirm,setShowConfirm]=useState(false);
  const set=(k,v)=>{setForm(f=>({...f,[k]:v}));setErrors(e=>({...e,[k]:""}));};
  if(!user) return <div style={{maxWidth:480,margin:"80px auto",textAlign:"center",padding:"0 20px"}}><div style={{fontSize:52,marginBottom:14}}>📤</div><GT g={P.gMain} tag="h2" style={{fontFamily:"'Syne',sans-serif",fontSize:24,fontWeight:900,display:"block",marginBottom:12}}>Sign in to post</GT><div style={{display:"flex",gap:10,justifyContent:"center"}}><Btn g={P.gMain} onClick={()=>setPage("login")}>Sign In</Btn><Btn g={P.gHero} onClick={()=>setPage("register")}>Join Free</Btn></div></div>;
  const handleFile=f=>{setFile(f);const r=new FileReader();r.onload=e=>setPreview(e.target.result);r.readAsDataURL(f);};
  const isFound=form.status==="found";
  const handleReview=()=>{const errs={};if(!form.name.trim())errs.name="Required";if(!form.location.trim())errs.location="Required";if(Object.keys(errs).length){setErrors(errs);return;}setShowConfirm(true);};
  const handlePost=async()=>{
    setPosting(true);
    try{const fd=new FormData();Object.entries(form).forEach(([k,v])=>{if(v)fd.append(k,v);});if(file)fd.append("image",file);await api.items.create(fd);setShowConfirm(false);toast(isFound?"Found item posted! Matching running 🔍":"Posted! You'll be notified on match 🔔");setPage("mine");}
    catch(e){toast(e.message,"error");setShowConfirm(false);}
    finally{setPosting(false);}
  };
  return(
    <div style={{maxWidth:620,margin:"0 auto",padding:"28px 20px"}}>
      <div style={{borderRadius:22,background:isFound?P.gCyan:P.gCoral,padding:"26px 28px 22px",marginBottom:22,color:"#fff",animation:"fadeUp .4s ease",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",top:-30,right:-30,width:140,height:140,borderRadius:"50%",background:"rgba(255,255,255,.1)"}}/>
        <div style={{fontSize:36,marginBottom:8}}>{isFound?"📦":"🔍"}</div>
        <h1 style={{fontFamily:"'Syne',sans-serif",fontSize:24,fontWeight:900,marginBottom:4}}>Post an Item</h1>
        <p style={{fontSize:12,opacity:.88}}>Fill in → review → confirm. Quick and easy!</p>
      </div>
      <div style={{background:P.card,border:`2px solid ${P.border}`,borderRadius:22,padding:24,display:"flex",flexDirection:"column",gap:18,boxShadow:P.shLg,animation:"fadeUp .4s ease .08s both"}}>
        <div>
          <div style={{fontSize:11,fontWeight:800,color:P.ink2,letterSpacing:".08em",textTransform:"uppercase",marginBottom:10}}>What happened?</div>
          <div style={{display:"flex",gap:10}}>
            {[["lost","🔍 I Lost It",P.gCoral,P.coral],["found","📦 I Found It",P.gCyan,P.cyan]].map(([v,l,g,c])=>(
              <button key={v} onClick={()=>set("status",v)}
                style={{flex:1,padding:"13px 10px",borderRadius:P.r,border:`2.5px solid ${form.status===v?c:P.border}`,background:form.status===v?g:P.panel,color:form.status===v?"#fff":P.ink2,fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit",transition:"all .18s",boxShadow:form.status===v?`0 6px 22px ${c}44`:"none"}}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div><div style={{fontSize:11,fontWeight:800,color:P.ink2,letterSpacing:".08em",textTransform:"uppercase",marginBottom:8}}>📷 Photo <span style={{fontWeight:500,color:P.ink3,textTransform:"none"}}>— recommended</span></div><UploadZone onFile={handleFile} preview={preview} onClear={()=>{setFile(null);setPreview(null);}}/></div>
        <Inp label="Item Name" required icon={CAT_ICONS[form.category]||"📦"} placeholder="e.g. Black Backpack" value={form.name} onChange={e=>set("name",e.target.value)} error={errors.name}/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <div>
            <div style={{fontSize:11,fontWeight:800,color:P.ink2,letterSpacing:".08em",textTransform:"uppercase",marginBottom:6}}>Category</div>
            <select value={form.category} onChange={e=>set("category",e.target.value)}
              style={{width:"100%",padding:"11px 14px",background:P.panel,border:`2px solid ${P.border}`,borderRadius:P.r,fontSize:13,color:P.ink,fontFamily:"inherit",outline:"none"}}>
              <option value="">Select…</option>
              {CATS.map(c=><option key={c} value={c}>{CAT_ICONS[c]} {c}</option>)}
            </select>
          </div>
          <Inp label="Location" required icon="📍" placeholder="Library 2F, Canteen…" value={form.location} onChange={e=>set("location",e.target.value)} error={errors.location}/>
        </div>
        <div><div style={{fontSize:11,fontWeight:800,color:P.ink2,letterSpacing:".08em",textTransform:"uppercase",marginBottom:6}}>Description</div>
          <textarea value={form.description} onChange={e=>set("description",e.target.value)} placeholder="Brand, color, distinctive marks…"
            style={{width:"100%",padding:"11px 14px",background:P.panel,border:`2px solid ${P.border}`,borderRadius:P.r,fontSize:13,fontFamily:"inherit",resize:"vertical",minHeight:88,color:P.ink,boxSizing:"border-box",outline:"none"}}/></div>
        <Inp label="Tags (comma-separated)" icon="🏷️" placeholder="Blue, Adidas, Velcro, Scratched" value={form.tags} onChange={e=>set("tags",e.target.value)}/>
        <div style={{display:"flex",gap:10}}>
          <Btn g={`linear-gradient(135deg,${P.border},${P.panel})`} col={P.ink2} onClick={()=>setPage("board")}>← Back</Btn>
          <Btn g={isFound?P.gCyan:P.gCoral} full onClick={handleReview} sz="lg" icon="👁️">Review & Confirm</Btn>
        </div>
      </div>
      <ConfirmModal open={showConfirm} onClose={()=>setShowConfirm(false)} onConfirm={handlePost} form={form} preview={preview} loading={posting}/>
    </div>
  );
}

// ── AUTH PAGES ─────────────────────────────────────────────────────────────────
function AuthShell({g,icon,title,sub,children}){
  return(
    <div style={{minHeight:"calc(100vh - 68px)",display:"flex",alignItems:"center",justifyContent:"center",padding:"32px 20px",background:`radial-gradient(ellipse at 70% 0%,${P.violet}12,transparent 55%),radial-gradient(ellipse at 0% 100%,${P.cyan}12,transparent 55%)`}}>
      <div style={{width:"100%",maxWidth:440,animation:"fadeUp .4s ease"}}>
        <div style={{textAlign:"center",marginBottom:22}}>
          <div style={{width:68,height:68,borderRadius:22,background:g,margin:"0 auto 14px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,boxShadow:`0 10px 32px ${P.violet}44`}}>{icon}</div>
          <GT g={g} tag="h1" style={{fontFamily:"'Syne',sans-serif",fontSize:28,fontWeight:900,marginBottom:6,display:"block"}}>{title}</GT>
          <p style={{color:P.ink3,fontSize:13}}>{sub}</p>
        </div>
        <div style={{background:P.card,border:`2px solid ${P.border}`,borderRadius:22,padding:28,boxShadow:P.shLg}}>{children}</div>
      </div>
    </div>
  );
}

function LoginPage({setPage,toast}){
  const {login}=useAuth();
  const [f,setF]=useState({email:"",password:""}); const [errs,setErrs]=useState({}); const [loading,setLoading]=useState(false);
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const submit=async()=>{const e={};if(!f.email)e.email="Required";if(!f.password)e.password="Required";if(Object.keys(e).length){setErrs(e);return;}setLoading(true);try{await login(f.email,f.password);setPage("board");toast("Welcome back! 👋");}catch(e){toast(e.message,"error");}finally{setLoading(false);};};
  return(
    <AuthShell g={P.gMain} icon="🔐" title="Welcome back!" sub="Sign in to your FINDME account">
      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <Inp label="Email" type="email" icon="✉️" placeholder="you@university.edu" value={f.email} onChange={e=>set("email",e.target.value)} error={errs.email}/>
        <Inp label="Password" type="password" icon="🔒" placeholder="••••••••" value={f.password} onChange={e=>set("password",e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} error={errs.password}/>
        <Btn g={P.gMain} full loading={loading} onClick={submit} sz="lg">Sign In →</Btn>
        <button onClick={()=>setPage("forgot")} style={{background:"none",border:"none",color:P.ink3,fontSize:12,cursor:"pointer",fontFamily:"inherit",textAlign:"center"}}>Forgot password?</button>
        <p style={{textAlign:"center",fontSize:12,color:P.ink3}}>No account? <button onClick={()=>setPage("register")} style={{background:"none",border:"none",color:P.violet,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>Join FINDME →</button></p>
      </div>
    </AuthShell>
  );
}

function RegisterPage({setPage,toast}){
  const {register}=useAuth();
  const [f,setF]=useState({email:"",password:"",full_name:"",phone:"",student_id:""}); const [errs,setErrs]=useState({}); const [loading,setLoading]=useState(false);
  const set=(k,v)=>{setF(p=>({...p,[k]:v}));setErrs(e=>({...e,[k]:""}));};
  const submit=async()=>{
    const e={};if(!f.full_name.trim())e.full_name="Required";if(!f.email.trim())e.email="Required";if(!f.password||f.password.length<8)e.password="Min 8 chars";
    if(Object.keys(e).length){setErrs(e);return;}
    setLoading(true);try{await register(f);setPage("board");toast("Welcome to FINDME! 🎉");}catch(e){toast(e.message,"error");}finally{setLoading(false);};
  };
  return(
    <AuthShell g={P.gHero} icon="🎓" title="Join FINDME" sub="Free campus lost & found account">
      <div style={{display:"flex",flexDirection:"column",gap:13}}>
        <Inp label="Full Name" required icon="👤" placeholder="Jane Doe" value={f.full_name} onChange={e=>set("full_name",e.target.value)} error={errs.full_name}/>
        <Inp label="Email" required type="email" icon="✉️" placeholder="you@university.edu" value={f.email} onChange={e=>set("email",e.target.value)} error={errs.email}/>
        <Inp label="Password" required type="password" icon="🔒" placeholder="Min 8 characters" value={f.password} onChange={e=>set("password",e.target.value)} error={errs.password}/>
        <Inp label="Phone" icon="📱" placeholder="+91 98765 43210" value={f.phone} onChange={e=>set("phone",e.target.value)} error={errs.phone}/>
        <Inp label="Student ID (optional)" icon="🎓" placeholder="22CS101" value={f.student_id} onChange={e=>set("student_id",e.target.value)}/>
        <Btn g={P.gHero} full loading={loading} onClick={submit} sz="lg">Create Account 🚀</Btn>
        <p style={{textAlign:"center",fontSize:12,color:P.ink3}}>Already have one? <button onClick={()=>setPage("login")} style={{background:"none",border:"none",color:P.violet,fontWeight:800,cursor:"pointer",fontFamily:"inherit"}}>Sign in →</button></p>
      </div>
    </AuthShell>
  );
}

function ForgotPage({setPage,toast}){
  const [step,setStep]=useState(1); // 1=email, 2=otp+newpw
  const [email,setEmail]=useState(""); const [otp,setOtp]=useState(""); const [pw,setPw]=useState(""); const [loading,setLoading]=useState(false);
  const sendOtp=async()=>{if(!email){toast("Enter your email","error");return;}setLoading(true);try{await api.auth.forgotPw(email);toast("Reset code sent! Check your email 📧");setStep(2);}catch(e){toast(e.message,"error");}finally{setLoading(false);};};
  const resetPw=async()=>{if(!otp||!pw){toast("Fill all fields","error");return;}if(pw.length<8){toast("Password min 8 chars","error");return;}setLoading(true);try{await api.auth.resetPw({email,otp,new_password:pw});toast("Password reset! Sign in now 🎉");setPage("login");}catch(e){toast(e.message,"error");}finally{setLoading(false);};};
  return(
    <AuthShell g={P.gAmber} icon="🔑" title="Reset Password" sub={step===1?"Enter your email to get a reset code":"Enter the 6-digit code from your email"}>
      {step===1
        ?<div style={{display:"flex",flexDirection:"column",gap:14}}>
            <Inp label="Email" type="email" icon="✉️" placeholder="you@university.edu" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendOtp()}/>
            <Btn g={P.gAmber} full loading={loading} onClick={sendOtp} sz="lg">Send Reset Code →</Btn>
            <button onClick={()=>setPage("login")} style={{background:"none",border:"none",color:P.ink3,fontSize:12,cursor:"pointer",fontFamily:"inherit",textAlign:"center"}}>← Back to Sign In</button>
          </div>
        :<div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div style={{background:P.amber+"15",border:`2px solid ${P.amber}33`,borderRadius:10,padding:"10px 13px",fontSize:12,color:P.amber,fontWeight:700}}>📧 Code sent to {email}</div>
            <Inp label="6-Digit Code" icon="🔢" placeholder="123456" value={otp} onChange={e=>setOtp(e.target.value)} maxLength={6}/>
            <Inp label="New Password" type="password" icon="🔒" placeholder="Min 8 characters" value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==="Enter"&&resetPw()}/>
            <Btn g={P.gAmber} full loading={loading} onClick={resetPw} sz="lg">Reset Password ✓</Btn>
            <button onClick={()=>setStep(1)} style={{background:"none",border:"none",color:P.ink3,fontSize:12,cursor:"pointer",fontFamily:"inherit",textAlign:"center"}}>← Resend code</button>
          </div>
      }
    </AuthShell>
  );
}

// ── PROFILE PAGE ───────────────────────────────────────────────────────────────
function ProfilePage({toast}){
  const {user,refreshUser}=useAuth();
  const [f,setF]=useState({}); const [loading,setLoading]=useState(false); const [saved,setSaved]=useState(false);
  useEffect(()=>{ if(user) setF({full_name:user.full_name||"",phone:user.phone||"",student_id:user.student_id||"",current_password:"",new_password:""}); },[user]);
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const save=async()=>{
    setLoading(true);setSaved(false);
    try{
      const payload={full_name:f.full_name,phone:f.phone,student_id:f.student_id};
      if(f.new_password){payload.current_password=f.current_password;payload.new_password=f.new_password;}
      await api.auth.updateProfile(payload);
      await refreshUser();
      setSaved(true);toast("Profile updated! ✨");
      setF(p=>({...p,current_password:"",new_password:""}));
    }catch(e){toast(e.message,"error");}
    finally{setLoading(false);}
  };
  if(!user) return <Guard/>;
  return(
    <div style={{maxWidth:540,margin:"0 auto",padding:"28px 20px"}}>
      <PgHdr g={P.gMain} icon="⚙️" title="Edit Profile" sub="Update your account details"/>
      <div style={{display:"flex",flexDirection:"column",gap:16}}>
        {/* Avatar */}
        <div style={{background:P.card,border:`2px solid ${P.border}`,borderRadius:22,padding:24,display:"flex",alignItems:"center",gap:18,boxShadow:P.sh}}>
          <div style={{width:72,height:72,borderRadius:"50%",background:P.gHero,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,fontWeight:900,color:"#fff",boxShadow:`0 6px 20px ${P.violet}44`,flexShrink:0}}>
            {user.full_name?.[0]?.toUpperCase()||"U"}
          </div>
          <div>
            <GT g={P.gMain} style={{fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:900,display:"block"}}>{user.full_name}</GT>
            <div style={{fontSize:12,color:P.ink3,marginTop:3}}>{user.email}</div>
            {user.student_id&&<div style={{fontSize:11,color:P.ink3}}>🎓 {user.student_id}</div>}
            {user.items_returned>0&&<Chip color={P.lime} style={{marginTop:5}}>🏆 {user.items_returned} items returned</Chip>}
          </div>
        </div>
        {/* Edit form */}
        <div style={{background:P.card,border:`2px solid ${P.border}`,borderRadius:22,padding:24,display:"flex",flexDirection:"column",gap:16,boxShadow:P.sh}}>
          <div style={{fontSize:12,fontWeight:800,color:P.violet,letterSpacing:".08em",textTransform:"uppercase",marginBottom:2}}>Personal Info</div>
          <Inp label="Full Name" icon="👤" value={f.full_name||""} onChange={e=>set("full_name",e.target.value)}/>
          <Inp label="Phone" icon="📱" placeholder="+91 98765 43210" value={f.phone||""} onChange={e=>set("phone",e.target.value)}/>
          <Inp label="Student ID" icon="🎓" placeholder="22CS101" value={f.student_id||""} onChange={e=>set("student_id",e.target.value)}/>
          <div style={{height:1,background:P.border,margin:"4px 0"}}/>
          <div style={{fontSize:12,fontWeight:800,color:P.violet,letterSpacing:".08em",textTransform:"uppercase",marginBottom:2}}>Change Password <span style={{fontWeight:400,color:P.ink3,textTransform:"none"}}>(optional)</span></div>
          <Inp label="Current Password" type="password" icon="🔒" placeholder="Enter current password" value={f.current_password||""} onChange={e=>set("current_password",e.target.value)}/>
          <Inp label="New Password" type="password" icon="🔑" placeholder="Min 8 characters" value={f.new_password||""} onChange={e=>set("new_password",e.target.value)}/>
          {saved&&<div style={{background:P.lime+"18",border:`2px solid ${P.lime}44`,borderRadius:10,padding:"9px 14px",fontSize:12,color:P.lime,fontWeight:700}}>✅ Profile saved successfully!</div>}
          <Btn g={P.gMain} full loading={loading} onClick={save} sz="lg">Save Changes ✨</Btn>
        </div>
      </div>
    </div>
  );
}

// ── MATCHES PAGE ───────────────────────────────────────────────────────────────
function MatchesPage({toast}){
  const {user}=useAuth();
  const [matches,setMatches]=useState([]); const [loading,setLoading]=useState(true);
  const [outcomeMatch,setOutcomeMatch]=useState(null); const [submitting,setSubmitting]=useState(false);
  const [chatMatchId,setChatMatchId]=useState(null);
  const [tab,setTab]=useState("seeker"); // "seeker" | "finder"

  const load=async()=>{try{setMatches(await api.matches.mine());}catch(e){toast(e.message,"error");};};
  useEffect(()=>{if(!user){setLoading(false);return;}load().finally(()=>setLoading(false));},[user]);

  const submitOutcome=async(outcome)=>{
    setSubmitting(true);
    try{
      const confirmed=outcome==="returned"||outcome==="already_found";
      await api.matches.confirm(outcomeMatch._id,{confirmed,outcome});
      toast(outcome==="returned"?"🎉 Confirmed! Finder earns a point!":outcome==="already_found"?"✅ Marked resolved.":"Dismissed.");
      setOutcomeMatch(null);await load();
    }catch(e){toast(e.message,"error");}
    finally{setSubmitting(false);}
  };

  if(!user) return <Guard/>;

  const seekerMatches=matches.filter(m=>m.my_role==="seeker");
  const finderMatches=matches.filter(m=>m.my_role==="finder");
  const shown=tab==="seeker"?seekerMatches:finderMatches;

  return(
    <div style={{maxWidth:860,margin:"0 auto",padding:"28px 20px"}}>
      <PgHdr g={P.gCyan} icon="🔗" title="My Matches" sub="Chat with the other party and update the outcome"/>

      {/* Tab switcher */}
      <div style={{display:"flex",gap:8,marginBottom:24,flexWrap:"wrap"}}>
        {[["seeker",`🔍 I Lost Something (${seekerMatches.length})`],["finder",`📦 I Found Something (${finderMatches.length})`]].map(([id,lbl])=>(
          <button key={id} onClick={()=>setTab(id)}
            style={{padding:"10px 20px",borderRadius:50,border:`2px solid ${tab===id?P.violet:P.border}`,background:tab===id?P.gMain:P.panel,color:tab===id?"#fff":P.ink2,fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit",transition:"all .15s",boxShadow:tab===id?P.shLg:"none"}}>
            {lbl}
          </button>
        ))}
      </div>

      {/* Info banner for finder tab */}
      {tab==="finder"&&finderMatches.length>0&&(
        <div style={{background:P.cyan+"12",border:`2px solid ${P.cyan}44`,borderRadius:P.r,padding:"12px 16px",marginBottom:18,fontSize:13,color:P.cyan,fontWeight:600,lineHeight:1.65}}>
          📢 The item owner has been notified by email & SMS. Use the chat below to coordinate pickup!
        </div>
      )}

      {loading?<CLoad/>:shown.length===0
        ?<Empty icon={tab==="seeker"?"🔍":"📦"} title={tab==="seeker"?"No matches for your lost items":"No matches for your found items"} sub={tab==="seeker"?"Post a lost item and we'll notify you when something turns up.":"When you post a found item, matches appear here."}/>
        :<div style={{display:"flex",flexDirection:"column",gap:18}}>
          {shown.map((m,i)=>{
            const col=m.score>=70?P.cyan:m.score>=45?P.amber:P.coral;
            const isSeeker=m.my_role==="seeker";
            return(
              <div key={m._id} style={{background:P.card,border:`2.5px solid ${col}44`,borderRadius:22,padding:"20px 22px",boxShadow:`0 6px 32px ${col}18`,animation:"fadeUp .4s ease",animationDelay:`${i*.07}s`,animationFillMode:"both"}}>
                {/* Role badge */}
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
                  <span style={{background:isSeeker?P.gCoral:P.gCyan,color:"#fff",padding:"3px 12px",borderRadius:50,fontSize:11,fontWeight:800}}>
                    {isSeeker?"🔍 You lost this":"📦 You found this"}
                  </span>
                  <Chip color={col}>{m.confidence} match</Chip>
                  {m.is_confirmed&&<span style={{background:P.gCyan,color:"#fff",padding:"3px 12px",borderRadius:50,fontSize:11,fontWeight:800}}>✅ Confirmed</span>}
                  {m.outcome&&<span style={{background:m.outcome==="returned"?P.gLime:m.outcome==="not_mine"?P.gCoral:P.gAmber,color:"#fff",padding:"3px 12px",borderRadius:50,fontSize:11,fontWeight:800}}>
                    {m.outcome==="returned"?"🎉 Returned":m.outcome==="not_mine"?"❌ Not mine":"🔄 Already found"}
                  </span>}
                </div>

                <div style={{display:"flex",gap:16,alignItems:"flex-start",flexWrap:"wrap"}}>
                  <ScoreRing score={m.score} size={68}/>
                  <div style={{flex:1,minWidth:200}}>
                    {/* Item cards */}
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                      {[[m.lost_item,"🔍 Lost Item",P.coral],[m.found_item,"📦 Found Item",P.cyan]].map(([item,lbl,c])=>item&&(
                        <div key={lbl} style={{background:c+"12",border:`2px solid ${c}30`,borderRadius:P.r,padding:"10px 13px"}}>
                          <div style={{fontSize:10,fontWeight:800,color:c,letterSpacing:".07em",marginBottom:3}}>{lbl}</div>
                          <div style={{fontSize:13,fontWeight:900,color:P.ink}}>{item.name}</div>
                          {item.location&&<div style={{fontSize:11,color:P.ink3,fontWeight:700}}>📍 {item.location}</div>}
                        </div>
                      ))}
                    </div>

                    {/* Finder contact — only shown to the seeker */}
                    {isSeeker&&(m.finder_name||m.finder_phone)&&(
                      <div style={{background:"linear-gradient(135deg,#22d3ee18,#a78bfa18)",border:`2px solid ${P.cyan}44`,borderRadius:P.r,padding:"12px 14px",marginBottom:12}}>
                        <div style={{fontSize:10,fontWeight:800,color:P.cyan,letterSpacing:".08em",marginBottom:8}}>🤝 FINDER CONTACT</div>
                        <div style={{display:"flex",flexDirection:"column",gap:5}}>
                          {m.finder_name&&<div style={{fontWeight:800,fontSize:13,color:P.ink}}>👤 {m.finder_name}</div>}
                          {m.finder_phone&&<a href={`tel:${m.finder_phone}`} style={{fontWeight:800,fontSize:14,color:P.cyan,textDecoration:"none"}}>📞 {m.finder_phone}</a>}
                          {m.finder_email&&<a href={`mailto:${m.finder_email}`} style={{fontSize:12,color:P.violet,textDecoration:"none",fontWeight:600}}>✉️ {m.finder_email}</a>}
                        </div>
                      </div>
                    )}

                    {/* For finder: show a prompt to reach out */}
                    {!isSeeker&&(
                      <div style={{background:P.amber+"12",border:`2px solid ${P.amber}33`,borderRadius:P.r,padding:"11px 14px",marginBottom:12,fontSize:12,color:P.amber,fontWeight:700,lineHeight:1.6}}>
                        💬 The owner has been notified. Use the chat to let them know where and how to collect it!
                      </div>
                    )}

                    {m.match_reason&&<p style={{fontSize:12,color:P.ink3,marginBottom:12,lineHeight:1.65,background:P.panel,padding:"9px 12px",borderRadius:10}}>{m.match_reason}</p>}

                    {/* Action buttons */}
                    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                      <button onClick={()=>setChatMatchId(chatMatchId===m._id?null:m._id)}
                        style={{display:"inline-flex",alignItems:"center",gap:6,padding:"9px 18px",borderRadius:50,border:`2px solid ${P.violet}44`,background:chatMatchId===m._id?P.gMain:P.violet+"18",color:chatMatchId===m._id?"#fff":P.violet,fontWeight:800,fontSize:12,cursor:"pointer",fontFamily:"inherit",transition:"all .15s",boxShadow:chatMatchId===m._id?P.shLg:"none"}}>
                        💬 {chatMatchId===m._id?"Close Chat":"Open Chat"}
                      </button>
                      {/* Only seeker can update outcome */}
                      {isSeeker&&!m.outcome&&(
                        <button onClick={()=>setOutcomeMatch(m)}
                          style={{display:"inline-flex",alignItems:"center",gap:6,padding:"9px 18px",borderRadius:50,border:`2px solid ${P.amber}44`,background:P.amber+"18",color:P.amber,fontWeight:800,fontSize:12,cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}}>
                          📋 Update Outcome
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      }
      <OutcomeModal open={!!outcomeMatch} onClose={()=>setOutcomeMatch(null)} onSubmit={submitOutcome} match={outcomeMatch} loading={submitting}/>
      {chatMatchId&&user&&<ChatWidget matchId={chatMatchId} currentUserId={String(user._id)} onClose={()=>setChatMatchId(null)}/>}
    </div>
  );
}

// ── LEADERBOARD PAGE ───────────────────────────────────────────────────────────
function LeaderboardPage({toast}){
  const [board,setBoard]=useState([]); const [loading,setLoading]=useState(true);
  useEffect(()=>{api.leaderboard().then(setBoard).catch(e=>toast(e.message,"error")).finally(()=>setLoading(false));},[]);
  return(
    <div style={{maxWidth:700,margin:"0 auto",padding:"28px 20px"}}>
      <PgHdr g={P.gGold} icon="🏆" title="Leaderboard" sub="Students who found & returned the most items on campus"/>
      {loading?<CLoad/>:board.length===0?<Empty icon="🏆" title="No heroes yet" sub="Be the first to find and return a lost item!"/>
        :<div style={{display:"flex",flexDirection:"column",gap:12}}>
          {board.length>0&&(
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(175px,1fr))",gap:12,marginBottom:8}}>
              {board.slice(0,Math.min(3,board.length)).map((u,i)=>(
                <div key={u._id} style={{background:RANK_COLORS[i]||P.gMain,borderRadius:20,padding:"20px 16px",textAlign:"center",position:"relative",overflow:"hidden",boxShadow:P.shLg,animation:"fadeUp .4s ease",animationDelay:`${i*.1}s`,animationFillMode:"both"}}>
                  <div style={{position:"absolute",top:-20,right:-20,fontSize:60,opacity:.15}}>{RANK_ICONS[i]}</div>
                  <div style={{fontSize:34,marginBottom:8}}>{RANK_ICONS[i]}</div>
                  <div style={{fontFamily:"'Syne',sans-serif",fontSize:15,fontWeight:900,color:"#fff",marginBottom:3}}>{u.full_name}</div>
                  {u.student_id&&<div style={{fontSize:11,color:"rgba(255,255,255,.7)",marginBottom:8}}>{u.student_id}</div>}
                  <div style={{background:"rgba(255,255,255,.2)",borderRadius:50,padding:"5px 14px",display:"inline-block"}}>
                    <span style={{fontSize:20,fontWeight:900,color:"#fff"}}>{u.items_returned}</span>
                    <span style={{fontSize:11,color:"rgba(255,255,255,.85)",marginLeft:5}}>returned</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {board.slice(3).map((u,i)=>(
            <div key={u._id} style={{background:P.card,border:`2px solid ${P.border}`,borderRadius:P.r,padding:"14px 18px",display:"flex",alignItems:"center",gap:14,boxShadow:P.sh,animation:"fadeUp .4s ease",animationDelay:`${(i+3)*.06}s`,animationFillMode:"both"}}>
              <div style={{width:36,height:36,borderRadius:"50%",background:P.gMain,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Syne',sans-serif",fontSize:14,fontWeight:900,color:"#fff",flexShrink:0}}>#{i+4}</div>
              <div style={{flex:1}}><div style={{fontWeight:800,fontSize:14,color:P.ink}}>{u.full_name}</div>{u.student_id&&<div style={{fontSize:11,color:P.ink3,fontWeight:600}}>{u.student_id}</div>}</div>
              <div style={{textAlign:"right"}}><GT g={P.gAmber} style={{fontFamily:"'Syne',sans-serif",fontSize:22,fontWeight:900}}>{u.items_returned}</GT><div style={{fontSize:10,color:P.ink3,fontWeight:700}}>RETURNED</div></div>
            </div>
          ))}
        </div>}
    </div>
  );
}

// ── EXPERIENCES PAGE ───────────────────────────────────────────────────────────
function ExperiencesPage({toast}){
  const {user}=useAuth();
  const [stories,setStories]=useState([]); const [loading,setLoading]=useState(true);
  const [text,setText]=useState(""); const [emoji,setEmoji]=useState("🎒"); const [posting,setPosting]=useState(false);
  const load=async()=>{try{setStories(await api.experiences.list());}catch(e){toast(e.message,"error");};};
  useEffect(()=>{load().finally(()=>setLoading(false));},[]);
  const post=async()=>{
    if(!user){toast("Sign in to share a story","error");return;}
    if(!text.trim()||text.trim().length<10){toast("Write at least 10 characters","error");return;}
    setPosting(true);
    try{await api.experiences.post({text,emoji});setText("");toast("Story shared! 🌟");await load();}
    catch(e){toast(e.message,"error");}
    finally{setPosting(false);}
  };
  const del=async id=>{
    try{await api.experiences.delete(id);toast("Deleted");await load();}catch(e){toast(e.message,"error");};
  };
  return(
    <div style={{maxWidth:760,margin:"0 auto",padding:"28px 20px"}}>
      <PgHdr g={P.gLime} icon="✨" title="Stories" sub="Share your FINDME experience with the campus community"/>
      {/* Write a story box */}
      <div style={{background:P.card,border:`2px solid ${P.border}`,borderRadius:22,padding:22,marginBottom:28,boxShadow:P.shLg,animation:"fadeUp .4s ease"}}>
        <div style={{fontSize:12,fontWeight:800,color:P.lime,letterSpacing:".08em",textTransform:"uppercase",marginBottom:12}}>✍️ Share your experience</div>
        {/* Emoji picker */}
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
          {STORY_EMOJIS.map(e=>(
            <button key={e} onClick={()=>setEmoji(e)}
              style={{width:36,height:36,borderRadius:10,border:`2px solid ${emoji===e?P.violet:P.border}`,background:emoji===e?P.violet+"20":P.panel,fontSize:18,cursor:"pointer",transition:"all .15s",boxShadow:emoji===e?`0 0 10px ${P.violet}44`:"none"}}>
              {e}
            </button>
          ))}
        </div>
        <textarea value={text} onChange={e=>setText(e.target.value)} placeholder={user?"Tell us your story! Did you get your item back? Did you help someone find theirs? 🌟":"Sign in to share your story…"} disabled={!user}
          style={{width:"100%",padding:"12px 14px",background:P.panel,border:`2px solid ${P.border}`,borderRadius:P.r,fontSize:13,fontFamily:"inherit",resize:"vertical",minHeight:100,color:P.ink,boxSizing:"border-box",outline:"none",marginBottom:10,lineHeight:1.6}}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
          <span style={{fontSize:11,color:text.length>500?P.coral:P.ink3,fontWeight:600}}>{text.length}/600</span>
          <Btn g={P.gLime} col={P.ink} loading={posting} onClick={post} disabled={!user} icon="🌟">Share Story</Btn>
        </div>
      </div>
      {/* Stories list */}
      {loading?<CLoad/>:stories.length===0?<Empty icon="✨" title="No stories yet" sub="Be the first to share your FINDME experience!"/>
        :<div style={{display:"flex",flexDirection:"column",gap:14}}>
          {stories.map((s,i)=>(
            <div key={s._id} style={{background:P.card,border:`2px solid ${P.border}`,borderRadius:18,padding:"18px 20px",boxShadow:P.sh,animation:"fadeUp .4s ease",animationDelay:`${i*.05}s`,animationFillMode:"both"}}>
              <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                <div style={{width:48,height:48,borderRadius:"50%",background:P.gMain,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0,boxShadow:`0 4px 14px ${P.violet}44`}}>{s.emoji||"🎒"}</div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6,flexWrap:"wrap",gap:6}}>
                    <GT g={P.gMain} style={{fontWeight:800,fontSize:14}}>{s.author_name}</GT>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <span style={{fontSize:11,color:P.ink3,fontWeight:600}}>{new Date(s.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>
                      {user&&s.author_id===String(user._id)&&(
                        <button onClick={()=>del(s._id)} style={{background:"none",border:"none",color:P.coral,fontSize:12,cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>✕</button>
                      )}
                    </div>
                  </div>
                  <p style={{fontSize:13,color:P.ink2,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{s.text}</p>
                </div>
              </div>
            </div>
          ))}
        </div>}
    </div>
  );
}

// ── MY ITEMS PAGE ──────────────────────────────────────────────────────────────
function MyItemsPage({setPage,toast}){
  const {user}=useAuth();
  const [items,setItems]=useState([]); const [loading,setLoading]=useState(true);
  const [del,setDel]=useState(null); const [edit,setEdit]=useState(null);
  const load=async()=>{setLoading(true);try{setItems(await api.items.mine());}catch(e){toast(e.message,"error");}finally{setLoading(false);};};
  useEffect(()=>{if(user)load();else setLoading(false);},[user]);
  const doDelete=async id=>{if(!confirm("Delete this item?"))return;setDel(id);try{await api.items.delete(id);toast("Deleted!");load();}catch(e){toast(e.message,"error");}finally{setDel(null);};};
  if(!user) return <Guard/>;
  return(
    <div style={{maxWidth:980,margin:"0 auto",padding:"28px 20px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12,marginBottom:28}}>
        <PgHdr g={P.gAmber} icon="📋" title="My Items" sub={`${items.length} items posted`} inline/>
        <Btn g={P.gCoral} onClick={()=>setPage("post")} icon="＋" sz="lg">Post New</Btn>
      </div>
      {loading?<CLoad/>:items.length===0?<Empty icon="📦" title="Nothing posted" sub="Post your first lost or found item"/>
        :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(230px,1fr))",gap:18}}>
          {items.map((item,i)=>{const acc=CARD_ACC[i%CARD_ACC.length]; return(
            <div key={item._id} style={{background:P.card,border:`2px solid ${P.border}`,borderRadius:22,overflow:"hidden",boxShadow:P.sh,animation:"fadeUp .4s ease",animationDelay:`${i*.05}s`,animationFillMode:"both"}}>
              <div style={{height:5,background:acc.bar}}/>
              <div style={{padding:16,display:"flex",flexDirection:"column",gap:8}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:6}}>
                  <h3 style={{fontSize:14.5,fontWeight:900,fontFamily:"'Syne',sans-serif",color:P.ink,lineHeight:1.2,flex:1}}>{item.name}</h3>
                  <SPill status={item.status}/>
                </div>
                {item.location&&<div style={{fontSize:11,color:P.ink3,fontWeight:700}}>📍 {item.location}</div>}
                {item.tags?.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:4}}>{item.tags.slice(0,3).map((t,ti)=><Chip key={t} color={TAG_COLORS[ti%TAG_COLORS.length]}>{t}</Chip>)}</div>}
                <div style={{fontSize:10,color:P.ink3,fontWeight:700}}>{new Date(item.created_at).toLocaleDateString()}</div>
                <div style={{display:"flex",gap:7,paddingTop:4}}>
                  <Btn g={P.gCyan} sz="sm" onClick={()=>setEdit(item)}>✏️ Edit</Btn>
                  <Btn g={P.gCoral} sz="sm" loading={del===item._id} onClick={()=>doDelete(item._id)}>🗑️</Btn>
                </div>
              </div>
            </div>
          );})}
        </div>}
      <EditModal item={edit} onClose={()=>setEdit(null)} onSaved={()=>{setEdit(null);load();toast("Updated! ✨");}} toast={toast}/>
    </div>
  );
}

function EditModal({item,onClose,onSaved,toast}){
  const [f,setF]=useState({}); const [loading,setLoading]=useState(false);
  useEffect(()=>{if(item)setF({name:item.name,description:item.description||"",location:item.location||"",tags:(item.tags||[]).join(", "),status:item.status});},[item]);
  const save=async()=>{setLoading(true);try{await api.items.update(item._id,{...f,tags:f.tags?f.tags.split(",").map(t=>t.trim()).filter(Boolean):[]});onSaved();}catch(e){toast(e.message,"error");}finally{setLoading(false);};};
  return(
    <Modal open={!!item} onClose={onClose}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <GT g={P.gMain} tag="h3" style={{fontFamily:"'Syne',sans-serif",fontSize:20,fontWeight:900}}>Edit Item</GT>
        <button onClick={onClose} style={{width:32,height:32,borderRadius:"50%",border:"none",background:P.border,color:P.ink2,fontSize:16,cursor:"pointer"}}>✕</button>
      </div>
      {item&&(
        <div style={{display:"flex",flexDirection:"column",gap:13}}>
          {[["name","Item Name","📦"],["location","Location","📍"],["description","Description","📝"],["tags","Tags","🏷️"]].map(([k,l,ic])=>(
            <Inp key={k} label={l} icon={ic} value={f[k]||""} onChange={e=>setF(p=>({...p,[k]:e.target.value}))}/>
          ))}
          <div>
            <div style={{fontSize:11,fontWeight:800,color:P.ink2,letterSpacing:".08em",textTransform:"uppercase",marginBottom:6}}>Status</div>
            <select value={f.status||""} onChange={e=>setF(p=>({...p,status:e.target.value}))} style={{width:"100%",padding:"11px 14px",background:P.panel,border:`2px solid ${P.border}`,borderRadius:P.r,fontSize:13,fontFamily:"inherit",color:P.ink,outline:"none"}}>
              {["lost","found","matched","claimed"].map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{display:"flex",gap:10}}><Btn g={`linear-gradient(135deg,${P.border},${P.panel})`} col={P.ink2} onClick={onClose}>Cancel</Btn><Btn g={P.gMain} full loading={loading} onClick={save}>Save ✨</Btn></div>
        </div>
      )}
    </Modal>
  );
}

// ── NOTIFICATIONS PAGE ─────────────────────────────────────────────────────────
function NotifsPage({toast}){
  const {user}=useAuth();
  const [notifs,setNotifs]=useState([]); const [loading,setLoading]=useState(true);
  useEffect(()=>{if(!user){setLoading(false);return;}api.notifications.mine().then(setNotifs).catch(e=>toast(e.message,"error")).finally(()=>setLoading(false));},[user]);
  if(!user) return <Guard/>;
  return(
    <div style={{maxWidth:700,margin:"0 auto",padding:"28px 20px"}}>
      <PgHdr g={P.gMain} icon="🔔" title="Notifications" sub="Your alert history"/>
      {loading?<CLoad/>:notifs.length===0?<Empty icon="🔔" title="No alerts yet" sub="You'll be notified when a match is found."/>
        :<div style={{display:"flex",flexDirection:"column",gap:10}}>
          {notifs.map((n,i)=>{const sc=n.status==="sent"?P.cyan:n.status==="failed"?P.coral:P.amber; return(
            <div key={n._id} style={{background:P.card,border:`2px solid ${P.border}`,borderRadius:P.r,padding:"13px 17px",boxShadow:P.sh,animation:"fadeUp .4s ease",animationDelay:`${i*.05}s`,animationFillMode:"both"}}>
              <div style={{display:"flex",gap:11,alignItems:"flex-start"}}>
                <div style={{width:40,height:40,borderRadius:12,background:n.type==="email"?P.gCyan:P.gMain,display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0}}>{n.type==="email"?"✉️":"💬"}</div>
                <div style={{flex:1}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4,flexWrap:"wrap",gap:5}}>
                    <span style={{fontWeight:800,fontSize:13,color:P.ink}}>{n.subject||"Notification"}</span>
                    <div style={{display:"flex",gap:5}}><Chip color={sc}>{n.status}</Chip><Chip color={P.violet}>{n.type}</Chip></div>
                  </div>
                  <div style={{fontSize:11,color:P.ink3,fontWeight:600}}>{n.recipient} · {new Date(n.created_at).toLocaleString()}</div>
                  {n.status==="failed"&&n.error_message&&<div style={{fontSize:11,color:P.coral,marginTop:3,fontWeight:700}}>⚠️ {n.error_message}</div>}
                </div>
              </div>
            </div>
          );})}
        </div>}
    </div>
  );
}

// ── HELPERS ────────────────────────────────────────────────────────────────────
function PgHdr({g,icon,title,sub,inline}){
  return(
    <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:inline?0:28,animation:"fadeUp .4s ease"}}>
      <div style={{width:52,height:52,borderRadius:16,background:g,display:"flex",alignItems:"center",justifyContent:"center",fontSize:24,boxShadow:"0 6px 20px rgba(0,0,0,.25)",flexShrink:0}}>{icon}</div>
      <div>
        <GT g={g} tag="h1" style={{fontFamily:"'Syne',sans-serif",fontSize:28,fontWeight:900,marginBottom:4,display:"block"}}>{title}</GT>
        <p style={{color:P.ink3,fontSize:13}}>{sub}</p>
      </div>
    </div>
  );
}
const Guard=()=>(<div style={{textAlign:"center",padding:"80px 24px"}}><div style={{fontSize:52,marginBottom:14,animation:"float 3s ease-in-out infinite"}}>🔒</div><GT g={P.gMain} tag="div" style={{fontFamily:"'Syne',sans-serif",fontSize:24,fontWeight:900,marginBottom:8,display:"block"}}>Sign in required</GT><div style={{fontSize:13,color:P.ink3}}>Please sign in to view this page.</div></div>);
const Empty=({icon,title,sub})=>(<div style={{textAlign:"center",padding:"72px 24px"}}><div style={{fontSize:58,marginBottom:14,animation:"float 3s ease-in-out infinite"}}>{icon}</div><GT g={P.gMain} tag="div" style={{fontFamily:"'Syne',sans-serif",fontSize:24,fontWeight:900,marginBottom:8,display:"block"}}>{title}</GT><div style={{fontSize:13,color:P.ink3}}>{sub}</div></div>);
const CLoad=()=><div style={{display:"flex",justifyContent:"center",padding:80}}><Spin s={48}/></div>;

// ── ROOT ───────────────────────────────────────────────────────────────────────
export default function App(){
  const [page,setPage]=useState("board");
  const {ts,toast,remove}=useToast();
  const PAGES={board:BoardPage,post:PostPage,login:LoginPage,register:RegisterPage,forgot:ForgotPage,profile:ProfilePage,matches:MatchesPage,mine:MyItemsPage,leaderboard:LeaderboardPage,experiences:ExperiencesPage,notifs:NotifsPage};
  const Page=PAGES[page]||BoardPage;
  return(
    <AuthProvider>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
        body{background:#080818;color:#f0eeff;font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-size:15px;line-height:1.6;}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
        @keyframes slideIn{from{transform:translateX(110%);opacity:0}to{transform:none;opacity:1}}
        @keyframes popIn{from{opacity:0;transform:scale(.88)}to{opacity:1;transform:none}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
        input:focus,textarea:focus,select:focus{outline:none;}
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:#0f0f23}::-webkit-scrollbar-thumb{background:#2a2a4a;border-radius:3px}
        @media(max-width:640px){.fm-desk{display:none!important;}.fm-mob{display:flex!important;}}
      `}</style>
      <div style={{minHeight:"100vh",background:"radial-gradient(ellipse at 20% 0%,#a78bfa12 0%,transparent 50%),radial-gradient(ellipse at 80% 100%,#22d3ee10 0%,transparent 50%),#080818"}}>
        <Navbar page={page} setPage={setPage}/>
        <main><Page setPage={setPage} toast={toast}/></main>
        <footer style={{borderTop:`2px solid ${P.border}`,marginTop:64,padding:"22px 24px",textAlign:"center",color:P.ink3,fontSize:12,fontWeight:600}}>
          <GT g={P.gHero} style={{fontFamily:"'Syne',sans-serif",fontWeight:900,fontSize:14}}>FINDME</GT>
          {" "}· Campus Lost & Found · Smart Matching · FastAPI + MongoDB
        </footer>
      </div>
      <Toast toasts={ts} remove={remove}/>
    </AuthProvider>
  );
}
