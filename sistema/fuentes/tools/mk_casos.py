import re
s=open('legal_mya/video_original.html',encoding='utf-8').read()
css=s[s.index('<style>')+7:s.index('</style>')]
css=css.replace(':root{',':host{',1).replace('html,body{margin:0;height:100%}\n','')
css=re.sub(r'(?m)^body\{','.casos{height:100%;',css,count=1)
css+='\n.bar .navb{display:none}\n'
js=s[s.index('const $=id=>document.getElementById(id);'):s.rindex('</script>')]
def rep(a,b,n=1):
    global js
    c=js.count(a); assert c==n,(a[:90],c); js=js.replace(a,b)
# sesión: la da el bloque M&A de la página
i=js.index('let SB=null, YO=null, ROL=null, LISTO=false;'); j=js.index('if(window.pdfjsLib)')
js=js[:i]+'let SB=MA.sb, YO=(MA.ctx()||{}).email, ROL=(MA.ctx()||{}).rol;\n'+js[j:]
rep('const $=id=>document.getElementById(id);','const $=id=>ROOT.getElementById(id);')
rep('d.textContent=t; document.body.appendChild(d);','d.textContent=t; ROOT.appendChild(d);')
rep('bg.innerHTML=`<div class="dlg">${html}</div>`; document.body.appendChild(bg);','bg.innerHTML=`<div class="dlg">${html}</div>`; ROOT.appendChild(bg);')
rep('function cerrarDlg(){ document.querySelectorAll(".bg")','function cerrarDlg(){ ROOT.querySelectorAll(".bg")')
rep('document.querySelector(".main").scrollTop=0;','ROOT.querySelector(".main").scrollTop=0;')
# la subcarpeta Documentos (pestaña Documentos) no es un caso
rep('if(/^plantillas?$/i.test(n))','if(/^documentos$/i.test(n)||/^(19|20)\\d{2}$/.test(n)) continue;   // Documentos y las carpetas de año (Dashboard de Legal) no son casos\n    if(/^plantillas?$/i.test(n))')
# carpeta: la misma que eligió la barra de arriba
i=js.index('async function conectar(gesto){'); j=js.index('/* ============================ lectura de documentos')
js=js[:i]+'''async function conectar(){ RAIZ=window.LEGAL_DIR?window.LEGAL_DIR():null; if(!RAIZ) return false; await leerCarpeta(); return true; }
function pantallaConectar(){
  pintarEstado();
  $("main").innerHTML=`<div class="card connect"><div class="big">📂</div><h2>Elige la carpeta Legal</h2>
    <p class="nota" style="font-size:13.5px;line-height:1.6">Pulsa <b>Elegir carpeta</b> (arriba a la derecha) y elige la carpeta <b>Legal</b> de OneDrive. Cada subcarpeta es un caso; la subcarpeta <b>Plantillas</b> guarda los modelos de Word.</p>
    <button class="btn pri" id="btnCon" style="font-size:14px;padding:11px 22px">📂 Elegir carpeta Legal</button></div>`;
  $("btnCon").onclick=()=>SH.chooseFolder();
}

'''+js[j:]
# IA: mismas instrucciones de antes, ahora armadas aquí y enviadas por la función agente-legal
i=js.index('async function ia(tarea,payload){'); j=js.index('async function guardarResultado(')
js=js[:i]+open('legal_mya/ia_casos.js',encoding='utf-8').read()+'\n'+js[j:]
# arranque: sin barra propia de carpeta; la navegación la hacen las pestañas de arriba
i=js.index('async function iniciar(){'); j=js.index('function listo(){')
js=js[:i]+'''async function iniciar(){
  $("btnRelee").onclick=async()=>{ if(!window.LEGAL_DIR||!LEGAL_DIR()){ SH.chooseFolder(); return; } $("btnRelee").disabled=true; try{ if(window.LEGAL_RELEER) await LEGAL_RELEER(); else { await leerCarpeta(); ir(VISTA); } toast("Carpeta Legal actualizada"); }catch(e){ toast(e.message,true); } $("btnRelee").disabled=false; };
  $("btnCambiar").onclick=()=>SH.chooseFolder();
  if(await conectar()) ir(VISTA); else pantallaConectar();
}
async function alCambiarCarpeta(){ TXT.clear(); if(await conectar()) ir(VISTA); else pantallaConectar(); }
'''+js[j:]
rep('function listo(){ $("bar").querySelectorAll(".navb").forEach(b=>b.disabled=false); ir("inicio"); }','function listo(){ ir(VISTA); }')
# "Más herramientas" del inicio abre las de la pestaña de Martina (Agente y Checklists y herramientas legales)
rep('''$("main").querySelectorAll("[data-h]").forEach(b=>b.onclick=()=>{ MAS_TAB=b.dataset.h; ir("mas"); });''',
    '''$("main").querySelectorAll("[data-h]").forEach(b=>b.onclick=()=>{ const h=b.dataset.h; if(h==="chat") SH.go("chat"); else { SH.go("ag"); SH.apps.ag.show(h==="semaforo"?"reglas":h); } });''')
markup='''<div class="casos">
  <nav class="bar" id="bar">
    <div class="estado"><span id="estadoTxt"></span>
      <button class="btn sm teal" id="btnRelee">↻ Actualizar carpeta Legal</button>
      <button class="btn sm" id="btnCambiar" title="Elegir otra carpeta Legal">📁</button></div>
  </nav>
  <main class="main"><div class="wrap" id="main"></div></main>
</div>'''
out='''<template id="tpl-casos"><style>
'''+css+'''
</style>'''+markup+'''</template>
<script>
/* ===== Inicio · Due diligence · Redacción · Cierre (versión del video de Martina) =====
   Usa la misma carpeta Legal de la barra de arriba y la misma sesión de la página.
   Los datos de cada caso, los checklists y los últimos resultados se guardan en Supabase (tablas lg_*). */
function mountCasos(ROOT){
'''+js+'''
return {ir:v=>{ if(!RAIZ){ VISTA=v; pantallaConectar(); } else ir(v); }, iniciar, alCambiarCarpeta};
}
(function(){
  const views=document.getElementById("views");
  const v=document.createElement("div"); v.id="v-casos"; v.hidden=true; v.innerHTML='<div class="vhost" id="h-casos"></div>'; views.prepend(v);
  const host=document.getElementById("h-casos"); const root=host.attachShadow({mode:"open"}); root.append(document.getElementById("tpl-casos").content.cloneNode(true));
  const nav=document.getElementById("tabs");
  [["inicio","Inicio"],["dd","Due diligence"],["red","Redacción"],["cierre","Cierre"]].reverse().forEach(([k,t])=>{ const b=document.createElement("button"); b.type="button"; b.dataset.v=k; b.setAttribute("aria-selected","false"); b.textContent=t; nav.prepend(b); });
  const CAS=["inicio","dd","red","cierre"];
  let app=null, arrancado=false;
  SH.go=function(v){ this.view=v; const enCasos=CAS.includes(v);
    $s("#v-chat").hidden=v!=="chat"; $s("#v-ag").hidden=v!=="ag"; const d=$s("#v-doc"); if(d) d.hidden=v!=="doc"; $s("#v-casos").hidden=!enCasos;
    $s("#tabs").querySelectorAll("button").forEach(b=>b.setAttribute("aria-selected",b.dataset.v===v));
    if(enCasos&&app){ if(!arrancado){ arrancado=true; app.iniciar().then(()=>app.ir(v)); } else app.ir(v); }
    if(v==="doc"&&window.DOC_CARGAR) window.DOC_CARGAR(); };
  MA.listo.then(()=>{ app=mountCasos(root); SH.onFolder(()=>{ if(arrancado) app.alCambiarCarpeta(); }); SH.go("inicio"); });
})();
</script>
'''
open('legal_mya/casos.html','w',encoding='utf-8').write(out); print('casos',len(out))
