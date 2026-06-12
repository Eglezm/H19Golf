import { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyAsWuJRelERz7W2QG3-DPaOprKKT0TJBA4",
  authDomain: "h19golf-4624f.firebaseapp.com",
  databaseURL: "https://h19golf-4624f-default-rtdb.firebaseio.com",
  projectId: "h19golf-4624f",
  storageBucket: "h19golf-4624f.firebasestorage.app",
  messagingSenderId: "476582553669",
  appId: "1:476582553669:web:b01cbb904a8a9a4f1e1b2c"
};
const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);

const DEFAULT_APUESTA = 50;
const DEFAULT_MARCA_VAL = 10;
const DEFAULT_TARJETA_VAL = 10;
const ADMIN_PIN = "1919";

const CAMPOS = {
  huerta:    { nombre: "Club de Golf La Huerta",   pares: [4,3,3,3,3,4,3,3,3,4,3,3,3,3,4,3,3,3] },
  lavista:   { nombre: "La Vista Country Club",    pares: [4,3,4,5,4,4,3,4,5,5,4,3,4,4,5,4,3,4] },
  campestre: { nombre: "Club Campestre de Puebla", pares: [4,3,5,4,4,4,4,3,5,4,4,5,3,4,5,4,3,4] },
  otro:      { nombre: "Otro campo",               pares: null },
};

const MARCAS_MULTI = [
  { key: "holeinone", label: "🎯 Hole in One", pts: 10 },
  { key: "eagle",     label: "🦅 Eagle",       pts: 3  },
  { key: "birdie",    label: "🐦 Birdie",      pts: 2  },
  { key: "holeout",   label: "🕳️ Hole out",   pts: 1  },
  { key: "sandy",     label: "🏖️ Sandy par",  pts: 2  },
];

const TARJETAS = [
  { key: "ob",       label: "🚫 Out of Bound", auto: false },
  { key: "water",    label: "💧 Water",         auto: false },
  { key: "sand",     label: "⛱️ Sand",          auto: false },
  { key: "sapo",     label: "🐸 Sapo",          auto: false },
  { key: "arbol",    label: "🌳 Árbol",         auto: false },
  { key: "threeput", label: "🔄 Three putt",    auto: false },
  { key: "doblepar", label: "💀 Doble Par",     auto: true  },
];

const D = {
  bg: "#F5F0E8", surface: "#FFFFFF", card: "#FFFFFF", border: "#DDD5C0",
  gold: "#9A6F00", goldLight: "#C49A00", goldDim: "#FDF3D0",
  text: "#1A1A1A", textSub: "#6B6150", textDim: "#B0A690",
  green: "#1B5E20", greenBg: "#E8F5E9", red: "#B71C1C", redBg: "#FFEBEE",
  success: "#2E7D32", danger: "#C62828",
};

const COLORS = [
  {bg:"#D6E4F7",fg:"#1A4A8A"},{bg:"#D4EDD8",fg:"#1A5C24"},
  {bg:"#F7E6D4",fg:"#8A3A0A"},{bg:"#F7D4E6",fg:"#8A0A40"},
  {bg:"#E4D4F7",fg:"#4A1A8A"},{bg:"#F7D4F0",fg:"#8A1A7A"},
  {bg:"#D4F0E8",fg:"#0A5A3A"},{bg:"#F7EDD4",fg:"#7A5000"},
  {bg:"#D4D8F7",fg:"#1A1A8A"},{bg:"#F7D8D4",fg:"#8A1A14"},
];

const col = (id) => COLORS[(id - 1) % COLORS.length];
const fmt = (n) => n >= 0 ? `+$${n}` : `−$${Math.abs(n)}`;
const fmtC = (n) => n >= 0 ? D.success : D.danger;

const emptyMarca = (n) => ({
  multi: Array(n).fill(null).map(() => ({ holeinone:false, eagle:false, birdie:false, holeout:false, sandy:false })),
  oyes: null, regulation: null,
});
const emptyTarjetas = () => { const t = {}; TARJETAS.forEach(tj => { t[tj.key] = null; }); return t; };

function Avatar({ name, id, size = 32 }) {
  const c = col(id);
  return (
    <div style={{ width:size, height:size, borderRadius:"50%", background:c.bg, color:c.fg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:size*0.34, fontWeight:700, flexShrink:0, border:`1px solid ${c.fg}33` }}>
      {name.substring(0,2).toUpperCase()}
    </div>
  );
}

function getBadge(s, par) {
  const d = s - par;
  if (d <= -2) return { label:"Eagle",  bg:"#D6E4F7", fg:"#1A4A8A" };
  if (d === -1) return { label:"Birdie", bg:"#D4EDD8", fg:"#1A5C24" };
  if (d === 0)  return { label:"Par",    bg:"#EEE8DC", fg:"#6B6150" };
  if (d === 1)  return { label:"Bogey",  bg:"#FFF0D4", fg:"#8A4A00" };
  if (d === 2)  return { label:"Doble",  bg:"#FFE0D4", fg:"#8A2A00" };
  return { label:"+"+d, bg:"#FFDBDB", fg:"#C62828" };
}

function Card({ children, style = {} }) {
  return (
    <div style={{ background:D.card, border:`1px solid ${D.border}`, borderRadius:16, padding:16, marginBottom:12, ...style }}>
      {children}
    </div>
  );
}

function SLabel({ children }) {
  return <div style={{ fontSize:10, fontWeight:700, color:D.gold, textTransform:"uppercase", letterSpacing:2, marginBottom:10 }}>{children}</div>;
}

function Btn({ children, onClick, disabled, outline, danger, style = {} }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ width:"100%", padding:14, border:outline ? `1px solid ${danger?D.danger:D.gold}` : "none", borderRadius:12, fontSize:15, fontWeight:700, cursor:disabled?"default":"pointer", marginTop:6, background:outline ? "transparent" : danger ? D.danger : `linear-gradient(135deg,${D.gold},${D.goldLight})`, color:outline ? (danger?D.danger:D.gold) : "#FFFFFF", opacity:disabled?0.4:1, ...style }}>
      {children}
    </button>
  );
}

function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{ display:"flex", gap:6, marginBottom:14 }}>
      {tabs.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)} style={{ flex:1, padding:"9px 4px", border:`1px solid ${active===t.key?D.gold:D.border}`, borderRadius:10, background:active===t.key?D.goldDim:D.surface, color:active===t.key?D.gold:D.textSub, fontSize:11, fontWeight:700, cursor:"pointer" }}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

function Pill({ active, danger, onClick, children }) {
  return (
    <div onClick={onClick} style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 14px", border:`1px solid ${active?D.gold:danger?D.danger:D.border}`, borderRadius:20, background:active?D.goldDim:"transparent", color:active?D.gold:danger?D.danger:D.textSub, fontSize:13, fontWeight:600, cursor:"pointer", userSelect:"none" }}>
      {children}
    </div>
  );
}

function calcMarcasPts(players, marcas) {
  return players.map((p, pi) => {
    let pts = 0;
    marcas.forEach(h => {
      MARCAS_MULTI.forEach(m => { if (h.multi[pi][m.key]) pts += m.pts; });
      if (h.oyes === pi) pts += 1;
      if (h.regulation === pi) pts += 1;
    });
    return pts;
  });
}

function calcMarcasMoney(players, marcas, marcaVal) {
  const pts = calcMarcasPts(players, marcas);
  return players.map((_, i) => {
    let b = 0;
    players.forEach((_, j) => { if (i !== j) { b += pts[i]*marcaVal; b -= pts[j]*marcaVal; } });
    return b;
  });
}

function calcTarjetasMoney(players, tarjetas, tarjetaVal) {
  const count = players.map((_, i) => TARJETAS.filter(t => tarjetas[t.key] === i).length);
  return players.map((_, i) => {
    let b = 0;
    players.forEach((_, j) => { if (i !== j) { b -= count[i]*tarjetaVal; b += count[j]*tarjetaVal; } });
    return b;
  });
}

function calcMoney(players, scores, apuesta) {
  const n = players.length;
  const nets = players.map((p, i) => scores[i].reduce((a, b) => a+b, 0) - p.hc);
  const pot = apuesta * n;
  const uniq = [...new Set(nets)].sort((a, b) => a-b);
  const f = uniq[0], s = uniq[1];
  const fi = nets.reduce((a, v, i) => v===f ? [...a,i] : a, []);
  const si = s !== undefined ? nets.reduce((a, v, i) => v===s ? [...a,i] : a, []) : [];
  const loserIdxs = nets.reduce((a, v, i) => v!==f ? [...a,i] : a, []);
  const totalFromLosers = apuesta * loserIdxs.length;
  const totalNonFirst = apuesta * (n - fi.length);
  return { nets, fi, si, pot, money: players.map((_, i) => {
    if (n <= 9) return fi.includes(i) ? Math.round(totalFromLosers/fi.length) : -apuesta;
    if (fi.length > 1) return fi.includes(i) ? Math.round(totalFromLosers/fi.length) : -apuesta;
    if (fi.includes(i)) return Math.round(totalNonFirst*0.6);
    if (si.includes(i)) return Math.round((totalNonFirst*0.4)/si.length);
    return -apuesta;
  })};
}

function calcHC(players, scores) {
  const nets = players.map((p, i) => scores[i].reduce((a, b) => a+b, 0) - p.hc);
  const fnet = Math.min(...nets);
  const fi = nets.reduce((a, v, i) => v===fnet ? [...a,i] : a, []);
  const deltas = {};
  players.forEach(p => { deltas[p.id] = 0; });
  fi.forEach(wi => {
    const w = players[wi];
    if (w.hc === 0) players.forEach((p, i) => { if (i !== wi) deltas[p.id] += 1; });
    else deltas[w.id] -= 1;
  });
  return players.map(p => ({ ...p, before:p.hc, delta:deltas[p.id], after:Math.max(0, p.hc+deltas[p.id]) }));
}

function calcOrden(players, scores, pars, currentHole) {
  if (currentHole === 0) return players.map((_, i) => i);
  return players.map((_, i) => i).sort((a, b) => {
    const h = currentHole - 1;
    const sa = scores[a][h] ?? pars[h];
    const sb = scores[b][h] ?? pars[h];
    if (sa !== sb) return sa - sb;
    const na = scores[a].slice(0,currentHole).reduce((s,v,j)=>s+(v??pars[j]),0) - players[a].hc;
    const nb = scores[b].slice(0,currentHole).reduce((s,v,j)=>s+(v??pars[j]),0) - players[b].hc;
    return na - nb;
  });
}

// ─── SPECTATOR VIEW ───────────────────────────────
function SpectatorView({ rondaId }) {
  const [ronda, setRonda] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const r = ref(db, `rondas/${rondaId}`);
    const unsub = onValue(r, snap => {
      setRonda(snap.exists() ? snap.val() : null);
      setLoading(false);
    });
    return () => unsub();
  }, [rondaId]);

  const appStyle = { fontSize:14, fontFamily:"-apple-system,sans-serif", color:D.text, background:D.bg, minHeight:"100vh", maxWidth:420, margin:"0 auto" };

  if (loading) {
    return (
      <div style={{ ...appStyle, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12 }}>
        <div style={{ fontSize:32 }}>⛳</div>
        <div style={{ color:D.gold, fontWeight:700 }}>Conectando...</div>
      </div>
    );
  }

  if (!ronda || !ronda.players || !ronda.scores) {
    return (
      <div style={{ ...appStyle, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12 }}>
        <div style={{ fontSize:32 }}>🏌️</div>
        <div style={{ color:D.textSub }}>Ronda no encontrada</div>
      </div>
    );
  }

  const { players, scores, pars, hole, campo, tarjetas, status } = ronda;
  const nets = players.map((p, i) => (scores[i]||[]).reduce((a,v)=>a+(v||0),0) - p.hc);
  const ranked = players.map((p, i) => ({ ...p, net:nets[i], gross:(scores[i]||[]).reduce((a,v)=>a+(v||0),0) })).sort((a,b)=>a.net-b.net);
  const campoNombre = CAMPOS[campo]?.nombre || campo;

  return (
    <div style={appStyle}>
      <div style={{ background:D.surface, borderBottom:`1px solid ${D.border}`, padding:"20px 16px 14px", textAlign:"center" }}>
        <div style={{ fontSize:30, fontWeight:900, color:D.gold }}>H19</div>
        <div style={{ fontSize:11, color:D.textSub, letterSpacing:2, textTransform:"uppercase", marginTop:2 }}>{campoNombre}</div>
        <div style={{ marginTop:8, display:"inline-flex", alignItems:"center", gap:6, padding:"4px 12px", background:status==="finalizada"?D.greenBg:D.goldDim, border:`1px solid ${status==="finalizada"?D.success:D.gold}`, borderRadius:20 }}>
          <div style={{ width:6, height:6, borderRadius:"50%", background:status==="finalizada"?D.success:D.gold }} />
          <span style={{ fontSize:11, fontWeight:700, color:status==="finalizada"?D.success:D.gold }}>
            {status==="finalizada" ? "Ronda finalizada" : "En vivo"}
          </span>
        </div>
      </div>
      <div style={{ padding:"12px 12px 32px" }}>
        {status !== "finalizada" && (
          <Card style={{ textAlign:"center", marginBottom:12 }}>
            <div style={{ fontSize:11, color:D.textSub, letterSpacing:2, textTransform:"uppercase", marginBottom:4 }}>Hoyo actual</div>
            <div style={{ fontSize:36, fontWeight:900 }}>{(hole||0)+1}</div>
            <div style={{ fontSize:13, color:D.gold, fontWeight:700 }}>PAR {(pars||[])[hole||0]||"—"}</div>
          </Card>
        )}
        <Card>
          <SLabel>🏆 Marcador</SLabel>
          {ranked.map((p, pos) => {
            const pi = players.findIndex(pl => pl.id===p.id);
            const cs = (scores[pi]||[])[hole||0];
            const par = (pars||[])[hole||0];
            const b = cs && par ? getBadge(cs, par) : null;
            return (
              <div key={p.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 0", borderBottom:pos<ranked.length-1?`1px solid ${D.border}`:"none" }}>
                <div style={{ width:24, height:24, borderRadius:"50%", background:pos===0?D.goldDim:D.surface, border:`1px solid ${pos===0?D.gold:D.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:900, color:pos===0?D.gold:D.textSub }}>{pos+1}</div>
                <Avatar name={p.name} id={p.id} size={32} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:600 }}>{p.name}</div>
                  <div style={{ fontSize:11, color:D.textSub }}>HC {p.hc} · {p.gross} bruto</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:18, fontWeight:900, color:pos===0?D.gold:D.text }}>{p.net}</div>
                  <div style={{ fontSize:10, color:D.textSub }}>neto</div>
                </div>
                {b && <span style={{ fontSize:10, padding:"2px 6px", borderRadius:8, fontWeight:700, background:b.bg, color:b.fg }}>{b.label}</span>}
              </div>
            );
          })}
        </Card>
        {tarjetas && (
          <Card>
            <SLabel>🃏 Tarjetas</SLabel>
            {TARJETAS.map((tj, idx) => {
              const owner = tarjetas[tj.key];
              return (
                <div key={tj.key} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0", borderBottom:idx<TARJETAS.length-1?`1px solid ${D.border}`:"none" }}>
                  <div style={{ flex:1, fontSize:12 }}>{tj.label}</div>
                  {owner !== null && owner !== undefined
                    ? <div style={{ fontSize:12, fontWeight:700, color:D.danger }}>{players[owner]?.name||"—"}</div>
                    : <div style={{ fontSize:11, color:D.textDim }}>Sin dueño</div>
                  }
                </div>
              );
            })}
          </Card>
        )}
        <div style={{ textAlign:"center", fontSize:11, color:D.textDim, marginTop:8 }}>Vista de solo lectura · Actualización automática</div>
      </div>
    </div>
  );
}

// ─── APP PRINCIPAL ────────────────────────────────
export default function H19() {
  const [mode, setMode] = useState(null);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [rondaId, setRondaId] = useState(null);
  const [spectatorInput, setSpectatorInput] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rid = params.get("ronda");
    if (rid) { setRondaId(rid); setMode("spectator"); }
    else setMode("home");
  }, []);

  const appStyle = { fontSize:14, fontFamily:"-apple-system,sans-serif", color:D.text, background:D.bg, minHeight:"100vh", maxWidth:420, margin:"0 auto" };

  if (mode === null) {
    return (
      <div style={{ ...appStyle, display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ color:D.gold, fontSize:20, fontWeight:700 }}>Cargando H19...</div>
      </div>
    );
  }

  if (mode === "spectator" && rondaId) return <SpectatorView rondaId={rondaId} />;

  if (mode === "home") {
    return (
      <div style={{ ...appStyle, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24, gap:16 }}>
        <div style={{ fontSize:64, fontWeight:900, letterSpacing:-3, color:D.gold }}>H19</div>
        <div style={{ fontSize:12, color:D.textSub, letterSpacing:3, textTransform:"uppercase", marginBottom:16 }}>Club de Golf</div>
        <Btn onClick={() => setMode("pin")}>🏌️ Entrar como Admin</Btn>
        <Btn outline onClick={() => setMode("spectator-input")}>👀 Ver ronda en vivo</Btn>
      </div>
    );
  }

  if (mode === "pin") {
    return (
      <div style={{ ...appStyle, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24, gap:14 }}>
        <div style={{ fontSize:40, fontWeight:900, color:D.gold }}>H19</div>
        <div style={{ fontSize:14, color:D.textSub, marginBottom:8 }}>Ingresa tu PIN de administrador</div>
        <input type="password" value={pinInput} onChange={e => setPinInput(e.target.value)} placeholder="PIN" maxLength={6}
          style={{ width:"100%", padding:14, border:`1px solid ${pinError?D.danger:D.border}`, borderRadius:12, background:D.surface, color:D.text, fontSize:22, textAlign:"center", letterSpacing:8, fontWeight:700 }} />
        {pinError && <div style={{ color:D.danger, fontSize:13 }}>PIN incorrecto</div>}
        <Btn onClick={() => { if (pinInput===ADMIN_PIN) { setMode("admin"); setPinError(false); } else setPinError(true); }}>Entrar</Btn>
        <button onClick={() => { setMode("home"); setPinInput(""); setPinError(false); }} style={{ fontSize:13, color:D.textSub, background:"none", border:"none", cursor:"pointer" }}>← Volver</button>
      </div>
    );
  }

  if (mode === "spectator-input") {
    return (
      <div style={{ ...appStyle, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24, gap:14 }}>
        <div style={{ fontSize:40, fontWeight:900, color:D.gold }}>H19</div>
        <div style={{ fontSize:14, color:D.textSub, marginBottom:8, textAlign:"center" }}>Ingresa el código de ronda</div>
        <input value={spectatorInput} onChange={e => setSpectatorInput(e.target.value.toUpperCase())} placeholder="Código" maxLength={8}
          style={{ width:"100%", padding:14, border:`1px solid ${D.border}`, borderRadius:12, background:D.surface, color:D.text, fontSize:20, textAlign:"center", letterSpacing:4, fontWeight:700 }} />
        <Btn onClick={() => { if (spectatorInput.trim()) { setRondaId(spectatorInput.trim()); setMode("spectator"); } }}>Ver ronda</Btn>
        <button onClick={() => setMode("home")} style={{ fontSize:13, color:D.textSub, background:"none", border:"none", cursor:"pointer" }}>← Volver</button>
      </div>
    );
  }

  if (mode === "admin") return <AdminApp onExit={() => setMode("home")} />;

  return null;
}

// ─── ADMIN APP ────────────────────────────────────
function AdminApp({ onExit }) {
  const [screen, setScreen] = useState("dir");
  const [dir, setDir] = useState([]);
  const [nid, setNid] = useState(6);
  const [sel, setSel] = useState(new Set());
  const [nHoles, setNHoles] = useState(9);
  const [campo, setCampo] = useState("huerta");
  const [apuesta, setApuesta] = useState(DEFAULT_APUESTA);
  const [marcaVal, setMarcaVal] = useState(DEFAULT_MARCA_VAL);
  const [tarjetaVal, setTarjetaVal] = useState(DEFAULT_TARJETA_VAL);
  const [playerOpts, setPlayerOpts] = useState({});
  const [newName, setNewName] = useState("");
  const [newHC, setNewHC] = useState("");
  const [editingHC, setEditingHC] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [players, setPlayers] = useState([]);
  const [scores, setScores] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [tarjetas, setTarjetas] = useState(emptyTarjetas());
  const [hole, setHole] = useState(0);
  const [pars, setPars] = useState([]);
  const [results, setResults] = useState(null);
  const [tab, setTab] = useState("score");
  const [showTabla, setShowTabla] = useState(false);
  const [rondaId, setRondaId] = useState(null);
  const [shareMsg, setShareMsg] = useState("");
  const [savedRonda, setSavedRonda] = useState(null);

  // Load directory from Firebase
  useEffect(() => {
    const dirRef = ref(db, "directorio");
    const unsub = onValue(dirRef, snap => {
      if (snap.exists()) {
        const data = snap.val();
        setDir(data.players || []);
        setNid(data.nextId || 6);
      } else {
        const defaultDir = { nextId:6, players:[
          {id:1,name:"Beto",hc:0},{id:2,name:"Arturo G",hc:4},
          {id:3,name:"Enrique",hc:2},{id:4,name:"Miguel",hc:3},{id:5,name:"Toño",hc:1}
        ]};
        set(ref(db, "directorio"), defaultDir);
      }
    });
    return () => unsub();
  }, []);

  // Check localStorage for saved ronda
  useEffect(() => {
    try {
      const saved = localStorage.getItem("h19-ronda-activa");
      if (saved) {
        const data = JSON.parse(saved);
        if (data.savedAt && Date.now() - data.savedAt < 24*60*60*1000) setSavedRonda(data);
      }
    } catch(e) {}
  }, []);

  const saveDir = (newPlayers, newNidVal) => {
    set(ref(db, "directorio"), { players:newPlayers, nextId:newNidVal||nid });
  };

  const saveToLocal = (state) => {
    try { localStorage.setItem("h19-ronda-activa", JSON.stringify({ ...state, savedAt:Date.now() })); } catch(e) {}
  };

  const syncFirebase = (state) => {
    if (!rondaId) return;
    try { set(ref(db, `rondas/${rondaId}`), { ...state, updatedAt:Date.now() }); } catch(e) {}
  };

  const updateGame = (state) => { saveToLocal(state); syncFirebase(state); };
  const getState = () => ({ players, pars, scores, marcas, tarjetas, hole, campo, status:"en_juego", rondaId });

  const resumeRonda = () => {
    if (!savedRonda) return;
    setPlayers(savedRonda.players||[]); setScores(savedRonda.scores||[]);
    setMarcas(savedRonda.marcas||[]); setTarjetas(savedRonda.tarjetas||emptyTarjetas());
    setHole(savedRonda.hole||0); setPars(savedRonda.pars||[]);
    setCampo(savedRonda.campo||"huerta"); setRondaId(savedRonda.rondaId||null);
    setScreen("score"); setSavedRonda(null);
  };

  const toggleSel = (id) => { const s = new Set(sel); s.has(id) ? s.delete(id) : s.add(id); setSel(s); };

  const addPlayer = () => {
    const name = newName.trim(); if (!name) return;
    const hc = Math.max(0, parseInt(newHC)||0);
    const newPlayers = [...dir, {id:nid, name, hc}];
    saveDir(newPlayers, nid+1); setNid(nid+1); setNewName(""); setNewHC("");
  };

  const removePlayer = (id) => { saveDir(dir.filter(p=>p.id!==id)); const s=new Set(sel); s.delete(id); setSel(s); };

  const startGame = () => {
    if (sel.size < 2) return;
    const ps = dir.filter(p => sel.has(p.id));
    const basePares = CAMPOS[campo].pares || Array(18).fill(4);
    const p = basePares.slice(0, nHoles);
    const initScores = ps.map(() => Array(nHoles).fill(null));
    const initMarcas = Array(nHoles).fill(null).map(() => emptyMarca(ps.length));
    const initTarjetas = emptyTarjetas();
    const rid = Math.random().toString(36).substring(2,8).toUpperCase();
    setRondaId(rid); setPlayers(ps); setPars(p);
    setScores(initScores); setMarcas(initMarcas); setTarjetas(initTarjetas);
    setHole(0); setTab("score"); setResults(null);
    const state = { players:ps, pars:p, scores:initScores, marcas:initMarcas, tarjetas:initTarjetas, hole:0, campo, status:"en_juego", rondaId:rid };
    saveToLocal(state);
    try { set(ref(db, `rondas/${rid}`), { ...state, createdAt:Date.now(), updatedAt:Date.now() }); } catch(e) {}
    setScreen("score");
  };

  const commitHole = (sc, h) => sc.map(row => row.map((v,j) => j===h && v===null ? pars[j] : v));

  const changeScore = (pi, d) => {
    const newScores = scores.map((row, i) => {
      if (i !== pi) return row;
      return row.map((v, j) => { if (j !== hole) return v; return Math.max(1, (v===null?pars[j]:v)+d); });
    });
    const s = newScores[pi][hole], p = pars[hole];
    const newMarcas = marcas.map((m, h) => {
      if (h !== hole) return m;
      const diff = s-p, bogey = diff>=1;
      return { ...m, multi:m.multi.map((row, i) => {
        if (i !== pi) return row;
        let nr = {...row};
        if (p===3) { nr.holeinone=s===1; nr.eagle=false; nr.birdie=s===2; }
        else if (p===4) { nr.holeinone=false; nr.eagle=s===2; nr.birdie=s===3; }
        else if (p===5) { nr.holeinone=false; nr.eagle=s===3; nr.birdie=s===4; }
        if (bogey) { nr.sandy=false; nr.holeout=false; }
        return nr;
      })};
    });
    const newTarjetas = {...tarjetas};
    const limit = p===3?6:p===4?8:p===5?10:999;
    if (s >= limit) newTarjetas["doblepar"] = pi;
    setScores(newScores); setMarcas(newMarcas); setTarjetas(newTarjetas);
    updateGame({ ...getState(), scores:newScores, marcas:newMarcas, tarjetas:newTarjetas });
  };

  const toggleMultiMarca = (pi, key) => {
    const newMarcas = marcas.map((m, h) => {
      if (h !== hole) return m;
      return { ...m, multi:m.multi.map((row,i) => i===pi ? {...row,[key]:!row[key]} : row) };
    });
    setMarcas(newMarcas); updateGame({ ...getState(), marcas:newMarcas });
  };

  const setExclusive = (field, pi) => {
    const newMarcas = marcas.map((m, h) => { if (h!==hole) return m; return { ...m, [field]:m[field]===pi?null:pi }; });
    setMarcas(newMarcas); updateGame({ ...getState(), marcas:newMarcas });
  };

  const assignTarjeta = (tkey, pi) => {
    const newTarjetas = { ...tarjetas, [tkey]:tarjetas[tkey]===pi?null:pi };
    let newMarcas = marcas;
    if (tkey==="threeput" && tarjetas["threeput"]!==pi) {
      newMarcas = marcas.map((m,h) => { if (h!==hole) return m; return { ...m, multi:m.multi.map((row,i)=>i===pi?{...row,sandy:false}:row) }; });
      setMarcas(newMarcas);
    }
    setTarjetas(newTarjetas); updateGame({ ...getState(), tarjetas:newTarjetas, marcas:newMarcas });
  };

  const nextHole = () => {
    const sc = commitHole(scores, hole); setScores(sc);
    const nh = hole < nHoles-1 ? hole+1 : hole;
    setHole(nh); setTab("score"); updateGame({ ...getState(), scores:sc, hole:nh });
  };

  const prevHole = () => { if (hole>0) { setHole(hole-1); setTab("score"); } };

  const finish = () => {
    try { localStorage.removeItem("h19-ronda-activa"); } catch(e) {}
    const sc = commitHole(scores, hole); setScores(sc);
    const fullScores = sc.map(row => row.map((v,j) => v===null?pars[j]:v));
    const r = calcMoney(players, fullScores, apuesta);
    const hc = calcHC(players, fullScores);
    const marcasMoney = calcMarcasMoney(players, marcas, marcaVal);
    const marcasPts = calcMarcasPts(players, marcas);
    const tarjetasMoney = calcTarjetasMoney(players, tarjetas, tarjetaVal);
    const tarjetasCount = players.map((_,i) => TARJETAS.filter(t=>tarjetas[t.key]===i).length);
    setResults({ ...r, hcUpdates:hc, marcasMoney, marcasPts, tarjetasMoney, tarjetasCount, fullScores });
    updateGame({ ...getState(), scores:sc, status:"finalizada" });
    setScreen("res");
  };

  const confirmHC = () => {
    if (!results) return;
    const updated = dir.map(p => { const u=results.hcUpdates.find(u=>u.id===p.id); return u?{...p,hc:u.after}:p; });
    saveDir(updated); setSel(new Set()); setScreen("sel");
  };

  const shareRonda = () => {
    const url = `${window.location.origin}${window.location.pathname}?ronda=${rondaId}`;
    if (navigator.clipboard) { navigator.clipboard.writeText(url); setShareMsg("¡Link copiado!"); setTimeout(()=>setShareMsg(""),2500); }
    else { setShareMsg(`Código: ${rondaId}`); setTimeout(()=>setShareMsg(""),4000); }
  };

  const getDisplay = (pi, h) => scores[pi]?.[h]===null ? pars[h] : scores[pi]?.[h];
  const liveNets = players.map((p,i) => (scores[i]||[]).reduce((a,v,j)=>a+(v===null?pars[j]:v),0) - p.hc);
  const par = pars[hole] || 4;
  const n = sel.size, pot = apuesta * n;

  function marcasPtsHole(pi) {
    if (!marcas[hole]) return 0;
    let pts = 0;
    MARCAS_MULTI.forEach(m => { if (marcas[hole].multi[pi][m.key]) pts += m.pts; });
    if (marcas[hole].oyes===pi) pts += 1;
    if (marcas[hole].regulation===pi) pts += 1;
    return pts;
  }

  const appSt = { fontSize:14, fontFamily:"-apple-system,sans-serif", color:D.text, background:D.bg, minHeight:"100vh", maxWidth:420, margin:"0 auto", paddingBottom:32 };
  const tog = (a) => ({ flex:1, padding:9, border:`1px solid ${a?D.gold:D.border}`, borderRadius:10, background:a?D.goldDim:"transparent", color:a?D.gold:D.textSub, fontSize:13, fontWeight:700, cursor:"pointer" });

  // ── DIRECTORIO ──
  if (screen==="dir") return (
    <div style={appSt}>
      <div style={{ background:D.surface, borderBottom:`1px solid ${D.border}`, padding:"20px 16px 14px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ fontSize:28, fontWeight:900, color:D.gold }}>H19</div>
          <button onClick={onExit} style={{ fontSize:12, color:D.textSub, background:"none", border:`1px solid ${D.border}`, borderRadius:8, padding:"5px 10px", cursor:"pointer" }}>Salir</button>
        </div>
        <div style={{ fontSize:11, color:D.textSub, letterSpacing:2, textTransform:"uppercase", marginTop:2 }}>Admin</div>
      </div>
      <div style={{ padding:"12px 12px" }}>
        <TabBar tabs={[{key:"dir",label:"👥 Jugadores"},{key:"sel",label:"⛳ Nueva ronda"}]} active="dir" onChange={k => k==="sel" && setScreen("sel")} />
        {savedRonda && (
          <div style={{ background:D.greenBg, border:`1px solid ${D.success}`, borderRadius:12, padding:"12px 16px", marginBottom:12 }}>
            <div style={{ fontSize:13, fontWeight:700, color:D.success, marginBottom:4 }}>⛳ Ronda guardada encontrada</div>
            <div style={{ fontSize:11, color:D.textSub, marginBottom:10 }}>Hoyo {(savedRonda.hole||0)+1} · {savedRonda.players?.length||0} jugadores</div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={resumeRonda} style={{ flex:1, padding:8, border:"none", borderRadius:8, background:D.success, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>▶ Continuar</button>
              <button onClick={() => { localStorage.removeItem("h19-ronda-activa"); setSavedRonda(null); }} style={{ flex:1, padding:8, border:`1px solid ${D.border}`, borderRadius:8, background:"transparent", color:D.textSub, fontSize:13, cursor:"pointer" }}>Descartar</button>
            </div>
          </div>
        )}
        <Card>
          <SLabel>Miembros del grupo</SLabel>
          {dir.length===0 && <div style={{ textAlign:"center", color:D.textSub, padding:24, fontSize:13 }}>No hay jugadores aún</div>}
          {dir.map((p, idx) => (
            <div key={p.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 0", borderBottom:idx<dir.length-1?`1px solid ${D.border}`:"none" }}>
              <Avatar name={p.name} id={p.id} size={36} />
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:600 }}>{p.name}</div>
                {editingHC===p.id ? (
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:4 }}>
                    <span style={{ fontSize:11, color:D.gold }}>HC</span>
                    <input type="number" min="0" max="54" defaultValue={p.hc} autoFocus
                      onBlur={e => { const v=Math.max(0,parseInt(e.target.value)||0); saveDir(dir.map(d=>d.id===p.id?{...d,hc:v}:d)); setEditingHC(null); }}
                      style={{ width:56, padding:"4px 8px", border:`1px solid ${D.gold}`, borderRadius:8, background:D.surface, color:D.gold, fontSize:13, fontWeight:700, textAlign:"center" }} />
                    <span style={{ fontSize:11, color:D.textSub }}>Enter para guardar</span>
                  </div>
                ) : (
                  <div style={{ fontSize:11, color:D.gold, marginTop:1, cursor:"pointer" }} onClick={() => setEditingHC(p.id)}>
                    Handicap {p.hc} <span style={{ color:D.textDim, fontSize:10 }}>· toca para editar</span>
                  </div>
                )}
              </div>
              <button onClick={() => setEditingHC(editingHC===p.id?null:p.id)} style={{ padding:"5px 10px", border:`1px solid ${editingHC===p.id?D.gold:D.border}`, borderRadius:8, background:editingHC===p.id?D.goldDim:"transparent", color:editingHC===p.id?D.gold:D.textSub, fontSize:11, cursor:"pointer" }}>
                {editingHC===p.id ? "✓ Listo" : "Editar HC"}
              </button>
              {confirmDelete===p.id ? (
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ fontSize:11, color:D.danger, whiteSpace:"nowrap" }}>¿Eliminar?</span>
                  <button onClick={() => { removePlayer(p.id); setConfirmDelete(null); }} style={{ padding:"5px 10px", border:`1px solid ${D.danger}`, borderRadius:8, background:D.redBg, color:D.danger, fontSize:11, fontWeight:700, cursor:"pointer" }}>Sí</button>
                  <button onClick={() => setConfirmDelete(null)} style={{ padding:"5px 10px", border:`1px solid ${D.border}`, borderRadius:8, background:"transparent", color:D.textSub, fontSize:11, cursor:"pointer" }}>No</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(p.id)} style={{ padding:"5px 8px", border:`1px solid ${D.danger}44`, borderRadius:8, background:"transparent", color:D.danger, fontSize:11, cursor:"pointer" }}>✕</button>
              )}
            </div>
          ))}
        </Card>
        <Card>
          <SLabel>Agregar jugador</SLabel>
          <div style={{ display:"flex", gap:8 }}>
            <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Nombre" style={{ flex:1, padding:"10px 12px", border:`1px solid ${D.border}`, borderRadius:10, background:D.surface, color:D.text, fontSize:14 }} />
            <input value={newHC} onChange={e=>setNewHC(e.target.value)} type="number" min="0" max="54" placeholder="HC" style={{ width:56, padding:"10px 8px", border:`1px solid ${D.border}`, borderRadius:10, background:D.surface, color:D.text, fontSize:14, textAlign:"center" }} />
            <button onClick={addPlayer} style={{ padding:"10px 14px", border:`1px solid ${D.gold}`, borderRadius:10, background:D.goldDim, color:D.gold, fontSize:13, fontWeight:700, cursor:"pointer" }}>+ Agregar</button>
          </div>
        </Card>
        <Btn onClick={() => setScreen("sel")}>⛳ Iniciar ronda</Btn>
      </div>
    </div>
  );

  // ── SELECCIÓN ──
  if (screen==="sel") return (
    <div style={appSt}>
      <div style={{ background:D.surface, borderBottom:`1px solid ${D.border}`, padding:"20px 16px 14px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ fontSize:28, fontWeight:900, color:D.gold }}>H19</div>
          <button onClick={onExit} style={{ fontSize:12, color:D.textSub, background:"none", border:`1px solid ${D.border}`, borderRadius:8, padding:"5px 10px", cursor:"pointer" }}>Salir</button>
        </div>
      </div>
      <div style={{ padding:"12px 12px" }}>
        <TabBar tabs={[{key:"dir",label:"👥 Jugadores"},{key:"sel",label:"⛳ Nueva ronda"}]} active="sel" onChange={k => k==="dir" && setScreen("dir")} />
        <Card>
          <SLabel>Campo</SLabel>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {Object.entries(CAMPOS).map(([key,c]) => (
              <button key={key} onClick={() => setCampo(key)} style={{ width:"100%", padding:"10px 14px", border:`1px solid ${campo===key?D.gold:D.border}`, borderRadius:10, background:campo===key?D.goldDim:"transparent", color:campo===key?D.gold:D.textSub, fontSize:13, fontWeight:700, cursor:"pointer", textAlign:"left" }}>
                {campo===key?"✓ ":""}{c.nombre}
              </button>
            ))}
          </div>
        </Card>
        <Card>
          <SLabel>Hoyos</SLabel>
          <div style={{ display:"flex", gap:8 }}>
            {[9,18].map(h => {
              const bp = CAMPOS[campo].pares || Array(18).fill(4);
              const pt = bp.slice(0,h).reduce((a,b)=>a+b,0);
              return <button key={h} onClick={() => setNHoles(h)} style={tog(nHoles===h)}>{h} hoyos · Par {pt}</button>;
            })}
          </div>
        </Card>
        <Card>
          <SLabel>💰 Apuestas</SLabel>
          {[
            {label:"Score — por jugador", val:apuesta, set:setApuesta},
            {label:"Marcas — por punto",  val:marcaVal, set:setMarcaVal},
            {label:"Tarjetas — por tarjeta", val:tarjetaVal, set:setTarjetaVal},
          ].map(({label,val,set}) => (
            <div key={label} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:`1px solid ${D.border}` }}>
              <div style={{ flex:1, fontSize:13, color:D.textSub }}>{label}</div>
              <button onClick={() => set(Math.max(0,val-10))} style={{ width:30,height:30,borderRadius:"50%",border:`1px solid ${D.border}`,background:"transparent",color:D.text,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center" }}>−</button>
              <div style={{ width:50, textAlign:"center", fontSize:15, fontWeight:700, color:D.gold }}>${val}</div>
              <button onClick={() => set(val+10)} style={{ width:30,height:30,borderRadius:"50%",border:`1px solid ${D.gold}`,background:D.goldDim,color:D.gold,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center" }}>+</button>
            </div>
          ))}
        </Card>
        <Card>
          <SLabel>¿Quién juega hoy?</SLabel>
          <div style={{ fontSize:12, color:n<2?D.textSub:D.gold, marginBottom:10, fontWeight:600 }}>
            {n===0?"Selecciona los jugadores":n===1?"1 seleccionado — necesitas al menos 2":`${n} jugadores seleccionados ✓`}
          </div>
          {n>=2 && (
            <div style={{ fontSize:12, color:D.textSub, padding:"8px 12px", background:D.surface, borderRadius:10, marginBottom:12, border:`1px solid ${D.border}` }}>
              🏆 Premio <span style={{ color:D.gold, fontWeight:700 }}>${pot}</span> · {n>=10?`1er $${Math.round(pot*0.6)} (60%) · 2do $${Math.round(pot*0.4)} (40%)`:"Todo para el 1er lugar"}
            </div>
          )}
          {dir.map((p, idx) => (
            <div key={p.id} onClick={() => toggleSel(p.id)} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 0", borderBottom:idx<dir.length-1?`1px solid ${D.border}`:"none", cursor:"pointer", userSelect:"none" }}>
              <div style={{ width:22,height:22,borderRadius:6,border:`2px solid ${sel.has(p.id)?D.gold:D.border}`,background:sel.has(p.id)?D.goldDim:"transparent",color:D.gold,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,flexShrink:0 }}>
                {sel.has(p.id)?"✓":""}
              </div>
              <Avatar name={p.name} id={p.id} size={32} />
              <div style={{ flex:1, fontSize:14, fontWeight:600 }}>{p.name}</div>
              <div style={{ fontSize:12, color:D.gold }}>HC {p.hc}</div>
            </div>
          ))}
        </Card>
        {n>=2 && (
          <Card>
            <SLabel>🎮 Opciones por jugador</SLabel>
            <div style={{ display:"flex", gap:4, marginBottom:10, paddingBottom:8, borderBottom:`1px solid ${D.border}` }}>
              <div style={{ flex:1 }}></div>
              {["Score","Marcas","Tarjetas"].map(o => <div key={o} style={{ width:56,textAlign:"center",fontSize:10,color:D.gold,fontWeight:700 }}>{o}</div>)}
            </div>
            {dir.filter(p=>sel.has(p.id)).map(p => {
              const opts = playerOpts[p.id] || {score:true,marcas:true,tarjetas:true};
              const toggle = (key) => setPlayerOpts(prev=>({...prev,[p.id]:{...opts,[key]:!opts[key]}}));
              return (
                <div key={p.id} style={{ display:"flex", alignItems:"center", gap:4, padding:"8px 0", borderBottom:`1px solid ${D.border}` }}>
                  <div style={{ flex:1, display:"flex", alignItems:"center", gap:8 }}>
                    <Avatar name={p.name} id={p.id} size={24} />
                    <span style={{ fontSize:13, fontWeight:600 }}>{p.name}</span>
                  </div>
                  {["score","marcas","tarjetas"].map(key => (
                    <div key={key} onClick={() => toggle(key)} style={{ width:56, display:"flex", justifyContent:"center" }}>
                      <div style={{ width:26,height:26,borderRadius:6,border:`2px solid ${opts[key]!==false?D.gold:D.border}`,background:opts[key]!==false?D.goldDim:"transparent",color:D.gold,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,cursor:"pointer" }}>
                        {opts[key]!==false?"✓":""}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </Card>
        )}
        <Btn onClick={startGame} disabled={n<2}>Comenzar ronda</Btn>
        <Btn outline onClick={() => setScreen("dir")} style={{ marginTop:8 }}>← Volver</Btn>
      </div>
    </div>
  );

  // ── SCORE ──
  if (screen==="score") return (
    <div style={appSt}>
      <div style={{ height:3, background:D.border }}>
        <div style={{ height:"100%", width:`${(hole/nHoles)*100}%`, background:`linear-gradient(90deg,${D.gold},${D.goldLight})`, transition:"width 0.3s" }} />
      </div>
      <div style={{ background:D.surface, borderBottom:`1px solid ${D.border}`, padding:"12px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
        <button onClick={prevHole} disabled={hole===0} style={{ width:36,height:36,borderRadius:"50%",border:`1px solid ${D.border}`,background:"transparent",color:D.text,cursor:"pointer",fontSize:20,opacity:hole===0?0.3:1 }}>‹</button>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:11, color:D.textSub, letterSpacing:1, textTransform:"uppercase" }}>{CAMPOS[campo]?.nombre||"Campo"}</div>
          <div style={{ fontSize:22, fontWeight:900 }}>Hoyo {hole+1}</div>
          <div style={{ fontSize:12, color:D.gold, fontWeight:700, letterSpacing:1 }}>PAR {par}</div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4 }}>
          {hole < nHoles-1
            ? <button onClick={nextHole} style={{ padding:"7px 14px", border:`1px solid ${D.gold}`, borderRadius:20, background:D.goldDim, color:D.gold, fontSize:12, fontWeight:700, cursor:"pointer" }}>Siguiente ›</button>
            : <div style={{ width:80 }} />
          }
          {rondaId && <button onClick={shareRonda} style={{ padding:"4px 10px", border:`1px solid ${D.border}`, borderRadius:12, background:"transparent", color:D.textSub, fontSize:10, cursor:"pointer" }}>📤 Compartir</button>}
        </div>
      </div>
      {shareMsg && <div style={{ margin:"0 12px 10px", padding:"8px 12px", background:D.greenBg, border:`1px solid ${D.success}`, borderRadius:10, color:D.success, fontSize:12, textAlign:"center", fontWeight:600 }}>{shareMsg}</div>}
      <div style={{ padding:"0 12px" }}>
        {hole > 0 && (
          <div style={{ background:D.surface, border:`1px solid ${D.border}`, borderRadius:12, padding:"10px 14px", marginBottom:12 }}>
            <div style={{ fontSize:10, fontWeight:700, color:D.gold, textTransform:"uppercase", letterSpacing:2, marginBottom:8 }}>🏌️ Orden de salida</div>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {calcOrden(players,scores,pars,hole).map((pi,pos) => (
                <div key={pi} style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 10px", border:`1px solid ${pos===0?D.gold:D.border}`, borderRadius:20, background:pos===0?D.goldDim:"transparent" }}>
                  <span style={{ fontSize:11, fontWeight:700, color:pos===0?D.gold:D.textSub }}>{pos+1}°</span>
                  <Avatar name={players[pi].name} id={players[pi].id} size={18} />
                  <span style={{ fontSize:12, fontWeight:600, color:pos===0?D.gold:D.text }}>{players[pi].name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <TabBar tabs={[{key:"score",label:"📊 Score"},{key:"marcas",label:"⭐ Marcas"},{key:"tarjetas",label:"🃏 Tarjetas"},{key:"tabla",label:"📋 Tabla"}]} active={tab} onChange={setTab} />

        {tab==="score" && (
          <Card>
            {(hole>0 ? calcOrden(players,scores,pars,hole).map(i=>({...players[i],origIdx:i})) : players.map((p,i)=>({...p,origIdx:i}))).map((pl,pos) => {
              const i = pl.origIdx;
              const disp = getDisplay(i,hole);
              const b = getBadge(disp, par);
              return (
                <div key={pl.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 0", borderBottom:pos<players.length-1?`1px solid ${D.border}`:"none" }}>
                  <Avatar name={pl.name} id={pl.id} size={30} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:600 }}>{pl.name}</div>
                    <div style={{ fontSize:11, color:D.textSub }}>HC {pl.hc}</div>
                  </div>
                  <span style={{ fontSize:10, padding:"3px 8px", borderRadius:8, fontWeight:700, background:b.bg, color:b.fg, marginRight:4 }}>{b.label}</span>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <button onClick={() => changeScore(i,-1)} style={{ width:36,height:36,borderRadius:"50%",border:`1px solid ${D.border}`,background:D.surface,color:D.text,cursor:"pointer",fontSize:22,display:"flex",alignItems:"center",justifyContent:"center" }}>−</button>
                    <div style={{ width:30, textAlign:"center", fontSize:20, fontWeight:900 }}>{disp}</div>
                    <button onClick={() => changeScore(i,1)} style={{ width:36,height:36,borderRadius:"50%",border:`1px solid ${D.gold}`,background:D.goldDim,color:D.gold,cursor:"pointer",fontSize:22,display:"flex",alignItems:"center",justifyContent:"center" }}>+</button>
                  </div>
                </div>
              );
            })}
          </Card>
        )}

        {tab==="marcas" && marcas[hole] && (
          <div>
            <Card>
              <SLabel>Marcas por jugador</SLabel>
              {players.map((pl, pi) => (
                <div key={pl.id} style={{ marginBottom:12, paddingBottom:12, borderBottom:pi<players.length-1?`1px solid ${D.border}`:"none" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                    <Avatar name={pl.name} id={pl.id} size={26} />
                    <div style={{ fontSize:13, fontWeight:600, flex:1 }}>{pl.name}</div>
                    {marcasPtsHole(pi)>0 && <div style={{ fontSize:12, fontWeight:700, color:D.gold, background:D.goldDim, padding:"2px 10px", borderRadius:10 }}>{marcasPtsHole(pi)} pts</div>}
                  </div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                    {MARCAS_MULTI.map(m => {
                      const cs = scores[pi][hole]===null?pars[hole]:scores[pi][hole];
                      const cp = pars[hole], diff=cs-cp, bogey=diff>=1;
                      const hasTP = tarjetas["threeput"]===pi;
                      const p3 = cp===3 && (m.key==="holeinone"||m.key==="birdie"||m.key==="eagle");
                      const p4 = cp===4 && (m.key==="eagle"||m.key==="birdie");
                      const p5 = cp===5 && (m.key==="eagle"||m.key==="birdie");
                      const isAuto = p3||p4||p5;
                      const isBogeyLock = bogey && (m.key==="sandy"||m.key==="holeout");
                      const isTPLock = hasTP && m.key==="sandy";
                      const isLocked = isAuto||isBogeyLock||isTPLock;
                      const lockReason = isTPLock?"3putt":isBogeyLock?"Bogey+":isAuto?"auto":null;
                      const isActive = marcas[hole].multi[pi][m.key];
                      return (
                        <div key={m.key} onClick={() => { if (!isLocked) toggleMultiMarca(pi,m.key); }}
                          style={{ display:"flex", alignItems:"center", gap:6, padding:"7px 12px", border:`1px solid ${isActive?D.gold:D.border}`, borderRadius:20, background:isActive?D.goldDim:"transparent", color:isActive?D.gold:isLocked?D.textDim:D.textSub, fontSize:12, fontWeight:600, cursor:isLocked?"default":"pointer", userSelect:"none", opacity:isLocked?0.4:1 }}>
                          {m.label} <span style={{ opacity:0.6 }}>({m.pts})</span>
                          {lockReason && <span style={{ fontSize:9, opacity:0.6 }}>🔒{lockReason}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </Card>
            <Card>
              <SLabel>Marcas exclusivas</SLabel>
              {pars[hole]===3 && (
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:13, fontWeight:700, marginBottom:8 }}>📍 O'Yes <span style={{ fontSize:11, color:D.textSub, fontWeight:400 }}>— más cerca 1er tiro · 1pt</span></div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                    {players.map((pl,pi) => <Pill key={pl.id} active={marcas[hole].oyes===pi} onClick={() => setExclusive("oyes",pi)}>{pl.name}</Pill>)}
                    <Pill active={marcas[hole].oyes===null} onClick={() => setExclusive("oyes",null)}>Ninguno</Pill>
                  </div>
                </div>
              )}
              {pars[hole]>=4 && (
                <div>
                  <div style={{ fontSize:13, fontWeight:700, marginBottom:8 }}>🎯 Regulation <span style={{ fontSize:11, color:D.textSub, fontWeight:400 }}>— más cerca {pars[hole]===4?"2do":"3er"} tiro · 1pt</span></div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                    {players.map((pl,pi) => <Pill key={pl.id} active={marcas[hole].regulation===pi} onClick={() => setExclusive("regulation",pi)}>{pl.name}</Pill>)}
                    <Pill active={marcas[hole].regulation===null} onClick={() => setExclusive("regulation",null)}>Ninguno</Pill>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}

        {tab==="tarjetas" && (
          <Card>
            <SLabel>Tarjetas — papa caliente 🃏</SLabel>
            <div style={{ fontSize:12, color:D.textSub, marginBottom:14 }}>Toca el nombre del jugador que cometió la falla.</div>
            {TARJETAS.map((tj, idx) => {
              const owner = tarjetas[tj.key];
              return (
                <div key={tj.key} style={{ marginBottom:14, paddingBottom:14, borderBottom:idx<TARJETAS.length-1?`1px solid ${D.border}`:"none" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                    <div style={{ fontSize:13, fontWeight:700, flex:1 }}>{tj.label}</div>
                    {tj.auto && <div style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:D.goldDim, color:D.gold, fontWeight:700 }}>AUTO</div>}
                    {owner!==null ? <div style={{ fontSize:11, padding:"3px 10px", borderRadius:10, background:D.redBg, color:D.danger, fontWeight:700 }}>🃏 {players[owner]?.name}</div> : <div style={{ fontSize:11, padding:"3px 10px", borderRadius:10, background:D.surface, color:D.textDim }}>Sin dueño</div>}
                  </div>
                  {tj.auto ? (
                    <div style={{ fontSize:11, color:D.textSub, fontStyle:"italic" }}>Se asigna automáticamente · Par3≥6, Par4≥8, Par5≥10</div>
                  ) : (
                    <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                      {players.map((pl,pi) => (
                        <div key={pl.id} onClick={() => assignTarjeta(tj.key,pi)} style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 12px", border:`1px solid ${owner===pi?D.danger:D.border}`, borderRadius:20, background:owner===pi?D.redBg:"transparent", color:owner===pi?D.danger:D.textSub, fontSize:12, fontWeight:600, cursor:"pointer", userSelect:"none" }}>
                          <Avatar name={pl.name} id={pl.id} size={18} />{pl.name}
                        </div>
                      ))}
                      {owner!==null && <Pill danger onClick={() => assignTarjeta(tj.key,null)}>✕ Quitar</Pill>}
                    </div>
                  )}
                </div>
              );
            })}
            <div style={{ marginTop:8, padding:"10px 12px", background:D.surface, borderRadius:10 }}>
              <div style={{ fontSize:10, color:D.gold, fontWeight:700, marginBottom:8, textTransform:"uppercase", letterSpacing:1 }}>Poseedores</div>
              {players.map((pl,pi) => {
                const mc = TARJETAS.filter(t => tarjetas[t.key]===pi);
                return (
                  <div key={pl.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 0", borderBottom:`1px solid ${D.border}` }}>
                    <Avatar name={pl.name} id={pl.id} size={22} />
                    <div style={{ flex:1, fontSize:13, fontWeight:600 }}>{pl.name}</div>
                    {mc.length>0 ? <div style={{ fontSize:12, color:D.danger, fontWeight:700 }}>{mc.length} tarjeta{mc.length>1?"s":""}</div> : <div style={{ fontSize:12, color:D.textDim }}>—</div>}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {tab==="tabla" && (
          <div style={{ overflowX:"auto", marginBottom:12 }}>
            <table style={{ borderCollapse:"collapse", width:"100%", fontSize:11, color:D.text }}>
              <thead>
                <tr style={{ background:D.surface }}>
                  <td style={{ padding:"8px 10px", fontWeight:700, color:D.gold, fontSize:10, textTransform:"uppercase", letterSpacing:1, position:"sticky", left:0, background:D.surface, borderBottom:`1px solid ${D.border}`, minWidth:70 }}>Jugador</td>
                  {pars.map((_,i) => <td key={i} style={{ padding:"6px 4px", textAlign:"center", fontWeight:700, color:D.textSub, borderBottom:`1px solid ${D.border}`, minWidth:28, fontSize:10 }}>{i+1}</td>)}
                  <td style={{ padding:"6px 8px", textAlign:"center", fontWeight:700, color:D.gold, borderBottom:`1px solid ${D.border}`, minWidth:36 }}>TOT</td>
                  <td style={{ padding:"6px 6px", textAlign:"center", fontWeight:700, color:D.textSub, borderBottom:`1px solid ${D.border}`, minWidth:30 }}>HC</td>
                  <td style={{ padding:"6px 8px", textAlign:"center", fontWeight:700, color:D.gold, borderBottom:`1px solid ${D.border}`, minWidth:36 }}>NET</td>
                </tr>
                <tr>
                  <td style={{ padding:"4px 10px", fontSize:10, color:D.textDim, position:"sticky", left:0, background:D.card, borderBottom:`1px solid ${D.border}` }}>PAR</td>
                  {pars.map((p,i) => <td key={i} style={{ padding:"4px 4px", textAlign:"center", fontSize:10, color:D.textSub, borderBottom:`1px solid ${D.border}` }}>{p}</td>)}
                  <td style={{ padding:"4px 8px", textAlign:"center", fontSize:10, color:D.textSub, borderBottom:`1px solid ${D.border}` }}>{pars.reduce((a,b)=>a+b,0)}</td>
                  <td style={{ borderBottom:`1px solid ${D.border}` }}></td>
                  <td style={{ borderBottom:`1px solid ${D.border}` }}></td>
                </tr>
              </thead>
              <tbody>
                {players.map((pl, pi) => {
                  const total = scores[pi].reduce((a,b)=>a+(b||0),0);
                  const net = total - pl.hc;
                  return (
                    <tr key={pl.id} style={{ borderBottom:`1px solid ${D.border}` }}>
                      <td style={{ padding:"8px 10px", position:"sticky", left:0, background:D.card, zIndex:1 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <Avatar name={pl.name} id={pl.id} size={22} />
                          <span style={{ fontSize:11, fontWeight:600, whiteSpace:"nowrap" }}>{pl.name}</span>
                        </div>
                      </td>
                      {pars.map((par, hi) => {
                        const s = scores[pi][hi];
                        if (s===null||s===undefined) return <td key={hi} style={{ textAlign:"center", padding:"6px 4px", color:D.textDim }}>·</td>;
                        const d = s-par;
                        let cb="transparent",cc=D.text,cbr="transparent",r=2;
                        if(d<=-2){cb="#D6E4F7";cc="#1A4A8A";cbr="#1A4A8A";r="50%";}
                        else if(d===-1){cb="#D4EDD8";cc="#1A5C24";cbr="#1A5C24";r=4;}
                        else if(d===1){cc="#8A4A00";cbr="#E8A050";}
                        else if(d>=2){cc=D.danger;cbr=D.danger;}
                        return <td key={hi} style={{ textAlign:"center", padding:"4px 2px" }}><div style={{ width:24,height:24,borderRadius:r,border:`1.5px solid ${cbr}`,background:cb,color:cc,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,margin:"0 auto" }}>{s}</div></td>;
                      })}
                      <td style={{ textAlign:"center", padding:"6px 8px", fontWeight:700, fontSize:12 }}>{total||"—"}</td>
                      <td style={{ textAlign:"center", padding:"6px 6px", fontSize:11, color:D.textSub }}>{pl.hc}</td>
                      <td style={{ textAlign:"center", padding:"6px 8px", fontWeight:900, fontSize:12, color:D.gold }}>{net||"—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <Card>
          <SLabel>Marcador en vivo</SLabel>
          {players.map((p,i)=>({name:p.name,id:p.id,net:liveNets[i]})).sort((a,b)=>a.net-b.net).map((p,pos) => (
            <div key={p.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 0", borderBottom:pos<players.length-1?`1px solid ${D.border}`:"none" }}>
              <div style={{ width:20, fontSize:12, color:pos===0?D.gold:D.textSub, fontWeight:700 }}>{pos+1}</div>
              <Avatar name={p.name} id={p.id} size={26} />
              <div style={{ flex:1, fontSize:13, fontWeight:600 }}>{p.name}</div>
              <div style={{ fontSize:13, fontWeight:700, color:pos===0?D.gold:D.textSub }}>{p.net} neto</div>
            </div>
          ))}
        </Card>

        {rondaId && (
          <div style={{ textAlign:"center", marginBottom:8 }}>
            <button onClick={shareRonda} style={{ padding:"10px 24px", border:`1px solid ${D.gold}`, borderRadius:20, background:D.goldDim, color:D.gold, fontSize:13, fontWeight:700, cursor:"pointer" }}>📤 Compartir ronda en vivo</button>
            {shareMsg && <div style={{ color:D.success, fontSize:12, marginTop:6, fontWeight:600 }}>{shareMsg}</div>}
            <div style={{ color:D.textSub, fontSize:11, marginTop:4 }}>Código: <span style={{ color:D.gold, fontWeight:700 }}>{rondaId}</span></div>
          </div>
        )}

        {hole===nHoles-1 && <Btn onClick={finish}>Ver resultados finales 🏆</Btn>
    </div>
  </div>
  </div>
  );

  // ── RESULTADOS ──
  if (screen==="res" && results) {
    const { nets, fi, si, pot, money, hcUpdates, marcasMoney, marcasPts, tarjetasMoney, tarjetasCount, fullScores } = results;
    const ranked = players.map((p,i) => ({
      ...p, net:nets[i], scoreMoney:money[i], marcasMoney:marcasMoney[i],
      tarjetasMoney:tarjetasMoney[i], total:money[i]+marcasMoney[i]+tarjetasMoney[i],
      pts:marcasPts[i], cards:tarjetasCount[i], bruto:fullScores[i].reduce((a,b)=>a+b,0)
    })).sort((a,b)=>a.net-b.net);
    const fn = fi.map(i=>players[i].name).join(" · ");
    const fp = money[fi[0]];
    const nn = players.length;

    return (
      <div style={appSt}>
        <div style={{ background:`linear-gradient(135deg,#FDF8EE,#F5EDD0)`, borderBottom:`1px solid ${D.gold}44`, padding:"28px 16px", textAlign:"center", marginBottom:16 }}>
          <div style={{ fontSize:36, marginBottom:8 }}>🏆</div>
          <div style={{ fontSize:11, color:D.gold, letterSpacing:2, textTransform:"uppercase", marginBottom:6 }}>1er Lugar · Score</div>
          <div style={{ fontSize:24, fontWeight:900, color:D.text, marginBottom:4 }}>{fn}</div>
          <div style={{ fontSize:13, color:D.textSub, marginBottom:12 }}>{nets[fi[0]]} golpes netos{fi.length>1?" · Premio dividido":""}</div>
          <div style={{ fontSize:32, fontWeight:900, color:D.gold }}>+${fp}.00{fi.length>1?" c/u":""}</div>
        </div>
        {nn>=10 && fi.length===1 && si.length>0 && (
          <div style={{ background:D.surface, border:`1px solid ${D.border}`, margin:"0 12px 12px", borderRadius:16, padding:20, textAlign:"center" }}>
            <div style={{ fontSize:11, color:D.textSub, textTransform:"uppercase", letterSpacing:1, marginBottom:4 }}>🥈 2do Lugar</div>
            <div style={{ fontSize:20, fontWeight:700, marginBottom:4 }}>{si.map(i=>players[i].name).join(" · ")}</div>
            <div style={{ fontSize:22, fontWeight:700, color:D.gold }}>+${money[si[0]]}.00{si.length>1?" c/u":""}</div>
          </div>
        )}
        <div style={{ padding:"0 12px" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <div style={{ fontSize:10, fontWeight:700, color:D.gold, textTransform:"uppercase", letterSpacing:2 }}>Clasificación final</div>
            <button onClick={() => setShowTabla(s=>!s)} style={{ padding:"5px 12px", border:`1px solid ${showTabla?D.gold:D.border}`, borderRadius:20, background:showTabla?D.goldDim:"transparent", color:showTabla?D.gold:D.textSub, fontSize:11, fontWeight:700, cursor:"pointer" }}>
              {showTabla ? "📊 Desglose" : "📋 Tabla"}
            </button>
          </div>

          {showTabla && (
            <div style={{ overflowX:"auto", marginBottom:12 }}>
              <table style={{ borderCollapse:"collapse", width:"100%", fontSize:11, color:D.text }}>
                <thead>
                  <tr style={{ background:D.surface }}>
                    <td style={{ padding:"8px 10px", fontWeight:700, color:D.gold, fontSize:10, position:"sticky", left:0, background:D.surface, borderBottom:`1px solid ${D.border}`, minWidth:80 }}>#</td>
                    {fullScores[0].map((_,hi) => <td key={hi} style={{ padding:"6px 4px", textAlign:"center", fontWeight:700, color:D.textSub, borderBottom:`1px solid ${D.border}`, minWidth:28, fontSize:10 }}>{hi+1}</td>)}
                    <td style={{ padding:"6px 6px", textAlign:"center", fontWeight:700, color:D.gold, borderBottom:`1px solid ${D.border}`, minWidth:36 }}>TOT</td>
                    <td style={{ padding:"6px 4px", textAlign:"center", fontWeight:700, color:D.textSub, borderBottom:`1px solid ${D.border}`, minWidth:28 }}>HC</td>
                    <td style={{ padding:"6px 6px", textAlign:"center", fontWeight:700, color:D.gold, borderBottom:`1px solid ${D.border}`, minWidth:36 }}>NET</td>
                    <td style={{ padding:"6px 4px", textAlign:"center", fontWeight:700, color:"#1A5C24", borderBottom:`1px solid ${D.border}`, minWidth:34, borderLeft:`1px solid ${D.border}` }}>MK pts</td>
                    <td style={{ padding:"6px 4px", textAlign:"center", fontWeight:700, color:"#1A5C24", borderBottom:`1px solid ${D.border}`, minWidth:44 }}>MK $</td>
                    <td style={{ padding:"6px 4px", textAlign:"center", fontWeight:700, color:D.danger, borderBottom:`1px solid ${D.border}`, minWidth:44, borderLeft:`1px solid ${D.border}` }}>TARJ $</td>
                    <td style={{ padding:"6px 6px", textAlign:"center", fontWeight:700, color:D.gold, borderBottom:`1px solid ${D.border}`, minWidth:56, borderLeft:`1px solid ${D.border}` }}>TOTAL $</td>
                  </tr>
                  <tr>
                    <td style={{ padding:"4px 10px", fontSize:10, color:D.textDim, position:"sticky", left:0, background:D.card, borderBottom:`1px solid ${D.border}` }}>PAR</td>
                    {pars.map((p,i) => <td key={i} style={{ padding:"4px 4px", textAlign:"center", fontSize:10, color:D.textSub, borderBottom:`1px solid ${D.border}` }}>{p}</td>)}
                    <td style={{ padding:"4px 6px", textAlign:"center", fontSize:10, color:D.textSub, borderBottom:`1px solid ${D.border}` }}>{pars.reduce((a,b)=>a+b,0)}</td>
                    <td style={{ borderBottom:`1px solid ${D.border}` }}></td><td style={{ borderBottom:`1px solid ${D.border}` }}></td>
                    <td style={{ borderBottom:`1px solid ${D.border}`, borderLeft:`1px solid ${D.border}` }}></td><td style={{ borderBottom:`1px solid ${D.border}` }}></td>
                    <td style={{ borderBottom:`1px solid ${D.border}`, borderLeft:`1px solid ${D.border}` }}></td>
                    <td style={{ borderBottom:`1px solid ${D.border}`, borderLeft:`1px solid ${D.border}` }}></td>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((p, pos) => {
                    const pi = players.findIndex(pl=>pl.id===p.id);
                    return (
                      <tr key={p.id} style={{ borderBottom:`1px solid ${D.border}`, background:pos===0?D.goldDim:D.card }}>
                        <td style={{ padding:"8px 10px", position:"sticky", left:0, background:pos===0?D.goldDim:D.card, zIndex:1 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                            <span style={{ fontSize:12, fontWeight:700, color:pos===0?D.gold:D.textSub }}>{pos+1}</span>
                            <Avatar name={p.name} id={p.id} size={20} />
                            <span style={{ fontSize:10, fontWeight:600, whiteSpace:"nowrap" }}>{p.name}</span>
                          </div>
                        </td>
                        {fullScores[pi].map((s,hi) => {
                          const par2=pars[hi], d=s-par2;
                          let cb="transparent",cc=D.text,cbr="transparent",r=2;
                          if(d<=-2){cb="#D6E4F7";cc="#1A4A8A";cbr="#1A4A8A";r="50%";}
                          else if(d===-1){cb="#D4EDD8";cc="#1A5C24";cbr="#1A5C24";r=4;}
                          else if(d===1){cc="#8A4A00";cbr="#E8A050";}
                          else if(d>=2){cc=D.danger;cbr=D.danger;}
                          return <td key={hi} style={{ textAlign:"center", padding:"4px 2px" }}><div style={{ width:22,height:22,borderRadius:r,border:`1.5px solid ${cbr}`,background:cb,color:cc,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,margin:"0 auto" }}>{s}</div></td>;
                        })}
                        <td style={{ textAlign:"center", padding:"6px 6px", fontWeight:700, fontSize:12 }}>{p.bruto}</td>
                        <td style={{ textAlign:"center", padding:"6px 4px", fontSize:11, color:D.textSub }}>{p.hc}</td>
                        <td style={{ textAlign:"center", padding:"6px 6px", fontWeight:900, fontSize:12, color:D.gold }}>{p.net}</td>
                        <td style={{ textAlign:"center", padding:"6px 4px", fontWeight:700, fontSize:11, color:"#1A5C24", borderLeft:`1px solid ${D.border}` }}>{p.pts}</td>
                        <td style={{ textAlign:"center", padding:"6px 4px", fontWeight:700, fontSize:11, color:fmtC(p.marcasMoney) }}>{fmt(p.marcasMoney)}</td>
                        <td style={{ textAlign:"center", padding:"6px 4px", fontWeight:700, fontSize:11, color:fmtC(p.tarjetasMoney), borderLeft:`1px solid ${D.border}` }}>{fmt(p.tarjetasMoney)}</td>
                        <td style={{ textAlign:"center", padding:"6px 6px", fontWeight:900, fontSize:12, color:fmtC(p.total), borderLeft:`1px solid ${D.border}` }}>{fmt(p.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!showTabla && ranked.map((p, pos) => (
            <Card key={p.id} style={{ borderColor:pos===0?`${D.gold}66`:D.border }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12, paddingBottom:12, borderBottom:`1px solid ${D.border}` }}>
                <div style={{ width:26,height:26,borderRadius:"50%",background:pos===0?D.goldDim:D.surface,border:`1px solid ${pos===0?D.gold:D.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:900,color:pos===0?D.gold:D.textSub }}>{pos+1}</div>
                <Avatar name={p.name} id={p.id} size={36} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:15, fontWeight:700 }}>{p.name}</div>
                  <div style={{ fontSize:11, color:D.textSub }}>HC {p.hc} · {p.net} golpes netos</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:20, fontWeight:900, color:fmtC(p.total) }}>{fmt(p.total)}</div>
                  <div style={{ fontSize:10, color:D.textSub, textTransform:"uppercase", letterSpacing:1 }}>Total</div>
                </div>
              </div>
              {[
                {icon:"📊",label:"Score",sub:`${p.bruto} bruto · HC ${p.hc} · ${p.net} neto`,val:p.scoreMoney},
                {icon:"⭐",label:"Marcas",sub:`${p.pts} puntos · $${marcaVal} por punto`,val:p.marcasMoney},
                {icon:"🃏",label:"Tarjetas",sub:`${p.cards} tarjeta${p.cards!==1?"s":""} · $${tarjetaVal} por tarjeta`,val:p.tarjetasMoney},
              ].map((row, i, arr) => (
                <div key={row.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:i<arr.length-1?`1px solid ${D.border}`:"none" }}>
                  <div>
                    <div style={{ fontSize:12, fontWeight:700, marginBottom:2 }}>{row.icon} {row.label}</div>
                    <div style={{ fontSize:11, color:D.textSub }}>{row.sub}</div>
                  </div>
                  <div style={{ fontSize:15, fontWeight:700, color:fmtC(row.val) }}>{fmt(row.val)}</div>
                </div>
              ))}
            </Card>
          ))}

          <Card>
            <SLabel>Resumen de marcas</SLabel>
            {players.map((pl, pi) => {
              const myMarcas = [];
              marcas.forEach((hd, hi) => {
                MARCAS_MULTI.forEach(m => { if (hd.multi[pi][m.key]) myMarcas.push({hoyo:hi+1,label:m.label,pts:m.pts}); });
                if (hd.oyes===pi) myMarcas.push({hoyo:hi+1,label:"📍 O'Yes",pts:1});
                if (hd.regulation===pi) myMarcas.push({hoyo:hi+1,label:"🎯 Regulation",pts:1});
              });
              return (
                <div key={pl.id} style={{ padding:"10px 0", borderBottom:pi<players.length-1?`1px solid ${D.border}`:"none" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:myMarcas.length>0?8:0 }}>
                    <Avatar name={pl.name} id={pl.id} size={28} />
                    <div style={{ flex:1, fontSize:13, fontWeight:600 }}>{pl.name}</div>
                    <div style={{ fontSize:12, color:D.textSub, marginRight:8 }}>{marcasPts[pi]} pts</div>
                    <div style={{ fontSize:13, fontWeight:700, color:fmtC(marcasMoney[pi]) }}>{fmt(marcasMoney[pi])}</div>
                  </div>
                  {myMarcas.length>0 ? (
                    <div style={{ paddingLeft:36, display:"flex", flexWrap:"wrap", gap:6 }}>
                      {myMarcas.map((m,i) => (
                        <div key={i} style={{ display:"flex", alignItems:"center", gap:4, padding:"3px 8px", background:D.surface, border:`1px solid ${D.border}`, borderRadius:12, fontSize:11 }}>
                          <span>{m.label}</span><span style={{ color:D.textSub }}>H{m.hoyo}</span><span style={{ color:D.gold, fontWeight:700 }}>+{m.pts}pt</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ paddingLeft:36, fontSize:11, color:D.textDim }}>Sin marcas</div>
                  )}
                </div>
              );
            })}
          </Card>

          <Card>
            <SLabel>Resumen de tarjetas</SLabel>
            {TARJETAS.map((tj, idx) => {
              const owner = tarjetas[tj.key];
              return (
                <div key={tj.key} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 0", borderBottom:idx<TARJETAS.length-1?`1px solid ${D.border}`:"none" }}>
                  <div style={{ flex:1, fontSize:13 }}>{tj.label}</div>
                  {owner!==null ? (
                    <><Avatar name={players[owner].name} id={players[owner].id} size={22} /><div style={{ fontSize:13, fontWeight:700, color:D.danger, marginLeft:4 }}>{players[owner].name}</div></>
                  ) : (
                    <div style={{ fontSize:12, color:D.textDim }}>Sin dueño</div>
                  )}
                </div>
              );
            })}
          </Card>

          <Card>
            <SLabel>Ajuste de handicaps</SLabel>
            {hcUpdates.map((u, i) => {
              const up=u.delta>0, dn=u.delta<0;
              return (
                <div key={u.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 0", borderBottom:i<hcUpdates.length-1?`1px solid ${D.border}`:"none" }}>
                  <Avatar name={u.name} id={u.id} size={30} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:600 }}>{u.name}</div>
                    <div style={{ fontSize:11, color:D.textSub }}>HC {u.before}</div>
                  </div>
                  <div style={{ fontSize:12, padding:"3px 10px", borderRadius:10, fontWeight:700, background:up?D.redBg:dn?D.greenBg:D.surface, color:up?D.danger:dn?D.success:D.textSub, border:`1px solid ${up?D.danger+"44":dn?D.success+"44":D.border}` }}>
                    {up?`+${u.delta} → HC ${u.after}`:dn?`${u.delta} → HC ${u.after}`:"Sin cambio"}
                  </div>
                </div>
              );
            })}
          </Card>

          <Card>
            <SLabel>Resumen de apuesta</SLabel>
            {[
              ["Apuesta score por jugador", `$${apuesta}.00`],
              ["Jugadores", nn],
              ["Pozo score total", `$${pot}.00`],
              ...(nn>=10&&fi.length===1?[["1er lugar (60%)",`$${Math.round(pot*0.6)}.00`],["2do lugar (40%)",`$${Math.round(pot*0.4)}.00`]]:[["1er lugar (100%)",`$${pot}.00`]]),
              ["Premio 1er lugar c/u", `$${fp}.00`],
              ["Marcas", `$${marcaVal} por punto`],
              ["Tarjetas", `$${tarjetaVal} por tarjeta`],
            ].map(([k,v], i) => (
              <div key={i} style={{ display:"flex", justifyContent:"space-between", fontSize:13, padding:"5px 0", borderBottom:`1px solid ${D.border}` }}>
                <span style={{ color:D.textSub }}>{k}</span>
                <span style={{ fontWeight:700, color:D.gold }}>{v}</span>
              </div>
            ))}
          </Card>

          <Btn onClick={confirmHC}>Confirmar y guardar handicaps</Btn>
          <Btn outline onClick={() => { setSel(new Set()); setScreen("sel"); }} style={{ marginTop:8 }}>Nueva ronda sin guardar</Btn>
        </div>
      </div>
    );
  }

  return null;
}
