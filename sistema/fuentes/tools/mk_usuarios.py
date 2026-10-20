t=open('martina_template.html',encoding='utf-8').read()
css=t[t.index('<style>'):t.index('</style>')+len('</style>')]
i=t.index('/* ---------- Diálogo simple'); j=t.index('$("btnUsrRef").onclick=cargarUsuarios;')+len('$("btnUsrRef").onclick=cargarUsuarios;')
code=t[i:j]
a=code.index('/* ---------- Archivos: se leen directo'); b=code.index('/* ---------- Usuarios (solo administradora)')
code=code[:a]+code[b:]
def rep(s,x,y):
    assert s.count(x)>=1,x; return s.replace(x,y)
code=rep(code,'if(!esAdmin()) return;','')
code=rep(code,'const yo=SB_USER.email.toLowerCase();','const yo=CTX.email;')
code=rep(code,'await SB.functions.invoke(','await MA.sb.functions.invoke(')
code=rep(code,'await SB.from("ma_usuarios")','await MA.sb.from("ma_usuarios")')
s='''<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Usuarios y permisos — M&amp;A Capital</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
'''+css+'''
<style>
html,body{height:100%}
body{display:flex;flex-direction:column;overflow:hidden}
.upage{flex:1;min-height:0;display:flex;flex-direction:column;padding:10px 12px 12px}
.utop{display:flex;align-items:center;gap:10px;margin-bottom:8px;color:var(--text-2);font-size:12.5px}
.upage>#usrPanel{flex:1;min-height:0}
</style>
</head>
<body>
<!--MA_AUTH-->
<script>MA.iniciar({soloAdmin:true,titulo:"Usuarios y permisos"});</script>
<div class="upage">
  <div class="utop"><button class="btn sm" id="btnUsrRef">↻ Actualizar</button><span>Quién entra a cada dashboard. Cada persona tiene un rol y los módulos marcados.</span></div>
  <div id="bannerBox"></div>
  <div id="usrPanel" class="adm"><div class="panel">
    <form class="newuser" id="formNuevo" autocomplete="off">
      <input class="inp sm" type="email" id="nuEmail" placeholder="Correo" required>
      <input class="inp sm" type="text" id="nuNombre" placeholder="Nombre">
      <input class="inp sm" type="password" id="nuPass" placeholder="Contraseña (mín. 8)" minlength="8" required autocomplete="new-password">
      <select class="inp sm" id="nuRol"><option value="lector">Lector</option><option value="admin">Administradora</option></select>
      <span id="nuMods" class="lbl" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"></span>
      <button class="btn sm pri" type="submit" id="btnCrear">＋ Crear usuario</button>
    </form>
    <div class="tbl-wrap" id="usrBox"></div>
  </div></div>
</div>
<script>
/* Usuarios y permisos (solo administradora). Las cuentas se crean con la función pantera-usuarios;
   rol, módulos y estado se guardan con ma_usuario_guardar. */
const $=id=>document.getElementById(id);
const esc=MA.esc;
const fFecha=t=>t?new Date(t).toLocaleString("es-PA",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}):"—";
const MODULOS=MA.MODULOS, ROL_TXT=MA.ROL_TXT;
let CTX=null;
const rpc=async(fn,args)=>{ const {data,error}=await MA.sb.rpc(fn,args); if(error) throw new Error(error.message); return data; };
function banner(html,tipo){ const box=$("bannerBox"); box.innerHTML=html?`<div class="banner ${tipo||""}">${html}<button class="bx" title="Cerrar aviso">✕</button></div>`:""; const b=box.querySelector(".bx"); if(b) b.onclick=()=>box.innerHTML=""; }
'''+code+'''
MA.listo.then(c=>{ CTX=c; cargarUsuarios(); });
</script>
</body>
</html>
'''
open('usuarios.html','w',encoding='utf-8').write(s); print('usuarios',len(s))
