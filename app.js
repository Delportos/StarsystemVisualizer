/* =========================================================================
   Relay Network — application logic
   Reads:  systems.csv, connections.csv, dossiers.json   (must sit beside this file)
   NOTE:   browsers block fetch() from file:// — serve the folder, e.g.
             python3 -m http.server 8000   →  http://localhost:8000/starsystemhop.html
   ========================================================================= */

const FACTIONS = ["US", "Commonwealth", "Japan", "France", "China"];
const FCOL = { US:"#4331c8", Commonwealth:"#e81818", Japan:"#d2cece", France:"#2a1152", China:"#ae4421" };
const SHARED_COL = "#C9BE92";              // links used by >1 bloc
const enabled = { US:true, Commonwealth:true, Japan:true, France:true, China:true };

let STARS = {}, LINKS = [], DOSS = {};
const starObjs = [];     // {name, pos, facs, mesh, halo, ring, label, drop, kind, role}
const linkObjs = [];     // {a, b, facs, sprint, line}
const allLabels = [];

/* ---------- tiny CSV parser (no quoted-comma support needed here) ---------- */
function parseCSV(text){
  const lines = text.trim().split(/\r?\n/);
  const head = lines[0].split(",").map(s=>s.trim());
  return lines.slice(1).filter(l=>l.trim()).map(line=>{
    const cells = line.split(",");
    const o = {}; head.forEach((h,i)=> o[h] = (cells[i]||"").trim());
    return o;
  });
}
function facsOf(field){ return (field||"").split(";").map(s=>s.trim()).filter(Boolean); }
// approximate true colour by spectral class (first letter of the type)
const SPECTRAL_COL = {
  O:0x9bb0ff, B:0xaabfff, A:0xcad7ff, F:0xf8f7ff,
  G:0xfff4e8, K:0xffd2a1, M:0xff9d6b
};
const R_MIN = 0.45, R_MAX = 1.7;     // clamp range in scene units
function starRadius(s){
  if (s.name === "Sol") return 0.9;
  if (s.lum == null) return 0.7;       // fallback if no lum given
  const r = 0.8 * Math.pow(s.lum, 0.2);   // L^0.2 compression
  return Math.max(R_MIN, Math.min(R_MAX, r));
}
function spectralColor(spec){
  const c = (spec||"").trim().charAt(0).toUpperCase();
  return SPECTRAL_COL[c] ?? 0xcfcfcf;   // grey fallback (e.g. white dwarfs / unknown)
}
function toXYZ(raH, decD, d){
  const ra = raH*15*Math.PI/180, dec = decD*Math.PI/180;
  return new THREE.Vector3(d*Math.cos(dec)*Math.cos(ra), d*Math.cos(dec)*Math.sin(ra), d*Math.sin(dec));
}

/* ============================ THREE.JS SCENE ============================== */
let scene, camera, renderer, canvas;
const gridGroup = new THREE.Group();
let labelMult = 0.8; const BASE = 0.011;

function mkLabel(text, sub){
  const cv = document.createElement('canvas'); const m = cv.getContext('2d');
  const pad=8, fs=42, fs2=28; m.font=`600 ${fs}px "Chakra Petch", sans-serif`;
  const w = Math.max(m.measureText(text).width, sub?m.measureText(sub).width:0)+pad*2;
  cv.width=w; cv.height=sub?100:60;
  const c=cv.getContext('2d'); c.font=`600 ${fs}px "Chakra Petch", sans-serif`; c.textBaseline='top';
  c.fillStyle="#E7DCC0"; c.fillText(text,pad,4);
  if(sub){ c.font=`400 ${fs2}px "IBM Plex Mono", monospace`; c.fillStyle="#8C876F"; c.fillText(sub,pad,4+fs+6); }
  const tex=new THREE.CanvasTexture(cv); tex.minFilter=THREE.LinearFilter;
  const spr=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:false}));
  spr.userData={bw:cv.width,bh:cv.height};
  spr.scale.set(cv.width*BASE*labelMult, cv.height*BASE*labelMult, 1);
  return spr;
}
function applyLabelScale(){ allLabels.forEach(l=>l.scale.set(l.userData.bw*BASE*labelMult, l.userData.bh*BASE*labelMult,1)); }

function buildScene(){
  canvas = document.getElementById('c');
  renderer = new THREE.WebGLRenderer({canvas, antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  scene = new THREE.Scene(); scene.background = new THREE.Color(0x070A0F);
  camera = new THREE.PerspectiveCamera(50,1,0.1,3000);
  scene.add(gridGroup);

  // starfield
  const g=new THREE.BufferGeometry(); const n=900; const p=new Float32Array(n*3);
  for(let i=0;i<n;i++){const r=400+Math.random()*400,th=Math.random()*6.28,ph=Math.acos(2*Math.random()-1);
    p[i*3]=r*Math.sin(ph)*Math.cos(th); p[i*3+1]=r*Math.sin(ph)*Math.sin(th); p[i*3+2]=r*Math.cos(ph);}
  g.setAttribute('position',new THREE.BufferAttribute(p,3));
  scene.add(new THREE.Points(g,new THREE.PointsMaterial({color:0x99a6bb,size:1.2,sizeAttenuation:false,transparent:true,opacity:0.5})));

  // reference rings + drop lines
  const mat=new THREE.LineBasicMaterial({color:0x1c2430,transparent:true,opacity:0.95});
  for(let r=10;r<=40;r+=10){const pts=[];for(let a=0;a<=64;a++){const t=a/64*6.283;pts.push(new THREE.Vector3(Math.cos(t)*r,Math.sin(t)*r,0));}
    gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),mat));}
}

const dropMat=new THREE.LineBasicMaterial({color:0x2a333f,transparent:true,opacity:0.5});

function buildNetwork(){
  // stars
  Object.values(STARS).forEach(s=>{
    const isSun = s.kind==="sun";
    const isTerm = s.role==="colony";
    const r = starRadius(s);
    const col = spectralColor(s.spectral);
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(r,20,20),new THREE.MeshBasicMaterial({color:col}));
    mesh.position.copy(s.pos); mesh.userData={name:s.name}; scene.add(mesh);
    const halo=new THREE.Mesh(new THREE.SphereGeometry(r*1.25,16,16),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0.2}));
    halo.position.copy(s.pos); scene.add(halo);
    let ring=null;
    if(isTerm){
      const rc = s.faction.length===1 ? FCOL[s.faction[0]] : "#C0392B";
      ring=new THREE.Mesh(new THREE.RingGeometry(r*2.5,r*2.8,32),new THREE.MeshBasicMaterial({color:rc,side:THREE.DoubleSide,transparent:true,opacity:0.85}));
      ring.position.copy(s.pos); scene.add(ring);
    }
    const drop=new THREE.Line(new THREE.BufferGeometry().setFromPoints([s.pos,new THREE.Vector3(s.pos.x,s.pos.y,0)]),dropMat);
    gridGroup.add(drop);
    const lab=mkLabel(s.name, s.dist?s.dist.toFixed(1)+" ly":"0");
    lab.position.set(s.pos.x,s.pos.y,s.pos.z+r+1.0); scene.add(lab); allLabels.push(lab);
    starObjs.push({name:s.name,pos:s.pos,facs:s.faction,mesh,halo,ring,label:lab,drop});
  });

  // links
  LINKS.forEach(L=>{
    const A=STARS[L.from], B=STARS[L.to]; if(!A||!B) return;
    const col = L.faction.length>1 ? SHARED_COL : FCOL[L.faction[0]];
    const geo=new THREE.BufferGeometry().setFromPoints([A.pos,B.pos]);
    let line;
    if(L.sprint==="1"||L.sprint===1||L.sprint===true){
      line=new THREE.Line(geo,new THREE.LineDashedMaterial({color:col,dashSize:1.4,gapSize:0.9,transparent:true,opacity:0.95}));
      line.computeLineDistances();
    } else {
      line=new THREE.Line(geo,new THREE.LineBasicMaterial({color:col,transparent:true,opacity:0.9}));
    }
    scene.add(line);
    linkObjs.push({a:L.from,b:L.to,facs:L.faction,line});
  });
}

let labelsOn=true;
function refresh(){
  const vis = facs => facs.some(f=>enabled[f]);
  starObjs.forEach(o=>{
    const v = vis(o.facs);
    o.mesh.visible=v; o.halo.visible=v; o.drop.visible=v; if(o.ring) o.ring.visible=v;
    o.label.visible = v && labelsOn;
  });
  linkObjs.forEach(o=>{ o.line.visible = vis(o.facs); });
}

/* ============================ CAMERA / CONTROLS ========================== */
let rot={az:-1.0, el:0.42}, radius=118, radiusGoal=118;
let target=new THREE.Vector3(-10,0,5), targetGoal=new THREE.Vector3(-10,0,5);
let dragging=false,lastX=0,lastY=0,spin=false;
function updateCam(){
  camera.position.set(
    target.x+radius*Math.cos(rot.el)*Math.cos(rot.az),
    target.y+radius*Math.cos(rot.el)*Math.sin(rot.az),
    target.z+radius*Math.sin(rot.el));
  camera.up.set(0,0,1); camera.lookAt(target);
}
function bindControls(){
  canvas.addEventListener('pointerdown',e=>{dragging=true;lastX=e.clientX;lastY=e.clientY;});
  window.addEventListener('pointerup',()=>dragging=false);
  window.addEventListener('pointermove',e=>{
    if(!dragging)return; const dx=e.clientX-lastX,dy=e.clientY-lastY; lastX=e.clientX;lastY=e.clientY;
    rot.az-=dx*0.006; rot.el=Math.max(-1.45,Math.min(1.45,rot.el+dy*0.006));
  });
  canvas.addEventListener('wheel',e=>{e.preventDefault();radiusGoal=Math.max(14,Math.min(220,radiusGoal*(1+Math.sign(e.deltaY)*0.08)));},{passive:false});

  const ray=new THREE.Raycaster(); const ndc=new THREE.Vector2();
  canvas.addEventListener('click',e=>{
    const r=canvas.getBoundingClientRect();
    ndc.x=((e.clientX-r.left)/r.width)*2-1; ndc.y=-((e.clientY-r.top)/r.height)*2+1;
    ray.setFromCamera(ndc,camera);
    const meshes=starObjs.filter(o=>o.mesh.visible).map(o=>o.mesh);
    const hit=ray.intersectObjects(meshes)[0];
    if(hit){
      const name=hit.object.userData.name;
      // CENTER THE VIEW on the clicked star
      targetGoal.copy(STARS[name].pos);
      radiusGoal = Math.max(30, radius*0.55);
      showDoss(name);
    }
  });
}

/* ============================ PANEL ===================================== */
function showDoss(name){
  const d=DOSS[name]; if(!d) return;
  document.getElementById('d-eyebrow').textContent=d.eyebrow||"";
  document.getElementById('d-name').textContent=name;
  document.getElementById('d-type').textContent=d.type||"";
  document.getElementById('d-stats').innerHTML=(d.stats||[]).map(s=>`<div class="stat"><div class="k">${s[0]}</div><div class="v">${s[1]}</div></div>`).join('');
  document.getElementById('d-role').textContent=d.role||"";
  const lg=document.getElementById('legend'); if(lg) lg.style.display='none';
}

/* ============================ UI WIRING ================================= */
function bindUI(){
  document.querySelectorAll('.fbtn').forEach(b=>{
    b.addEventListener('click',()=>{ b.classList.toggle('on'); enabled[b.dataset.f]=b.classList.contains('on'); refresh(); });
  });
  document.querySelectorAll('.ctl').forEach(c=>{
    c.addEventListener('click',()=>{
      c.classList.toggle('on'); const on=c.classList.contains('on'), t=c.dataset.t;
      if(t==='labels'){ labelsOn=on; refresh(); }
      if(t==='grid') gridGroup.visible=on;
      if(t==='spin') spin=on;
    });
  });
  const ls=document.getElementById('lsize');
  if(ls) ls.addEventListener('input',e=>{ labelMult=+e.target.value; applyLabelScale(); });
}

function resize(){const w=canvas.parentElement.clientWidth,h=canvas.parentElement.clientHeight;
  renderer.setSize(w,h,false); camera.aspect=w/h; camera.updateProjectionMatrix();}

function loop(){
  requestAnimationFrame(loop);
  if(spin&&!dragging) rot.az+=0.0016;
  target.lerp(targetGoal,0.12);
  radius += (radiusGoal-radius)*0.12;
  updateCam();
  scene.traverse(o=>{ if(o.userData&&o.userData._ring) o.userData._ring.lookAt(camera.position); });
  renderer.render(scene,camera);
}

/* ============================ BOOT ===================================== */
function showError(msg){
  document.getElementById('d-eyebrow').textContent="Load error";
  document.getElementById('d-name').textContent="Data not loaded";
  document.getElementById('d-role').innerHTML=msg;
  const lg=document.getElementById('legend'); if(lg) lg.style.display='none';
}

async function boot(){
  buildScene();
  try{
    const [sysT, conT, dossT] = await Promise.all([
      fetch('systems.csv').then(r=>{if(!r.ok)throw 0;return r.text();}),
      fetch('connections.csv').then(r=>{if(!r.ok)throw 0;return r.text();}),
      fetch('dossiers.json').then(r=>{if(!r.ok)throw 0;return r.json();}),
    ]);
    parseCSV(sysT).forEach(row=>{
      STARS[row.name] = {
        name:row.name, ra:+row.ra_hours, dec:+row.dec_deg, dist:+row.dist_ly,
        spectral:row.spectral, kind:row.kind, role:row.role,
        faction:facsOf(row.faction), pos:toXYZ(+row.ra_hours,+row.dec_deg,+row.dist_ly),
        lum: row.lum ? +row.lum : null,
        pos: toXYZ(+row.ra_hours, +row.dec_deg, +row.dist_ly)
      };
    });
    LINKS = parseCSV(conT).map(row=>({from:row.from,to:row.to,sprint:row.sprint,faction:facsOf(row.faction)}));
    DOSS = dossT;
    // ---- de-clump: push apart any stars closer than MIN_SEP (display only) ----
const MIN_SEP = 2.2;          // ly — min on-screen separation; raise to spread more
const SPREAD_ITERS = 60;
(function deClump(){
  const arr = Object.values(STARS);
  // honour any manual offsets first (optional dx,dy,dz columns in the CSV)
  arr.forEach(s=>{
    if (s.dx||s.dy||s.dz) s.pos.add(new THREE.Vector3(+s.dx||0,+s.dy||0,+s.dz||0));
  });
  for (let it=0; it<SPREAD_ITERS; it++){
    let moved=false;
    for (let i=0;i<arr.length;i++) for (let j=i+1;j<arr.length;j++){
      const a=arr[i].pos, b=arr[j].pos;
      const d=a.distanceTo(b);
      if (d>0.0001 && d<MIN_SEP){
        const push=(MIN_SEP-d)/2;
        const dir=b.clone().sub(a).normalize();
        b.addScaledVector(dir, push);
        a.addScaledVector(dir,-push);
        moved=true;
      }
    }
    if(!moved) break;
  }
})();
    buildNetwork(); refresh(); bindControls(); bindUI();
    new ResizeObserver(resize).observe(canvas.parentElement); resize(); updateCam();
    loop();
  } catch(err){
    showError("Couldn't read <b>systems.csv / connections.csv / dossiers.json</b>.<br><br>Browsers block local file reads from <code>file://</code>. Serve the folder instead:<br><br><code>python3 -m http.server 8000</code><br>then open <code>http://localhost:8000/starsystemhop.html</code>");
    console.error(err);
  }
}
boot();