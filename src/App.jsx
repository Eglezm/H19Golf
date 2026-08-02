import { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, onValue, remove, get } from "firebase/database";

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

// Campos personalizados guardados en localStorage
const getCamposCustom = () => { try { return JSON.parse(localStorage.getItem("h19-campos-custom")||"{}"); } catch(e) { return {}; } };
const saveCamposCustom = (c) => { try { localStorage.setItem("h19-campos-custom", JSON.stringify(c)); } catch(e) {} };

const CAMPOS = {
  huerta:    { nombre: "Club de Golf La Huerta",   pares: [4,3,3,3,3,4,3,3,3,4,3,3,3,3,4,3,3,3],
    greens: [
      {lat:19.0601039, lng:-98.3301499}, {lat:19.0598427, lng:-98.3300061}, {lat:19.058892, lng:-98.3300967},
      {lat:19.058652, lng:-98.3307404}, {lat:19.0596076, lng:-98.3300105}, {lat:19.0585069, lng:-98.3313680},
      {lat:19.059541, lng:-98.3316322}, {lat:19.0597324, lng:-98.3309748}, {lat:19.0588899, lng:-98.3317317},
    ],
    waypoints: {
      5: { label:"La Vista", lat:19.0583248, lng:-98.33006978 },
    } },
  lavista:   { nombre: "La Vista Country Club",              pares: [4,3,4,5,4,4,3,4,5,5,4,3,4,4,5,4,3,4] },
  campestre: { nombre: "Club Campestre de Puebla",           pares: [4,3,5,4,4,4,4,3,5,4,4,5,3,4,5,4,3,4] },
  soltepec:  { nombre: "Club de Golf Hacienda Soltepec",     pares: [4,4,5,3,5,3,4,4,3,4,4,5,3,5,3,4,4,3] },
  elcristo:  { nombre: "El Cristo Golf & Country Club",      pares: [5,3,4,4,4,4,3,4,5,5,3,4,4,4,5,4,3,4] },
  cuernavaca:{ nombre: "Club de Golf de Cuernavaca",         pares: [4,4,5,4,3,4,3,4,4,4,4,5,4,3,4,3,4,4] },
  xalapa:    { nombre: "Club de Golf Xalapa",                pares: [4,4,5,4,5,3,4,4,3,4,3,4,5,3,4,5,3,4] },
  otro:      { nombre: "Otro campo",                         pares: null },
};

// Distancia en yardas entre 2 coordenadas GPS (fórmula de Haversine)
function distanciaYardas(lat1, lng1, lat2, lng2) {
  const R = 6371000; // radio de la Tierra en metros
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const metros = R * c;
  return Math.round(metros * 1.09361); // metros a yardas
}

// Obtiene el waypoint (punto intermedio/dogleg) para un hoyo dado, si existe
function getWaypoint(campo, holeIndex) {
  const c = CAMPOS[campo];
  if (!c || !c.waypoints) return null;
  const idx = holeIndex % 9;
  return c.waypoints[idx] || null;
}

// Obtiene la coordenada del green para un hoyo dado, considerando que en 18 hoyos se repite el recorrido de 9
function getGreenCoord(campo, holeIndex) {
  const c = CAMPOS[campo];
  if (!c || !c.greens) return null;
  const idx = holeIndex % c.greens.length;
  return c.greens[idx] || null;
}

const MARCAS_MULTI = [
  { key: "holeinone", label: "🎯 Hole in One", pts: 10 },
  { key: "eagle",     label: "🦅 Eagle",       pts: 3  },
  { key: "birdie",    label: "🐦 Birdie",      pts: 2  },
  { key: "holeout",   label: "🕳️ Hole out",   pts: 1  },
  { key: "sandy",     label: "🏖️ Sandy par",  pts: 2  },
];

const TARJETAS = [
  { key: "ob",        label: "🚫 Out of Bound", auto: false },
  { key: "water",     label: "💧 Water",         auto: false },
  { key: "sand",      label: "⛱️ Sand",          auto: false },
  { key: "sapo",      label: "🐸 Sapo",          auto: false },
  { key: "arbol",     label: "🌳 Árbol",         auto: false },
  { key: "threeput",  label: "🔄 Three putt",    auto: false },
  { key: "doblepar",  label: "🔻 MP del Hoyo", auto: true  },
  { key: "peorscore", label: "🪣 MP General",    auto: true  },
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

const col = (id) => {
  let n = typeof id === "number" ? id : String(id).split("").reduce((a,c) => a + c.charCodeAt(0), 0);
  return COLORS[Math.abs(n) % COLORS.length];
};
const fmt = (n) => n >= 0 ? `+$${n}` : `-$${Math.abs(n)}`;
const fmtC = (n) => n >= 0 ? D.success : D.danger;

const emptyMarca = (n) => ({
  multi: Array(n).fill(null).map(() => ({ holeinone:false, eagle:false, birdie:false, holeout:false, sandy:false })),
  oyes: null, regulation: null,
});
const emptyTarjetas = () => { const t = {}; TARJETAS.forEach(tj => { t[tj.key] = null; }); t["threeput_hole"] = null; t["doblepar_hole"] = null; return t; };

// Firebase convierte arrays a objetos — normalizar al leer
const normalizeTarjetas = (t) => {
  if (!t) return emptyTarjetas();
  const result = { ...emptyTarjetas(), ...t };
  // peorscore puede ser un array serializado como objeto {0:0, 1:1}
  if (result.peorscore !== null && result.peorscore !== undefined && !Array.isArray(result.peorscore) && typeof result.peorscore === 'object') {
    result.peorscore = Object.values(result.peorscore);
  }
  return result;
};

function Avatar({ name, id, size = 32 }) {
  const c = col(id);
  const nameStr = String(name || '?');
  return (
    <div style={{ width:size, height:size, borderRadius:"50%", background:c.bg, color:c.fg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:size*0.34, fontWeight:700, flexShrink:0, border:`1px solid ${c.fg}33` }}>
      {nameStr.substring(0,2).toUpperCase()}
    </div>
  );
}

// ─── SELECTOR DE CAMPO ────────────────────────────────
function CampoSelector({ campo, setCampo, nHoles, setNHoles }) {
  const [camposCustom, setCamposCustom] = useState(getCamposCustom);
  const [addingCampo, setAddingCampo] = useState(false);
  const [newNombre, setNewNombre] = useState("");
  const [newPares, setNewPares] = useState(Array(18).fill(4));
  const [newHoles, setNewHoles] = useState(18);

  const todosLosCampos = { ...CAMPOS };
  Object.entries(camposCustom).forEach(([k,v]) => { todosLosCampos[k] = v; });

  const guardarCampo = () => {
    if (!newNombre.trim()) return;
    const key = "custom_" + newNombre.trim().toLowerCase().replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,"");
    const pares = newPares.slice(0, newHoles);
    const nuevo = { ...camposCustom, [key]: { nombre: newNombre.trim(), pares, custom: true } };
    saveCamposCustom(nuevo);
    setCamposCustom(nuevo);
    setCampo(key);
    if (setNHoles) setNHoles(newHoles);
    setAddingCampo(false);
    setNewNombre("");
    setNewPares(Array(18).fill(4));
  };

  const eliminarCampo = (key, e) => {
    e.stopPropagation();
    const nuevo = { ...camposCustom };
    delete nuevo[key];
    saveCamposCustom(nuevo);
    setCamposCustom(nuevo);
    if (campo === key) setCampo("otro");
  };

  if (addingCampo) {
    const parTotal = newPares.slice(0, newHoles).reduce((a,b)=>a+b,0);
    return (
      <div>
        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
          <button onClick={() => setAddingCampo(false)} style={{ fontSize:12, color:D.textSub, background:"none", border:`1px solid ${D.border}`, borderRadius:8, padding:"5px 10px", cursor:"pointer" }}>Volver</button>
          <div style={{ fontSize:14, fontWeight:700, color:D.gold }}>Nuevo campo</div>
        </div>
        <input value={newNombre} onChange={e=>setNewNombre(e.target.value)} placeholder="Nombre del club"
          style={{ width:"100%", padding:"10px 12px", border:`1px solid ${D.border}`, borderRadius:10, background:D.surface, color:D.text, fontSize:14, marginBottom:12, boxSizing:"border-box" }} />
        <div style={{ display:"flex", gap:8, marginBottom:12 }}>
          {[9,18].map(h => (
            <button key={h} onClick={() => setNewHoles(h)} style={{ flex:1, padding:9, border:`1px solid ${newHoles===h?D.gold:D.border}`, borderRadius:10, background:newHoles===h?D.goldDim:"transparent", color:newHoles===h?D.gold:D.textSub, fontSize:13, fontWeight:700, cursor:"pointer" }}>
              {h} hoyos
            </button>
          ))}
        </div>
        <div style={{ marginBottom:8, fontSize:12, color:D.textSub }}>Par por hoyo: <span style={{ color:D.gold, fontWeight:700 }}>Total: {parTotal}</span></div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(9, 1fr)", gap:4, marginBottom:16 }}>
          {Array(newHoles).fill(0).map((_, h) => (
            <div key={h} style={{ textAlign:"center" }}>
              <div style={{ fontSize:10, color:D.textDim, marginBottom:2 }}>{h+1}</div>
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
                <button onClick={() => setNewPares(p => p.map((v,i)=>i===h?Math.min(6,v+1):v))}
                  style={{ width:28, height:20, border:`1px solid ${D.border}`, borderRadius:4, background:D.surface, color:D.gold, fontSize:12, cursor:"pointer", padding:0 }}>+</button>
                <div style={{ fontSize:14, fontWeight:700, color:D.text }}>{newPares[h]}</div>
                <button onClick={() => setNewPares(p => p.map((v,i)=>i===h?Math.max(3,v-1):v))}
                  style={{ width:28, height:20, border:`1px solid ${D.border}`, borderRadius:4, background:D.surface, color:D.textSub, fontSize:12, cursor:"pointer", padding:0 }}>-</button>
              </div>
            </div>
          ))}
        </div>
        <button onClick={guardarCampo} disabled={!newNombre.trim()}
          style={{ width:"100%", padding:"12px", border:"none", borderRadius:10, background:newNombre.trim()?D.gold:"#555", color:"#000", fontSize:14, fontWeight:700, cursor:newNombre.trim()?"pointer":"default" }}>
          ✓ Guardar campo
        </button>
      </div>
    );
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
      {Object.entries(todosLosCampos).map(([key, c]) => (
        <div key={key} style={{ display:"flex", alignItems:"center", gap:6 }}>
          <button onClick={() => setCampo(key)} style={{ flex:1, padding:"10px 14px", border:`1px solid ${campo===key?D.gold:D.border}`, borderRadius:10, background:campo===key?D.goldDim:"transparent", color:campo===key?D.gold:D.textSub, fontSize:13, fontWeight:700, cursor:"pointer", textAlign:"left" }}>
            {campo===key?"✓ ":""}{c.nombre}
            {c.custom && <span style={{ fontSize:10, color:D.textDim, marginLeft:6 }}>personalizado</span>}
          </button>
          {c.custom && (
            <button onClick={(e) => eliminarCampo(key, e)} style={{ padding:"8px 10px", border:`1px solid ${D.danger}44`, borderRadius:8, background:"transparent", color:D.danger, fontSize:11, cursor:"pointer", flexShrink:0 }}>🗑️</button>
          )}
        </div>
      ))}
      <button onClick={() => setAddingCampo(true)} style={{ width:"100%", padding:"10px 14px", border:`1px dashed ${D.gold}`, borderRadius:10, background:"transparent", color:D.gold, fontSize:13, fontWeight:600, cursor:"pointer", textAlign:"left" }}>
        ➕ Agregar campo personalizado
      </button>
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

// Notación tradicional de golf
function ScoreCell({ s, par, size = 24 }) {
  if (s === null || s === undefined) return (
    <div style={{ width:size, height:size, display:"flex", alignItems:"center", justifyContent:"center", fontSize:size*0.45, color:D.textDim, margin:"0 auto" }}>—</div>
  );
  const d = s - par;
  const fs = Math.round(size * 0.46);
  const base = { width:size, height:size, display:"flex", alignItems:"center", justifyContent:"center", fontSize:fs, fontWeight:700, margin:"0 auto", position:"relative", boxSizing:"border-box", background:"transparent" };

  if (d <= -2) {
    // Eagle o mejor: doble círculo, línea dorada
    return (
      <div style={{ ...base, borderRadius:"50%", border:`1.5px solid ${D.gold}`, outline:`1.5px solid ${D.gold}`, outlineOffset:"2px", color:D.gold }}>{s}</div>
    );
  }
  if (d === -1) {
    // Birdie: círculo, línea verde
    return (
      <div style={{ ...base, borderRadius:"50%", border:`1.5px solid #1A5C24`, color:"#1A5C24" }}>{s}</div>
    );
  }
  if (d === 0) {
    // Par: número solo, sin adorno
    return (
      <div style={{ ...base, color:D.text }}>{s}</div>
    );
  }
  if (d === 1) {
    // Bogey: cuadro, línea naranja
    return (
      <div style={{ ...base, border:`1.5px solid #C87A30`, color:"#8A4A00" }}>{s}</div>
    );
  }
  if (d === 2) {
    // Doble bogey: doble cuadro, línea roja
    return (
      <div style={{ ...base, border:`1.5px solid #C62828`, outline:`1.5px solid #C62828`, outlineOffset:"2px", color:"#C62828" }}>{s}</div>
    );
  }
  // Triple bogey o peor: doble cuadro, línea rojo oscuro
  return (
    <div style={{ ...base, border:`1.5px solid #7B0000`, outline:`1.5px solid #7B0000`, outlineOffset:"2px", color:"#7B0000", fontWeight:900 }}>{s}</div>
  );
}

// Leyenda de notación de golf
function ScoreLegend() {
  const items = [
    { d:-2, label:"Eagle", s:2, par:4 },
    { d:-1, label:"Birdie", s:3, par:4 },
    { d:0,  label:"Par",    s:4, par:4 },
    { d:1,  label:"Bogey",  s:5, par:4 },
    { d:2,  label:"Doble",  s:6, par:4 },
    { d:3,  label:"Triple+",s:7, par:4 },
  ];
  return (
    <div style={{ display:"flex", flexWrap:"wrap", gap:8, justifyContent:"center", padding:"10px 0 4px", borderTop:`1px solid ${D.border}`, marginTop:8 }}>
      {items.map(it => (
        <div key={it.label} style={{ display:"flex", alignItems:"center", gap:4 }}>
          <ScoreCell s={it.s} par={it.par} size={20} />
          <span style={{ fontSize:9, color:D.textSub }}>{it.label}</span>
        </div>
      ))}
    </div>
  );
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

function calcMarcasResumen(players, marcas) {
  // Devuelve lista de eventos: { hole, label, playerName }, excluyendo jugadores que no participan en Marcas
  const playsMarcas = (p) => p ? (p.opts ? p.opts.marcas !== false : true) : false;
  const eventos = [];
  marcas.forEach((h, hi) => {
    MARCAS_MULTI.forEach(m => {
      players.forEach((p, pi) => {
        if (h.multi[pi]?.[m.key] && playsMarcas(p)) eventos.push({ hole:hi+1, label:m.label, playerName:p.name });
      });
    });
    if (h.oyes !== null && h.oyes !== undefined && playsMarcas(players[h.oyes])) eventos.push({ hole:hi+1, label:"⛳ O'Yes", playerName:players[h.oyes]?.name||"—" });
    if (h.regulation !== null && h.regulation !== undefined && playsMarcas(players[h.regulation])) eventos.push({ hole:hi+1, label:"✅ Regulation", playerName:players[h.regulation]?.name||"—" });
  });
  return eventos.sort((a,b) => a.hole - b.hole);
}

function calcMarcasMoney(players, marcas, marcaVal) {
  const pts = calcMarcasPts(players, marcas);
  const playsMarcas = players.map(p => p.opts ? p.opts.marcas !== false : true);
  return players.map((_, i) => {
    if (!playsMarcas[i]) return 0;
    let b = 0;
    players.forEach((_, j) => {
      if (i !== j && playsMarcas[j]) { b += pts[i]*marcaVal; b -= pts[j]*marcaVal; }
    });
    return b;
  });
}

function calcTarjetasMoney(players, tarjetas, tarjetaVal) {
  // count: cuántas tarjetas tiene cada jugador (incluyendo peorscore que puede ser array)
  const count = players.map((_, i) => {
    let c = 0;
    TARJETAS.forEach(t => {
      const owner = tarjetas[t.key];
      if (Array.isArray(owner)) {
        // Si hay empate (peorscore), se divide la tarjeta entre los empatados
        if (owner.includes(i)) c += 1 / owner.length;
      } else if (owner === i) c += 1;
    });
    return c;
  });
  const playsTarjetas = players.map(p => p.opts ? p.opts.tarjetas !== false : true);
  return players.map((_, i) => {
    if (!playsTarjetas[i]) return 0;
    let b = 0;
    players.forEach((_, j) => {
      if (i !== j && playsTarjetas[j]) { b -= count[i]*tarjetaVal; b += count[j]*tarjetaVal; }
    });
    return Math.round(b);
  });
}

function calcMoney(players, scores, apuesta, extraPot = 0) {
  const playsScore = players.map(p => p.opts ? p.opts.score !== false : true);
  const idxIn = players.map((_, i) => i).filter(i => playsScore[i]);
  const n = idxIn.length;
  const nets = players.map((p, i) => scores[i].reduce((a, b) => a+b, 0) - p.hc);
  if (n < 2) {
    return { nets, fi:[], si:[], pot:0, money: players.map(() => 0) };
  }
  // El pozo incluye la apuesta de los abandonados con castigo
  const pot = apuesta * n + extraPot;
  const netsIn = idxIn.map(i => nets[i]);
  const uniq = [...new Set(netsIn)].sort((a, b) => a-b);
  const f = uniq[0], s = uniq[1];
  const fi = idxIn.filter(i => nets[i] === f);
  const si = s !== undefined ? idxIn.filter(i => nets[i] === s) : [];
  const loserIdxs = idxIn.filter(i => nets[i] !== f);
  // Perdedores activos + pozo extra de abandonados
  const totalFromLosers = apuesta * loserIdxs.length + extraPot;
  return { nets, fi, si, pot, money: players.map((_, i) => {
    if (!playsScore[i]) return 0;
    if (n <= 9) {
      if (fi.includes(i)) return Math.round(totalFromLosers / fi.length);
      return -apuesta;
    }
    if (fi.length > 1) {
      if (fi.includes(i)) return Math.round(totalFromLosers / fi.length);
      return -apuesta;
    }
    // 10+ con 1ro y 2do distintos: 60/40 del pozo total
    if (fi.includes(i)) return Math.round(pot * 0.6) - apuesta;
    if (si.includes(i)) return Math.round((pot * 0.4) / si.length) - apuesta;
    return -apuesta;
  })};
}

function calcHC(players, scores, si = []) {
  const nets = players.map((p, i) => scores[i].reduce((a, b) => a+b, 0) - p.hc);
  const fnet = Math.min(...nets);
  const fi = nets.reduce((a, v, i) => v===fnet ? [...a,i] : a, []);
  const ganadores = [...new Set([...fi, ...si])];
  const deltas = {};
  players.forEach(p => { deltas[p.id] = 0; });

  let subeATodos = false;
  ganadores.forEach(wi => {
    const w = players[wi];
    if (w.hc === 0) subeATodos = true; // ganador con HC=0 -> todos los elegibles suben
    else deltas[w.id] -= 1; // ganador con HC>0 -> baja -1
  });

  if (subeATodos) {
    // Suben los que tienen HC entre 0 y 4 (no los ganadores, no los que tienen HC 5+)
    players.forEach((p, i) => {
      if (!ganadores.includes(i) && p.hc >= 0 && p.hc <= 4) {
        deltas[p.id] += 1;
      }
    });
  }

  return players.map(p => ({
    ...p,
    before: p.hc,
    delta: deltas[p.id],
    after: Math.min(5, Math.max(0, p.hc + deltas[p.id])), // tope máximo HC 5
  }));
}

function calcOrden(players, scores, pars, currentHole) {
  if (currentHole === 0) return players.map((_, i) => i);
  return players.map((_, i) => i).sort((a, b) => {
    // Compara el resultado del hoyo anterior; si hay empate, retrocede hoyo por hoyo
    // hasta encontrar diferencia (desempate por hoyos previos, no por acumulado total)
    for (let h = currentHole - 1; h >= 0; h--) {
      const sa = scores[a][h] ?? pars[h];
      const sb = scores[b][h] ?? pars[h];
      if (sa !== sb) return sa - sb;
    }
    return 0; // empate total en todos los hoyos jugados
  });
}

// ─── SPLASH SCREEN ────────────────────────────────
function SplashScreen({ phase, appStyle }) {
  const IMG = "https://images.unsplash.com/photo-1587174486073-ae5e5cff23aa?w=800&q=80";
  return (
    <div style={{ ...appStyle, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      background:"#0A1A0A", position:"relative", overflow:"hidden",
      opacity: phase === 2 ? 0 : 1, transition: phase === 2 ? "opacity 0.7s ease" : "none" }}>
      {/* Imagen real de campo de golf */}
      <div style={{ position:"absolute", inset:0 }}>
        <img src={IMG} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", objectPosition:"center" }}
          onError={e => { e.target.style.display="none"; }} />
        {/* Overlay oscuro para legibilidad */}
        <div style={{ position:"absolute", inset:0, background:"linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.55) 50%, rgba(0,0,0,0.7) 100%)" }} />
      </div>
      {/* Contenido central */}
      <div style={{ position:"relative", zIndex:1, textAlign:"center" }}>
        <div style={{ fontSize:88, fontWeight:900, letterSpacing:-4, color:D.gold,
          textShadow:"0 4px 24px rgba(0,0,0,0.8), 0 0 40px #9A6F0066" }}>
          H19
        </div>
        <div style={{ width: phase >= 1 ? 160 : 0, height:2,
          background:`linear-gradient(90deg, transparent, ${D.gold}, transparent)`,
          margin:"8px auto 16px", transition:"width 0.6s ease" }} />
        <div style={{ fontSize:16, fontWeight:600, color:"#FFFFFF", letterSpacing:3, textTransform:"uppercase",
          opacity: phase >= 1 ? 1 : 0, transform: phase >= 1 ? "translateY(0)" : "translateY(12px)",
          transition:"opacity 0.5s ease 0.1s, transform 0.5s ease 0.1s",
          textShadow:"0 2px 8px rgba(0,0,0,0.8)" }}>
          Welcome to H19 Golf
        </div>
        <div style={{ fontSize:18, color:"#FFD97D", letterSpacing:2, marginTop:8,
          opacity: phase >= 1 ? 1 : 0, transition:"opacity 0.5s ease 0.3s",
          textShadow:"0 1px 4px rgba(0,0,0,0.8)" }}>
          ⛳ Chacales Team
        </div>
      </div>
      {/* Dots decorativos */}
      <div style={{ position:"absolute", bottom:40, left:"50%", transform:"translateX(-50%)",
        display:"flex", gap:6, opacity: phase >= 1 ? 0.8 : 0, transition:"opacity 0.5s ease 0.4s" }}>
        {[0,1,2].map(i => (
          <div key={i} style={{ width: i===1 ? 20 : 6, height:4, borderRadius:2,
            background:D.gold, opacity: i===1 ? 1 : 0.5 }} />
        ))}
      </div>
    </div>
  );
}

// ─── SPECTATOR VIEW ───────────────────────────────
function SpectatorView({ rondaId }) {
  const [ronda, setRonda] = useState(null);
  const [histData, setHistData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(true);
  const [splashPhase, setSplashPhase] = useState(0);
  const [distGreen, setDistGreen] = useState(null);
  const [distWaypoint, setDistWaypoint] = useState(null);
  const [gpsError, setGpsError] = useState("");
  const [gpsLoading, setGpsLoading] = useState(false);

  useEffect(() => {
    const r = ref(db, `rondas/${rondaId}`);
    const unsub = onValue(r, snap => {
      setRonda(snap.exists() ? snap.val() : null);
      setLoading(false);
    });
    return () => unsub();
  }, [rondaId]);

  useEffect(() => {
    const h = ref(db, `historial/${rondaId}`);
    const unsub = onValue(h, snap => {
      setHistData(snap.exists() ? snap.val() : null);
    });
    return () => unsub();
  }, [rondaId]);

  useEffect(() => { setDistGreen(null); setDistWaypoint(null); setGpsError(""); }, [ronda?.hole]);

  // Splash animation — más corto para espectadores (2s total)
  useEffect(() => {
    setTimeout(() => setSplashPhase(1), 400);
    setTimeout(() => setSplashPhase(2), 1600);
    setTimeout(() => setShowSplash(false), 2200);
  }, []);

  const appStyle = { fontSize:14, fontFamily:"-apple-system,sans-serif", color:D.text, background:D.bg, minHeight:"100vh", maxWidth:420, margin:"0 auto" };

  if (showSplash) {
    return <SplashScreen phase={splashPhase} appStyle={{ fontSize:14, fontFamily:"-apple-system,sans-serif", color:D.text, background:D.bg, minHeight:"100vh", maxWidth:420, margin:"0 auto" }} />;
  }

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

  const { players: _players, scores: _scores, pars, hole, campo, tarjetas, marcas, status, apuesta, marcaVal, tarjetaVal } = ronda;
  const players = Array.isArray(_players) ? _players : Object.values(_players||{});
  const scores = Array.isArray(_scores) ? _scores : Object.values(_scores||{});
  const nets = players.map((p, i) => (scores[i]||[]).reduce((a,v)=>a+(v||0),0) - p.hc);
  const ranked = players.map((p, i) => ({ ...p, net:nets[i], gross:(scores[i]||[]).reduce((a,v)=>a+(v||0),0) })).sort((a,b)=>a.net-b.net);
  const campoNombre = CAMPOS[campo]?.nombre || campo;

  const medirDistancia = () => {
    const green = getGreenCoord(campo, hole||0);
    if (!green) { setGpsError("Este campo no tiene GPS configurado para este hoyo"); return; }
    if (!navigator.geolocation) { setGpsError("Tu navegador no soporta GPS"); return; }
    setGpsLoading(true); setGpsError(""); setDistGreen(null); setDistWaypoint(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const yd = distanciaYardas(pos.coords.latitude, pos.coords.longitude, green.lat, green.lng);
        setDistGreen(yd);
        const wp = getWaypoint(campo, hole||0);
        if (wp) {
          const ydw = distanciaYardas(pos.coords.latitude, pos.coords.longitude, wp.lat, wp.lng);
          setDistWaypoint({ label:wp.label, yards:ydw });
        }
        setGpsLoading(false);
      },
      (err) => {
        setGpsError(err.code === 1 ? "Activa el permiso de ubicación para usar el GPS" : "No se pudo obtener tu ubicación");
        setGpsLoading(false);
      },
      { enableHighAccuracy:true, timeout:10000, maximumAge:5000 }
    );
  };


  // ── DINERO EN VIVO (estimado con hoyos no jugados = par) ──
  const liveMoney = (() => {
    if (!pars || !apuesta) return null;
    const fullSc = players.map((_, i) => pars.map((par, h) => {
      const v = (scores[i]||[])[h];
      return v===null||v===undefined ? par : v;
    }));
    const r = calcMoney(players, fullSc, apuesta);
    const mMoney = marcas ? calcMarcasMoney(players, marcas, marcaVal||0) : players.map(()=>0);
    const mPtsRaw = marcas ? calcMarcasPts(players, marcas) : players.map(()=>0);
    const mPts = players.map((p,i) => (p.opts?.marcas === false) ? 0 : mPtsRaw[i]);
    const tMoney = tarjetas ? calcTarjetasMoney(players, tarjetas, tarjetaVal||0) : players.map(()=>0);
    const tCount = players.map((p,i) => (p.opts?.tarjetas === false) ? 0 : (tarjetas ? TARJETAS.filter(t=>tarjetas[t.key]===i).length : 0));
    return players.map((p,i) => ({
      name:p.name, scoreMoney:r.money[i], marcasMoney:mMoney[i], marcasPts:mPts[i],
      tarjetasMoney:tMoney[i], tarjetasCount:tCount[i],
      total:r.money[i]+mMoney[i]+tMoney[i],
    })).sort((a,b)=>b.total-a.total);
  })();

  // ── VISTA COMPLETA DE RESULTADOS FINALES (cuando hay historial guardado) ──
  if (status === "finalizada" && histData && histData.jugadores) {
    const jr = histData.jugadores.slice().sort((a,b) => a.neto - b.neto);
    const winner = jr[0];
    return (
      <div style={appStyle}>
        <div style={{ background:`linear-gradient(135deg,#FDF8EE,#F5EDD0)`, borderBottom:`1px solid ${D.gold}44`, padding:"28px 16px", textAlign:"center", marginBottom:16 }}>
          <div style={{ fontSize:36, marginBottom:8 }}>🏆</div>
          <div style={{ fontSize:11, color:D.gold, letterSpacing:2, textTransform:"uppercase", marginBottom:6 }}>{histData.nombre || campoNombre}</div>
          <div style={{ fontSize:24, fontWeight:900, color:D.text, marginBottom:4 }}>{histData.ganador}</div>
          <div style={{ fontSize:13, color:D.textSub }}>{histData.netGanador} golpes netos</div>
        </div>
        <div style={{ padding:"0 12px 32px" }}>
          <Card>
            <SLabel>📊 Clasificación final</SLabel>
            {jr.map((p, pos) => (
              <div key={p.name} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 0", borderBottom:pos<jr.length-1?`1px solid ${D.border}`:"none" }}>
                <div style={{ width:24, height:24, borderRadius:"50%", background:pos===0?D.goldDim:D.surface, border:`1px solid ${pos===0?D.gold:D.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:900, color:pos===0?D.gold:D.textSub }}>{pos+1}</div>
                <Avatar name={p.name} id={p.name} size={32} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:600 }}>{p.name}</div>
                  <div style={{ fontSize:11, color:D.textSub }}>HC {p.hc} · {p.bruto} bruto</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:18, fontWeight:900, color:pos===0?D.gold:D.text }}>{p.neto}</div>
                  <div style={{ fontSize:10, color:D.textSub }}>neto</div>
                </div>
              </div>
            ))}
          </Card>

          <Card>
            <SLabel>💰 Resumen por jugador</SLabel>
            {jr.map((p, pos) => (
              <div key={p.name} style={{ padding:"10px 0", borderBottom:pos<jr.length-1?`1px solid ${D.border}`:"none" }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                  <div style={{ fontSize:13, fontWeight:700 }}>{p.name}</div>
                  <div style={{ fontSize:14, fontWeight:900, color:p.total>=0?D.success:D.danger }}>{p.total>=0?`+$${p.total}`:`-$${Math.abs(p.total)}`}</div>
                </div>
                <div style={{ fontSize:11, color:D.textSub }}>Score ${p.scoreMoney} · Marcas ${p.marcasMoney} ({p.marcasPts}pts) · Tarjetas ${p.tarjetasMoney} ({p.tarjetasCount})</div>
              </div>
            ))}
          </Card>

          {histData.marcas && histData.playerNames && (() => {
            const eventos = calcMarcasResumen(histData.playerNames.map((n,i)=>({name:n, opts:histData.playerOptsArr?.[i]})), histData.marcas);
            return eventos.length > 0 ? (
              <Card>
                <SLabel>⭐ Resumen de marcas</SLabel>
                {eventos.map((ev, i) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0", borderBottom:i<eventos.length-1?`1px solid ${D.border}`:"none" }}>
                    <div style={{ fontSize:11, color:D.textDim, width:42 }}>Hoyo {ev.hole}</div>
                    <div style={{ flex:1, fontSize:12 }}>{ev.label}</div>
                    <div style={{ fontSize:12, fontWeight:700, color:D.gold }}>{ev.playerName}</div>
                  </div>
                ))}
              </Card>
            ) : null;
          })()}

          {histData.scoresPorHoyo && histData.pars && (
            <Card>
              <SLabel>🏌️ Tarjeta hoyo por hoyo</SLabel>
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11, minWidth:histData.pars.length*32+90 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign:"left", padding:"4px 6px", color:D.textSub, position:"sticky", left:0, background:D.surface }}>Hoyo</th>
                      {histData.pars.map((par, h) => (
                        <th key={h} style={{ padding:"4px 4px", color:D.textDim, fontWeight:600, minWidth:28 }}>{h+1}</th>
                      ))}
                      <th style={{ padding:"4px 6px", color:D.gold, fontWeight:700 }}>Tot</th>
                    </tr>
                    <tr>
                      <td style={{ padding:"2px 6px", color:D.textDim, fontSize:10, position:"sticky", left:0, background:D.surface }}>Par</td>
                      {histData.pars.map((par, h) => (
                        <td key={h} style={{ textAlign:"center", padding:"2px 4px", color:D.textDim, fontSize:10 }}>{par}</td>
                      ))}
                      <td style={{ textAlign:"center", padding:"2px 6px", color:D.textDim, fontSize:10, fontWeight:700 }}>{histData.pars.reduce((a,b)=>a+b,0)}</td>
                    </tr>
                  </thead>
                  <tbody>
                    {(histData.playerNames||[]).map((name, pi) => {
                      const row = histData.scoresPorHoyo[pi] || [];
                      const tot = row.reduce((a,b)=>a+(b||0),0);
                      return (
                        <tr key={name} style={{ borderTop:`1px solid ${D.border}` }}>
                          <td style={{ padding:"5px 6px", fontWeight:600, position:"sticky", left:0, background:D.surface, whiteSpace:"nowrap" }}>{name}</td>
                          {row.map((s, h) => (
                            <td key={h} style={{ textAlign:"center", padding:"3px 1px" }}>
                              <ScoreCell s={s??null} par={histData.pars[h]} size={22} />
                            </td>
                          ))}
                          <td style={{ textAlign:"center", padding:"5px 6px", fontWeight:900, color:D.gold }}>{tot}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <ScoreLegend />
              </div>
            </Card>
          )}

          {tarjetas && (
            <Card>
              <SLabel>🃏 Resumen de tarjetas</SLabel>
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

          {histData.hcUpdates && histData.hcUpdates.length > 0 && (
            <Card>
              <SLabel>📈 Ajuste de handicaps</SLabel>
              {histData.hcUpdates.map((u, i) => {
                const up=u.delta>0, dn=u.delta<0;
                return (
                  <div key={u.name} style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 0", borderBottom:i<histData.hcUpdates.length-1?`1px solid ${D.border}`:"none" }}>
                    <Avatar name={u.name} id={u.name} size={30} />
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600 }}>{u.name}</div>
                      <div style={{ fontSize:11, color:D.textSub }}>HC {u.before}</div>
                    </div>
                    <div style={{ fontSize:12, padding:"3px 10px", borderRadius:10, fontWeight:700, background:up?D.redBg:dn?D.greenBg:D.surface, color:up?D.danger:dn?D.success:D.textSub, border:`1px solid ${up?D.danger+"44":dn?D.success+"44":D.border}` }}>
                      {up?`+${u.delta} -> HC ${u.after}`:dn?`${u.delta} -> HC ${u.after}`:"Sin cambio"}
                    </div>
                  </div>
                );
              })}
            </Card>
          )}

          <div style={{ textAlign:"center", fontSize:11, color:D.textDim, marginTop:8 }}>Resultados finales · Vista de solo lectura</div>
        </div>
      </div>
    );
  }

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
        {status !== "finalizada" && getGreenCoord(campo, hole||0) && (
          <Card style={{ marginBottom:12, textAlign:"center" }}>
            {distGreen !== null ? (
              <div onClick={medirDistancia} style={{ cursor:"pointer" }}>
                {distWaypoint && (
                  <div style={{ marginBottom:10, paddingBottom:10, borderBottom:`1px solid ${D.border}` }}>
                    <div style={{ fontSize:10, fontWeight:700, color:D.textSub, textTransform:"uppercase", letterSpacing:2, marginBottom:2 }}>📍 A {distWaypoint.label}</div>
                    <div style={{ fontSize:22, fontWeight:900, color:D.text }}>{distWaypoint.yards} <span style={{ fontSize:12, color:D.textSub, fontWeight:600 }}>yds</span></div>
                  </div>
                )}
                <div style={{ fontSize:10, fontWeight:700, color:D.gold, textTransform:"uppercase", letterSpacing:2, marginBottom:4 }}>📍 Distancia al green</div>
                <div style={{ fontSize:32, fontWeight:900, color:D.text }}>{distGreen} <span style={{ fontSize:14, color:D.textSub, fontWeight:600 }}>yds</span></div>
                <div style={{ fontSize:10, color:D.textDim, marginTop:2 }}>Toca para actualizar</div>
              </div>
            ) : (
              <button onClick={medirDistancia} disabled={gpsLoading} style={{ width:"100%", padding:"10px", border:`1px solid ${D.gold}`, borderRadius:10, background:D.goldDim, color:D.gold, fontSize:13, fontWeight:700, cursor:"pointer" }}>
                {gpsLoading ? "📍 Midiendo..." : "📍 Medir distancia al green"}
              </button>
            )}
            {gpsError && <div style={{ fontSize:11, color:D.danger, marginTop:8 }}>{gpsError}</div>}
          </Card>
        )}
        {status !== "finalizada" && pars && (
          <Card style={{ marginBottom:12 }}>
            <SLabel>🚩 Orden de salida</SLabel>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
              {calcOrden(players, scores, pars, hole||0).map((pi, pos) => (
                <div key={players[pi].id} style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 10px 5px 6px", background:D.goldDim, borderRadius:20, border:`1px solid ${D.gold}33` }}>
                  <div style={{ width:18, height:18, borderRadius:"50%", background:D.gold, color:"#fff", fontSize:10, fontWeight:900, display:"flex", alignItems:"center", justifyContent:"center" }}>{pos+1}</div>
                  <span style={{ fontSize:12, fontWeight:600 }}>{players[pi].name}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
        <Card>
          <SLabel>📋 Marcador en vivo</SLabel>
          {pars && pars.length > 0 && players && players.length > 0 && (() => {
            const parTotal = (pars||[]).reduce((a,b)=>a+b,0);
            const fmtVs = (v) => v === null ? "-" : v === 0 ? "E" : v > 0 ? `+${v}` : `${v}`;
            const vsColor = (v) => v === null ? D.textDim : v < 0 ? D.success : v > 0 ? D.danger : D.text;
            const tablaData = players.map((pl, pi) => {
              const rowScores = scores[pi] || [];
              const jugados = rowScores.filter(s => s !== null && s !== undefined);
              const total = jugados.length > 0 ? jugados.reduce((a,b)=>a+b,0) : null;
              const lastIdx = rowScores.reduce((last,s,i) => s!==null&&s!==undefined ? i+1 : last, 0);
              const parJugados = (pars||[]).slice(0, lastIdx).reduce((a,b)=>a+b,0);
              const vsPar = total !== null ? total - parJugados : null;
              const vsParHC = vsPar !== null ? vsPar - pl.hc : null;
              return { pl, pi, rowScores, total, vsPar, vsParHC };
            }).sort((a,b) => {
              if (a.vsParHC === null && b.vsParHC === null) return 0;
              if (a.vsParHC === null) return 1;
              if (b.vsParHC === null) return -1;
              return a.vsParHC - b.vsParHC;
            });
            return (
              <div style={{ overflowX:"auto" }}>
                <table style={{ borderCollapse:"collapse", width:"100%", fontSize:11, color:D.text }}>
                  <thead>
                    <tr style={{ background:D.surface }}>
                      <td style={{ padding:"6px 6px", fontWeight:700, color:D.gold, fontSize:10, textTransform:"uppercase", letterSpacing:1, position:"sticky", left:0, background:D.surface, borderBottom:`1px solid ${D.border}`, minWidth:70 }}>Jugador</td>
                      {(pars||[]).map((_,i) => <td key={i} style={{ padding:"5px 2px", textAlign:"center", fontWeight:700, color:D.textSub, borderBottom:`1px solid ${D.border}`, minWidth:24, fontSize:10 }}>{i+1}</td>)}
                      <td style={{ padding:"5px 4px", textAlign:"center", fontWeight:700, color:D.gold, borderBottom:`1px solid ${D.border}`, minWidth:28, borderLeft:`1px solid ${D.border}` }}>TOT</td>
                      <td style={{ padding:"5px 3px", textAlign:"center", fontWeight:700, color:D.textSub, borderBottom:`1px solid ${D.border}`, minWidth:24 }}>HC</td>
                      <td style={{ padding:"5px 4px", textAlign:"center", fontWeight:700, color:"#1A5C24", borderBottom:`1px solid ${D.border}`, minWidth:32, borderLeft:`1px solid ${D.border}` }}>VS Par</td>
                      <td style={{ padding:"5px 4px", textAlign:"center", fontWeight:700, color:D.gold, borderBottom:`1px solid ${D.border}`, minWidth:40, borderLeft:`1px solid ${D.border}` }}>VS Par-HC</td>
                    </tr>
                    <tr>
                      <td style={{ padding:"3px 6px", fontSize:10, color:D.textDim, position:"sticky", left:0, background:D.card, borderBottom:`1px solid ${D.border}` }}>PAR</td>
                      {(pars||[]).map((p,i) => <td key={i} style={{ padding:"3px 2px", textAlign:"center", fontSize:10, color:D.textSub, borderBottom:`1px solid ${D.border}` }}>{p}</td>)}
                      <td style={{ padding:"3px 4px", textAlign:"center", fontSize:10, color:D.textSub, borderBottom:`1px solid ${D.border}`, borderLeft:`1px solid ${D.border}` }}>{parTotal}</td>
                      <td style={{ borderBottom:`1px solid ${D.border}` }}></td>
                      <td style={{ borderBottom:`1px solid ${D.border}`, borderLeft:`1px solid ${D.border}` }}></td>
                      <td style={{ borderBottom:`1px solid ${D.border}`, borderLeft:`1px solid ${D.border}` }}></td>
                    </tr>
                  </thead>
                  <tbody>
                    {tablaData.map(({ pl, pi, rowScores, total, vsPar, vsParHC }, pos) => (
                      <tr key={pl.id} style={{ borderBottom:`1px solid ${D.border}`, background:pos===0&&vsParHC!==null?D.goldDim+"55":"transparent" }}>
                        <td style={{ padding:"6px 6px", position:"sticky", left:0, background:pos===0&&vsParHC!==null?D.goldDim+"55":D.card, zIndex:1 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                            <span style={{ fontSize:10, fontWeight:700, color:pos===0?D.gold:D.textSub, minWidth:12 }}>{pos+1}</span>
                            <Avatar name={String(pl.name||'')} id={pl.id} size={20} />
                            <span style={{ fontSize:11, fontWeight:600, whiteSpace:"nowrap" }}>{pl.name}</span>
                          </div>
                        </td>
                        {(pars||[]).map((par, hi) => {
                          const s = rowScores[hi];
                          const isCurrent = hi === (hole||0);
                          return (
                            <td key={hi} style={{ textAlign:"center", padding:"3px 1px", background:isCurrent?D.goldDim+"55":"transparent" }}>
                              <ScoreCell s={s??null} par={par} size={22} />
                            </td>
                          );
                        })}
                        <td style={{ textAlign:"center", padding:"5px 4px", fontWeight:700, fontSize:12, borderLeft:`1px solid ${D.border}` }}>{total??'—'}</td>
                        <td style={{ textAlign:"center", padding:"5px 3px", fontSize:11, color:D.textSub }}>{pl.hc}</td>
                        <td style={{ textAlign:"center", padding:"5px 4px", fontWeight:700, fontSize:12, color:vsColor(vsPar), borderLeft:`1px solid ${D.border}` }}>{fmtVs(vsPar)}</td>
                        <td style={{ textAlign:"center", padding:"5px 4px", fontWeight:900, fontSize:12, color:vsColor(vsParHC), borderLeft:`1px solid ${D.border}` }}>{fmtVs(vsParHC)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <ScoreLegend />
              </div>
            );
          })()}
        </Card>

        {liveMoney && (
          <Card>
            <SLabel>💰 ¿Cómo va el dinero? <span style={{ fontSize:10, color:D.textDim, fontWeight:400 }}>(estimado)</span></SLabel>
            {liveMoney.map((p, pos) => (
              <div key={p.name} style={{ padding:"9px 0", borderBottom:pos<liveMoney.length-1?`1px solid ${D.border}`:"none" }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                  <div style={{ fontSize:13, fontWeight:700 }}>{p.name}</div>
                  <div style={{ fontSize:14, fontWeight:900, color:p.total>=0?D.success:D.danger }}>{p.total>=0?`+$${p.total}`:`-$${Math.abs(p.total)}`}</div>
                </div>
                <div style={{ fontSize:10, color:D.textSub }}>Score ${p.scoreMoney} · Marcas ${p.marcasMoney} ({p.marcasPts}pts) · Tarj ${p.tarjetasMoney} ({p.tarjetasCount})</div>
              </div>
            ))}
            <div style={{ fontSize:10, color:D.textDim, textAlign:"center", marginTop:6 }}>Los hoyos sin jugar se calculan como par</div>
          </Card>
        )}

        {marcas && (() => {
          const eventos = calcMarcasResumen(players, marcas);
          return eventos.length > 0 ? (
            <Card>
              <SLabel>⭐ Resumen de marcas</SLabel>
              {eventos.map((ev, i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0", borderBottom:i<eventos.length-1?`1px solid ${D.border}`:"none" }}>
                  <div style={{ fontSize:11, color:D.textDim, width:42 }}>Hoyo {ev.hole}</div>
                  <div style={{ flex:1, fontSize:12 }}>{ev.label}</div>
                  <div style={{ fontSize:12, fontWeight:700, color:D.gold }}>{ev.playerName}</div>
                </div>
              ))}
            </Card>
          ) : null;
        })()}


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

// ─── TORNEO: CREAR ────────────────────────────────
function TorneoCrear({ onExit, onIniciarGrupo, appStyle }) {
  const [paso, setPaso] = useState(1); // 1=config, 2=grupos+jugadores, 3=compartir
  const [campo, setCampo] = useState("huerta");
  const [nHoles, setNHoles] = useState(9);
  const [apuesta, setApuesta] = useState(50);
  const [marcaVal, setMarcaVal] = useState(10);
  const [tarjetaVal, setTarjetaVal] = useState(10);
  const [nombre, setNombre] = useState("");
  const [grupos, setGrupos] = useState([{nombre:"", id:null, players:[]},{nombre:"", id:null, players:[]}]);
  const [torneoId, setTorneoId] = useState(null);
  const [creando, setCreando] = useState(false);
  const [dir, setDir] = useState([]);
  const [grupoActivo, setGrupoActivo] = useState(0);

  useEffect(() => {
    onValue(ref(db, "directorio"), snap => {
      if (snap.exists()) setDir(snap.val().players || []);
    }, { onlyOnce: true });
  }, []);

  // Guardar torneoId en localStorage cuando lleguemos al paso 3
  useEffect(() => {
    if (paso === 3 && torneoId) {
      try { localStorage.setItem("h19-torneo-admin", JSON.stringify({ torneoId, nombre: nombre.trim() || "Torneo", campo, nHoles, apuesta, marcaVal, tarjetaVal })); } catch(e) {}
    }
  }, [paso, torneoId]);

  const addGrupo = () => setGrupos(g => [...g, {nombre:"", id:null, players:[]}]);
  const removeGrupo = (i) => setGrupos(g => g.filter((_,idx)=>idx!==i));
  const setGrupoNombre = (i, val) => setGrupos(g => g.map((g2,idx) => idx===i ? {...g2, nombre:val} : g2));
  const togglePlayerInGrupo = (grupoIdx, player) => {
    setGrupos(g => g.map((g2, idx) => {
      if (idx !== grupoIdx) return g2;
      const exists = g2.players.find(p => p.id === player.id);
      return { ...g2, players: exists ? g2.players.filter(p=>p.id!==player.id) : [...g2.players, player] };
    }));
  };
  const playerEnGrupo = (player) => grupos.findIndex(g => g.players.find(p=>p.id===player.id));

  const crearTorneo = async () => {
    setCreando(true);
    const tid = "T-" + Math.random().toString(36).substring(2,8).toUpperCase();
    const gruposConId = grupos.map((g, i) => ({
      ...g,
      id: Math.random().toString(36).substring(2,8).toUpperCase(),
      nombre: g.nombre.trim() || `Grupo ${i+1}`,
    }));
    const data = {
      torneoId: tid,
      nombre: nombre.trim() || `Torneo ${new Date().toLocaleDateString('es-MX')}`,
      campo, nHoles, apuesta, marcaVal, tarjetaVal,
      status: "en_juego", createdAt: Date.now(),
      gruposConfig: gruposConId,
      grupos: {}
    };
    await set(ref(db, `torneos/${tid}`), data);
    // Registrar código de grupo y pre-cargar jugadores asignados
    for (const g of gruposConId) {
      await set(ref(db, `codigosGrupo/${g.id}`), {
        torneoId: tid, grupoId: g.id, grupoNombre: g.nombre,
        players: g.players.map(p => ({ ...p, opts:{score:true,marcas:true,tarjetas:true} }))
      });
    }
    setGrupos(gruposConId);
    setTorneoId(tid);
    setCreando(false);
    setPaso(3);
  };

  const torneoData = { torneoId, nombre: nombre.trim() || `Torneo`, campo, nHoles, apuesta, marcaVal, tarjetaVal };

  // ── PASO 1: Configuración del torneo ──
  if (paso === 1) {
    const parTotal = (CAMPOS[campo].pares||[]).slice(0,nHoles).reduce((a,b)=>a+b,0);
    return (
      <div style={appStyle}>
        <div style={{ background:D.surface, borderBottom:`1px solid ${D.border}`, padding:"16px 16px 12px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ fontSize:20, fontWeight:900, color:D.gold }}>Nuevo Torneo</div>
          <button onClick={onExit} style={{ fontSize:12, color:D.textSub, background:"none", border:`1px solid ${D.border}`, borderRadius:8, padding:"5px 10px", cursor:"pointer" }}>Salir</button>
        </div>
        <div style={{ padding:"12px" }}>
          <Card>
            <SLabel>Nombre del torneo</SLabel>
            <input value={nombre} onChange={e=>setNombre(e.target.value)} placeholder={`Torneo ${new Date().toLocaleDateString('es-MX')}`}
              style={{ width:"100%", padding:"10px 12px", border:`1px solid ${D.border}`, borderRadius:10, background:D.surface, color:D.text, fontSize:14, boxSizing:"border-box" }} />
          </Card>
          <Card>
            <SLabel>Campo</SLabel>
            <CampoSelector campo={campo} setCampo={setCampo} nHoles={nHoles} setNHoles={setNHoles} />
          </Card>
          <Card>
            <SLabel>Hoyos</SLabel>
            <div style={{ display:"flex", gap:8 }}>
              {[9,18].map(h => {
                const pt = (CAMPOS[campo].pares||[]).slice(0,h).reduce((a,b)=>a+b,0);
                return <button key={h} onClick={() => setNHoles(h)} style={{ flex:1, padding:9, border:`1px solid ${nHoles===h?D.gold:D.border}`, borderRadius:10, background:nHoles===h?D.goldDim:"transparent", color:nHoles===h?D.gold:D.textSub, fontSize:13, fontWeight:700, cursor:"pointer" }}>{h} hoyos · Par {pt}</button>;
              })}
            </div>
          </Card>
          <Card>
            <SLabel>💰 Apuestas (iguales para todos los grupos)</SLabel>
            {[{label:"Score — por jugador",val:apuesta,set:setApuesta},{label:"Marcas — por punto",val:marcaVal,set:setMarcaVal},{label:"Tarjetas — por tarjeta",val:tarjetaVal,set:setTarjetaVal}].map(({label,val,set:setVal}) => (
              <div key={label} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:`1px solid ${D.border}` }}>
                <div style={{ flex:1, fontSize:13, color:D.textSub }}>{label}</div>
                <button onClick={() => setVal(Math.max(0,val-10))} style={{ width:30,height:30,borderRadius:"50%",border:`1px solid ${D.border}`,background:"transparent",color:D.text,cursor:"pointer",fontSize:18 }}>-</button>
                <div style={{ width:50, textAlign:"center", fontSize:15, fontWeight:700, color:D.gold }}>${val}</div>
                <button onClick={() => setVal(val+10)} style={{ width:30,height:30,borderRadius:"50%",border:`1px solid ${D.gold}`,background:D.goldDim,color:D.gold,cursor:"pointer",fontSize:18 }}>+</button>
              </div>
            ))}
          </Card>
          <Btn onClick={() => setPaso(2)}>Siguiente: Definir grupos</Btn>
        </div>
      </div>
    );
  }

  // ── PASO 2: Definir grupos y asignar jugadores ──
  if (paso === 2) {
    const grupoActualPlayers = grupos[grupoActivo]?.players || [];
    return (
      <div style={appStyle}>
        <div style={{ background:D.surface, borderBottom:`1px solid ${D.border}`, padding:"14px 16px 12px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ fontSize:20, fontWeight:900, color:D.gold }}>Grupos y jugadores</div>
          <button onClick={() => setPaso(1)} style={{ fontSize:12, color:D.textSub, background:"none", border:`1px solid ${D.border}`, borderRadius:8, padding:"5px 10px", cursor:"pointer" }}>Atrás</button>
        </div>
        <div style={{ padding:"12px" }}>
          {/* Tabs de grupos */}
          <div style={{ display:"flex", gap:6, marginBottom:12, overflowX:"auto" }}>
            {grupos.map((g, i) => (
              <button key={i} onClick={() => setGrupoActivo(i)} style={{ padding:"8px 12px", border:`1px solid ${grupoActivo===i?D.gold:D.border}`, borderRadius:10, background:grupoActivo===i?D.goldDim:"transparent", color:grupoActivo===i?D.gold:D.textSub, fontSize:12, fontWeight:700, cursor:"pointer", whiteSpace:"nowrap" }}>
                {g.nombre || `Grupo ${i+1}`} ({g.players.length})
              </button>
            ))}
            <button onClick={addGrupo} style={{ padding:"8px 10px", border:`1px dashed ${D.gold}`, borderRadius:10, background:"transparent", color:D.gold, fontSize:12, fontWeight:600, cursor:"pointer" }}>+ Grupo</button>
          </div>

          {/* Nombre del grupo activo */}
          <Card>
            <SLabel>Nombre del grupo {grupoActivo+1}</SLabel>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <input value={grupos[grupoActivo]?.nombre||""} onChange={e=>setGrupoNombre(grupoActivo,e.target.value)} placeholder={`Grupo ${grupoActivo+1} — Ej: Salida 8am`}
                style={{ flex:1, padding:"10px 12px", border:`1px solid ${D.border}`, borderRadius:10, background:D.surface, color:D.text, fontSize:14 }} />
              {grupos.length > 2 && <button onClick={() => { removeGrupo(grupoActivo); setGrupoActivo(Math.max(0,grupoActivo-1)); }} style={{ padding:"8px 10px", border:`1px solid ${D.danger}44`, borderRadius:8, background:"transparent", color:D.danger, fontSize:12, cursor:"pointer" }}>Eliminar</button>}
            </div>
          </Card>

          {/* Asignar jugadores */}
          <Card>
            <SLabel>Jugadores del grupo {grupoActivo+1} ({grupoActualPlayers.length} seleccionados)</SLabel>
            {dir.length === 0 && <div style={{ textAlign:"center", color:D.textSub, padding:12, fontSize:13 }}>No hay jugadores en el directorio</div>}
            {dir.map((p, idx) => {
              const enEsteGrupo = grupoActualPlayers.find(pl=>pl.id===p.id);
              const enOtroGrupoIdx = playerEnGrupo(p);
              const enOtroGrupo = enOtroGrupoIdx !== -1 && enOtroGrupoIdx !== grupoActivo;
              return (
                <div key={p.id} onClick={() => !enOtroGrupo && togglePlayerInGrupo(grupoActivo, p)}
                  style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 0", borderBottom:idx<dir.length-1?`1px solid ${D.border}`:"none", cursor:enOtroGrupo?"default":"pointer", opacity:enOtroGrupo?0.4:1 }}>
                  <div style={{ width:22, height:22, borderRadius:6, border:`2px solid ${enEsteGrupo?D.gold:D.border}`, background:enEsteGrupo?D.goldDim:"transparent", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, color:D.gold, flexShrink:0 }}>
                    {enEsteGrupo?"✓":""}
                  </div>
                  <Avatar name={p.name} id={p.id} size={30} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:600 }}>{p.name}</div>
                    <div style={{ fontSize:11, color:D.textSub }}>HC {p.hc}</div>
                  </div>
                  {enOtroGrupo && <div style={{ fontSize:10, color:D.textDim }}>En {grupos[enOtroGrupoIdx]?.nombre||`Grupo ${enOtroGrupoIdx+1}`}</div>}
                </div>
              );
            })}
          </Card>

          <Btn onClick={crearTorneo} disabled={creando || grupos.some(g=>g.players.length < 2)}>
            {creando ? "Creando..." : grupos.some(g=>g.players.length < 2) ? "Cada grupo necesita al menos 2 jugadores" : `🏆 Crear torneo con ${grupos.length} grupos`}
          </Btn>
        </div>
      </div>
    );
  }

  // ── PASO 3: Compartir códigos por grupo ──
  if (paso === 3) {
    const torneoUrl = `${window.location.origin}${window.location.pathname}?torneo=${torneoId}`;
    return (
      <div style={appStyle}>
        <div style={{ background:D.surface, borderBottom:`1px solid ${D.border}`, padding:"16px 16px 12px", textAlign:"center" }}>
          <div style={{ fontSize:22, fontWeight:900, color:D.gold }}>🏆 ¡Torneo creado!</div>
          <div style={{ fontSize:13, color:D.textSub, marginTop:2 }}>{nombre || "Torneo"}</div>
          <div style={{ fontSize:11, color:D.textDim, marginTop:2 }}>Código: <span style={{ color:D.gold, fontWeight:700 }}>{torneoId}</span></div>
        </div>
        <div style={{ padding:"12px" }}>

          {/* PANEL DEL ADMIN GENERAL */}
          <Card style={{ border:`2px solid ${D.gold}` }}>
            <SLabel>🎖️ Tu panel de Admin General</SLabel>
            <div style={{ fontSize:12, color:D.textSub, marginBottom:10 }}>Guarda este link para ver y controlar todo el torneo:</div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => {
                const msg = `🏆 H19 — ${nombre||"Torneo"} (Admin General)\nVer torneo completo: ${torneoUrl}`;
                if (navigator.clipboard) navigator.clipboard.writeText(torneoUrl);
                window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
              }} style={{ flex:1, padding:"10px", border:"none", borderRadius:10, background:"#25D366", color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                💬 Guardar link del torneo
              </button>
              <button onClick={() => {
                window.open(torneoUrl, "_blank");
              }} style={{ flex:1, padding:"10px", border:`1px solid ${D.gold}`, borderRadius:10, background:D.goldDim, color:D.gold, fontSize:12, fontWeight:700, cursor:"pointer" }}>
                👁️ Ver torneo ahora
              </button>
            </div>
          </Card>

          {/* Códigos por grupo */}
          <div style={{ fontSize:12, color:D.textSub, margin:"8px 0", textAlign:"center" }}>
            Envía a cada admin el código de su grupo:
          </div>
          {grupos.map((g, i) => (
            <Card key={i}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
                <SLabel style={{ marginBottom:0 }}>Grupo {i+1}: {g.nombre}</SLabel>
                <div style={{ fontSize:11, color:D.textSub }}>{g.players?.length||0} jugadores</div>
              </div>
              <div style={{ fontSize:28, fontWeight:900, letterSpacing:4, color:D.gold, textAlign:"center", padding:"8px 0" }}>{g.id}</div>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={() => {
                  const playersStr = (g.players||[]).map(p=>`- ${p.name} (HC ${p.hc})`).join('\n');
                  const msg = `🏌️ H19 Golf — *${nombre||"Torneo"}*\n*Tu grupo: ${g.nombre}*\nJugadores:\n${playersStr}\n\n*Código para ingresar: ${g.id}*\nAbre la app: ${window.location.origin}\n-> "Entrar con código de grupo"\nVer torneo en vivo: ${torneoUrl}`;
                  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
                }} style={{ flex:1, padding:"10px", border:"none", borderRadius:10, background:"#25D366", color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                  💬 WhatsApp al admin
                </button>
                <button onClick={() => {
                  if (navigator.clipboard) navigator.clipboard.writeText(g.id);
                }} style={{ flex:1, padding:"10px", border:`1px solid ${D.gold}`, borderRadius:10, background:D.goldDim, color:D.gold, fontSize:12, fontWeight:700, cursor:"pointer" }}>
                  📋 Copiar código
                </button>
              </div>
            </Card>
          ))}

          <Btn onClick={() => onIniciarGrupo({ ...torneoData, grupoId: grupos[0].id, grupoNombre: grupos[0].nombre })}>
            🏌️ Iniciar mi grupo ({grupos[0]?.nombre}) ->
          </Btn>
          <Btn outline onClick={() => onExit(torneoData)} style={{ marginTop:8 }}>Volver al inicio</Btn>
        </div>
      </div>
    );
  }
}

// ─── TORNEO: UNIRSE ────────────────────────────────
function TorneoUnirse({ onExit, appStyle }) {
  const [codigo, setCodigo] = useState("");
  const [torneoConfig, setTorneoConfig] = useState(null);
  const [error, setError] = useState("");
  const [buscando, setBuscando] = useState(false);

  const buscar = async () => {
    if (!codigo.trim()) return;
    setBuscando(true); setError("");
    const gid = codigo.trim().toUpperCase();
    try {
      const grupoSnap = await get(ref(db, `codigosGrupo/${gid}`));
      if (!grupoSnap.exists()) {
        setBuscando(false);
        setError("Código no encontrado. Verifica con el organizador.");
        return;
      }
      const { torneoId, grupoId, grupoNombre, players, status: grupoStatus } = grupoSnap.val();
      // Bloquear acceso si el grupo ya finalizó
      if (grupoStatus === "finalizado") {
        setBuscando(false);
        setError("Este grupo ya terminó su ronda. El acceso está bloqueado. Contacta al administrador general del torneo.");
        return;
      }
      const torneoSnap = await get(ref(db, `torneos/${torneoId}`));
      if (!torneoSnap.exists()) { setBuscando(false); setError("Error al cargar el torneo."); return; }
      const t = torneoSnap.val();

      // Verificar si ya existe una ronda activa para este grupo en Firebase
      const grupoActivoSnap = await get(ref(db, `torneos/${torneoId}/grupos/${grupoId}`));
      let playersPreasignados = players || [];
      let rondaActiva = null;
      if (grupoActivoSnap.exists()) {
        const gData = grupoActivoSnap.val();
        if (gData.status === "en_juego" && gData.players && gData.scores) {
          // Hay una ronda en curso — la retomamos
          rondaActiva = gData;
          playersPreasignados = Array.isArray(gData.players)
            ? gData.players
            : Object.values(gData.players);
        }
      }

      setBuscando(false);
      setTorneoConfig({
        torneoId, grupoId, grupoNombre,
        campo: t.campo, nHoles: t.nHoles,
        apuesta: t.apuesta, marcaVal: t.marcaVal, tarjetaVal: t.tarjetaVal,
        nombre: t.nombre,
        playersPreasignados,
        rondaActiva, // datos de ronda en curso si existe
      });
    } catch(e) {
      setBuscando(false);
      setError("Error de conexión. Intenta de nuevo.");
    }
  };

  if (torneoConfig) {
    return <AdminApp onExit={onExit} torneoConfig={torneoConfig} />;
  }

  return (
    <div style={{ ...appStyle, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24, gap:14 }}>
      <div style={{ fontSize:40, fontWeight:900, color:D.gold }}>H19</div>
      <div style={{ fontSize:14, color:D.textSub, marginBottom:4, textAlign:"center", fontWeight:700 }}>Admin de Grupo</div>
      <div style={{ fontSize:12, color:D.textSub, marginBottom:8, textAlign:"center" }}>Ingresa el código que te envió el organizador</div>
      <input value={codigo} onChange={e=>setCodigo(e.target.value.toUpperCase())} placeholder="Código de grupo"
        style={{ width:"100%", padding:14, border:`1px solid ${error?D.danger:D.border}`, borderRadius:12, background:D.surface, color:D.text, fontSize:20, textAlign:"center", letterSpacing:4, fontWeight:700 }} />
      {error && <div style={{ color:D.danger, fontSize:13, textAlign:"center" }}>{error}</div>}
      <Btn onClick={buscar} disabled={buscando}>{buscando?"Buscando...":"🔗 Entrar a mi grupo"}</Btn>
      <button onClick={onExit} style={{ fontSize:13, color:D.textSub, background:"none", border:"none", cursor:"pointer" }}>Volver</button>
    </div>
  );
}

// ─── CERRAR TORNEO ────────────────────────────────
function CerrarTorneoPanel({ torneoId, torneo, grupos, allPlayers, ranked, pars, onCerrado }) {
  const [hcUpdates, setHcUpdates] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [cerrado, setCerrado] = useState(false);

  useEffect(() => {
    // Calcular ajuste de HC: usar el ganador global (menor vsParHC)
    // y el segundo lugar si aplica regla 10+
    const conScore = ranked.filter(p => p.vsParHC !== null);
    if (conScore.length === 0) return;

    // Para calcular HC necesitamos los scores completos
    // Usamos fullScores aproximados (reemplazando null con par)
    const playersGlobal = allPlayers.map(p => ({
      ...p, id: p.id || p.name, opts:{score:true,marcas:true,tarjetas:true}
    }));
    const scoresGlobal = allPlayers.map(p => pars.map((par,h) => {
      const v = p.scores[h];
      return (v===null||v===undefined) ? par : v;
    }));

    const r = calcMoney(playersGlobal, scoresGlobal, torneo.apuesta||50);
    const playsScoreCount = playersGlobal.length;
    const siParaHC = (playsScoreCount >= 10 && r.fi.length === 1) ? r.si : [];
    const hc = calcHC(playersGlobal, scoresGlobal, siParaHC);
    setHcUpdates(hc);
  }, []);

  const guardarYCerrar = async (guardarHC) => {
    setGuardando(true);
    try {
      await set(ref(db, `torneos/${torneoId}/status`), "finalizado");

      const fecha = new Date();
      const fechaStr = `${fecha.getDate().toString().padStart(2,'0')}/${(fecha.getMonth()+1).toString().padStart(2,'0')}`;

      // ── Construir datos globales de todos los jugadores ──
      const allPlayers = grupos.flatMap(([gid, g]) => {
        const gPs = (Array.isArray(g.players)?g.players:Object.values(g.players||{}))
          .map(p=>({...p, opts:{score:true,marcas:true,tarjetas:true}}));
        const gScRaw = Array.isArray(g.scores)?g.scores:Object.values(g.scores||{});
        return gPs.map((p,pi) => {
          const rowRaw = gScRaw[pi];
          const row = Array.isArray(rowRaw)?rowRaw:Object.values(rowRaw||{});
          const fullRow = pars.map((par,h)=>{ const v=row[h]; return (v===null||v===undefined)?par:v; });
          return { ...p, grupoId:gid, grupoNombre:g.nombre||`Grupo ${gid.slice(-3)}`,
            fullScores:fullRow, marcas:g.marcas, tarjetas:g.tarjetas };
        });
      });

      // Score global entre todos
      const scoresGlobal = allPlayers.map(p => p.fullScores);
      const rGlobal = calcMoney(allPlayers, scoresGlobal, torneo.apuesta||50);

      // Peor score global
      const netsGlobal = allPlayers.map((p,i) => scoresGlobal[i].reduce((a,b)=>a+b,0) - p.hc);
      const peorNeto = Math.max(...netsGlobal);
      const peoresIdx = netsGlobal.map((n,i)=>n===peorNeto?i:-1).filter(i=>i>=0);
      const tv = torneo.tarjetaVal||10;
      const peorMoneyArr = allPlayers.map((_,i) => {
        if (peoresIdx.includes(i)) return -((allPlayers.length-peoresIdx.length)*tv/peoresIdx.length);
        return tv;
      });

      // Marcas y tarjetas por grupo (excluyendo peorscore)
      const TARJETAS_SIN_PS = TARJETAS.filter(t=>t.key!=="peorscore");
      const marcasMoneyArr = new Array(allPlayers.length).fill(0);
      const tarjetasMoneyArr = new Array(allPlayers.length).fill(0);
      let offset = 0;
      grupos.forEach(([gid,g]) => {
        const gPs = (Array.isArray(g.players)?g.players:Object.values(g.players||{}))
          .map(p=>({...p,opts:{score:true,marcas:true,tarjetas:true}}));
        const gMarcas = g.marcas?(Array.isArray(g.marcas)?g.marcas:Object.values(g.marcas)):null;
        const gTarjetas = g.tarjetas||null;
        if (gMarcas) {
          const mm = calcMarcasMoney(gPs, gMarcas, torneo.marcaVal||10);
          gPs.forEach((_,pi)=>{ marcasMoneyArr[offset+pi]=mm[pi]; });
        }
        if (gTarjetas) {
          const tarjetasSinPS = {...gTarjetas, peorscore:null};
          const count = gPs.map((_,i)=>{
            let c=0; TARJETAS_SIN_PS.forEach(t=>{ const o=tarjetasSinPS[t.key];
              c+=Array.isArray(o)?o.includes(i)?1/o.length:0:o===i?1:0; }); return c;
          });
          const tm = gPs.map((_,i)=>{
            let b=0; gPs.forEach((_,j)=>{ if(i!==j){b-=count[i]*tv;b+=count[j]*tv;} }); return Math.round(b);
          });
          gPs.forEach((_,pi)=>{ tarjetasMoneyArr[offset+pi]=tm[pi]; });
        }
        offset += gPs.length;
      });

      // Clasificación global final
      const jugadoresGlobal = allPlayers.map((p,i) => ({
        name: p.name, hc: p.hc,
        grupoNombre: p.grupoNombre,
        bruto: scoresGlobal[i].reduce((a,b)=>a+b,0),
        neto: rGlobal.nets[i],
        scoreMoney: rGlobal.money[i],
        marcasMoney: marcasMoneyArr[i],
        tarjetasMoney: tarjetasMoneyArr[i]+peorMoneyArr[i],
        total: rGlobal.money[i]+marcasMoneyArr[i]+tarjetasMoneyArr[i]+peorMoneyArr[i],
      })).sort((a,b)=>a.neto-b.neto);

      const ganadorGlobal = jugadoresGlobal[0];

      // Guardar resumen global en el torneo
      await set(ref(db, `torneos/${torneoId}/resumenGlobal`), {
        jugadores: jugadoresGlobal,
        ganador: ganadorGlobal?.name,
        netGanador: ganadorGlobal?.neto,
        fechaTs: Date.now(), fecha: fechaStr,
        pars, campo: torneo.campo, nHoles: torneo.nHoles,
        apuesta: torneo.apuesta, marcaVal: torneo.marcaVal, tarjetaVal: torneo.tarjetaVal,
      });

      // Guardar desglose por grupo (tarjeta hoyo×hoyo, marcas, tarjetas)
      for (const [gid, g] of grupos) {
        try {
          const gPs = (Array.isArray(g.players)?g.players:Object.values(g.players||{}));
          const gScRaw = Array.isArray(g.scores)?g.scores:Object.values(g.scores||{});
          const gMarcas = g.marcas?(Array.isArray(g.marcas)?g.marcas:Object.values(g.marcas)):null;
          const gFullScores = gPs.map((_,pi)=>{ const r=Array.isArray(gScRaw[pi])?gScRaw[pi]:Object.values(gScRaw[pi]||{}); return pars.map((par,h)=>{const v=r[h];return(v===null||v===undefined)?par:v;}); });
          await set(ref(db, `torneos/${torneoId}/grupos/${gid}/resumenFinal`), {
            ganador: calcMoney(gPs.map(p=>({...p,opts:{score:true,marcas:true,tarjetas:true}})),gFullScores,torneo.apuesta||50).fi.map(i=>gPs[i].name).join(" · "),
            pars, playerNames: gPs.map(p=>p.name),
            scoresPorHoyo: gFullScores,
            marcas: gMarcas, tarjetas: g.tarjetas||null,
          });
        } catch(e) {}
      }

      if (guardarHC && hcUpdates) {
        const dirSnap = await get(ref(db, "directorio"));
        if (dirSnap.exists()) {
          const dirData = dirSnap.val();
          const updatedPlayers = (dirData.players||[]).map(p => {
            const upd = hcUpdates.find(u=>u.name===p.name);
            return upd ? {...p,hc:upd.after} : p;
          });
          await set(ref(db, "directorio"), {...dirData, players:updatedPlayers});
        }
      }

      setCerrado(true);
      setTimeout(() => onCerrado(), 2000);
    } catch(e) {
      setGuardando(false);
      alert("Error al cerrar torneo: " + e.message);
    }
  };

  if (cerrado) return (
    <div style={{ background:"#E8F5E9", border:`2px solid ${D.success}`, borderRadius:12, padding:"20px", marginBottom:12, textAlign:"center" }}>
      <div style={{ fontSize:32, marginBottom:8 }}>✅</div>
      <div style={{ fontSize:16, fontWeight:700, color:D.success }}>¡Torneo cerrado!</div>
      <div style={{ fontSize:12, color:D.textSub, marginTop:4 }}>Regresando al inicio...</div>
    </div>
  );

  return (
    <div style={{ background:"#E8F5E9", border:`2px solid ${D.success}`, borderRadius:12, padding:"16px", marginBottom:12 }}>
      <div style={{ fontSize:15, fontWeight:700, color:D.success, marginBottom:4, textAlign:"center" }}>✅ Todos los grupos han finalizado</div>
      <div style={{ fontSize:12, color:D.textSub, marginBottom:12, textAlign:"center" }}>Como admin general, elige cómo cerrar el torneo:</div>

      {/* Ajuste de HC */}
      {hcUpdates && hcUpdates.some(u => u.delta !== 0) && (
        <Card style={{ marginBottom:10 }}>
          <SLabel>📈 Ajuste de Handicaps</SLabel>
          {hcUpdates.filter(u => u.delta !== 0).map((u, i) => {
            const up = u.delta > 0, dn = u.delta < 0;
            return (
              <div key={u.name} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 0", borderBottom:i<hcUpdates.filter(x=>x.delta!==0).length-1?`1px solid ${D.border}`:"none" }}>
                <div style={{ flex:1, fontSize:13, fontWeight:600 }}>{u.name}</div>
                <div style={{ fontSize:11, color:D.textSub }}>HC {u.before}</div>
                <div style={{ fontSize:12, padding:"3px 10px", borderRadius:10, fontWeight:700,
                  background:up?D.redBg:D.greenBg, color:up?D.danger:D.success,
                  border:`1px solid ${up?D.danger+"44":D.success+"44"}` }}>
                  {up?`+${u.delta} -> HC ${u.after}`:`${u.delta} -> HC ${u.after}`}
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <div style={{ display:"flex", gap:8, flexDirection:"column" }}>
        <button onClick={() => guardarYCerrar(true)} disabled={guardando}
          style={{ width:"100%", padding:"12px", border:"none", borderRadius:10, background:D.success, color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}>
          {guardando ? "Guardando..." : "✅ Cerrar torneo y guardar handicaps"}
        </button>
        <button onClick={() => guardarYCerrar(false)} disabled={guardando}
          style={{ width:"100%", padding:"12px", border:`1px solid ${D.border}`, borderRadius:10, background:"transparent", color:D.textSub, fontSize:13, fontWeight:600, cursor:"pointer" }}>
          Cerrar torneo sin guardar handicaps
        </button>
      </div>
    </div>
  );
}

// ─── TORNEO: SPECTATOR ────────────────────────────────
function TorneoSpectator({ torneoId, appStyle, isAdmin = false }) {
  const [torneo, setTorneo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showSplash, setShowSplash] = useState(true);
  const [splashPhase, setSplashPhase] = useState(0);

  useEffect(() => {
    const unsub = onValue(ref(db, `torneos/${torneoId}`), snap => {
      setTorneo(snap.exists() ? snap.val() : null);
      setLoading(false);
    });
    return () => unsub();
  }, [torneoId]);

  useEffect(() => {
    setTimeout(() => setSplashPhase(1), 400);
    setTimeout(() => setSplashPhase(2), 1600);
    setTimeout(() => setShowSplash(false), 2200);
  }, []);

  if (showSplash) return <SplashScreen phase={splashPhase} appStyle={appStyle} />;

  if (loading) return (
    <div style={{ ...appStyle, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12 }}>
      <div style={{ fontSize:32 }}>⛳</div>
      <div style={{ color:D.gold, fontWeight:700 }}>Cargando torneo...</div>
    </div>
  );

  if (!torneo) return (
    <div style={{ ...appStyle, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12 }}>
      <div style={{ fontSize:32 }}>🏌️</div>
      <div style={{ color:D.textSub }}>Torneo no encontrado</div>
    </div>
  );

  // Combinar todos los grupos
  const grupos = Object.entries(torneo.grupos || {});
  const pars = (CAMPOS[torneo.campo]?.pares || []).slice(0, torneo.nHoles);
  const parTotal = pars.reduce((a,b)=>a+b,0);

  // Todos los jugadores de todos los grupos con su grupo de origen
  const allPlayers = grupos.flatMap(([gid, g]) => {
    const gPlayers = Array.isArray(g.players) ? g.players : Object.values(g.players||{});
    const gScoresRaw = Array.isArray(g.scores) ? g.scores : Object.values(g.scores||{});
    return gPlayers.map((p, pi) => {
      const rowRaw = gScoresRaw[pi];
      const row = Array.isArray(rowRaw) ? rowRaw : Object.values(rowRaw||{});
      // Pad al tamaño correcto
      const scores = Array(torneo.nHoles).fill(null).map((_, h) => row[h] ?? null);
      return { ...p, grupoId:gid, grupoNombre: g.nombre || `Grupo ${gid.slice(-3)}`, scores, marcas: g.marcas, tarjetas: g.tarjetas, grupoStatus: g.status };
    });
  });

  // Calcular netos y clasificación global
  const fmtVs = (v) => v === null ? "-" : v === 0 ? "E" : v > 0 ? `+${v}` : `${v}`;
  const vsColor = (v) => v === null ? D.textDim : v < 0 ? D.success : v > 0 ? D.danger : D.text;
  const fmtMoney = (n) => n >= 0 ? `+$${n}` : `-$${Math.abs(n)}`;
  const moneyColor = (n) => n > 0 ? D.success : n < 0 ? D.danger : D.textSub;

  const ranked = allPlayers.map(p => {
    const jugados = p.scores.filter(s => s !== null && s !== undefined);
    const bruto = jugados.length > 0 ? jugados.reduce((a,b)=>a+b,0) : null;
    const lastIdx = p.scores.reduce((last,s,i) => s!==null&&s!==undefined ? i+1 : last, 0);
    const parJugados = pars.slice(0, lastIdx).reduce((a,b)=>a+b,0);
    const vsPar = bruto !== null ? bruto - parJugados : null;
    const vsParHC = vsPar !== null ? vsPar - p.hc : null;
    return { ...p, bruto, vsPar, vsParHC };
  }).sort((a,b) => {
    if (a.vsParHC===null && b.vsParHC===null) return 0;
    if (a.vsParHC===null) return 1;
    if (b.vsParHC===null) return -1;
    return a.vsParHC - b.vsParHC;
  });

  // Calcular dinero global (score) + por grupo (marcas+tarjetas)
  const playersForCalc = allPlayers.map(p => ({ ...p, opts:{score:true,marcas:true,tarjetas:true} }));
  const fullScoresForCalc = allPlayers.map(p => pars.map((par,h) => {
    const v = p.scores[h];
    return (v===null||v===undefined) ? par : v;
  }));
  const moneyGlobal = allPlayers.length >= 2
    ? calcMoney(playersForCalc, fullScoresForCalc, torneo.apuesta || 50).money
    : allPlayers.map(() => 0);

  // Marcas y tarjetas por grupo (excluyendo peorscore que se calcula globalmente)
  const TARJETAS_SIN_PEORSCORE = TARJETAS.filter(t => t.key !== "peorscore");
  const marcasMoneyMap = {};
  const tarjetasMoneyMap = {};
  grupos.forEach(([gid, g]) => {
    const gPlayers = (Array.isArray(g.players) ? g.players : Object.values(g.players||{})).map(p=>({...p,opts:{score:true,marcas:true,tarjetas:true}}));
    const gMarcas = g.marcas ? (Array.isArray(g.marcas) ? g.marcas : Object.values(g.marcas)) : null;
    const gTarjetas = normalizeTarjetas(g.tarjetas);
    if (gMarcas && gPlayers.length > 0) {
      const mm = calcMarcasMoney(gPlayers, gMarcas, torneo.marcaVal || 10);
      gPlayers.forEach((p, pi) => { marcasMoneyMap[`${gid}-${pi}`] = mm[pi]; });
    }
    if (gPlayers.length > 0) {
      const tarjetasSinPeor = { ...gTarjetas, peorscore: null };
      const count = gPlayers.map((_, i) => {
        let c = 0;
        TARJETAS_SIN_PEORSCORE.forEach(t => {
          const owner = tarjetasSinPeor[t.key];
          if (Array.isArray(owner)) { if (owner.includes(i)) c += 1/owner.length; }
          else if (owner === i) c += 1;
        });
        return c;
      });
      const playsTarjetas = gPlayers.map(p => p.opts ? p.opts.tarjetas !== false : true);
      const tm = gPlayers.map((_, i) => {
        if (!playsTarjetas[i]) return 0;
        let b = 0;
        gPlayers.forEach((_, j) => {
          if (i !== j && playsTarjetas[j]) { b -= count[i]*(torneo.tarjetaVal||10); b += count[j]*(torneo.tarjetaVal||10); }
        });
        return Math.round(b);
      });
      gPlayers.forEach((p, pi) => { tarjetasMoneyMap[`${gid}-${pi}`] = tm[pi]; });
    }
  });

  // ── PEOR SCORE GLOBAL: aplica sobre todos los jugadores del torneo ──
  // Identificar quién(es) tienen el peor VS Par-HC entre TODOS los jugadores
  const conScoreGlobal = ranked.filter(p => p.vsParHC !== null);
  const peorVsParHCGlobal = conScoreGlobal.length > 0 ? Math.max(...conScoreGlobal.map(p => p.vsParHC)) : null;
  const peoresGlobal = peorVsParHCGlobal !== null
    ? conScoreGlobal.filter(p => p.vsParHC === peorVsParHCGlobal)
    : [];
  const totalJugadoresConScore = conScoreGlobal.length;
  const peorScoreMoneyGlobal = {}; // key: `${grupoId}-${id}`
  if (peoresGlobal.length > 0 && totalJugadoresConScore > peoresGlobal.length) {
    const tv = torneo.tarjetaVal || 10;
    peoresGlobal.forEach(peor => {
      // El peor paga a todos los demás (fracción si hay empate)
      const pagoTotal = (totalJugadoresConScore - peoresGlobal.length) * tv;
      peorScoreMoneyGlobal[`${peor.grupoId}-${peor.id}`] = -(pagoTotal / peoresGlobal.length);
    });
    // Los que no son el peor cobran
    conScoreGlobal.forEach(p => {
      const key = `${p.grupoId}-${p.id}`;
      if (!peorScoreMoneyGlobal[key]) {
        peorScoreMoneyGlobal[key] = tv; // cobra $tarjetaVal de cada peor (fraccionado)
        // Ajuste: si hay varios peores, cada uno paga tv/peoresGlobal.length
        peorScoreMoneyGlobal[key] = (tv * peoresGlobal.length) / peoresGlobal.length; // = tv
      }
    });
  }

  const rankedWithMoney = ranked.map((p) => {
    const scoreM = moneyGlobal[allPlayers.findIndex(ap => ap.grupoId===p.grupoId && ap.id===p.id)] || 0;
    const gPlayers = Array.isArray(torneo.grupos[p.grupoId]?.players)
      ? torneo.grupos[p.grupoId].players
      : Object.values(torneo.grupos[p.grupoId]?.players||{});
    const piInGrupo = gPlayers.findIndex(gp => gp.id === p.id);
    const marcasM = marcasMoneyMap[`${p.grupoId}-${piInGrupo}`] || 0;
    // Tarjetas locales del grupo (excluyendo peor score global que se calcula aparte)
    const tarjetasLocalesM = tarjetasMoneyMap[`${p.grupoId}-${piInGrupo}`] || 0;
    // Peor score global
    const peorM = peorScoreMoneyGlobal[`${p.grupoId}-${p.id}`] || 0;
    const tarjetasM = tarjetasLocalesM + peorM;
    return { ...p, scoreM, marcasM, tarjetasM, totalM: scoreM + marcasM + tarjetasM };
  });

  return (
    <div style={appStyle}>
      <div style={{ background:D.surface, borderBottom:`1px solid ${D.border}`, padding:"16px 16px 12px", textAlign:"center" }}>
        <div style={{ fontSize:24, fontWeight:900, color:D.gold }}>H19 — Torneo</div>
        <div style={{ fontSize:13, color:D.textSub, marginTop:2 }}>{torneo.nombre}</div>
        <div style={{ fontSize:11, color:D.textSub, marginTop:2 }}>{CAMPOS[torneo.campo]?.nombre} · {torneo.nHoles} hoyos · {grupos.length} grupos · {allPlayers.length} jugadores</div>
      </div>
      <div style={{ padding:"12px 12px 32px" }}>
        {/* Marcador global */}
        <Card>
          <SLabel>🏆 Clasificación general</SLabel>
          <div style={{ overflowX:"auto" }}>
            <table style={{ borderCollapse:"collapse", width:"100%", fontSize:11 }}>
              <thead>
                <tr>
                  <td style={{ padding:"6px 6px", fontWeight:700, color:D.gold, fontSize:10, position:"sticky", left:0, background:D.surface, borderBottom:`1px solid ${D.border}`, minWidth:80 }}>Jugador</td>
                  {pars.map((_,i) => <td key={i} style={{ padding:"5px 2px", textAlign:"center", fontWeight:700, color:D.textSub, borderBottom:`1px solid ${D.border}`, minWidth:22, fontSize:10 }}>{i+1}</td>)}
                  <td style={{ padding:"5px 4px", textAlign:"center", fontWeight:700, color:D.gold, borderBottom:`1px solid ${D.border}`, minWidth:28, borderLeft:`1px solid ${D.border}` }}>TOT</td>
                  <td style={{ padding:"5px 3px", textAlign:"center", fontWeight:700, color:D.textSub, borderBottom:`1px solid ${D.border}`, minWidth:22 }}>HC</td>
                  <td style={{ padding:"5px 4px", textAlign:"center", fontWeight:700, color:"#1A5C24", borderBottom:`1px solid ${D.border}`, minWidth:32, borderLeft:`1px solid ${D.border}` }}>VS Par</td>
                  <td style={{ padding:"5px 4px", textAlign:"center", fontWeight:700, color:D.gold, borderBottom:`1px solid ${D.border}`, minWidth:40, borderLeft:`1px solid ${D.border}` }}>VS Par-HC</td>
                </tr>
                <tr>
                  <td style={{ padding:"3px 6px", fontSize:10, color:D.textDim, position:"sticky", left:0, background:D.card, borderBottom:`1px solid ${D.border}` }}>PAR</td>
                  {pars.map((p,i) => <td key={i} style={{ padding:"3px 2px", textAlign:"center", fontSize:10, color:D.textSub, borderBottom:`1px solid ${D.border}` }}>{p}</td>)}
                  <td style={{ padding:"3px 4px", textAlign:"center", fontSize:10, color:D.textSub, borderBottom:`1px solid ${D.border}`, borderLeft:`1px solid ${D.border}` }}>{parTotal}</td>
                  <td style={{ borderBottom:`1px solid ${D.border}` }}></td>
                  <td style={{ borderBottom:`1px solid ${D.border}`, borderLeft:`1px solid ${D.border}` }}></td>
                  <td style={{ borderBottom:`1px solid ${D.border}`, borderLeft:`1px solid ${D.border}` }}></td>
                </tr>
              </thead>
              <tbody>
                {rankedWithMoney.map(({ name, id, hc, scores: sc, grupoNombre, bruto, vsPar, vsParHC, scoreM, marcasM, tarjetasM, totalM }, pos) => (
                  <tr key={`${grupoNombre}-${name}`} style={{ borderBottom:`1px solid ${D.border}`, background:pos===0&&vsParHC!==null?D.goldDim+"55":"transparent" }}>
                    <td style={{ padding:"6px 6px", position:"sticky", left:0, background:pos===0&&vsParHC!==null?D.goldDim+"55":D.card, zIndex:1 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                        <span style={{ fontSize:10, fontWeight:700, color:pos===0?D.gold:D.textSub, minWidth:12 }}>{pos+1}</span>
                        <Avatar name={String(name||'?')} id={id||pos} size={18} />
                        <div>
                          <div style={{ fontSize:11, fontWeight:600, whiteSpace:"nowrap" }}>{name}</div>
                          <div style={{ fontSize:9, color:D.textDim }}>{grupoNombre}</div>
                        </div>
                      </div>
                    </td>
                    {pars.map((par, hi) => (
                      <td key={hi} style={{ textAlign:"center", padding:"2px 1px" }}>
                        <ScoreCell s={sc[hi]??null} par={par} size={20} />
                      </td>
                    ))}
                    <td style={{ textAlign:"center", padding:"5px 4px", fontWeight:700, fontSize:11, borderLeft:`1px solid ${D.border}` }}>{bruto??'—'}</td>
                    <td style={{ textAlign:"center", padding:"5px 3px", fontSize:11, color:D.textSub }}>{hc}</td>
                    <td style={{ textAlign:"center", padding:"5px 4px", fontWeight:700, fontSize:11, color:vsColor(vsPar), borderLeft:`1px solid ${D.border}` }}>{fmtVs(vsPar)}</td>
                    <td style={{ textAlign:"center", padding:"5px 4px", fontWeight:900, fontSize:12, color:vsColor(vsParHC), borderLeft:`1px solid ${D.border}` }}>{fmtVs(vsParHC)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ScoreLegend />
          </div>
        </Card>

        {/* Peor score global */}
        {peoresGlobal.length > 0 && (
          <Card>
            <SLabel>🪣 MP General global {peoresGlobal.length > 1 ? `(empate — tarjeta repartida entre ${peoresGlobal.length})` : ""}</SLabel>
            {peoresGlobal.map((p, i) => (
              <div key={`${p.grupoId}-${p.id}`} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:i<peoresGlobal.length-1?`1px solid ${D.border}`:"none" }}>
                <Avatar name={String(p.name||'?')} id={p.id||0} size={32} />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:D.danger }}>{p.name}</div>
                  <div style={{ fontSize:11, color:D.textSub }}>{p.grupoNombre}</div>
                </div>
                <div style={{ fontSize:16, fontWeight:900, color:D.danger }}>{fmtVs(p.vsParHC)}</div>
              </div>
            ))}
            {peoresGlobal.length > 1 && (
              <div style={{ fontSize:11, color:D.textSub, marginTop:6, textAlign:"center" }}>
                Cada uno paga ${Math.round((totalJugadoresConScore - peoresGlobal.length) * (torneo.tarjetaVal||10) / peoresGlobal.length)} a cada uno de los demás {totalJugadoresConScore - peoresGlobal.length} jugadores
              </div>
            )}
          </Card>
        )}

        {/* Dinero en vivo */}
        {rankedWithMoney.some(p => p.vsParHC !== null) && (
          <Card>
            <SLabel>💰 ¿Cómo va el dinero? <span style={{ fontSize:10, color:D.textDim, fontWeight:400 }}>(estimado)</span></SLabel>
            {rankedWithMoney.filter(p => p.vsParHC !== null).map((p, pos) => (
              <div key={`${p.grupoId}-${p.id}`} style={{ padding:"9px 0", borderBottom:pos<rankedWithMoney.filter(x=>x.vsParHC!==null).length-1?`1px solid ${D.border}`:"none" }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <Avatar name={String(p.name||'?')} id={p.id||0} size={22} />
                    <div>
                      <div style={{ fontSize:13, fontWeight:700 }}>{p.name}</div>
                      <div style={{ fontSize:10, color:D.textDim }}>{p.grupoNombre}</div>
                    </div>
                  </div>
                  <div style={{ fontSize:14, fontWeight:900, color:moneyColor(p.totalM) }}>{fmtMoney(p.totalM)}</div>
                </div>
                <div style={{ fontSize:10, color:D.textSub, paddingLeft:28 }}>Score {fmtMoney(p.scoreM)} · Marcas {fmtMoney(p.marcasM)} · Tarjetas {fmtMoney(p.tarjetasM)}</div>
              </div>
            ))}
            <div style={{ fontSize:10, color:D.textDim, textAlign:"center", marginTop:6 }}>Score: global entre todos · Marcas y Tarjetas: dentro de cada grupo</div>
            {(() => {
              const totales = rankedWithMoney.filter(p=>p.vsParHC!==null).map(p=>p.totalM);
              const ganancias = totales.filter(t=>t>0).reduce((a,b)=>a+b,0);
              const perdidas = totales.filter(t=>t<0).reduce((a,b)=>a+b,0);
              const cuadra = ganancias + perdidas === 0;
              return (
                <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${D.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div style={{ fontSize:11, color:D.textSub }}>
                    <span style={{ color:D.success, fontWeight:700 }}>+${ganancias}</span>
                    <span style={{ color:D.textDim, margin:"0 6px" }}>vs</span>
                    <span style={{ color:D.danger, fontWeight:700 }}>-${Math.abs(perdidas)}</span>
                  </div>
                  <div style={{ fontSize:11, fontWeight:700, color:cuadra?D.success:D.danger }}>
                    {cuadra ? "✓ Cuadra" : `⚠️ Dif $${ganancias+perdidas}`}
                  </div>
                </div>
              );
            })()}
          </Card>
        )}

        {/* Resultados por grupo */}
        {grupos.map(([gid, g]) => {
          const gPlayers = Array.isArray(g.players) ? g.players : Object.values(g.players||{});
          const gScores = Array.isArray(g.scores) ? g.scores : Object.values(g.scores||{});
          const gMarcas = g.marcas ? (Array.isArray(g.marcas) ? g.marcas : Object.values(g.marcas)) : null;
          return (
            <Card key={gid}>
              <SLabel>🏌️ {g.nombre || `Grupo ${gid.slice(-3)}`} · Hoyo {(g.hole||0)+1}</SLabel>
              {/* Score por jugador */}
              {gPlayers.map((p, pi) => {
                const sc = gScores[pi] || [];
                const jugados = sc.filter(s=>s!==null&&s!==undefined);
                const bruto = jugados.length > 0 ? jugados.reduce((a,b)=>a+b,0) : null;
                return (
                  <div key={pi} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 0", borderBottom:pi<gPlayers.length-1?`1px solid ${D.border}`:"none" }}>
                    <Avatar name={String(p.name||'?')} id={p.id||pi} size={26} />
                    <div style={{ flex:1, fontSize:13, fontWeight:600 }}>{p.name}</div>
                    <div style={{ fontSize:11, color:D.textSub }}>HC {p.hc}</div>
                    <div style={{ fontSize:13, fontWeight:700, color:D.gold }}>{bruto??'—'} golpes</div>
                  </div>
                );
              })}
              {/* Marcas del grupo */}
              {gMarcas && (() => {
                const eventos = calcMarcasResumen(gPlayers, gMarcas);
                return eventos.length > 0 ? (
                  <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${D.border}` }}>
                    <div style={{ fontSize:10, fontWeight:700, color:D.gold, textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>⭐ Marcas</div>
                    {eventos.map((ev, i) => (
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"4px 0" }}>
                        <div style={{ fontSize:10, color:D.textDim, width:42 }}>Hoyo {ev.hole}</div>
                        <div style={{ flex:1, fontSize:11 }}>{ev.label}</div>
                        <div style={{ fontSize:11, fontWeight:700, color:D.gold }}>{ev.playerName}</div>
                      </div>
                    ))}
                  </div>
                ) : null;
              })()}
              {/* Tarjetas del grupo */}
              {(() => {
                const gTarjetasNorm = normalizeTarjetas(g.tarjetas);
                const conDueno = TARJETAS.filter(tj => {
                  const o = gTarjetasNorm[tj.key];
                  return Array.isArray(o) ? o.length > 0 : (o !== null && o !== undefined);
                });
                return conDueno.length > 0 ? (
                  <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${D.border}` }}>
                    <div style={{ fontSize:10, fontWeight:700, color:D.danger, textTransform:"uppercase", letterSpacing:1, marginBottom:6 }}>🃏 Tarjetas</div>
                    {conDueno.map(tj => {
                      const owner = gTarjetasNorm[tj.key];
                      const names = Array.isArray(owner)
                        ? owner.map(i => gPlayers[i]?.name).filter(Boolean).join(" · ")
                        : gPlayers[owner]?.name || "—";
                      const esPeorScore = tj.key === "peorscore";
                      return (
                        <div key={tj.key} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", fontSize:11, padding:"4px 0", borderBottom:`1px solid ${D.border}44` }}>
                          <div>
                            <span style={{ color:D.textSub }}>{tj.label}</span>
                            {esPeorScore && <span style={{ fontSize:9, color:D.textDim, marginLeft:4 }}>(en este grupo)</span>}
                          </div>
                          <span style={{ fontWeight:700, color:D.danger }}>{names}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : null;
              })()}
            </Card>
          );
        })}

        {/* Estado de grupos */}
        <Card>
          <SLabel>📊 Estado de grupos</SLabel>
          {grupos.map(([gid, g]) => {
            const finalizado = g.status === "finalizada";
            return (
              <div key={gid} style={{ padding:"10px 0", borderBottom:`1px solid ${D.border}` }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:10, height:10, borderRadius:"50%", background:finalizado?D.success:D.gold, flexShrink:0 }} />
                  <div style={{ flex:1, fontSize:13, fontWeight:600 }}>{g.nombre || `Grupo ${gid.slice(-3)}`}</div>
                  <div style={{ fontSize:11, color:finalizado?D.success:D.gold, fontWeight:700 }}>
                    {finalizado ? "✅ Finalizado" : `Hoyo ${(g.hole||0)+1}`}
                  </div>
                </div>
                {isAdmin && finalizado && (
                  <div style={{ marginTop:8, paddingLeft:20 }}>
                    <button onClick={() => {
                      // Admin general puede entrar al grupo finalizado para revisar/editar
                      const tc = {
                        torneoId: torneoId,
                        grupoId: gid,
                        grupoNombre: g.nombre || `Grupo ${gid.slice(-3)}`,
                        campo: torneo.campo, nHoles: torneo.nHoles,
                        apuesta: torneo.apuesta, marcaVal: torneo.marcaVal, tarjetaVal: torneo.tarjetaVal,
                        nombre: torneo.nombre,
                        rondaActiva: { ...g, status: "en_juego" }, // admin puede editar aunque esté finalizado
                      };
                      // Guardar config y redirigir
                      try { localStorage.setItem("h19-admin-grupo-override", JSON.stringify(tc)); } catch(e) {}
                      window.location.href = `${window.location.pathname}?admingrupo=${gid}`;
                    }} style={{ fontSize:11, padding:"5px 12px", border:`1px solid ${D.gold}`, borderRadius:8, background:D.goldDim, color:D.gold, fontWeight:700, cursor:"pointer" }}>
                      🔑 Entrar como Admin General
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </Card>

        {isAdmin && grupos.length > 0 && grupos.every(([,g]) => g.status === "finalizada") && (
          <CerrarTorneoPanel torneoId={torneoId} torneo={torneo} grupos={grupos} allPlayers={allPlayers} ranked={ranked} pars={pars} onCerrado={() => {
            try { localStorage.removeItem("h19-torneo-admin"); } catch(e) {}
            window.location.href = window.location.pathname;
          }} />
        )}

        {isAdmin && grupos.some(([,g]) => g.status !== "finalizada") && (
          <div style={{ background:D.goldDim, border:`1px solid ${D.gold}`, borderRadius:12, padding:"12px", marginBottom:12, textAlign:"center", fontSize:12, color:D.gold }}>
            ⏳ Esperando que todos los grupos finalicen...
          </div>
        )}

        <div style={{ textAlign:"center", fontSize:11, color:D.textDim, marginTop:8 }}>Vista en vivo · Actualización automática</div>
      </div>
    </div>
  );
}

// ─── TORNEO: VER CÓDIGOS ────────────────────────────────
function TorneoCodigosView({ torneoAdmin, onExit, appStyle }) {
  const [grupos, setGrupos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    get(ref(db, `torneos/${torneoAdmin.torneoId}`)).then(snap => {
      if (snap.exists()) {
        const t = snap.val();
        const gs = Array.isArray(t.gruposConfig) ? t.gruposConfig : Object.values(t.gruposConfig||{});
        setGrupos(gs);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [torneoAdmin.torneoId]);

  const torneoUrl = `${window.location.origin}${window.location.pathname}?torneo=${torneoAdmin.torneoId}`;

  return (
    <div style={appStyle}>
      <div style={{ background:D.surface, borderBottom:`1px solid ${D.border}`, padding:"16px 16px 12px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <div style={{ fontSize:18, fontWeight:900, color:D.gold }}>Códigos del torneo</div>
          <div style={{ fontSize:12, color:D.textSub }}>{torneoAdmin.nombre}</div>
        </div>
        <button onClick={onExit} style={{ fontSize:12, color:D.textSub, background:"none", border:`1px solid ${D.border}`, borderRadius:8, padding:"5px 10px", cursor:"pointer" }}>Volver</button>
      </div>
      <div style={{ padding:"12px" }}>
        {/* Link del torneo */}
        <Card>
          <SLabel>👀 Link del torneo en vivo</SLabel>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={() => {
              const msg = `🏆 H19 — *${torneoAdmin.nombre}*\nVer todos los grupos en vivo: ${torneoUrl}`;
              window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
            }} style={{ flex:1, padding:"10px", border:"none", borderRadius:10, background:"#25D366", color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer" }}>
              💬 Compartir por WhatsApp
            </button>
            <button onClick={() => { if (navigator.clipboard) navigator.clipboard.writeText(torneoUrl); }}
              style={{ flex:1, padding:"10px", border:`1px solid ${D.gold}`, borderRadius:10, background:D.goldDim, color:D.gold, fontSize:12, fontWeight:700, cursor:"pointer" }}>
              📋 Copiar link
            </button>
          </div>
        </Card>

        {loading && <div style={{ textAlign:"center", color:D.textSub, padding:20 }}>Cargando grupos...</div>}

        {/* Código por grupo */}
        {grupos.map((g, i) => (
          <Card key={g.id||i}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
              <SLabel style={{ marginBottom:0 }}>Grupo {i+1}: {g.nombre}</SLabel>
              <div style={{ fontSize:11, color:D.textSub }}>{g.players?.length||0} jugadores</div>
            </div>
            <div style={{ fontSize:30, fontWeight:900, letterSpacing:4, color:D.gold, textAlign:"center", padding:"10px 0" }}>{g.id}</div>
            {/* Jugadores del grupo */}
            {(g.players||[]).length > 0 && (
              <div style={{ marginBottom:10 }}>
                {(g.players||[]).map((p,pi) => (
                  <div key={pi} style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 0", borderBottom:pi<(g.players||[]).length-1?`1px solid ${D.border}`:"none" }}>
                    <Avatar name={String(p.name||'?')} id={p.id||pi} size={22} />
                    <span style={{ fontSize:12, fontWeight:600 }}>{p.name}</span>
                    <span style={{ fontSize:11, color:D.textSub, marginLeft:"auto" }}>HC {p.hc}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => {
                const playersStr = (g.players||[]).map(p=>`- ${p.name} (HC ${p.hc})`).join('\n');
                const msg = `🏌️ H19 Golf — *${torneoAdmin.nombre}*\n*Tu grupo: ${g.nombre}*\n${playersStr ? `Jugadores:\n${playersStr}\n\n` : ""}*Código para ingresar: ${g.id}*\nAbre la app: ${window.location.origin}\n-> "Entrar con código de grupo"\n\nVer torneo en vivo: ${torneoUrl}`;
                window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
              }} style={{ flex:1, padding:"10px", border:"none", borderRadius:10, background:"#25D366", color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                💬 Reenviar por WhatsApp
              </button>
              <button onClick={() => { if (navigator.clipboard) navigator.clipboard.writeText(g.id); }}
                style={{ flex:1, padding:"10px", border:`1px solid ${D.gold}`, borderRadius:10, background:D.goldDim, color:D.gold, fontSize:12, fontWeight:700, cursor:"pointer" }}>
                📋 Copiar código
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── GESTION DE JUGADORES ────────────────────────────────
function GestionJugadores({ players, scores, marcas, tarjetas, pars, hole, campo, rondaId, grupoNombre, apuesta, tarjetaVal, nHoles, dir, torneoConfig, castigos, setCastigos, setPlayers, setScores, setMarcas, updateGame }) {
  const [totalJugadoresTorneo, setTotalJugadoresTorneo] = useState(players.length);
  const [pinOk, setPinOk] = useState(!torneoConfig);
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [abandonando, setAbandonando] = useState(null);
  const [agregando, setAgregando] = useState(false);

  if (!pinOk) return (
    <Card>
      <SLabel>Acceso restringido</SLabel>
      <div style={{ fontSize:12, color:D.textSub, marginBottom:12, textAlign:"center" }}>
        Solo el administrador general puede modificar jugadores en un torneo
      </div>
      <input type="password" value={pinInput} onChange={e => setPinInput(e.target.value)}
        placeholder="PIN admin general" maxLength={6}
        style={{ width:"100%", padding:"12px", border:`1px solid ${pinError?D.danger:D.border}`, borderRadius:10, background:D.surface, color:D.text, fontSize:20, textAlign:"center", letterSpacing:6, fontWeight:700, boxSizing:"border-box", marginBottom:8 }} />
      {pinError && <div style={{ color:D.danger, fontSize:12, textAlign:"center", marginBottom:8 }}>PIN incorrecto</div>}
      <Btn onClick={() => {
        if (pinInput === ADMIN_PIN) { setPinOk(true); setPinError(false); setPinInput(""); }
        else setPinError(true);
      }}>Entrar</Btn>
    </Card>
  );

  const eliminarJugador = (pi, conCastigo) => {
    // En torneo paga a todos los jugadores del torneo, en única salida solo al grupo
    const totalJ = torneoConfig ? totalJugadoresTorneo : players.length;
    const restantesPago = totalJ - 1;
    const nuevoCastigos = [...castigos, {
      name: players[pi].name,
      conCastigo,
      scorePago: conCastigo ? apuesta : 0,
      tarjetaPago: conCastigo ? tarjetaVal * restantesPago : 0,
      totalJugadores: totalJ,
    }];
    setCastigos(nuevoCastigos);
    const newPlayers = players.filter((_,i) => i !== pi);
    const newScores = scores.filter((_,i) => i !== pi);
    const newMarcas = marcas.map(m => {
      if (!m) return m;
      const multi = Array.isArray(m.multi) ? m.multi : Object.values(m.multi||{});
      return {
        ...m,
        multi: multi.filter((_,i) => i !== pi),
        oyes: m.oyes === pi ? null : (m.oyes > pi ? m.oyes - 1 : m.oyes),
        regulation: m.regulation === pi ? null : (m.regulation > pi ? m.regulation - 1 : m.regulation),
      };
    });
    setPlayers(newPlayers); setScores(newScores); setMarcas(newMarcas);
    updateGame({ players:newPlayers, pars, scores:newScores, marcas:newMarcas, tarjetas, hole, campo, status:"en_juego", rondaId, grupoNombre, abandonos:nuevoCastigos });
    setAbandonando(null);
  };

  const agregarJugador = (p) => {
    const newPlayer = { ...p, opts:{score:true,marcas:true,tarjetas:true} };
    const newPlayers = [...players, newPlayer];
    const newScores = [...scores, Array(nHoles).fill(null)];
    const newMarcas = marcas.map(m => {
      if (!m) return m;
      const multi = Array.isArray(m.multi) ? m.multi : Object.values(m.multi||{});
      const emptyRow = Object.fromEntries(MARCAS_MULTI.map(mk => [mk.key, false]));
      return { ...m, multi: [...multi, emptyRow] };
    });
    setPlayers(newPlayers); setScores(newScores); setMarcas(newMarcas);
    updateGame({ players:newPlayers, pars, scores:newScores, marcas:newMarcas, tarjetas, hole, campo, status:"en_juego", rondaId, grupoNombre });
    setAgregando(false);
  };

  if (abandonando !== null) {
    const p = players[abandonando];
    const totalJ = torneoConfig ? totalJugadoresTorneo : players.length;
    const restantesPago = totalJ - 1;
    const cs = apuesta;
    const ct = tarjetaVal * restantesPago;
    return (
      <Card>
        <SLabel>Eliminar jugador</SLabel>
        <div style={{ fontSize:14, fontWeight:700, marginBottom:8 }}>{p.name} abandona</div>
        {torneoConfig && (
          <div style={{ marginBottom:12, padding:10, background:D.goldDim, borderRadius:10 }}>
            <div style={{ fontSize:12, color:D.gold, fontWeight:700, marginBottom:4 }}>Total jugadores en el torneo</div>
            <div style={{ fontSize:11, color:D.textSub, marginBottom:6 }}>Cuenta todos los jugadores de todos los grupos</div>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <button onClick={() => setTotalJugadoresTorneo(t => Math.max(players.length, t-1))}
                style={{ width:32, height:32, borderRadius:"50%", border:`1px solid ${D.border}`, background:D.surface, color:D.text, fontSize:18, cursor:"pointer" }}>-</button>
              <div style={{ fontSize:22, fontWeight:900, color:D.gold, minWidth:30, textAlign:"center" }}>{totalJugadoresTorneo}</div>
              <button onClick={() => setTotalJugadoresTorneo(t => t+1)}
                style={{ width:32, height:32, borderRadius:"50%", border:`1px solid ${D.gold}`, background:D.goldDim, color:D.gold, fontSize:18, cursor:"pointer" }}>+</button>
            </div>
          </div>
        )}
        <div style={{ background:D.redBg, border:`1px solid ${D.danger}44`, borderRadius:10, padding:12, marginBottom:12 }}>
          <div style={{ fontSize:13, fontWeight:700, color:D.danger, marginBottom:4 }}>Con castigo</div>
          <div style={{ fontSize:12, color:D.textSub }}>Score: ${cs}</div>
          <div style={{ fontSize:12, color:D.textSub }}>
            Tarjeta: ${tarjetaVal} x {restantesPago} jugadores{torneoConfig ? " (total torneo)" : ""} = ${ct}
          </div>
          <div style={{ fontSize:14, fontWeight:900, color:D.danger, marginTop:6 }}>Total que paga: ${cs + ct}</div>
        </div>
        <div style={{ display:"flex", gap:8, marginBottom:8 }}>
          <button onClick={() => eliminarJugador(abandonando, true)}
            style={{ flex:1, padding:"10px", border:"none", borderRadius:10, background:D.danger, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
            Con castigo
          </button>
          <button onClick={() => eliminarJugador(abandonando, false)}
            style={{ flex:1, padding:"10px", border:`1px solid ${D.border}`, borderRadius:10, background:"transparent", color:D.textSub, fontSize:13, cursor:"pointer" }}>
            Sin castigo
          </button>
        </div>
        <button onClick={() => setAbandonando(null)}
          style={{ width:"100%", padding:"8px", border:"none", background:"transparent", color:D.textDim, fontSize:12, cursor:"pointer" }}>
          Cancelar
        </button>
      </Card>
    );
  }

  if (agregando) {
    const disponibles = dir.filter(p => !players.find(pl => pl.id === p.id));
    return (
      <Card>
        <SLabel>Agregar jugador</SLabel>
        {disponibles.length === 0 && <div style={{ textAlign:"center", color:D.textSub, padding:16, fontSize:13 }}>Todos los jugadores del directorio ya estan en la ronda</div>}
        {disponibles.map(p => (
          <div key={p.id} onClick={() => agregarJugador(p)} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 0", borderBottom:`1px solid ${D.border}`, cursor:"pointer" }}>
            <Avatar name={p.name} id={p.id} size={30} />
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:600 }}>{p.name}</div>
              <div style={{ fontSize:11, color:D.textSub }}>HC {p.hc}</div>
            </div>
            <div style={{ fontSize:12, color:D.gold, fontWeight:700 }}>+ Agregar</div>
          </div>
        ))}
        <button onClick={() => setAgregando(false)} style={{ width:"100%", marginTop:10, padding:"10px", border:`1px solid ${D.border}`, borderRadius:10, background:"transparent", color:D.textSub, fontSize:13, cursor:"pointer" }}>
          Cancelar
        </button>
      </Card>
    );
  }

  return (
    <div>
      <Card>
        <SLabel>Jugadores en la ronda</SLabel>
        {players.map((p, pi) => (
          <div key={p.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 0", borderBottom:pi<players.length-1?`1px solid ${D.border}`:"none" }}>
            <Avatar name={p.name} id={p.id} size={30} />
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:600 }}>{p.name}</div>
              <div style={{ fontSize:11, color:D.textSub }}>HC {p.hc} - {scores[pi].filter(s=>s!==null&&s!==undefined).length} hoyos jugados</div>
            </div>
            <button onClick={() => setAbandonando(pi)}
              style={{ padding:"6px 12px", border:`1px solid ${D.danger}44`, borderRadius:8, background:D.redBg, color:D.danger, fontSize:11, fontWeight:700, cursor:"pointer" }}>
              Eliminar
            </button>
          </div>
        ))}
        {castigos.length > 0 && (
          <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${D.border}` }}>
            <div style={{ fontSize:11, fontWeight:700, color:D.danger, marginBottom:6 }}>Jugadores que abandonaron</div>
            {castigos.map((c, i) => (
              <div key={i} style={{ display:"flex", justifyContent:"space-between", fontSize:12, padding:"4px 0" }}>
                <span style={{ color:D.textSub }}>{c.name}</span>
                <span style={{ color:D.danger, fontWeight:700 }}>{c.conCastigo ? "$" + (c.scorePago + c.tarjetaPago) + " (castigo)" : "Sin castigo"}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
      <button onClick={() => setAgregando(true)}
        style={{ width:"100%", padding:"12px", border:`1px dashed ${D.gold}`, borderRadius:12, background:"transparent", color:D.gold, fontSize:13, fontWeight:700, cursor:"pointer", marginBottom:8 }}>
        Agregar jugador
      </button>
    </div>
  );
}

// ─── MODAL ABANDONO ────────────────────────────────
function AbandonoModal({ player, pi, players, apuesta, tarjetaVal, castigos, setCastigos, scores, setScores, marcas, setMarcas, setPlayers, pars, hole, campo, rondaId, grupoNombre, tarjetas, updateGame, onClose }) {
  const restantes = players.length - 1;
  const castScore = apuesta;
  const castTarjeta = tarjetaVal * restantes;
  const castTotal = castScore + castTarjeta;

  const eliminar = (conCastigo) => {
    const nuevoCastigos = [...castigos, { name:player.name, conCastigo, scorePago:conCastigo?castScore:0, tarjetaPago:conCastigo?castTarjeta:0 }];
    setCastigos(nuevoCastigos);
    const newPlayers = players.filter((_,i)=>i!==pi);
    const newScores = scores.filter((_,i)=>i!==pi);
    const newMarcas = marcas.map(m => {
      if (!m) return m;
      const newMulti = (Array.isArray(m.multi)?m.multi:Object.values(m.multi||{})).filter((_,i)=>i!==pi);
      const newOyes = m.oyes===pi?null:(m.oyes>pi?m.oyes-1:m.oyes);
      const newReg = m.regulation===pi?null:(m.regulation>pi?m.regulation-1:m.regulation);
      return {...m, multi:newMulti, oyes:newOyes, regulation:newReg};
    });
    setPlayers(newPlayers); setScores(newScores); setMarcas(newMarcas);
    const state = { players:newPlayers, pars, scores:newScores, marcas:newMarcas, tarjetas, hole, campo, status:"en_juego", rondaId, grupoNombre, abandonos:nuevoCastigos };
    updateGame(state);
    onClose();
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:D.card, borderRadius:16, padding:24, width:"100%", maxWidth:360 }}>
        <div style={{ fontSize:16, fontWeight:700, marginBottom:4 }}>🚪 {player.name} abandona</div>
        <div style={{ fontSize:12, color:D.textSub, marginBottom:16 }}>Elige si el jugador se va con o sin castigo</div>
        <div style={{ background:D.redBg, border:`1px solid ${D.danger}44`, borderRadius:10, padding:12, marginBottom:12 }}>
          <div style={{ fontSize:13, fontWeight:700, color:D.danger, marginBottom:6 }}>Con castigo</div>
          <div style={{ fontSize:12, color:D.textSub }}>
            Score: <strong style={{color:D.text}}>${castScore}</strong> + Tarjeta: <strong style={{color:D.text}}>${tarjetaVal} x {restantes} = ${castTarjeta}</strong>
          </div>
          <div style={{ fontSize:13, fontWeight:900, color:D.danger, marginTop:4 }}>Total que paga: ${castTotal}</div>
          <div style={{ fontSize:10, color:D.textDim, marginTop:4 }}>Repartido entre los {restantes} jugadores restantes</div>
        </div>
        <div style={{ display:"flex", gap:8, marginBottom:12 }}>
          <button onClick={() => eliminar(true)} style={{ flex:1, padding:"10px", border:"none", borderRadius:10, background:D.danger, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
            Con castigo
          </button>
          <button onClick={() => eliminar(false)} style={{ flex:1, padding:"10px", border:`1px solid ${D.border}`, borderRadius:10, background:"transparent", color:D.textSub, fontSize:13, fontWeight:600, cursor:"pointer" }}>
            Sin castigo
          </button>
        </div>
        <button onClick={onClose} style={{ width:"100%", padding:"8px", border:"none", background:"transparent", color:D.textDim, fontSize:12, cursor:"pointer" }}>
          Cancelar
        </button>
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
  const [showSplash, setShowSplash] = useState(true);
  const [splashPhase, setSplashPhase] = useState(0);
  const [activeTorneoConfig, setActiveTorneoConfig] = useState(null);
  const [torneoIsAdmin, setTorneoIsAdmin] = useState(false);
  const [savedTorneoAdmin, setSavedTorneoAdmin] = useState(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("h19-torneo-admin");
      if (saved) setSavedTorneoAdmin(JSON.parse(saved));
    } catch(e) {}
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rid = params.get("ronda");
    const tid = params.get("torneo");
    const agid = params.get("admingrupo");
    if (rid) { setRondaId(rid); setMode("spectator"); setShowSplash(false); return; }
    if (tid) { setRondaId(tid); setMode("torneo-spectator"); setShowSplash(false); return; }
    if (agid) {
      // Admin general entrando a un grupo específico
      try {
        const tc = JSON.parse(localStorage.getItem("h19-admin-grupo-override") || "null");
        if (tc && tc.grupoId === agid) {
          setActiveTorneoConfig(tc);
          setMode("torneo-admin");
          setShowSplash(false);
          return;
        }
      } catch(e) {}
    }
    else setMode("home");
    // Splash animation sequence
    setTimeout(() => setSplashPhase(1), 600);
    setTimeout(() => setSplashPhase(2), 2800);
    setTimeout(() => setShowSplash(false), 3600);
  }, []);

  const appStyle = { fontSize:14, fontFamily:"-apple-system,sans-serif", color:D.text, background:D.bg, minHeight:"100vh", maxWidth:420, margin:"0 auto" };

  // ── SPLASH SCREEN ──
  if (showSplash) {
    return <SplashScreen phase={splashPhase} appStyle={appStyle} />;
  }

  if (mode === "spectator" && rondaId) return <SpectatorView rondaId={rondaId} />;

  if (mode === "home") {
    return (
      <div style={{ ...appStyle, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24, gap:12 }}>
        <div style={{ fontSize:64, fontWeight:900, letterSpacing:-3, color:D.gold }}>H19</div>
        <div style={{ fontSize:18, color:D.textSub, letterSpacing:3, textTransform:"uppercase", marginBottom:8 }}>Chacales Team</div>
        {savedTorneoAdmin && (
          <div style={{ width:"100%", background:"#E8F5E9", border:`1px solid ${D.success}`, borderRadius:12, padding:"12px 14px", marginBottom:4 }}>
            <div style={{ fontSize:12, fontWeight:700, color:D.success, marginBottom:6 }}>🏆 Torneo activo: {savedTorneoAdmin.nombre}</div>
            <div style={{ display:"flex", gap:6 }}>
              <button onClick={() => setMode("pin-torneo-ver")}
                style={{ flex:1, padding:"8px", border:"none", borderRadius:8, background:D.success, color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                👁️ Ver torneo
              </button>
              <button onClick={() => setMode("pin-torneo-codigos")}
                style={{ flex:1, padding:"8px", border:`1px solid ${D.success}`, borderRadius:8, background:"transparent", color:D.success, fontSize:12, fontWeight:700, cursor:"pointer" }}>
                🔑 Ver códigos
              </button>
            </div>
          </div>
        )}
        <Btn onClick={() => setMode("pin")}>🏌️ Admin — Única salida</Btn>
        <Btn onClick={() => setMode("pin-torneo")} style={{ background:`linear-gradient(135deg,#1A5C24,#2E7D32)` }}>🏌️🏌️ Admin — Crear torneo</Btn>
        <Btn outline onClick={() => setMode("torneo-unirse")}>🔗 Entrar con código de grupo</Btn>
        <div style={{ width:"100%", borderTop:`1px solid ${D.border}`, margin:"4px 0" }} />
        <Btn outline onClick={() => setMode("spectator-input")}>👀 Ver ronda en vivo</Btn>
        <Btn outline onClick={() => setMode("torneo-spectator-input")}>🏆 Ver torneo en vivo</Btn>
      </div>
    );
  }

  if (mode === "pin-torneo") {
    return (
      <div style={{ ...appStyle, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24, gap:14 }}>
        <div style={{ fontSize:40, fontWeight:900, color:D.gold }}>H19</div>
        <div style={{ fontSize:14, color:D.textSub, marginBottom:8 }}>PIN de administrador</div>
        <input type="password" value={pinInput} onChange={e => setPinInput(e.target.value)} placeholder="PIN" maxLength={6}
          style={{ width:"100%", padding:14, border:`1px solid ${pinError?D.danger:D.border}`, borderRadius:12, background:D.surface, color:D.text, fontSize:22, textAlign:"center", letterSpacing:8, fontWeight:700 }} />
        {pinError && <div style={{ color:D.danger, fontSize:13 }}>PIN incorrecto</div>}
        <Btn onClick={() => { if (pinInput===ADMIN_PIN) { setMode("torneo-menu"); setPinError(false); } else setPinError(true); }}>Entrar</Btn>
        <button onClick={() => { setMode("home"); setPinInput(""); setPinError(false); }} style={{ fontSize:13, color:D.textSub, background:"none", border:"none", cursor:"pointer" }}>Volver</button>
      </div>
    );
  }

  if (mode === "pin-torneo-ver") {
    return (
      <div style={{ ...appStyle, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24, gap:14 }}>
        <div style={{ fontSize:40, fontWeight:900, color:D.gold }}>H19</div>
        <div style={{ fontSize:14, color:D.textSub, marginBottom:4, textAlign:"center", fontWeight:700 }}>Panel Admin General</div>
        <div style={{ fontSize:12, color:D.textSub, marginBottom:8 }}>{savedTorneoAdmin?.nombre}</div>
        <input type="password" value={pinInput} onChange={e => setPinInput(e.target.value)} placeholder="PIN" maxLength={6}
          style={{ width:"100%", padding:14, border:`1px solid ${pinError?D.danger:D.border}`, borderRadius:12, background:D.surface, color:D.text, fontSize:22, textAlign:"center", letterSpacing:8, fontWeight:700 }} />
        {pinError && <div style={{ color:D.danger, fontSize:13 }}>PIN incorrecto</div>}
        <Btn onClick={() => { if (pinInput===ADMIN_PIN) { setRondaId(savedTorneoAdmin.torneoId); setTorneoIsAdmin(true); setMode("torneo-spectator"); setPinError(false); setPinInput(""); } else setPinError(true); }}>Ver torneo</Btn>
        <button onClick={() => { setMode("home"); setPinInput(""); setPinError(false); }} style={{ fontSize:13, color:D.textSub, background:"none", border:"none", cursor:"pointer" }}>Volver</button>
      </div>
    );
  }

  if (mode === "pin-torneo-codigos") {
    return (
      <div style={{ ...appStyle, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24, gap:14 }}>
        <div style={{ fontSize:40, fontWeight:900, color:D.gold }}>H19</div>
        <div style={{ fontSize:14, color:D.textSub, marginBottom:4, textAlign:"center", fontWeight:700 }}>Ver códigos del torneo</div>
        <div style={{ fontSize:12, color:D.textSub, marginBottom:8 }}>{savedTorneoAdmin?.nombre}</div>
        <input type="password" value={pinInput} onChange={e => setPinInput(e.target.value)} placeholder="PIN" maxLength={6}
          style={{ width:"100%", padding:14, border:`1px solid ${pinError?D.danger:D.border}`, borderRadius:12, background:D.surface, color:D.text, fontSize:22, textAlign:"center", letterSpacing:8, fontWeight:700 }} />
        {pinError && <div style={{ color:D.danger, fontSize:13 }}>PIN incorrecto</div>}
        <Btn onClick={() => { if (pinInput===ADMIN_PIN) { setMode("torneo-codigos"); setPinError(false); setPinInput(""); } else setPinError(true); }}>Ver códigos</Btn>
        <button onClick={() => { setMode("home"); setPinInput(""); setPinError(false); }} style={{ fontSize:13, color:D.textSub, background:"none", border:"none", cursor:"pointer" }}>Volver</button>
      </div>
    );
  }

  if (mode === "torneo-codigos" && savedTorneoAdmin) return <TorneoCodigosView torneoAdmin={savedTorneoAdmin} onExit={() => setMode("home")} appStyle={appStyle} />;

  if (mode === "torneo-menu") {
    return (
      <div style={{ ...appStyle, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24, gap:16 }}>
        <div style={{ fontSize:40, fontWeight:900, color:D.gold }}>H19</div>
        <div style={{ fontSize:14, color:D.textSub, marginBottom:8, textAlign:"center" }}>Modo Varias Salidas</div>
        <Btn onClick={() => setMode("torneo-crear")} style={{ background:`linear-gradient(135deg,#1A5C24,#2E7D32)` }}>🆕 Crear nuevo torneo</Btn>
        <Btn outline onClick={() => setMode("torneo-unirse")}>🔗 Unirse a torneo existente</Btn>
        <button onClick={() => setMode("home")} style={{ fontSize:13, color:D.textSub, background:"none", border:"none", cursor:"pointer" }}>Volver</button>
      </div>
    );
  }

  if (mode === "torneo-crear") return <TorneoCrear
    onExit={(td) => { if (td?.torneoId) setSavedTorneoAdmin(td); setMode("home"); }}
    onIniciarGrupo={(tc) => { setActiveTorneoConfig(tc); setSavedTorneoAdmin(tc); setMode("torneo-admin"); }}
    appStyle={appStyle} />;
  if (mode === "torneo-unirse") return <TorneoUnirse onExit={() => setMode("home")} appStyle={appStyle} />;
  if (mode === "torneo-admin") return <AdminApp onExit={() => setMode("home")} torneoConfig={activeTorneoConfig} />;

  if (mode === "torneo-spectator-input") {
    return (
      <div style={{ ...appStyle, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24, gap:14 }}>
        <div style={{ fontSize:40, fontWeight:900, color:D.gold }}>H19</div>
        <div style={{ fontSize:14, color:D.textSub, marginBottom:8, textAlign:"center" }}>Ingresa el código del torneo</div>
        <input value={spectatorInput} onChange={e => setSpectatorInput(e.target.value.toUpperCase())} placeholder="Código torneo" maxLength={10}
          style={{ width:"100%", padding:14, border:`1px solid ${D.border}`, borderRadius:12, background:D.surface, color:D.text, fontSize:20, textAlign:"center", letterSpacing:4, fontWeight:700 }} />
        <Btn onClick={() => { if (spectatorInput.trim()) { setRondaId(spectatorInput.trim()); setTorneoIsAdmin(false); setMode("torneo-spectator"); } }}>Ver torneo</Btn>
        <button onClick={() => setMode("home")} style={{ fontSize:13, color:D.textSub, background:"none", border:"none", cursor:"pointer" }}>Volver</button>
      </div>
    );
  }

  if (mode === "torneo-spectator" && rondaId) return <TorneoSpectator torneoId={rondaId} appStyle={appStyle} isAdmin={torneoIsAdmin} />;

  if (mode === "pin") {
    return (
      <div style={{ ...appStyle, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24, gap:14 }}>
        <div style={{ fontSize:40, fontWeight:900, color:D.gold }}>H19</div>
        <div style={{ fontSize:14, color:D.textSub, marginBottom:8 }}>Ingresa tu PIN de administrador</div>
        <input type="password" value={pinInput} onChange={e => setPinInput(e.target.value)} placeholder="PIN" maxLength={6}
          style={{ width:"100%", padding:14, border:`1px solid ${pinError?D.danger:D.border}`, borderRadius:12, background:D.surface, color:D.text, fontSize:22, textAlign:"center", letterSpacing:8, fontWeight:700 }} />
        {pinError && <div style={{ color:D.danger, fontSize:13 }}>PIN incorrecto</div>}
        <Btn onClick={() => { if (pinInput===ADMIN_PIN) { setMode("admin"); setPinError(false); } else setPinError(true); }}>Entrar</Btn>
        <button onClick={() => { setMode("home"); setPinInput(""); setPinError(false); }} style={{ fontSize:13, color:D.textSub, background:"none", border:"none", cursor:"pointer" }}>Volver</button>
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
        <button onClick={() => setMode("home")} style={{ fontSize:13, color:D.textSub, background:"none", border:"none", cursor:"pointer" }}>Volver</button>
      </div>
    );
  }

  if (mode === "admin") return <AdminApp onExit={() => setMode("home")} />;

  return null;
}

// ─── ADMIN APP ────────────────────────────────────
function AdminApp({ onExit, torneoConfig = null }) {
  const [screen, setScreen] = useState(() => {
    if (!torneoConfig) return "dir";
    if (torneoConfig.rondaActiva) return "torneo-resume"; // ronda en curso, retomar
    if (torneoConfig.playersPreasignados?.length >= 2) return "score-torneo-init";
    return "grupo-nombre";
  });
  const [grupoNombre, setGrupoNombre] = useState("");
  const [dir, setDir] = useState([]);
  const [nid, setNid] = useState(6);
  const [sel, setSel] = useState(new Set());
  const [nHoles, setNHoles] = useState(torneoConfig?.nHoles || 9);
  const [campo, setCampo] = useState(torneoConfig?.campo || "huerta");
  const [apuesta, setApuesta] = useState(torneoConfig?.apuesta || DEFAULT_APUESTA);
  const [marcaVal, setMarcaVal] = useState(torneoConfig?.marcaVal || DEFAULT_MARCA_VAL);
  const [tarjetaVal, setTarjetaVal] = useState(torneoConfig?.tarjetaVal || DEFAULT_TARJETA_VAL);
  const [playerOpts, setPlayerOpts] = useState({});
  const [newName, setNewName] = useState("");
  const [newHC, setNewHC] = useState("");
  const [editingHC, setEditingHC] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [players, setPlayers] = useState([]);
  const [scores, setScores] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [tarjetas, setTarjetas] = useState(emptyTarjetas());
  const [dobleparEmpate, setDobleparEmpate] = useState(null);
  const [hole, setHole] = useState(0);
  const [pars, setPars] = useState([]);
  const [results, setResults] = useState(null);
  const [tab, setTab] = useState("score");
  const [showTabla, setShowTabla] = useState(false);
  const [rondaId, setRondaId] = useState(null);
  const [shareMsg, setShareMsg] = useState("");
  const [abandonoModal, setAbandonoModal] = useState(null);
  const [agregarModal, setAgregarModal] = useState(false);
  const [castigos, setCastigos] = useState([]);
  const [jugadoresPinOk, setJugadoresPinOk] = useState(!torneoConfig); // en única salida ya está autenticado
  const [jugadoresPinInput, setJugadoresPinInput] = useState("");
  const [jugadoresPinError, setJugadoresPinError] = useState(false);
  const [distGreen, setDistGreen] = useState(null);
  const [gpsError, setGpsError] = useState("");
  const [gpsLoading, setGpsLoading] = useState(false);
  const [savedRonda, setSavedRonda] = useState(null);
  const [nombreRonda, setNombreRonda] = useState("");
  const [historial, setHistorial] = useState([]);
  const [historialTorneos, setHistorialTorneos] = useState([]);
  const [expandedHist, setExpandedHist] = useState(null);
  const [expandedTorneoHist, setExpandedTorneoHist] = useState(null); // torneoId
  const [expandedGrupoHist, setExpandedGrupoHist] = useState(null);   // grupoId
  const [histTab, setHistTab] = useState("rondas");
  const [confirmDeleteHist, setConfirmDeleteHist] = useState(null);

  // Load historial from Firebase
  useEffect(() => {
    const histRef = ref(db, "historial");
    const unsub = onValue(histRef, snap => {
      if (snap.exists()) {
        const data = snap.val();
        const lista = Object.entries(data).map(([id, r]) => ({id, ...r}))
          .sort((a,b) => (b.fechaTs||0) - (a.fechaTs||0));
        setHistorial(lista);
      }
    });
    return () => unsub();
  }, []);

  // Load historial de torneos from Firebase
  useEffect(() => {
    const torneoRef = ref(db, "torneos");
    const unsub = onValue(torneoRef, snap => {
      if (snap.exists()) {
        const data = snap.val();
        const lista = Object.entries(data)
          .filter(([,t]) => t.status === "finalizado")
          .map(([id, t]) => ({ id, ...t }))
          .sort((a,b) => (b.createdAt||0) - (a.createdAt||0));
        setHistorialTorneos(lista);
      }
    });
    return () => unsub();
  }, []);

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

  const grupoId = torneoConfig?.grupoId || rondaId;

  const syncFirebase = (state) => {
    try {
      // En modo torneo, el grupoId es el identificador primario
      if (torneoConfig && torneoConfig.torneoId) {
        const gid = torneoConfig.grupoId;
        if (!gid) return;
        set(ref(db, `torneos/${torneoConfig.torneoId}/grupos/${gid}`), {
          nombre: state.grupoNombre || torneoConfig.grupoNombre || grupoNombre || `Grupo`,
          players: state.players,
          scores: state.scores,
          marcas: state.marcas,
          tarjetas: state.tarjetas,
          hole: state.hole,
          status: state.status,
          abandonos: state.abandonos || [],
          updatedAt: Date.now(),
        });
      }
      // También guardar en rondas si tenemos rondaId
      if (rondaId) {
        set(ref(db, `rondas/${rondaId}`), { ...state, updatedAt:Date.now() });
      }
    } catch(e) {}
  };

  const updateGame = (state) => { saveToLocal(state); syncFirebase(state); };
  const getState = () => ({ players, pars, scores, marcas, tarjetas, hole, campo, status:"en_juego", rondaId, apuesta, marcaVal, tarjetaVal, grupoNombre, abandonos:castigos });

  const resumeRonda = () => {
    if (!savedRonda) return;
    setPlayers(savedRonda.players||[]); setScores(savedRonda.scores||[]);
    setMarcas(savedRonda.marcas||[]); setTarjetas(normalizeTarjetas(savedRonda.tarjetas));
    setHole(savedRonda.hole||0); setPars(savedRonda.pars||[]);
    setCampo(savedRonda.campo||"huerta"); setRondaId(savedRonda.rondaId||null);
    setCastigos(savedRonda.abandonos||[]);
    setTab("score"); setScreen("score"); setSavedRonda(null);
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
    const ps = dir.filter(p => sel.has(p.id)).map(p => ({
      ...p,
      opts: playerOpts[p.id] || {score:true, marcas:true, tarjetas:true},
    }));
    const basePares = CAMPOS[campo].pares || Array(18).fill(4);
    const p = basePares.slice(0, nHoles);
    const initScores = ps.map(() => Array(nHoles).fill(null));
    const initMarcas = Array(nHoles).fill(null).map(() => emptyMarca(ps.length));
    const initTarjetas = emptyTarjetas();
    const rid = Math.random().toString(36).substring(2,8).toUpperCase();
    const gid = torneoConfig?.grupoId || rid; // usar grupoId del torneo si existe
    setRondaId(rid); setPlayers(ps); setPars(p);
    setScores(initScores); setMarcas(initMarcas); setTarjetas(initTarjetas);
    setHole(0); setTab("score"); setResults(null);
    const state = { players:ps, pars:p, scores:initScores, marcas:initMarcas, tarjetas:initTarjetas, hole:0, campo, status:"en_juego", rondaId:rid, grupoNombre };
    saveToLocal(state);
    try { set(ref(db, `rondas/${rid}`), { ...state, createdAt:Date.now(), updatedAt:Date.now() }); } catch(e) {}
    // Si estamos en modo torneo, registrar el grupo con el grupoId del torneo
    if (torneoConfig) {
      try { set(ref(db, `torneos/${torneoConfig.torneoId}/grupos/${gid}`), {
        nombre: grupoNombre || torneoConfig.grupoNombre, players:ps, scores:initScores, marcas:initMarcas, tarjetas:initTarjetas, hole:0, status:"en_juego", updatedAt:Date.now()
      }); } catch(e) {}
    }
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

    // Peor score en el hoyo: buscar todos los jugadores que hicieron doble par o peor en el hoyo actual
    const peoresEnHoyo = newScores.map((row, i) => {
      if (players[i]?.opts?.tarjetas === false) return null;
      const sc = row[hole];
      if (sc === null || sc === undefined) return null;
      return sc >= limit ? sc : null;
    });
    const candidatos = peoresEnHoyo.map((sc, i) => sc !== null ? i : -1).filter(i => i >= 0);

    if (candidatos.length === 0) {
      if (newTarjetas["doblepar_hole"] === hole) {
        newTarjetas["doblepar"] = null;
        newTarjetas["doblepar_hole"] = null;
      }
      setDobleparEmpate(null);
    } else {
      // Encontrar el PEOR score entre los candidatos
      const peorScore = Math.max(...candidatos.map(i => newScores[i][hole]));
      const peoresIdx = candidatos.filter(i => newScores[i][hole] === peorScore);

      if (peoresIdx.length === 1) {
        // Solo uno con el peor score — asignar automáticamente
        newTarjetas["doblepar"] = peoresIdx[0];
        newTarjetas["doblepar_hole"] = hole;
        setDobleparEmpate(null);
      } else {
        // Empate real en el peor score — mostrar selector
        setDobleparEmpate({ hoyo: hole, candidatos: peoresIdx });
        newTarjetas["doblepar_hole"] = hole;
      }
    }

    // Peor Score: asignar al jugador con peor neto acumulado hasta ahora
    const netosActuales = players.map((p, i) => {
      if (p.opts?.tarjetas === false) return null;
      const jugados = newScores[i].filter(v => v !== null && v !== undefined);
      if (jugados.length === 0) return null;
      return jugados.reduce((a,b)=>a+b,0) - p.hc;
    });
    const validNetos = netosActuales.filter(n => n !== null);
    if (validNetos.length > 0) {
      const peorNeto = Math.max(...validNetos);
      const peores = netosActuales.map((n,i) => n === peorNeto ? i : -1).filter(i => i >= 0);
      newTarjetas["peorscore"] = peores.length === 1 ? peores[0] : peores;
    }
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
    // Guardar en qué hoyo se asignó el threeput para bloquear Sandy solo en ese hoyo
    if (tkey==="threeput") {
      newTarjetas["threeput_hole"] = tarjetas["threeput"]===pi ? null : hole;
    }
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

  const [distWaypoint, setDistWaypoint] = useState(null);

  const medirDistancia = () => {
    const green = getGreenCoord(campo, hole);
    if (!green) { setGpsError("Este campo no tiene GPS configurado para este hoyo"); return; }
    if (!navigator.geolocation) { setGpsError("Tu navegador no soporta GPS"); return; }
    setGpsLoading(true); setGpsError(""); setDistGreen(null); setDistWaypoint(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const yd = distanciaYardas(pos.coords.latitude, pos.coords.longitude, green.lat, green.lng);
        setDistGreen(yd);
        const wp = getWaypoint(campo, hole);
        if (wp) {
          const ydw = distanciaYardas(pos.coords.latitude, pos.coords.longitude, wp.lat, wp.lng);
          setDistWaypoint({ label:wp.label, yards:ydw });
        }
        setGpsLoading(false);
      },
      (err) => {
        setGpsError(err.code === 1 ? "Activa el permiso de ubicación para usar el GPS" : "No se pudo obtener tu ubicación");
        setGpsLoading(false);
      },
      { enableHighAccuracy:true, timeout:10000, maximumAge:5000 }
    );
  };

  // Reinicia la distancia al cambiar de hoyo
  useEffect(() => { setDistGreen(null); setDistWaypoint(null); setGpsError(""); setDobleparEmpate(null); }, [hole]);


  const finish = () => {
    try { localStorage.removeItem("h19-ronda-activa"); } catch(e) {}
    // Bloquear código del grupo para evitar reingreso
    if (torneoConfig?.grupoId) {
      try { set(ref(db, `codigosGrupo/${torneoConfig.grupoId}/status`), "finalizado"); } catch(e) {}
    }
    const fecha = new Date();
    const fechaStr = `${fecha.getDate().toString().padStart(2,'0')}/${(fecha.getMonth()+1).toString().padStart(2,'0')}`;
    const autoNombre = nombreRonda.trim() || `Ronda ${fechaStr}`;
    const sc = commitHole(scores, hole); setScores(sc);
    const fullScores = sc.map(row => row.map((v,j) => v===null?pars[j]:v));
    const rawScores = sc;
    // El score de los abandonados con castigo entra al pozo
    const extraPotAbandonos = castigos.filter(c=>c.conCastigo).reduce((a,c)=>a+c.scorePago,0);
    const r = calcMoney(players, fullScores, apuesta, extraPotAbandonos);
    const playsScoreCount = players.filter(p => p.opts ? p.opts.score !== false : true).length;
    const siParaHC = (playsScoreCount >= 10 && r.fi.length === 1) ? r.si : [];
    const hc = calcHC(players, fullScores, siParaHC);
    const marcasMoney = calcMarcasMoney(players, marcas, marcaVal);
    const marcasPtsRaw = calcMarcasPts(players, marcas);
    const marcasPts = players.map((p,i) => (p.opts?.marcas === false) ? 0 : marcasPtsRaw[i]);
    const tarjetasMoney = calcTarjetasMoney(players, tarjetas, tarjetaVal);
    const tarjetasCount = players.map((p,i) => {
      if (p.opts?.tarjetas === false) return 0;
      let c = 0;
      TARJETAS.forEach(t => {
        const owner = tarjetas[t.key];
        if (Array.isArray(owner)) { if (owner.includes(i)) c += 1/owner.length; }
        else if (owner === i) c += 1;
      });
      return Math.round(c * 10) / 10;
    });
    const resultData = { ...r, hcUpdates:hc, marcasMoney, marcasPts, tarjetasMoney, tarjetasCount, fullScores, rawScores, castigos };
    setResults(resultData);
    // Guardar estado final en Firebase (scores completos permanentes)
    const finalState = { ...getState(), scores:sc, status:"finalizada" };
    updateGame(finalState);
    // Si estamos en modo torneo, guardar resultados finales del grupo explícitamente
    if (torneoConfig?.torneoId) {
      const gid = torneoConfig.grupoId || rondaId;
      try {
        set(ref(db, `torneos/${torneoConfig.torneoId}/grupos/${gid}`), {
          nombre: grupoNombre || torneoConfig.grupoNombre || "Grupo",
          players, scores: sc, marcas, tarjetas,
          hole, status: "finalizada", updatedAt: Date.now(),
          resultados: {
            ganador: r.fi.map(i=>players[i].name).join(" · "),
            netGanador: r.nets[r.fi[0]],
          }
        });
      } catch(e) {}
    }
    // Guardar en historial
    try {
      const jugadoresDetalle = players.map((p, i) => ({
        name: p.name,
        hc: p.hc,
        bruto: fullScores[i].reduce((a,b)=>a+b,0),
        neto: r.nets[i],
        scoreMoney: r.money[i],
        marcasMoney: marcasMoney[i],
        marcasPts: marcasPts[i],
        tarjetasMoney: tarjetasMoney[i],
        tarjetasCount: tarjetasCount[i],
        total: r.money[i] + marcasMoney[i] + tarjetasMoney[i],
      }));
      const histData = {
        nombre: autoNombre,
        campo, nHoles, fechaTs: Date.now(),
        fecha: fechaStr,
        ganador: r.fi.map(i=>players[i].name).join(" · "),
        netGanador: r.nets[r.fi[0]],
        rondaId,
        apuesta, marcaVal, tarjetaVal,
        jugadores: jugadoresDetalle,
        hcUpdates: hc.map(u => ({ name:u.name, before:u.before, delta:u.delta, after:u.after })),
        // Tarjeta completa hoyo por hoyo
        pars,
        playerNames: players.map(p=>p.name),
        playerOptsArr: players.map(p=>p.opts || {score:true,marcas:true,tarjetas:true}),
        scoresPorHoyo: fullScores,
        marcas,
        tarjetas,
      };
      set(ref(db, `historial/${rondaId}`), histData)
        .catch(err => alert("Error guardando historial: " + err.message));
      // Si estamos en modo torneo, también guardar en historialTorneos
      if (torneoConfig) {
        const torneoHistKey = `${torneoConfig.torneoId}_${torneoConfig.grupoId}`;
        set(ref(db, `historialTorneos/${torneoHistKey}`), {
          ...histData,
          torneoId: torneoConfig.torneoId,
          torneoNombre: torneoConfig.nombre,
          grupoId: torneoConfig.grupoId,
          grupoNombre: grupoNombre || torneoConfig.grupoNombre,
        }).catch(() => {});
      }
    } catch(e) { alert("Error en bloque historial: " + e.message); }
    setScreen("res");
  };

  const confirmHC = () => {
    if (!results) return;
    const updated = dir.map(p => { const u=results.hcUpdates.find(u=>u.id===p.id); return u?{...p,hc:u.after}:p; });
    saveDir(updated); setSel(new Set()); setScreen("sel");
  };

  const shareRonda = () => {
    const url = torneoConfig
      ? `${window.location.origin}${window.location.pathname}?torneo=${torneoConfig.torneoId}`
      : `${window.location.origin}${window.location.pathname}?ronda=${rondaId}`;
    const label = torneoConfig ? "¡Link del torneo copiado!" : "¡Link copiado!";
    if (navigator.clipboard) { navigator.clipboard.writeText(url); setShareMsg(label); setTimeout(()=>setShareMsg(""),2500); }
    else { setShareMsg(torneoConfig ? `Código torneo: ${torneoConfig.torneoId}` : `Código: ${rondaId}`); setTimeout(()=>setShareMsg(""),4000); }
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

  // ── RETOMAR RONDA EN MODO TORNEO ──
  if (screen === "torneo-resume" && torneoConfig?.rondaActiva) {
    const ra = torneoConfig.rondaActiva;
    const ps = Array.isArray(ra.players) ? ra.players : Object.values(ra.players||{});
    const h = ra.hole || 0;

    const reanudar = () => {
      const basePares = CAMPOS[campo].pares || Array(18).fill(4);
      const p = basePares.slice(0, nHoles);

      // Restaurar scores asegurando que cada jugador tenga exactamente nHoles entradas
      const sc = ps.map((_, pi) => {
        const rawRow = Array.isArray(ra.scores)
          ? ra.scores[pi]
          : Object.values(ra.scores||{})[pi];
        const row = Array.isArray(rawRow) ? rawRow : Object.values(rawRow||{});
        // Pad o trim al tamaño correcto
        const padded = Array(nHoles).fill(null);
        for (let i = 0; i < Math.min(row.length, nHoles); i++) {
          padded[i] = row[i] ?? null;
        }
        return padded;
      });

      // Restaurar marcas
      const rawMarcas = ra.marcas
        ? (Array.isArray(ra.marcas) ? ra.marcas : Object.values(ra.marcas))
        : [];
      const mc = Array(nHoles).fill(null).map((_, hi) => {
        const m = rawMarcas[hi];
        if (!m) return emptyMarca(ps.length);
        return {
          multi: Array.isArray(m.multi) ? m.multi : Object.values(m.multi||{}).map(r => typeof r === 'object' ? r : {}),
          oyes: m.oyes ?? null,
          regulation: m.regulation ?? null,
        };
      });

      const tj = normalizeTarjetas(ra.tarjetas);

      setPlayers(ps);
      setScores(sc);
      setMarcas(mc);
      setTarjetas(tj);
      setHole(h);
      setPars(p);
      setTab("score");
      setGrupoNombre(torneoConfig.grupoNombre || "Mi Grupo");
      // Restaurar abandonos
      const abandonosGuardados = ra.abandonos ? (Array.isArray(ra.abandonos) ? ra.abandonos : Object.values(ra.abandonos)) : [];
      setCastigos(abandonosGuardados);

      // Buscar el rondaId en localStorage, si no hay generar uno nuevo
      let rid = null;
      try {
        const saved = localStorage.getItem("h19-ronda-activa");
        if (saved) {
          const data = JSON.parse(saved);
          if (data.rondaId) rid = data.rondaId;
        }
      } catch(e) {}
      if (!rid) rid = Math.random().toString(36).substring(2,8).toUpperCase();
      setRondaId(rid);
      // Guardar estado actual en localStorage
      const state = { players:ps, pars:p, scores:sc, marcas:mc, tarjetas:tj, hole:h, campo, status:"en_juego", rondaId:rid, grupoNombre:torneoConfig.grupoNombre };
      saveToLocal(state);

      setScreen("score");
    };

    return (
      <div style={appSt}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12, padding:32, textAlign:"center" }}>
          <div style={{ fontSize:40 }}>⛳</div>
          <div style={{ fontSize:18, fontWeight:700, color:D.gold }}>{torneoConfig.grupoNombre}</div>
          <div style={{ fontSize:13, color:D.textSub }}>{torneoConfig.nombre}</div>
          <div style={{ padding:"10px 16px", background:D.greenBg, border:`1px solid ${D.success}`, borderRadius:12, marginTop:8 }}>
            <div style={{ fontSize:13, fontWeight:700, color:D.success, marginBottom:4 }}>⛳ Ronda en curso encontrada</div>
            <div style={{ fontSize:12, color:D.textSub }}>Hoyo {h+1} · {ps.length} jugadores</div>
            <div style={{ fontSize:11, color:D.textSub, marginTop:2 }}>
              {ps.map(p => p.name).join(", ")}
            </div>
          </div>
          <Btn onClick={reanudar}>▶ Continuar desde hoyo {h+1}</Btn>
        </div>
      </div>
    );
  }

  // ── INICIO AUTOMÁTICO EN MODO TORNEO CON JUGADORES PRE-ASIGNADOS ──
  if (screen === "score-torneo-init" && torneoConfig?.playersPreasignados?.length >= 2) {
    // Auto-iniciar la ronda con los jugadores asignados
    const ps = torneoConfig.playersPreasignados;
    const basePares = CAMPOS[campo].pares || Array(18).fill(4);
    const p = basePares.slice(0, nHoles);
    if (players.length === 0) {
      // Inicializar solo una vez
      const initScores = ps.map(() => Array(nHoles).fill(null));
      const initMarcas = Array(nHoles).fill(null).map(() => emptyMarca(ps.length));
      const initTarjetas = emptyTarjetas();
      const rid = Math.random().toString(36).substring(2,8).toUpperCase();
      setRondaId(rid); setPlayers(ps); setPars(p);
      setScores(initScores); setMarcas(initMarcas); setTarjetas(initTarjetas);
      setHole(0); setTab("score"); setResults(null);
      setGrupoNombre(torneoConfig.grupoNombre || "Mi Grupo");
      const state = { players:ps, pars:p, scores:initScores, marcas:initMarcas, tarjetas:initTarjetas, hole:0, campo, status:"en_juego", rondaId:rid, grupoNombre:torneoConfig.grupoNombre };
      saveToLocal(state);
      try { set(ref(db, `rondas/${rid}`), { ...state, createdAt:Date.now(), updatedAt:Date.now() }); } catch(e) {}
      try { set(ref(db, `torneos/${torneoConfig.torneoId}/grupos/${torneoConfig.grupoId}`), {
        nombre: torneoConfig.grupoNombre, players:ps, scores:initScores, marcas:initMarcas, tarjetas:initTarjetas, hole:0, status:"en_juego", updatedAt:Date.now()
      }); } catch(e) {}
    }
    return (
      <div style={appSt}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12, padding:40, textAlign:"center" }}>
          <div style={{ fontSize:40 }}>⛳</div>
          <div style={{ fontSize:18, fontWeight:700, color:D.gold }}>{torneoConfig.grupoNombre}</div>
          <div style={{ fontSize:13, color:D.textSub }}>{torneoConfig.nombre}</div>
          <div style={{ fontSize:12, color:D.textSub, marginTop:8 }}>
            {ps.length} jugadores asignados:
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8, justifyContent:"center", marginBottom:16 }}>
            {ps.map(p => (
              <div key={p.id} style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 12px", background:D.goldDim, borderRadius:20, border:`1px solid ${D.gold}44` }}>
                <Avatar name={p.name} id={p.id} size={22} />
                <span style={{ fontSize:12, fontWeight:600 }}>{p.name} · HC {p.hc}</span>
              </div>
            ))}
          </div>
          <Btn onClick={() => setScreen("score")}>🏌️ Iniciar ronda del grupo</Btn>
        </div>
      </div>
    );
  }

  // ── NOMBRE DEL GRUPO (solo en modo torneo sin jugadores pre-asignados) ──
  if (screen === "grupo-nombre" && torneoConfig) return (
    <div style={appSt}>
      <div style={{ background:D.surface, borderBottom:`1px solid ${D.border}`, padding:"20px 16px 14px", textAlign:"center" }}>
        <div style={{ fontSize:22, fontWeight:900, color:D.gold }}>H19 — Torneo</div>
        <div style={{ fontSize:13, color:D.textSub, marginTop:2 }}>{torneoConfig.nombre}</div>
      </div>
      <div style={{ padding:"24px 16px", display:"flex", flexDirection:"column", gap:16, alignItems:"center" }}>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:32, marginBottom:8 }}>🏌️</div>
          <div style={{ fontSize:16, fontWeight:700, color:D.text, marginBottom:4 }}>¿Cómo se llama tu grupo?</div>
          <div style={{ fontSize:12, color:D.textSub }}>Ej: "Grupo 1", "Los Chacales A", "Salida 8am"</div>
        </div>
        <input value={grupoNombre} onChange={e=>setGrupoNombre(e.target.value)} placeholder="Nombre del grupo"
          style={{ width:"100%", padding:"14px 16px", border:`1px solid ${D.border}`, borderRadius:12, background:D.surface, color:D.text, fontSize:16, textAlign:"center", boxSizing:"border-box" }} />
        <div style={{ width:"100%", padding:"10px 14px", background:D.goldDim, borderRadius:10, fontSize:12, color:D.gold }}>
          <div style={{ fontWeight:700, marginBottom:4 }}>📋 Configuración del torneo:</div>
          <div>{CAMPOS[torneoConfig.campo]?.nombre} · {torneoConfig.nHoles} hoyos</div>
          <div>Score ${torneoConfig.apuesta} · Marcas ${torneoConfig.marcaVal} · Tarjetas ${torneoConfig.tarjetaVal}</div>
        </div>
        <Btn onClick={() => { if (grupoNombre.trim()) setScreen("dir"); }} disabled={!grupoNombre.trim()}>
          Continuar ->
        </Btn>
        <button onClick={onExit} style={{ fontSize:13, color:D.textSub, background:"none", border:"none", cursor:"pointer" }}>Volver</button>
      </div>
    </div>
  );

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
        <TabBar tabs={[{key:"dir",label:"👥 Jugadores"},{key:"hist",label:"📋 Historial"},{key:"sel",label:"⛳ Nueva ronda"}]} active="dir" onChange={k => { if(k==="sel") setScreen("sel"); if(k==="hist") setScreen("hist"); }} />
        {torneoConfig && (
          <div style={{ background:D.goldDim, border:`1px solid ${D.gold}`, borderRadius:12, padding:"12px 16px", marginBottom:12 }}>
            <div style={{ fontSize:13, fontWeight:700, color:D.gold, marginBottom:4 }}>🏆 Modo Torneo</div>
            <div style={{ fontSize:12, color:D.textSub }}>{torneoConfig.nombre}</div>
            <div style={{ fontSize:11, color:D.textSub, marginTop:2 }}>Grupo: <strong>{grupoNombre}</strong> · {CAMPOS[torneoConfig.campo]?.nombre} · {torneoConfig.nHoles} hoyos</div>
          </div>
        )}
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
          {dir.map((p, idx) => {
            const ultimosNombres = new Set((historial[0]?.jugadores||[]).map(j=>j.name));
            const jugoUltima = ultimosNombres.has(p.name);
            return (
            <div key={p.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 0", borderBottom:idx<dir.length-1?`1px solid ${D.border}`:"none" }}>
              <div style={{ position:"relative" }}>
                <Avatar name={p.name} id={p.id} size={36} />
                {jugoUltima && <div title="Jugó la última ronda" style={{ position:"absolute", bottom:-2, right:-2, width:12, height:12, borderRadius:"50%", background:D.success, border:`2px solid ${D.surface}` }} />}
              </div>
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
            );
          })}
        </Card>
        <Card>
          <SLabel>Agregar jugador</SLabel>
          <div style={{ display:"flex", gap:8 }}>
            <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Nombre" style={{ flex:1, padding:"10px 12px", border:`1px solid ${D.border}`, borderRadius:10, background:D.surface, color:D.text, fontSize:14 }} />
            <input value={newHC} onChange={e=>setNewHC(e.target.value)} type="number" min="0" max="54" placeholder="HC" style={{ width:56, padding:"10px 8px", border:`1px solid ${D.border}`, borderRadius:10, background:D.surface, color:D.text, fontSize:14, textAlign:"center" }} />
            <button onClick={addPlayer} style={{ padding:"10px 14px", border:`1px solid ${D.gold}`, borderRadius:10, background:D.goldDim, color:D.gold, fontSize:13, fontWeight:700, cursor:"pointer" }}>+ Agregar</button>
          </div>
        </Card>
        <button onClick={() => {
          const ultimosNombres = new Set((historial[0]?.jugadores||[]).map(j=>j.name));
          const lines = [
            `📋 *H19 Golf — Reporte de Handicaps*`,
            `_Actualizado al ${new Date().toLocaleDateString('es-MX')}_`,
            ``,
            ...dir.slice().sort((a,b)=>a.hc-b.hc).map(p => `${ultimosNombres.has(p.name)?"🟢":"⚪"} ${p.name} — HC ${p.hc}`),
            ``,
            `🟢 = Jugó la última ronda${historial[0]?.nombre ? ` (${historial[0].nombre})` : ""}`,
          ].join("\n");
          const url = `https://wa.me/?text=${encodeURIComponent(lines)}`;
          window.open(url, "_blank");
        }} style={{ width:"100%", padding:"12px", border:"none", borderRadius:12, background:"#25D366", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", marginBottom:10 }}>
          💬 Compartir reporte de handicaps
        </button>
        <Btn onClick={() => setScreen("sel")}>⛳ Iniciar ronda</Btn>
      </div>
    </div>
  );

  // ── HISTORIAL ──
  if (screen==="hist") return (
    <div style={appSt}>
      <div style={{ background:D.surface, borderBottom:`1px solid ${D.border}`, padding:"20px 16px 14px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ fontSize:28, fontWeight:900, color:D.gold }}>H19</div>
          <button onClick={onExit} style={{ fontSize:12, color:D.textSub, background:"none", border:`1px solid ${D.border}`, borderRadius:8, padding:"5px 10px", cursor:"pointer" }}>Salir</button>
        </div>
      </div>
      <div style={{ padding:"12px 12px" }}>
        <TabBar tabs={[{key:"dir",label:"👥 Jugadores"},{key:"hist",label:"📋 Historial"},{key:"sel",label:"⛳ Nueva ronda"}]} active="hist" onChange={k => { if(k==="dir") setScreen("dir"); if(k==="sel") setScreen("sel"); }} />

        {/* Sub-tabs: Rondas vs Torneos */}
        <div style={{ display:"flex", gap:8, marginBottom:12 }}>
          <button onClick={() => setHistTab("rondas")} style={{ flex:1, padding:"9px", border:`1px solid ${histTab==="rondas"?D.gold:D.border}`, borderRadius:10, background:histTab==="rondas"?D.goldDim:"transparent", color:histTab==="rondas"?D.gold:D.textSub, fontSize:13, fontWeight:700, cursor:"pointer" }}>
            🏌️ Rondas ({historial.length})
          </button>
          <button onClick={() => setHistTab("torneos")} style={{ flex:1, padding:"9px", border:`1px solid ${histTab==="torneos"?D.gold:D.border}`, borderRadius:10, background:histTab==="torneos"?D.goldDim:"transparent", color:histTab==="torneos"?D.gold:D.textSub, fontSize:13, fontWeight:700, cursor:"pointer" }}>
            🏆 Torneos ({historialTorneos.length})
          </button>
        </div>

        {/* ── RONDAS ── */}
        {histTab === "rondas" && (
          <Card>
            <SLabel>Rondas jugadas</SLabel>
            {historial.length === 0 && (
              <div style={{ textAlign:"center", color:D.textSub, padding:24, fontSize:13 }}>No hay rondas guardadas aún</div>
            )}
          {historial.map((r, idx) => {
            const isOpen = expandedHist === r.id;
            return (
            <div key={r.id} style={{ padding:"12px 0", borderBottom:idx<historial.length-1?`1px solid ${D.border}`:"none" }}>
              <div onClick={() => setExpandedHist(isOpen ? null : r.id)} style={{ cursor:"pointer" }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
                  <div style={{ fontSize:14, fontWeight:700 }}>{r.nombre}</div>
                  <div style={{ fontSize:11, color:D.textSub }}>{r.fecha}</div>
                </div>
                <div style={{ fontSize:12, color:D.textSub, marginBottom:6 }}>
                  {CAMPOS[r.campo]?.nombre || r.campo} · {r.nHoles} hoyos · {r.jugadores?.length || 0} jugadores
                </div>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div style={{ fontSize:12, background:D.goldDim, color:D.gold, padding:"2px 10px", borderRadius:10, fontWeight:700 }}>
                    🏆 {r.ganador} ({r.netGanador} neto)
                  </div>
                  <div style={{ fontSize:11, color:D.textSub }}>{isOpen ? "▲ Ocultar" : "▼ Ver desglose"}</div>
                </div>
              </div>
              {isOpen && r.jugadores && (
                <div style={{ marginTop:10, background:D.bg, borderRadius:10, padding:10 }}>
                  {r.jugadores.slice().sort((a,b)=>a.neto-b.neto).map((j, pos) => (
                    <div key={j.name} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 0", borderBottom:pos<r.jugadores.length-1?`1px solid ${D.border}`:"none" }}>
                      <div style={{ width:20, fontSize:12, fontWeight:900, color:pos===0?D.gold:D.textSub }}>{pos+1}</div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:600 }}>{j.name}</div>
                        <div style={{ fontSize:10, color:D.textSub }}>HC {j.hc} · {j.bruto} bruto · {j.neto} neto</div>
                      </div>
                      <div style={{ textAlign:"right" }}>
                        <div style={{ fontSize:13, fontWeight:900, color:j.total>=0?D.success:D.danger }}>
                          {j.total>=0?`+$${j.total}`:`-$${Math.abs(j.total)}`}
                        </div>
                        <div style={{ fontSize:9, color:D.textDim }}>
                          Score ${j.scoreMoney} · Marcas ${j.marcasMoney} ({j.marcasPts}pts) · Tarj ${j.tarjetasMoney} ({j.tarjetasCount})
                        </div>
                      </div>
                    </div>
                  ))}

                  {r.marcas && r.playerNames && (() => {
                    const eventos = calcMarcasResumen(r.playerNames.map((n,i)=>({name:n, opts:r.playerOptsArr?.[i]})), r.marcas);
                    return eventos.length > 0 ? (
                      <div style={{ marginTop:12 }}>
                        <div style={{ fontSize:11, fontWeight:700, color:D.textSub, marginBottom:6, textTransform:"uppercase", letterSpacing:1 }}>⭐ Resumen de marcas</div>
                        {eventos.map((ev, i) => (
                          <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"4px 0" }}>
                            <div style={{ fontSize:11, color:D.textDim, width:42 }}>Hoyo {ev.hole}</div>
                            <div style={{ flex:1, fontSize:12 }}>{ev.label}</div>
                            <div style={{ fontSize:12, fontWeight:700, color:D.gold }}>{ev.playerName}</div>
                          </div>
                        ))}
                      </div>
                    ) : null;
                  })()}

                  {r.scoresPorHoyo && r.pars && (
                    <div style={{ marginTop:12, overflowX:"auto" }}>
                      <div style={{ fontSize:11, fontWeight:700, color:D.textSub, marginBottom:6, textTransform:"uppercase", letterSpacing:1 }}>🏌️ Tarjeta hoyo por hoyo</div>
                      <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11, minWidth:r.pars.length*32+90 }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign:"left", padding:"4px 6px", color:D.textSub, position:"sticky", left:0, background:D.bg }}>Hoyo</th>
                            {r.pars.map((par, h) => (
                              <th key={h} style={{ padding:"4px 4px", color:D.textDim, fontWeight:600, minWidth:28 }}>{h+1}</th>
                            ))}
                            <th style={{ padding:"4px 6px", color:D.gold, fontWeight:700 }}>Tot</th>
                          </tr>
                          <tr>
                            <td style={{ padding:"2px 6px", color:D.textDim, fontSize:10, position:"sticky", left:0, background:D.bg }}>Par</td>
                            {r.pars.map((par, h) => (
                              <td key={h} style={{ textAlign:"center", padding:"2px 4px", color:D.textDim, fontSize:10 }}>{par}</td>
                            ))}
                            <td style={{ textAlign:"center", padding:"2px 6px", color:D.textDim, fontSize:10, fontWeight:700 }}>{r.pars.reduce((a,b)=>a+b,0)}</td>
                          </tr>
                        </thead>
                        <tbody>
                          {(r.playerNames||[]).map((name, pi) => {
                            const row = r.scoresPorHoyo[pi] || [];
                            const tot = row.reduce((a,b)=>a+(b||0),0);
                            return (
                              <tr key={name} style={{ borderTop:`1px solid ${D.border}` }}>
                                <td style={{ padding:"5px 6px", fontWeight:600, position:"sticky", left:0, background:D.bg, whiteSpace:"nowrap" }}>{name}</td>
                                {row.map((s, h) => (
                                  <td key={h} style={{ textAlign:"center", padding:"3px 1px" }}>
                                    <ScoreCell s={s??null} par={r.pars[h]} size={20} />
                                  </td>
                                ))}
                                <td style={{ textAlign:"center", padding:"5px 6px", fontWeight:900, color:D.gold }}>{tot}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      <ScoreLegend />
                    </div>
                  )}

                  {r.tarjetas && (
                    <div style={{ marginTop:12 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:D.textSub, marginBottom:6, textTransform:"uppercase", letterSpacing:1 }}>🃏 Tarjetas ganadas</div>
                      {TARJETAS.map((tj, idx) => {
                        const owner = r.tarjetas[tj.key];
                        if (owner === null || owner === undefined) return null;
                        return (
                          <div key={tj.key} style={{ display:"flex", justifyContent:"space-between", fontSize:12, padding:"4px 0" }}>
                            <span style={{ color:D.textSub }}>{tj.label}</span>
                            <span style={{ fontWeight:700, color:D.danger }}>{r.playerNames?.[owner] || "—"}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div style={{ marginTop:14, paddingTop:10, borderTop:`1px solid ${D.border}` }}>
                    {confirmDeleteHist === r.id ? (
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ fontSize:12, color:D.danger, flex:1 }}>¿Eliminar esta ronda del historial?</span>
                        <button onClick={() => { remove(ref(db, `historial/${r.id}`)); setConfirmDeleteHist(null); setExpandedHist(null); }} style={{ padding:"6px 12px", border:`1px solid ${D.danger}`, borderRadius:8, background:D.redBg, color:D.danger, fontSize:11, fontWeight:700, cursor:"pointer" }}>Sí, eliminar</button>
                        <button onClick={() => setConfirmDeleteHist(null)} style={{ padding:"6px 12px", border:`1px solid ${D.border}`, borderRadius:8, background:"transparent", color:D.textSub, fontSize:11, cursor:"pointer" }}>Cancelar</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDeleteHist(r.id)} style={{ width:"100%", padding:"8px", border:`1px solid ${D.danger}44`, borderRadius:8, background:"transparent", color:D.danger, fontSize:12, cursor:"pointer" }}>🗑️ Eliminar ronda</button>
                    )}
                  </div>
                </div>
              )}
            </div>
            );
          })}
          </Card>
        )}

        {/* ── TORNEOS ── */}
        {histTab === "torneos" && (
          <Card>
            <SLabel>Torneos finalizados</SLabel>
            {historialTorneos.length === 0 && (
              <div style={{ textAlign:"center", color:D.textSub, padding:24, fontSize:13 }}>No hay torneos guardados aún</div>
            )}
            {historialTorneos.map((t, idx) => {
              const isOpen = expandedTorneoHist === t.id;
              const grupos = t.grupos ? Object.entries(t.grupos) : [];
              const fecha = t.resumenGlobal?.fecha || (t.createdAt ? new Date(t.createdAt).toLocaleDateString('es-MX') : "—");
              const rg = t.resumenGlobal; // resumen global con todos los jugadores
              const totalJugadores = rg?.jugadores?.length || grupos.reduce((sum,[,g])=>sum+(Array.isArray(g.players)?g.players:Object.values(g.players||{})).length,0);
              const ganadorNombre = rg?.ganador || "—";
              return (
                <div key={t.id} style={{ padding:"12px 0", borderBottom:idx<historialTorneos.length-1?`1px solid ${D.border}`:"none" }}>
                  <div onClick={() => { setExpandedTorneoHist(isOpen ? null : t.id); setExpandedGrupoHist(null); }} style={{ cursor:"pointer" }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
                      <div style={{ fontSize:14, fontWeight:700 }}>{t.nombre}</div>
                      <div style={{ fontSize:11, color:D.textSub }}>{fecha}</div>
                    </div>
                    <div style={{ fontSize:12, color:D.textSub, marginBottom:4 }}>
                      {CAMPOS[t.campo]?.nombre||t.campo} · {t.nHoles} hoyos · {grupos.length} grupos · {totalJugadores} jugadores
                    </div>
                    {rg && <div style={{ fontSize:12, background:D.goldDim, color:D.gold, padding:"2px 10px", borderRadius:10, fontWeight:700, display:"inline-block", marginBottom:4 }}>🏆 {ganadorNombre} ({rg.netGanador} neto)</div>}
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginTop:4 }}>
                      <div style={{ fontSize:11, color:D.textSub }}>{isOpen ? "▲ Ocultar grupos" : "▼ Ver grupos"}</div>
                      <button onClick={e => { e.stopPropagation(); remove(ref(db, `torneos/${t.id}`)); setExpandedTorneoHist(null); }}
                        style={{ fontSize:11, color:D.danger, background:"transparent", border:`1px solid ${D.danger}44`, borderRadius:6, padding:"2px 8px", cursor:"pointer" }}>
                        🗑️ Eliminar
                      </button>
                    </div>
                  </div>
                  {isOpen && (
                    <div style={{ marginTop:10, background:D.bg, borderRadius:10, padding:10 }}>

                      {/* ── CLASIFICACIÓN GLOBAL ── */}
                      {rg?.jugadores ? (
                        <div style={{ marginBottom:12 }}>
                          <div style={{ fontSize:11, fontWeight:700, color:D.gold, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>🏆 Clasificación global</div>
                          {rg.jugadores.map((j,pos) => (
                            <div key={j.name} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 0", borderBottom:`1px solid ${D.border}` }}>
                              <div style={{ width:18, fontSize:12, fontWeight:900, color:pos===0?D.gold:D.textSub }}>{pos+1}</div>
                              <Avatar name={String(j.name||'?')} id={j.name} size={26} />
                              <div style={{ flex:1 }}>
                                <div style={{ fontSize:13, fontWeight:600 }}>{j.name}</div>
                                <div style={{ fontSize:10, color:D.textDim }}>{j.grupoNombre} · HC {j.hc} · {j.bruto} bruto · {j.neto} neto</div>
                              </div>
                              <div style={{ textAlign:"right" }}>
                                <div style={{ fontSize:14, fontWeight:900, color:j.total>=0?D.success:D.danger }}>
                                  {j.total>=0?`+$${j.total}`:`-$${Math.abs(j.total)}`}
                                </div>
                                <div style={{ fontSize:9, color:D.textDim }}>Sc ${j.scoreMoney} · Mk ${j.marcasMoney} · Tj ${j.tarjetasMoney}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ textAlign:"center", color:D.textDim, fontSize:12, padding:12 }}>Torneo guardado con versión anterior — sin resumen global</div>
                      )}

                      {/* ── DESGLOSE POR GRUPO (tarjeta, marcas, tarjetas) ── */}
                      <div style={{ fontSize:11, fontWeight:700, color:D.textSub, textTransform:"uppercase", letterSpacing:1, marginBottom:8, marginTop:4 }}>Desglose por grupo</div>
                      {grupos.map(([gid, g]) => {
                        const rf = g.resumenFinal;
                        const isGrupoOpen = expandedGrupoHist === gid;
                        return (
                          <div key={gid} style={{ marginBottom:10, paddingBottom:10, borderBottom:`1px solid ${D.border}` }}>
                            <div onClick={() => setExpandedGrupoHist(isGrupoOpen ? null : gid)} style={{ cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between", padding:"6px 0" }}>
                              <div style={{ fontSize:13, fontWeight:700, color:D.gold }}>🏌️ {g.nombre || `Grupo ${gid.slice(-3)}`}</div>
                              <div style={{ fontSize:10, color:D.textSub }}>{isGrupoOpen ? "▲" : "▼ Tarjeta"}</div>
                            </div>
                            {isGrupoOpen && rf && (
                              <div style={{ marginTop:8 }}>
                                {/* Tarjeta hoyo×hoyo */}
                                {rf.scoresPorHoyo && rf.pars && (
                                  <div style={{ overflowX:"auto" }}>
                                    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:10, minWidth:rf.pars.length*26+80 }}>
                                      <thead>
                                        <tr>
                                          <td style={{ padding:"3px 4px", color:D.textDim, position:"sticky", left:0, background:D.bg }}>Par</td>
                                          {rf.pars.map((par,h) => <td key={h} style={{ textAlign:"center", padding:"2px 2px", color:D.textDim }}>{par}</td>)}
                                          <td style={{ textAlign:"center", padding:"2px 4px", color:D.textSub, fontWeight:700 }}>Tot</td>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {(rf.playerNames||[]).map((name,pi) => {
                                          const row = rf.scoresPorHoyo[pi]||[];
                                          return (
                                            <tr key={name} style={{ borderTop:`1px solid ${D.border}` }}>
                                              <td style={{ padding:"4px 4px", fontWeight:600, position:"sticky", left:0, background:D.bg, whiteSpace:"nowrap" }}>{name}</td>
                                              {rf.pars.map((par,h) => <td key={h} style={{ textAlign:"center", padding:"2px 1px" }}><ScoreCell s={row[h]??null} par={par} size={18} /></td>)}
                                              <td style={{ textAlign:"center", padding:"4px 4px", fontWeight:900, color:D.gold }}>{row.filter(s=>s!=null).reduce((a,b)=>a+b,0)||'-'}</td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                    <ScoreLegend />
                                  </div>
                                )}
                                {/* Marcas */}
                                {rf.marcas && rf.playerNames && (() => {
                                  const ps = rf.playerNames.map(name=>({name,opts:{marcas:true}}));
                                  const eventos = calcMarcasResumen(ps, rf.marcas);
                                  return eventos.length > 0 ? (
                                    <div style={{ marginTop:8 }}>
                                      <div style={{ fontSize:10, fontWeight:700, color:D.textSub, marginBottom:4, textTransform:"uppercase" }}>⭐ Marcas</div>
                                      {eventos.map((ev,i) => (
                                        <div key={i} style={{ display:"flex", gap:6, padding:"3px 0", fontSize:11 }}>
                                          <span style={{ color:D.textDim, width:38 }}>Hoyo {ev.hole}</span>
                                          <span style={{ flex:1 }}>{ev.label}</span>
                                          <span style={{ fontWeight:700, color:D.gold }}>{ev.playerName}</span>
                                        </div>
                                      ))}
                                    </div>
                                  ) : null;
                                })()}
                                {/* Tarjetas */}
                                {rf.tarjetas && (() => {
                                  const conDueno = TARJETAS.filter(tj=>{ const o=rf.tarjetas[tj.key]; return Array.isArray(o)?o.length>0:(o!==null&&o!==undefined); });
                                  return conDueno.length>0 ? (
                                    <div style={{ marginTop:8 }}>
                                      <div style={{ fontSize:10, fontWeight:700, color:D.danger, marginBottom:4, textTransform:"uppercase" }}>🃏 Tarjetas</div>
                                      {conDueno.map(tj=>{
                                        const owner=rf.tarjetas[tj.key];
                                        const names=Array.isArray(owner)?owner.map(i=>rf.playerNames?.[i]).filter(Boolean).join(" · "):rf.playerNames?.[owner]||"-";
                                        return <div key={tj.key} style={{ display:"flex", justifyContent:"space-between", fontSize:11, padding:"2px 0" }}><span style={{ color:D.textSub }}>{tj.label}</span><span style={{ fontWeight:700, color:D.danger }}>{names}</span></div>;
                                      })}
                                    </div>
                                  ) : null;
                                })()}
                              </div>
                            )}
                            {isGrupoOpen && !rf && <div style={{ fontSize:11, color:D.textDim, padding:"6px 0" }}>Sin desglose de tarjeta guardado</div>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </Card>
        )}

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
          <CampoSelector campo={campo} setCampo={setCampo} nHoles={nHoles} setNHoles={setNHoles} />
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
            {label:"Score - por jugador", val:apuesta, set:setApuesta},
            {label:"Marcas - por punto",  val:marcaVal, set:setMarcaVal},
            {label:"Tarjetas - por tarjeta", val:tarjetaVal, set:setTarjetaVal},
          ].map(({label,val,set}) => (
            <div key={label} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:`1px solid ${D.border}` }}>
              <div style={{ flex:1, fontSize:13, color:D.textSub }}>{label}</div>
              <button onClick={() => set(Math.max(0,val-10))} style={{ width:30,height:30,borderRadius:"50%",border:`1px solid ${D.border}`,background:"transparent",color:D.text,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center" }}>-</button>
              <div style={{ width:50, textAlign:"center", fontSize:15, fontWeight:700, color:D.gold }}>${val}</div>
              <button onClick={() => set(val+10)} style={{ width:30,height:30,borderRadius:"50%",border:`1px solid ${D.gold}`,background:D.goldDim,color:D.gold,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center" }}>+</button>
            </div>
          ))}
        </Card>
        <Card>
          <SLabel>¿Quién juega hoy?</SLabel>
          <div style={{ fontSize:12, color:n<2?D.textSub:D.gold, marginBottom:10, fontWeight:600 }}>
            {n===0?"Selecciona los jugadores":n===1?"1 seleccionado - necesitas al menos 2":`${n} jugadores seleccionados ✓`}
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
        <Card>
          <SLabel>📝 Nombre de la ronda (opcional)</SLabel>
          <input
            value={nombreRonda}
            onChange={e => setNombreRonda(e.target.value)}
            placeholder={`Ronda ${new Date().getDate().toString().padStart(2,'0')}/${(new Date().getMonth()+1).toString().padStart(2,'0')}`}
            style={{ width:"100%", padding:"10px 12px", border:`1px solid ${D.border}`, borderRadius:10, background:D.surface, color:D.text, fontSize:14, boxSizing:"border-box" }}
          />
          <div style={{ fontSize:11, color:D.textSub, marginTop:6 }}>Ej: "Torneo Navidad", "Ronda 16/06"</div>
        </Card>

        <Btn onClick={startGame} disabled={n<2}>Comenzar ronda</Btn>
        <Btn outline onClick={() => setScreen("dir")} style={{ marginTop:8 }}>Volver</Btn>
      </div>
    </div>
  );

  // ── SCORE ──
  if (screen==="score") return (
    <div style={appSt}>
      <div style={{ height:3, background:D.border }}>
        <div style={{ height:"100%", width:`${Math.round((hole/nHoles)*100)}%`, background:`linear-gradient(90deg,${D.gold},${D.goldLight})`, transition:"width 0.3s" }} />
      </div>
      <div style={{ background:D.surface, borderBottom:`1px solid ${D.border}`, padding:"12px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
        <button onClick={prevHole} disabled={hole===0} style={{ width:36,height:36,borderRadius:"50%",border:`1px solid ${D.border}`,background:"transparent",color:D.text,cursor:"pointer",fontSize:20,opacity:hole===0?0.3:1 }}>{"<"}</button>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:11, color:D.textSub, letterSpacing:1, textTransform:"uppercase" }}>{CAMPOS[campo]?.nombre||"Campo"}</div>
          <div style={{ fontSize:22, fontWeight:900 }}>Hoyo {hole+1}</div>
          <div style={{ fontSize:12, color:D.gold, fontWeight:700, letterSpacing:1 }}>PAR {par}</div>
        </div>
        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4 }}>
          {hole < nHoles-1
            ? <button onClick={nextHole} style={{ padding:"7px 14px", border:`1px solid ${D.gold}`, borderRadius:20, background:D.goldDim, color:D.gold, fontSize:12, fontWeight:700, cursor:"pointer" }}>Siguiente</button>
            : <div style={{ width:80 }} />
          }
          {torneoConfig
            ? <button onClick={() => onExit()} style={{ padding:"4px 10px", border:`1px solid ${D.border}`, borderRadius:12, background:"transparent", color:D.textSub, fontSize:10, cursor:"pointer" }}>⏸ Salir</button>
            : rondaId && <button onClick={shareRonda} style={{ padding:"4px 10px", border:`1px solid ${D.border}`, borderRadius:12, background:"transparent", color:D.textSub, fontSize:10, cursor:"pointer" }}>📤 Compartir</button>
          }
        </div>
      </div>
      {shareMsg && <div style={{ margin:"0 12px 10px", padding:"8px 12px", background:D.greenBg, border:`1px solid ${D.success}`, borderRadius:10, color:D.success, fontSize:12, textAlign:"center", fontWeight:600 }}>{shareMsg}</div>}

      {dobleparEmpate && (
        <div style={{ margin:"0 12px 10px", padding:"14px", background:"#FFF3CD", border:`2px solid #C87A30`, borderRadius:12 }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#8A4A00", marginBottom:8 }}>
            🔻 Empate en Peor score en el hoyo {dobleparEmpate.hoyo + 1}
          </div>
          <div style={{ fontSize:12, color:"#8A4A00", marginBottom:10 }}>
            ¿Quién tiró al último?
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {dobleparEmpate.candidatos.map(pi => (
              <button key={pi} onClick={() => {
                const newTarjetas = { ...tarjetas, doblepar: pi, doblepar_hole: dobleparEmpate.hoyo };
                setTarjetas(newTarjetas);
                updateGame({ ...getState(), tarjetas: newTarjetas });
                setDobleparEmpate(null);
              }} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", border:`1px solid #C87A30`, borderRadius:20, background:"#FFF", color:"#8A4A00", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                <Avatar name={players[pi].name} id={players[pi].id} size={22} />
                {players[pi].name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div style={{ padding:"0 12px" }}>
        {getGreenCoord(campo, hole) && (
          <div style={{ background:D.surface, border:`1px solid ${D.border}`, borderRadius:12, padding:"12px 14px", marginBottom:12, textAlign:"center" }}>
            {distGreen !== null ? (
              <div onClick={medirDistancia} style={{ cursor:"pointer" }}>
                {distWaypoint && (
                  <div style={{ marginBottom:10, paddingBottom:10, borderBottom:`1px solid ${D.border}` }}>
                    <div style={{ fontSize:10, fontWeight:700, color:D.textSub, textTransform:"uppercase", letterSpacing:2, marginBottom:2 }}>📍 A {distWaypoint.label}</div>
                    <div style={{ fontSize:22, fontWeight:900, color:D.text }}>{distWaypoint.yards} <span style={{ fontSize:12, color:D.textSub, fontWeight:600 }}>yds</span></div>
                  </div>
                )}
                <div style={{ fontSize:10, fontWeight:700, color:D.gold, textTransform:"uppercase", letterSpacing:2, marginBottom:4 }}>📍 Distancia al green</div>
                <div style={{ fontSize:32, fontWeight:900, color:D.text }}>{distGreen} <span style={{ fontSize:14, color:D.textSub, fontWeight:600 }}>yds</span></div>
                <div style={{ fontSize:10, color:D.textDim, marginTop:2 }}>Toca para actualizar</div>
              </div>
            ) : (
              <button onClick={medirDistancia} disabled={gpsLoading} style={{ width:"100%", padding:"10px", border:`1px solid ${D.gold}`, borderRadius:10, background:D.goldDim, color:D.gold, fontSize:13, fontWeight:700, cursor:"pointer" }}>
                {gpsLoading ? "📍 Midiendo..." : "📍 Medir distancia al green"}
              </button>
            )}
            {gpsError && <div style={{ fontSize:11, color:D.danger, marginTop:8 }}>{gpsError}</div>}
          </div>
        )}
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
        <TabBar tabs={[{key:"score",label:"📊 Score"},{key:"marcas",label:"⭐ Marcas"},{key:"tarjetas",label:"🃏 Tarjetas"},{key:"tabla",label:"📋 Tabla"},{key:"jugadores",label:"👥 Jugadores"}]} active={tab} onChange={setTab} />

        {tab==="score" && (
          <Card>
            {(hole>0 ? calcOrden(players,scores,pars,hole).map(i=>({...players[i],origIdx:i})) : players.map((p,i)=>({...p,origIdx:i}))).map((pl,pos) => {
              const i = pl.origIdx;
              const rawScore = scores[i]?.[hole];
              const hasScore = rawScore !== null && rawScore !== undefined;
              const disp = hasScore ? rawScore : null;
              const dispShow = hasScore ? rawScore : pars[hole];
              const b = dispShow && par ? getBadge(dispShow, par) : null;
              return (
                <div key={pl.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 0", borderBottom:pos<players.length-1?`1px solid ${D.border}`:"none" }}>
                  <Avatar name={pl.name} id={pl.id} size={30} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:600 }}>{pl.name}</div>
                    <div style={{ fontSize:11, color:D.textSub }}>HC {pl.hc}</div>
                  </div>
                  {hasScore && b && <span style={{ fontSize:10, padding:"3px 8px", borderRadius:8, fontWeight:700, background:b.bg, color:b.fg, marginRight:4 }}>{b.label}</span>}
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <button onClick={() => changeScore(i,-1)} style={{ width:36,height:36,borderRadius:"50%",border:`1px solid ${D.border}`,background:D.surface,color:D.text,cursor:"pointer",fontSize:22,display:"flex",alignItems:"center",justifyContent:"center" }}>-</button>
                    <div style={{ width:34, textAlign:"center", fontSize:20, fontWeight:900, color:hasScore?D.text:D.textDim }}>
                      {hasScore ? disp : "--"}
                    </div>
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
              {players.map((pl, pi) => {
                if (pl.opts?.marcas === false) return null;
                return (
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
                      const hasTP = tarjetas["threeput"]===pi && tarjetas["threeput_hole"]===hole;
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
                );
              })}
            </Card>
            <Card>
              <SLabel>Marcas exclusivas</SLabel>
              {pars[hole]===3 && (
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:13, fontWeight:700, marginBottom:8 }}>📍 O'Yes <span style={{ fontSize:11, color:D.textSub, fontWeight:400 }}>-- más cerca 1er tiro · 1pt</span></div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                    {players.filter(pl=>pl.opts?.marcas!==false).map((pl) => { const pi=players.indexOf(pl); return <Pill key={pl.id} active={marcas[hole].oyes===pi} onClick={() => setExclusive("oyes",pi)}>{pl.name}</Pill>; })}
                    <Pill active={marcas[hole].oyes===null} onClick={() => setExclusive("oyes",null)}>Ninguno</Pill>
                  </div>
                </div>
              )}
              {pars[hole]>=4 && (
                <div>
                  <div style={{ fontSize:13, fontWeight:700, marginBottom:8 }}>🎯 Regulation <span style={{ fontSize:11, color:D.textSub, fontWeight:400 }}>-- más cerca {pars[hole]===4?"2do":"3er"} tiro · 1pt</span></div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                    {players.filter(pl=>pl.opts?.marcas!==false).map((pl) => { const pi=players.indexOf(pl); return <Pill key={pl.id} active={marcas[hole].regulation===pi} onClick={() => setExclusive("regulation",pi)}>{pl.name}</Pill>; })}
                    <Pill active={marcas[hole].regulation===null} onClick={() => setExclusive("regulation",null)}>Ninguno</Pill>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}

        {tab==="tarjetas" && (
          <Card>
            <SLabel>Tarjetas -- papa caliente 🃏</SLabel>
            <div style={{ fontSize:12, color:D.textSub, marginBottom:14 }}>Toca el nombre del jugador que cometió la falla.</div>
            {TARJETAS.map((tj, idx) => {
              const owner = tarjetas[tj.key];
              const ownerNames = Array.isArray(owner)
                ? owner.map(i => players[i]?.name).filter(Boolean).join(" · ")
                : (owner !== null && owner !== undefined ? players[owner]?.name : null);
              return (
                <div key={tj.key} style={{ marginBottom:14, paddingBottom:14, borderBottom:idx<TARJETAS.length-1?`1px solid ${D.border}`:"none" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                    <div style={{ fontSize:13, fontWeight:700, flex:1 }}>{tj.label}</div>
                    {tj.auto && <div style={{ fontSize:10, padding:"2px 8px", borderRadius:10, background:D.goldDim, color:D.gold, fontWeight:700 }}>AUTO</div>}
                    {ownerNames ? <div style={{ fontSize:11, padding:"3px 10px", borderRadius:10, background:D.redBg, color:D.danger, fontWeight:700 }}>🃏 {ownerNames}</div> : <div style={{ fontSize:11, padding:"3px 10px", borderRadius:10, background:D.surface, color:D.textDim }}>Sin dueño</div>}
                  </div>
                  {tj.auto ? (
                    <div style={{ fontSize:11, color:D.textSub, fontStyle:"italic" }}>
                      {tj.key === "peorscore" ? "Se asigna automáticamente · Peor score neto acumulado (bruto - HC)" : "Se asigna automáticamente · Doble par o peor en el hoyo · En empate el admin elige quién tiró al último."}
                    </div>
                  ) : (
                    <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                      {players.filter(pl=>pl.opts?.tarjetas!==false).map((pl) => { const pi = players.indexOf(pl); return (
                        <div key={pl.id} onClick={() => assignTarjeta(tj.key,pi)} style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 12px", border:`1px solid ${owner===pi?D.danger:D.border}`, borderRadius:20, background:owner===pi?D.redBg:"transparent", color:owner===pi?D.danger:D.textSub, fontSize:12, fontWeight:600, cursor:"pointer", userSelect:"none" }}>
                          <Avatar name={pl.name} id={pl.id} size={18} />{pl.name}
                        </div>
                      ); })}
                      {owner!==null && <Pill danger onClick={() => assignTarjeta(tj.key,null)}>✕ Quitar</Pill>}
                    </div>
                  )}
                </div>
              );
            })}
            <div style={{ marginTop:8, padding:"10px 12px", background:D.surface, borderRadius:10 }}>
              <div style={{ fontSize:10, color:D.gold, fontWeight:700, marginBottom:8, textTransform:"uppercase", letterSpacing:1 }}>Poseedores</div>
              {players.filter(pl=>pl.opts?.tarjetas!==false).map((pl) => {
                const pi = players.indexOf(pl);
                const mc = TARJETAS.filter(t => {
                  const o = tarjetas[t.key];
                  return Array.isArray(o) ? o.includes(pi) : o === pi;
                });
                return (
                  <div key={pl.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 0", borderBottom:`1px solid ${D.border}` }}>
                    <Avatar name={pl.name} id={pl.id} size={22} />
                    <div style={{ flex:1, fontSize:13, fontWeight:600 }}>{pl.name}</div>
                    {mc.length>0 ? <div style={{ fontSize:12, color:D.danger, fontWeight:700 }}>{mc.length} tarjeta{mc.length>1?"s":""}</div> : <div style={{ fontSize:12, color:D.textDim }}>--</div>}
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {tab==="tabla" && pars.length > 0 && players.length > 0 && (() => {
          const parTotal = pars.reduce((a,b)=>a+b,0);
          const tablaData = players.map((pl, pi) => {
            const rowScores = scores[pi];
            const jugados = rowScores.filter(s => s !== null && s !== undefined);
            const total = jugados.reduce((a,b)=>a+b,0);
            const parJugados = pars.slice(0, rowScores.filter((s,i) => s!==null&&s!==undefined ? true : false).length > 0
              ? rowScores.reduce((last,s,i)=>s!==null&&s!==undefined?i+1:last,0) : 0).reduce((a,b)=>a+b,0);
            const vsPar = jugados.length > 0 ? total - parJugados : null;
            const vsParHC = vsPar !== null ? vsPar - pl.hc : null;
            return { pl, pi, rowScores, total: jugados.length>0?total:null, vsPar, vsParHC };
          }).sort((a,b) => {
            if (a.vsParHC === null && b.vsParHC === null) return 0;
            if (a.vsParHC === null) return 1;
            if (b.vsParHC === null) return -1;
            return a.vsParHC - b.vsParHC;
          });
          return (
          <div style={{ overflowX:"auto", marginBottom:12 }}>
            <table style={{ borderCollapse:"collapse", width:"100%", fontSize:11, color:D.text }}>
              <thead>
                <tr style={{ background:D.surface }}>
                  <td style={{ padding:"8px 6px", fontWeight:700, color:D.gold, fontSize:10, textTransform:"uppercase", letterSpacing:1, position:"sticky", left:0, background:D.surface, borderBottom:`1px solid ${D.border}`, minWidth:70 }}>Jugador</td>
                  {pars.map((_,i) => <td key={i} style={{ padding:"6px 3px", textAlign:"center", fontWeight:700, color:D.textSub, borderBottom:`1px solid ${D.border}`, minWidth:26, fontSize:10 }}>{i+1}</td>)}
                  <td style={{ padding:"6px 5px", textAlign:"center", fontWeight:700, color:D.gold, borderBottom:`1px solid ${D.border}`, minWidth:32, borderLeft:`1px solid ${D.border}` }}>TOT</td>
                  <td style={{ padding:"6px 4px", textAlign:"center", fontWeight:700, color:D.textSub, borderBottom:`1px solid ${D.border}`, minWidth:28 }}>HC</td>
                  <td style={{ padding:"6px 5px", textAlign:"center", fontWeight:700, color:"#1A5C24", borderBottom:`1px solid ${D.border}`, minWidth:36, borderLeft:`1px solid ${D.border}` }}>VS Par</td>
                  <td style={{ padding:"6px 5px", textAlign:"center", fontWeight:700, color:D.gold, borderBottom:`1px solid ${D.border}`, minWidth:42, borderLeft:`1px solid ${D.border}` }}>VS Par-HC</td>
                </tr>
                <tr>
                  <td style={{ padding:"4px 6px", fontSize:10, color:D.textDim, position:"sticky", left:0, background:D.card, borderBottom:`1px solid ${D.border}` }}>PAR</td>
                  {pars.map((p,i) => <td key={i} style={{ padding:"4px 3px", textAlign:"center", fontSize:10, color:D.textSub, borderBottom:`1px solid ${D.border}` }}>{p}</td>)}
                  <td style={{ padding:"4px 5px", textAlign:"center", fontSize:10, color:D.textSub, borderBottom:`1px solid ${D.border}`, borderLeft:`1px solid ${D.border}` }}>{parTotal}</td>
                  <td style={{ borderBottom:`1px solid ${D.border}` }}></td>
                  <td style={{ borderBottom:`1px solid ${D.border}`, borderLeft:`1px solid ${D.border}` }}></td>
                  <td style={{ borderBottom:`1px solid ${D.border}`, borderLeft:`1px solid ${D.border}` }}></td>
                </tr>
              </thead>
              <tbody>
                {tablaData.map(({ pl, pi, rowScores, total, vsPar, vsParHC }, pos) => (
                  <tr key={pl.id} style={{ borderBottom:`1px solid ${D.border}`, background:pos===0&&vsParHC!==null?D.goldDim+"55":"transparent" }}>
                    <td style={{ padding:"7px 6px", position:"sticky", left:0, background:pos===0&&vsParHC!==null?D.goldDim+"55":D.card, zIndex:1 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                        <span style={{ fontSize:10, fontWeight:700, color:pos===0?D.gold:D.textSub, minWidth:12 }}>{pos+1}</span>
                        <Avatar name={pl.name} id={pl.id} size={20} />
                        <span style={{ fontSize:11, fontWeight:600, whiteSpace:"nowrap" }}>{pl.name}</span>
                      </div>
                    </td>
                    {pars.map((par, hi) => {
                      const s = rowScores[hi];
                      return <td key={hi} style={{ textAlign:"center", padding:"3px 2px" }}><ScoreCell s={s??null} par={par} size={22} /></td>;
                    })}
                    <td style={{ textAlign:"center", padding:"5px 5px", fontWeight:700, fontSize:12, borderLeft:`1px solid ${D.border}` }}>{total??'--'}</td>
                    <td style={{ textAlign:"center", padding:"5px 4px", fontSize:11, color:D.textSub }}>{pl.hc}</td>
                    <td style={{ textAlign:"center", padding:"5px 5px", fontWeight:700, fontSize:12, color:vsColor(vsPar), borderLeft:`1px solid ${D.border}` }}>{fmtVs(vsPar)}</td>
                    <td style={{ textAlign:"center", padding:"5px 5px", fontWeight:900, fontSize:12, color:vsColor(vsParHC), borderLeft:`1px solid ${D.border}` }}>{fmtVs(vsParHC)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ScoreLegend />
          </div>
          );
        })()}

        {tab==="jugadores" && (
          <GestionJugadores
            players={players} scores={scores} marcas={marcas} tarjetas={tarjetas}
            pars={pars} hole={hole} campo={campo} rondaId={rondaId}
            grupoNombre={grupoNombre} apuesta={apuesta} tarjetaVal={tarjetaVal}
            nHoles={nHoles} dir={dir} torneoConfig={torneoConfig}
            castigos={castigos} setCastigos={setCastigos}
            setPlayers={setPlayers} setScores={setScores} setMarcas={setMarcas}
            updateGame={updateGame}
          />
        )}

        <Card>
          <SLabel>Marcador en vivo</SLabel>
          <div style={{ display:"flex", alignItems:"center", gap:8, padding:"4px 0 8px", borderBottom:`1px solid ${D.border}`, marginBottom:2 }}>
            <div style={{ width:20 }}></div>
            <div style={{ width:26 }}></div>
            <div style={{ flex:1 }}></div>
            <div style={{ width:36, textAlign:"center", fontSize:10, fontWeight:700, color:D.textSub }}>GOLP</div>
            <div style={{ width:28, textAlign:"center", fontSize:10, fontWeight:700, color:D.textSub }}>HC</div>
            <div style={{ width:40, textAlign:"center", fontSize:10, fontWeight:700, color:D.gold }}>NETO</div>
          </div>
          {players.map((p,i) => {
            const jugados = (scores[i]||[]).filter(v => v !== null && v !== undefined);
            const bruto = jugados.length > 0 ? jugados.reduce((a,b)=>a+b,0) : null;
            const neto = bruto !== null ? bruto - p.hc : null;
            return { name:p.name, id:p.id, bruto, hc:p.hc, neto };
          }).sort((a,b) => {
            if (a.neto === null && b.neto === null) return 0;
            if (a.neto === null) return 1;
            if (b.neto === null) return -1;
            return a.neto - b.neto;
          }).map((p,pos) => (
            <div key={p.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 0", borderBottom:pos<players.length-1?`1px solid ${D.border}`:"none" }}>
              <div style={{ width:20, fontSize:12, color:pos===0&&p.neto!==null?D.gold:D.textSub, fontWeight:700 }}>{pos+1}</div>
              <Avatar name={p.id} id={p.id} size={26} />
              <div style={{ flex:1, fontSize:13, fontWeight:600 }}>{p.name}</div>
              <div style={{ width:36, textAlign:"center", fontSize:13, fontWeight:700, color:D.text }}>{p.bruto??'--'}</div>
              <div style={{ width:28, textAlign:"center", fontSize:12, color:D.textSub }}>{p.hc}</div>
              <div style={{ width:40, textAlign:"center", fontSize:14, fontWeight:900, color:pos===0&&p.neto!==null?D.gold:D.text }}>{p.neto??'--'}</div>
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

        {hole===nHoles-1 && <Btn onClick={finish}>Ver resultados finales 🏆</Btn>}
      </div>
    </div>
  );

  // ── RESULTADOS ──
  if (screen==="res" && results) {
    const { nets, fi, si, pot, money, hcUpdates, marcasMoney, marcasPts, tarjetasMoney, tarjetasCount, fullScores, rawScores } = results;
    // Leer castigosRes de results (persisten aunque se salga y vuelva)
    const castigosRes = results.castigos || castigos || [];
    const totalTarjetaAbandonoPool = castigosRes.filter(c=>c.conCastigo).reduce((a,c)=>a+c.tarjetaPago,0);
    const gananciaXCastigo = players.length > 0 ? Math.round(totalTarjetaAbandonoPool / players.length) : 0;
    const totalCastigoPool = castigosRes.filter(c=>c.conCastigo).reduce((a,c)=>a+(c.scorePago+c.tarjetaPago),0);

    const ranked = players.map((p,i) => ({
      ...p, net:nets[i], scoreMoney:money[i], marcasMoney:marcasMoney[i],
      tarjetasMoney:tarjetasMoney[i],
      castigoMoney: gananciaXCastigo,
      total:money[i]+marcasMoney[i]+tarjetasMoney[i]+gananciaXCastigo,
      pts:marcasPts[i], cards:tarjetasCount[i], bruto:fullScores[i].reduce((a,b)=>a+b,0)
    })).sort((a,b)=>a.net-b.net);
    const fn = fi.map(i=>players[i].name).join(" · ");
    const fp = money[fi[0]];
    const nn = players.length;

    return (
      <div style={appSt}>
    return (
      <div style={appSt}>
        {/* DEBUG TEMPORAL */}
        <div style={{ background:"#111", color:"#0f0", padding:8, fontSize:10, wordBreak:"break-all", zIndex:999 }}>
          castigos state len: {castigos.length} | castigosRes len: {castigosRes.length} | results.castigos len: {(results.castigos||[]).length}
          {castigosRes.map((c,i) => <div key={i}>{c.name} - conCastigo:{String(c.conCastigo)} - score:${c.scorePago} - tarjeta:${c.tarjetaPago}</div>)}
        </div>
        {/* Banner de torneo para admins de grupo */}
        {torneoConfig && (
          <div style={{ background:`linear-gradient(135deg,#1A5C24,#2E7D32)`, padding:"12px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div>
              <div style={{ fontSize:11, color:"#fff", opacity:0.8 }}>Torneo · {torneoConfig.nombre}</div>
              <div style={{ fontSize:13, fontWeight:700, color:"#fff" }}>Grupo finalizado: {grupoNombre || torneoConfig.grupoNombre}</div>
            </div>
            <button onClick={() => window.open(`${window.location.origin}${window.location.pathname}?torneo=${torneoConfig.torneoId}`, "_blank")}
              style={{ padding:"8px 12px", border:"1px solid #fff", borderRadius:10, background:"transparent", color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer" }}>
              🏆 Ver torneo global
            </button>
          </div>
        )}
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

          {showTabla && (() => {
            const parTotal = pars.reduce((a,b)=>a+b,0);
            const fmtVs = (v) => v === 0 ? "E" : v > 0 ? `+${v}` : `${v}`;
            const vsColor = (v) => v < 0 ? D.success : v > 0 ? D.danger : D.text;
            const resTabla = ranked.map(p => {
              const pi = players.findIndex(pl=>pl.id===p.id);
              const raw = (rawScores||fullScores)[pi];
              const jugados = raw.filter(s => s !== null && s !== undefined);
              const brutoReal = jugados.length > 0 ? jugados.reduce((a,b)=>a+b,0) : null;
              const parJugados = pars.slice(0, raw.reduce((last,s,i)=>s!==null&&s!==undefined?i+1:last, 0)).reduce((a,b)=>a+b,0);
              const vsPar = brutoReal !== null ? brutoReal - parJugados : null;
              const vsParHC = vsPar !== null ? vsPar - p.hc : null;
              return { ...p, pi, raw, brutoReal, vsPar, vsParHC };
            }).sort((a,b) => {
              if (a.vsParHC === null && b.vsParHC === null) return 0;
              if (a.vsParHC === null) return 1;
              if (b.vsParHC === null) return -1;
              return a.vsParHC - b.vsParHC;
            });
            return (
            <div style={{ overflowX:"auto", marginBottom:12 }}>
              <table style={{ borderCollapse:"collapse", width:"100%", fontSize:11, color:D.text }}>
                <thead>
                  <tr style={{ background:D.surface }}>
                    <td style={{ padding:"8px 6px", fontWeight:700, color:D.gold, fontSize:10, position:"sticky", left:0, background:D.surface, borderBottom:`1px solid ${D.border}`, minWidth:75 }}>#</td>
                    {pars.map((_,hi) => <td key={hi} style={{ padding:"6px 3px", textAlign:"center", fontWeight:700, color:D.textSub, borderBottom:`1px solid ${D.border}`, minWidth:24, fontSize:10 }}>{hi+1}</td>)}
                    <td style={{ padding:"6px 4px", textAlign:"center", fontWeight:700, color:D.gold, borderBottom:`1px solid ${D.border}`, minWidth:30, borderLeft:`1px solid ${D.border}` }}>TOT</td>
                    <td style={{ padding:"6px 3px", textAlign:"center", fontWeight:700, color:D.textSub, borderBottom:`1px solid ${D.border}`, minWidth:24 }}>HC</td>
                    <td style={{ padding:"6px 4px", textAlign:"center", fontWeight:700, color:"#1A5C24", borderBottom:`1px solid ${D.border}`, minWidth:34, borderLeft:`1px solid ${D.border}` }}>VS Par</td>
                    <td style={{ padding:"6px 4px", textAlign:"center", fontWeight:700, color:D.gold, borderBottom:`1px solid ${D.border}`, minWidth:40, borderLeft:`1px solid ${D.border}` }}>VS Par-HC</td>
                    <td style={{ padding:"6px 3px", textAlign:"center", fontWeight:700, color:"#1A5C24", borderBottom:`1px solid ${D.border}`, minWidth:30, borderLeft:`1px solid ${D.border}` }}>MK pts</td>
                    <td style={{ padding:"6px 3px", textAlign:"center", fontWeight:700, color:"#1A5C24", borderBottom:`1px solid ${D.border}`, minWidth:38 }}>MK $</td>
                    <td style={{ padding:"6px 3px", textAlign:"center", fontWeight:700, color:D.danger, borderBottom:`1px solid ${D.border}`, minWidth:38, borderLeft:`1px solid ${D.border}` }}>TARJ $</td>
                    <td style={{ padding:"6px 4px", textAlign:"center", fontWeight:700, color:D.gold, borderBottom:`1px solid ${D.border}`, minWidth:48, borderLeft:`1px solid ${D.border}` }}>TOTAL $</td>
                  </tr>
                  <tr>
                    <td style={{ padding:"4px 6px", fontSize:10, color:D.textDim, position:"sticky", left:0, background:D.card, borderBottom:`1px solid ${D.border}` }}>PAR</td>
                    {pars.map((p,i) => <td key={i} style={{ padding:"4px 3px", textAlign:"center", fontSize:10, color:D.textSub, borderBottom:`1px solid ${D.border}` }}>{p}</td>)}
                    <td style={{ padding:"4px 4px", textAlign:"center", fontSize:10, color:D.textSub, borderBottom:`1px solid ${D.border}`, borderLeft:`1px solid ${D.border}` }}>{parTotal}</td>
                    <td style={{ borderBottom:`1px solid ${D.border}` }}></td>
                    <td style={{ borderBottom:`1px solid ${D.border}`, borderLeft:`1px solid ${D.border}` }}></td>
                    <td style={{ borderBottom:`1px solid ${D.border}`, borderLeft:`1px solid ${D.border}` }}></td>
                    <td style={{ borderBottom:`1px solid ${D.border}`, borderLeft:`1px solid ${D.border}` }}></td>
                    <td style={{ borderBottom:`1px solid ${D.border}` }}></td>
                    <td style={{ borderBottom:`1px solid ${D.border}`, borderLeft:`1px solid ${D.border}` }}></td>
                    <td style={{ borderBottom:`1px solid ${D.border}`, borderLeft:`1px solid ${D.border}` }}></td>
                  </tr>
                </thead>
                <tbody>
                  {resTabla.map((p, pos) => (
                    <tr key={p.id} style={{ borderBottom:`1px solid ${D.border}`, background:pos===0?D.goldDim:D.card }}>
                      <td style={{ padding:"7px 6px", position:"sticky", left:0, background:pos===0?D.goldDim:D.card, zIndex:1 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                          <span style={{ fontSize:11, fontWeight:700, color:pos===0?D.gold:D.textSub }}>{pos+1}</span>
                          <Avatar name={p.name} id={p.id} size={20} />
                          <span style={{ fontSize:10, fontWeight:600, whiteSpace:"nowrap" }}>{p.name}</span>
                        </div>
                      </td>
                      {p.raw.map((s,hi) => (
                        <td key={hi} style={{ textAlign:"center", padding:"3px 1px" }}><ScoreCell s={s??null} par={pars[hi]} size={20} /></td>
                      ))}
                      <td style={{ textAlign:"center", padding:"5px 4px", fontWeight:700, fontSize:11, borderLeft:`1px solid ${D.border}` }}>{p.brutoReal??'—'}</td>
                      <td style={{ textAlign:"center", padding:"5px 3px", fontSize:11, color:D.textSub }}>{p.hc}</td>
                      <td style={{ textAlign:"center", padding:"5px 4px", fontWeight:700, fontSize:11, color:p.vsPar!==null?vsColor(p.vsPar):D.textDim, borderLeft:`1px solid ${D.border}` }}>{p.vsPar!==null?fmtVs(p.vsPar):'—'}</td>
                      <td style={{ textAlign:"center", padding:"5px 4px", fontWeight:900, fontSize:12, color:p.vsParHC!==null?vsColor(p.vsParHC):D.textDim, borderLeft:`1px solid ${D.border}` }}>{p.vsParHC!==null?fmtVs(p.vsParHC):'—'}</td>
                      <td style={{ textAlign:"center", padding:"5px 3px", fontWeight:700, fontSize:11, color:"#1A5C24", borderLeft:`1px solid ${D.border}` }}>{p.pts}</td>
                      <td style={{ textAlign:"center", padding:"5px 3px", fontWeight:700, fontSize:11, color:fmtC(p.marcasMoney) }}>{fmt(p.marcasMoney)}</td>
                      <td style={{ textAlign:"center", padding:"5px 3px", fontWeight:700, fontSize:11, color:fmtC(p.tarjetasMoney), borderLeft:`1px solid ${D.border}` }}>{fmt(p.tarjetasMoney)}</td>
                      <td style={{ textAlign:"center", padding:"5px 4px", fontWeight:900, fontSize:12, color:fmtC(p.total), borderLeft:`1px solid ${D.border}` }}>{fmt(p.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <ScoreLegend />
            </div>
            );
          })()}

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
                ...(p.castigoMoney > 0 ? [{icon:"🚪",label:"Castigo abandono",sub:"Reparto del fondo de abandonos",val:p.castigoMoney}] : []),
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

          {/* Jugadores que abandonaron */}
          {castigosRes.length > 0 && castigosRes.map((c, i) => (
            <Card key={"abandono-"+i} style={{ borderColor:`${D.danger}66`, border:`1px solid ${D.danger}44` }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8, paddingBottom:8, borderBottom:`1px solid ${D.border}` }}>
                <div style={{ width:26,height:26,borderRadius:"50%",background:D.redBg,border:`1px solid ${D.danger}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:900,color:D.danger }}>🚪</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:15, fontWeight:700 }}>{c.name}</div>
                  <div style={{ fontSize:11, color:D.danger }}>Abandono{c.conCastigo ? " con castigo" : " sin castigo"}</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:20, fontWeight:900, color:c.conCastigo?D.danger:D.textSub }}>
                    {c.conCastigo ? "-$"+(c.scorePago+c.tarjetaPago) : "$0"}
                  </div>
                  <div style={{ fontSize:11, color:D.textSub }}>TOTAL</div>
                </div>
              </div>
              {c.conCastigo && (
                <div>
                  <div style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:`1px solid ${D.border}` }}>
                    <div><div style={{ fontSize:12, fontWeight:700 }}>📊 Score</div><div style={{ fontSize:11, color:D.textSub }}>Apuesta de la ronda</div></div>
                    <div style={{ fontSize:15, fontWeight:700, color:D.danger }}>-${c.scorePago}</div>
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", padding:"6px 0" }}>
                    <div><div style={{ fontSize:12, fontWeight:700 }}>🃏 Tarjeta abandono</div><div style={{ fontSize:11, color:D.textSub }}>${tarjetaVal} a cada uno de los {players.length} jugadores activos</div></div>
                    <div style={{ fontSize:15, fontWeight:700, color:D.danger }}>-${c.tarjetaPago}</div>
                  </div>
                </div>
              )}
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
              const ownerArr = Array.isArray(owner) ? owner : (owner !== null && owner !== undefined ? [owner] : []);
              return (
                <div key={tj.key} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 0", borderBottom:idx<TARJETAS.length-1?`1px solid ${D.border}`:"none" }}>
                  <div style={{ flex:1, fontSize:13 }}>{tj.label}</div>
                  {ownerArr.length > 0 ? (
                    <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                      {ownerArr.map(oi => players[oi] ? (
                        <div key={oi} style={{ display:"flex", alignItems:"center", gap:4 }}>
                          <Avatar name={players[oi].name} id={players[oi].id} size={22} />
                          <div style={{ fontSize:13, fontWeight:700, color:D.danger }}>{players[oi].name}</div>
                        </div>
                      ) : null)}
                    </div>
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
                    {up?`+${u.delta} -> HC ${u.after}`:dn?`${u.delta} -> HC ${u.after}`:"Sin cambio"}
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

          {/* Castigos por abandono */}
          {castigosRes.length > 0 && (
            <Card>
              <SLabel>🚪 Abandonos</SLabel>
              {castigosRes.map((c, i) => (
                <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:i<castigosRes.length-1?`1px solid ${D.border}`:"none" }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600 }}>{c.name}</div>
                    <div style={{ fontSize:11, color:D.textSub }}>
                      {c.conCastigo ? "Score $" + c.scorePago + " + Tarjeta $" + c.tarjetaPago + " a cada uno" : "Sin castigo"}
                    </div>
                  </div>
                  <div style={{ fontSize:14, fontWeight:900, color:c.conCastigo?D.danger:D.textSub }}>
                    {c.conCastigo ? "-$" + (c.scorePago + c.tarjetaPago) : "Sin cargo"}
                  </div>
                </div>
              ))}
              {castigosRes.some(c=>c.conCastigo) && (
                <div style={{ fontSize:11, color:D.textSub, marginTop:8, textAlign:"center", paddingTop:8, borderTop:`1px solid ${D.border}` }}>
                  {"Cada jugador activo recibe $" + castigosRes.filter(c=>c.conCastigo).reduce((a,c)=>a+c.scorePago/players.length + c.tarjetaVal,0).toFixed(0) + " del fondo de abandonos"}
                </div>
              )}
            </Card>
          )}

          {/* Comprobación de cuentas */}
          {(() => {
            const totalesActivos = ranked.map(p => p.total);
            const totalScoreAbandonos = castigosRes.filter(c=>c.conCastigo).reduce((a,c)=>a+c.scorePago,0);
            const totalTarjetaAbandonos = castigosRes.filter(c=>c.conCastigo).reduce((a,c)=>a+c.tarjetaPago,0);
            const totalCastigoPool = totalScoreAbandonos + totalTarjetaAbandonos;
            const ganancias = totalesActivos.filter(t => t > 0).reduce((a,b)=>a+b,0);
            const perdidas = Math.abs(totalesActivos.filter(t => t < 0).reduce((a,b)=>a+b,0));
            // Total que entra = pérdidas activos + score abandono (en calcMoney) + tarjeta abandono (distribuida)
            const totalEntrada = perdidas + totalCastigoPool;
            const cuadra = Math.abs(ganancias - totalEntrada) <= 2;
            return (
              <Card style={{ border:`1px solid ${cuadra?D.success:D.danger}` }}>
                <SLabel>✅ Comprobación de cuentas</SLabel>
                <div style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:`1px solid ${D.border}` }}>
                  <span style={{ fontSize:13, color:D.textSub }}>Ganancias jugadores activos</span>
                  <span style={{ fontSize:14, fontWeight:700, color:D.success }}>+${ganancias}</span>
                </div>
                <div style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:`1px solid ${D.border}` }}>
                  <span style={{ fontSize:13, color:D.textSub }}>Pérdidas jugadores activos</span>
                  <span style={{ fontSize:14, fontWeight:700, color:D.danger }}>-${perdidas}</span>
                </div>
                {totalCastigoPool > 0 && (
                  <div style={{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:`1px solid ${D.border}` }}>
                    <span style={{ fontSize:13, color:D.textSub }}>Pago por abandono</span>
                    <span style={{ fontSize:14, fontWeight:700, color:D.danger }}>-${totalCastigoPool}</span>
                  </div>
                )}
                <div style={{ display:"flex", justifyContent:"space-between", padding:"8px 0" }}>
                  <span style={{ fontSize:13, fontWeight:700 }}>Balance total</span>
                  <span style={{ fontSize:14, fontWeight:900, color:cuadra?D.success:D.danger }}>
                    {cuadra ? "✓ Cuadra" : "⚠️ Revisar"}
                  </span>
                </div>
              </Card>
            );
          })()}

          {/* Compartir resultados */}
          <Card>
            <SLabel>📤 Compartir resultados</SLabel>
            <div style={{ display:"flex", gap:8, marginBottom:8 }}>
              <button onClick={() => {
                const url = `${window.location.origin}${window.location.pathname}?ronda=${rondaId}`;
                if (navigator.clipboard) { navigator.clipboard.writeText(url); }
                alert("¡Link copiado! Compártelo para ver los resultados finales.");
              }} style={{ flex:1, padding:"12px", border:`1px solid ${D.gold}`, borderRadius:12, background:D.goldDim, color:D.gold, fontSize:13, fontWeight:700, cursor:"pointer" }}>
                🔗 Copiar link
              </button>
              <button onClick={() => {
                const winner = fi.map(i => players[i].name).join(" y ");
                const eventos = calcMarcasResumen(players, marcas);
                const lines = [
                  `⛳ *H19 Golf — Resultados finales*`,
                  nombreRonda.trim() ? `📋 ${nombreRonda.trim()}` : null,
                  `🏆 *Ganador: ${winner}* (${nets[fi[0]]} neto)`,
                  ``,
                  `*Clasificación y desglose:*`,
                  ...ranked.map((p,pos) => {
                    const total = p.scoreMoney + p.marcasMoney + p.tarjetasMoney;
                    const signo = total >= 0 ? `+$${total}` : `-$${Math.abs(total)}`;
                    return [
                      `${pos+1}. *${p.name}* — ${p.bruto} bruto / ${p.net} neto — ${signo}`,
                      `   Score: $${p.scoreMoney} · Marcas: $${p.marcasMoney} (${p.pts}pts) · Tarjetas: $${p.tarjetasMoney} (${p.cards})`
                    ].join("\n");
                  }),
                  eventos.length > 0 ? `` : null,
                  eventos.length > 0 ? `*⭐ Resumen de marcas:*` : null,
                  ...eventos.map(ev => `Hoyo ${ev.hole} — ${ev.label}: *${ev.playerName}*`),
                  ``,
                  `Ver detalles: ${window.location.origin}${window.location.pathname}?ronda=${rondaId}`
                ].filter(Boolean).join("\n");
                const url = `https://wa.me/?text=${encodeURIComponent(lines)}`;
                window.open(url, "_blank");
              }} style={{ flex:1, padding:"12px", border:"none", borderRadius:12, background:"#25D366", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                💬 WhatsApp
              </button>
            </div>
            <div style={{ fontSize:11, color:D.textSub, textAlign:"center" }}>
              El link muestra los resultados finales en tiempo real
            </div>
          </Card>

          {torneoConfig ? (
            <div style={{ background:D.goldDim, border:`1px solid ${D.gold}`, borderRadius:12, padding:"14px", marginBottom:8, textAlign:"center" }}>
              <div style={{ fontSize:14, fontWeight:700, color:D.gold, marginBottom:6 }}>🏆 Grupo finalizado</div>
              <div style={{ fontSize:12, color:D.textSub }}>El administrador general del torneo confirmará los handicaps y cerrará el torneo cuando todos los grupos terminen.</div>
            </div>
          ) : (
            <Btn onClick={confirmHC}>Confirmar y guardar handicaps</Btn>
          )}
          {torneoConfig ? (
            <div style={{ display:"flex", flexDirection:"column", gap:8, marginTop:8 }}>
              <button onClick={() => window.open(`${window.location.origin}${window.location.pathname}?torneo=${torneoConfig.torneoId}`, "_blank")}
                style={{ width:"100%", padding:"12px", border:"none", borderRadius:12, background:`linear-gradient(135deg,#1A5C24,#2E7D32)`, color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}>
                🏆 Ver torneo global
              </button>
              <button onClick={() => onExit()}
                style={{ width:"100%", padding:"10px", border:`1px solid ${D.border}`, borderRadius:12, background:"transparent", color:D.textSub, fontSize:13, cursor:"pointer" }}>
                Salir al inicio
              </button>
            </div>
          ) : (
            <Btn outline onClick={() => { setSel(new Set()); setScreen("sel"); }} style={{ marginTop:8 }}>Nueva ronda sin guardar</Btn>
          )}
        </div>
      </div>
    );
  }

  return null;
}
