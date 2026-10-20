// Dashboard M&A · programa local
//
// Sirve el dashboard en http://localhost:8765 (trae las páginas de GitHub y guarda una copia por si no hay internet)
// y le entrega al dashboard las carpetas de OneDrive de esta PC: PruebaDashboard (Pantera), Contabilidad y Legal.
// Las busca solo dentro de OneDrive (y bibliotecas de SharePoint sincronizadas en la carpeta del usuario).
// Solo acepta conexiones de esta misma PC y solo desde el propio dashboard.
package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"net"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode"
)

const (
	VERSION = "1.2.0"
	PUERTO  = "8765"
)

var ORIGEN = "https://rapiprestamos-prog.github.io/PruebaDashboardMartina/"

var MODULOS = map[string][]string{
	"PruebaDashboard": {"PruebaDashboard", "Pantera"},
	"Contabilidad":    {"Contabilidad"},
	"Legal":           {"Legal"},
}
var ORDEN = []string{"PruebaDashboard", "Contabilidad", "Legal"}

var noEntrar = map[string]bool{}

func init() {
	for _, n := range []string{"appdata", "application data", "local settings", "cookies", "nethood", "printhood", "recent", "sendto",
		"start menu", "templates", "menu inicio", "plantillas", "saved games", "searches", "contacts", "links", "favorites", "3d objects",
		"music", "videos", "pictures", "musica", "imagenes", "juegos guardados", "busquedas", "contactos", "vinculos", "favoritos",
		"objetos 3d", "node_modules", "windows", "program files", "program files (x86)", "programdata", "system volume information",
		"my music", "my pictures", "my videos", "mis documentos", "mi musica", "mis imagenes", "mis videos", ".git", "snap"} {
		noEntrar[n] = true
	}
	if o := os.Getenv("MA_ORIGEN"); o != "" {
		ORIGEN = strings.TrimRight(o, "/") + "/"
	}
}

var (
	dirApp   string
	rutasMu  sync.Mutex
	rutas    = map[string]string{} // módulo → ruta absoluta
	ultBusca time.Time
	reAnio   = regexp.MustCompile(`^(19|20)\d\d$`)
)

var sinTilde = strings.NewReplacer("á", "a", "é", "e", "í", "i", "ó", "o", "ú", "u", "ü", "u", "ñ", "n", "Á", "a", "É", "e", "Í", "i", "Ó", "o", "Ú", "u", "Ü", "u", "Ñ", "n")

func normal(s string) string {
	var b strings.Builder
	for _, r := range sinTilde.Replace(strings.TrimSpace(s)) {
		if unicode.Is(unicode.Mn, r) { // tildes combinadas (macOS/OneDrive)
			continue
		}
		b.WriteRune(unicode.ToLower(r))
	}
	return b.String()
}
func modDe(nombre string) string {
	k := normal(nombre)
	for _, m := range ORDEN {
		for _, a := range MODULOS[m] {
			if normal(a) == k {
				return m
			}
		}
	}
	return ""
}
func saltar(n string) bool {
	k := normal(n)
	return k == "" || strings.HasPrefix(k, ".") || strings.HasPrefix(k, "$") || strings.HasPrefix(k, "~") || noEntrar[k]
}
func tieneAnios(dir string) bool {
	es, err := os.ReadDir(dir)
	if err != nil {
		return false
	}
	for _, e := range es {
		if e.IsDir() && reAnio.MatchString(strings.TrimSpace(e.Name())) {
			return true
		}
	}
	return false
}

/* ---------------- detector de carpetas ---------------- */

type cand struct {
	mod, ruta, padre string
	orden, nivel     int
}

func carpetaUsuario() string {
	if u := os.Getenv("USERPROFILE"); u != "" {
		return u
	}
	h, _ := os.UserHomeDir()
	return h
}

func buscar() map[string]string {
	t0 := time.Now()
	casa := carpetaUsuario()
	var fase1, fase2 []string
	vistos := map[string]bool{}
	agregar := func(lista *[]string, d string) {
		if d == "" {
			return
		}
		d = filepath.Clean(d)
		if !vistos[strings.ToLower(d)] {
			vistos[strings.ToLower(d)] = true
			*lista = append(*lista, d)
		}
	}
	// primero: la carpeta donde está el programa y la de arriba (carpetas locales en cualquier disco)
	var fase0 []string
	if yo, err := os.Executable(); err == nil {
		d := filepath.Dir(yo)
		agregar(&fase0, d)
		if p := filepath.Dir(d); p != d && len(p) > 3 {
			agregar(&fase0, p)
		}
	}
	for _, v := range []string{"OneDriveCommercial", "OneDrive", "OneDriveConsumer"} {
		if d := os.Getenv(v); d != "" {
			agregar(&fase1, d)
		}
	}
	if es, err := os.ReadDir(casa); err == nil {
		for _, e := range es {
			if !e.IsDir() || saltar(e.Name()) {
				continue
			}
			d := filepath.Join(casa, e.Name())
			if strings.HasPrefix(strings.ToLower(e.Name()), "onedrive") {
				agregar(&fase1, d)
			} else {
				agregar(&fase2, d)
			}
		}
	}
	var cands []cand
	listados := 0
	const maxListados, maxTiempo = 6000, 20 * time.Second
	recorrer := func(raices []string, prof int) {
		type q struct {
			d string
			p int
		}
		nivel := []q{}
		for _, r := range raices {
			nivel = append(nivel, q{r, prof})
		}
		for n := 0; len(nivel) > 0; n++ {
			var sig []q
			for _, it := range nivel {
				if listados >= maxListados || time.Since(t0) > maxTiempo {
					return
				}
				listados++
				es, err := os.ReadDir(it.d)
				if err != nil {
					continue
				}
				for _, e := range es {
					if !e.IsDir() || saltar(e.Name()) {
						continue
					}
					d := filepath.Join(it.d, e.Name())
					if m := modDe(e.Name()); m != "" {
						if tieneAnios(d) {
							cands = append(cands, cand{m, d, it.d, len(cands), n})
						}
						continue
					}
					if it.p > 1 && !reAnio.MatchString(e.Name()) {
						sig = append(sig, q{d, it.p - 1})
					}
				}
			}
			nivel = sig
			if juntas(cands) {
				return
			}
		}
	}
	recorrer(fase0, 3)
	if !juntas(cands) {
		recorrer(fase1, 7)
	}
	if !juntas(cands) {
		recorrer(fase2, 4)
	}
	res := map[string]string{}
	for _, m := range ORDEN {
		var l []cand
		for _, c := range cands {
			if c.mod == m {
				l = append(l, c)
			}
		}
		junto := func(c cand) int {
			s := map[string]bool{}
			for _, o := range cands {
				if o.padre == c.padre && o.mod != m {
					s[o.mod] = true
				}
			}
			return len(s)
		}
		sort.SliceStable(l, func(i, j int) bool {
			if a, b := junto(l[i]), junto(l[j]); a != b {
				return a > b
			}
			return l[i].orden < l[j].orden
		})
		if len(l) > 0 {
			res[m] = l[0].ruta
		}
	}
	log.Printf("búsqueda: %d carpetas revisadas en %v → %v", listados, time.Since(t0).Round(time.Millisecond), res)
	return res
}
func juntas(cs []cand) bool {
	for _, c := range cs {
		ok := true
		for _, m := range ORDEN {
			hay := false
			for _, o := range cs {
				if o.mod == m && o.padre == c.padre {
					hay = true
					break
				}
			}
			if !hay {
				ok = false
				break
			}
		}
		if ok {
			return true
		}
	}
	return false
}

func archivoRutas() string { return filepath.Join(dirApp, "rutas.json") }
func cargarRutas() {
	b, err := os.ReadFile(archivoRutas())
	if err == nil {
		_ = json.Unmarshal(b, &rutas)
	}
}
func guardarRutas() {
	b, _ := json.MarshalIndent(rutas, "", "  ")
	_ = os.WriteFile(archivoRutas(), b, 0o644)
}

// rutasActuales valida las recordadas y vuelve a buscar si falta alguna (como mucho una vez por minuto, salvo que se pida)
func rutasActuales(forzar bool) map[string]string {
	rutasMu.Lock()
	defer rutasMu.Unlock()
	falta := false
	for _, m := range ORDEN {
		r, ok := rutas[m]
		if ok {
			if st, err := os.Stat(r); err != nil || !st.IsDir() {
				delete(rutas, m)
				ok = false
			}
		}
		if !ok {
			falta = true
		}
	}
	if forzar || (falta && time.Since(ultBusca) > time.Minute) {
		ultBusca = time.Now()
		nuevas := buscar()
		for m, r := range nuevas {
			if _, ya := rutas[m]; !ya || forzar {
				rutas[m] = r
			}
		}
		// si junto a la carpeta de otro módulo está la de este, se usa esa (mismo grupo)
		for _, m := range ORDEN {
			for _, o := range ORDEN {
				if o == m || rutas[o] == "" {
					continue
				}
				padre := filepath.Dir(rutas[o])
				if rutas[m] != "" && filepath.Dir(rutas[m]) == padre {
					break
				}
				if es, err := os.ReadDir(padre); err == nil {
					for _, e := range es {
						if d := filepath.Join(padre, e.Name()); e.IsDir() && modDe(e.Name()) == m && tieneAnios(d) {
							rutas[m] = d
						}
					}
				}
			}
		}
		guardarRutas()
	}
	out := map[string]string{}
	for k, v := range rutas {
		out[k] = v
	}
	return out
}

/* ---------------- servidor ---------------- */

func hostValido(h string) bool { return h == "localhost:"+PUERTO || h == "127.0.0.1:"+PUERTO }
func origenValido(r *http.Request) bool {
	o := r.Header.Get("Origin")
	if o == "" {
		return true // pedido del mismo sitio (GET sin Origin)
	}
	return o == "http://localhost:"+PUERTO || o == "http://127.0.0.1:"+PUERTO
}

// resolver: módulo + ruta relativa → ruta absoluta dentro de la carpeta del módulo (nunca fuera)
func resolver(mod, rel string) (string, error) {
	raiz := rutasActuales(false)[mod]
	if raiz == "" {
		return "", errors.New("no se encontró la carpeta " + mod + " en OneDrive")
	}
	rel = strings.TrimLeft(path.Clean("/"+strings.ReplaceAll(rel, "\\", "/")), "/")
	if strings.ContainsAny(rel, ":") {
		return "", errors.New("ruta no válida")
	}
	full := filepath.Join(raiz, filepath.FromSlash(rel))
	r, err := filepath.Rel(raiz, full)
	if err != nil || r == ".." || strings.HasPrefix(r, ".."+string(filepath.Separator)) {
		return "", errors.New("ruta no válida")
	}
	return full, nil
}

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(v)
}
func falla(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func api(w http.ResponseWriter, r *http.Request) {
	if !origenValido(r) {
		falla(w, 403, "origen no permitido")
		return
	}
	q := r.URL.Query()
	switch strings.TrimPrefix(r.URL.Path, "/__ma/") {
	case "salir": // lo usa el acceso "Detener Dashboard M&A"
		if r.Method != http.MethodPost {
			falla(w, 405, "método no permitido")
			return
		}
		jsonOK(w, map[string]string{"ok": "1"})
		log.Printf("detenido a pedido")
		go func() { time.Sleep(300 * time.Millisecond); os.Exit(0) }()
	case "ping":
		jsonOK(w, map[string]string{"ok": "1", "version": VERSION})
	case "rutas":
		rs := rutasActuales(q.Get("buscar") == "1")
		out := map[string]map[string]string{}
		for m, p := range rs {
			out[m] = map[string]string{"nombre": filepath.Base(p), "ruta": p}
		}
		jsonOK(w, out)
	case "listar":
		d, err := resolver(q.Get("m"), q.Get("p"))
		if err != nil {
			falla(w, 400, err.Error())
			return
		}
		es, err := os.ReadDir(d)
		if err != nil {
			if os.IsNotExist(err) {
				falla(w, 404, "no existe")
			} else {
				falla(w, 500, err.Error())
			}
			return
		}
		type ent struct {
			N string `json:"n"`
			D bool   `json:"d"`
			S int64  `json:"s"`
			T int64  `json:"t"`
		}
		out := []ent{}
		for _, e := range es {
			if e.Type()&os.ModeSymlink != 0 {
				continue
			}
			x := ent{N: e.Name(), D: e.IsDir()}
			if info, err := e.Info(); err == nil {
				x.S, x.T = info.Size(), info.ModTime().UnixMilli()
			}
			out = append(out, x)
		}
		jsonOK(w, out)
	case "archivo":
		f, err := resolver(q.Get("m"), q.Get("p"))
		if err != nil {
			falla(w, 400, err.Error())
			return
		}
		switch r.Method {
		case http.MethodGet:
			fh, err := os.Open(f)
			if err != nil {
				falla(w, 404, "no existe")
				return
			}
			defer fh.Close()
			st, _ := fh.Stat()
			if st.IsDir() {
				falla(w, 400, "es una carpeta")
				return
			}
			w.Header().Set("Cache-Control", "no-store")
			w.Header().Set("Content-Type", "application/octet-stream")
			http.ServeContent(w, r, "", st.ModTime(), fh)
		case http.MethodPut:
			if st, err := os.Stat(filepath.Dir(f)); err != nil || !st.IsDir() {
				falla(w, 404, "la carpeta no existe")
				return
			}
			tmp := f + ".ma-guardando"
			out, err := os.Create(tmp)
			if err != nil {
				falla(w, 500, err.Error())
				return
			}
			_, err = io.Copy(out, http.MaxBytesReader(w, r.Body, 500<<20))
			out.Close()
			if err == nil {
				err = os.Rename(tmp, f)
			}
			if err != nil {
				os.Remove(tmp)
				falla(w, 500, err.Error())
				return
			}
			log.Printf("guardado: %s", f)
			jsonOK(w, map[string]string{"ok": "1"})
		default:
			falla(w, 405, "método no permitido")
		}
	case "carpeta":
		if r.Method != http.MethodPost {
			falla(w, 405, "método no permitido")
			return
		}
		d, err := resolver(q.Get("m"), q.Get("p"))
		if err == nil {
			err = os.MkdirAll(d, 0o755)
		}
		if err != nil {
			falla(w, 500, err.Error())
			return
		}
		jsonOK(w, map[string]string{"ok": "1"})
	case "borrar":
		if r.Method != http.MethodPost {
			falla(w, 405, "método no permitido")
			return
		}
		f, err := resolver(q.Get("m"), q.Get("p"))
		if err == nil && strings.Trim(q.Get("p"), "/") == "" {
			err = errors.New("no se puede borrar la carpeta del módulo")
		}
		if err == nil {
			if q.Get("todo") == "1" {
				err = os.RemoveAll(f)
			} else {
				err = os.Remove(f)
			}
		}
		if err != nil {
			falla(w, 500, err.Error())
			return
		}
		log.Printf("borrado: %s", f)
		jsonOK(w, map[string]string{"ok": "1"})
	default:
		falla(w, 404, "no existe")
	}
}

var clienteWeb = &http.Client{Timeout: 20 * time.Second}

// paginas: trae la página de GitHub (siempre la más reciente) y guarda una copia; sin internet, usa la copia
func paginas(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "método no permitido", 405)
		return
	}
	p := path.Clean("/" + r.URL.Path)
	if p == "/" {
		p = "/index.html"
	}
	rel := strings.TrimPrefix(p, "/")
	copia := filepath.Join(dirApp, "copia", filepath.FromSlash(rel))
	tipo := mime.TypeByExtension(path.Ext(p))
	if tipo == "" {
		tipo = "application/octet-stream"
	}
	var cuerpo []byte
	res, err := clienteWeb.Get(ORIGEN + rel + "?t=" + fmt.Sprint(time.Now().UnixNano()))
	if err == nil {
		if res.StatusCode == 200 {
			cuerpo, err = io.ReadAll(res.Body)
		} else {
			err = fmt.Errorf("GitHub respondió %d", res.StatusCode)
		}
		res.Body.Close()
	}
	if err == nil {
		_ = os.MkdirAll(filepath.Dir(copia), 0o755)
		_ = os.WriteFile(copia, cuerpo, 0o644)
	} else if b, e2 := os.ReadFile(copia); e2 == nil {
		log.Printf("sin conexión con GitHub (%v): uso la copia de %s", err, rel)
		cuerpo = b
	} else {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(502)
		fmt.Fprintf(w, `<!doctype html><meta charset="utf-8"><body style="font:15px system-ui;padding:40px;color:#0f1c2e"><b>No se pudo abrir el dashboard</b><br><br>No hay conexión con GitHub y todavía no hay una copia guardada de esta página.<br>Revisa internet y vuelve a intentar.<br><br><small>%s</small>`, err)
		return
	}
	w.Header().Set("Content-Type", tipo)
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(cuerpo)
}

func servidor() http.Handler {
	m := http.NewServeMux()
	m.HandleFunc("/__ma/", api)
	m.HandleFunc("/", paginas)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !hostValido(r.Host) {
			http.Error(w, "no permitido", 403)
			return
		}
		m.ServeHTTP(w, r)
	})
}

func yaCorre() bool {
	c := &http.Client{Timeout: 1500 * time.Millisecond}
	r, err := c.Get("http://127.0.0.1:" + PUERTO + "/__ma/ping")
	if err != nil {
		return false
	}
	r.Body.Close()
	return r.StatusCode == 200
}

func servir() error {
	ln, err := net.Listen("tcp", "127.0.0.1:"+PUERTO)
	if err != nil {
		return err
	}
	go func() { rutasActuales(false) }() // busca las carpetas apenas arranca
	log.Printf("Dashboard M&A %s escuchando en http://localhost:%s (origen %s)", VERSION, PUERTO, ORIGEN)
	return http.Serve(ln, servidor())
}

func main() {
	base, _ := os.UserCacheDir() // Windows: %LOCALAPPDATA%
	if d := os.Getenv("MA_DIR"); d != "" {
		base = d
	}
	dirApp = filepath.Join(base, "DashboardMA")
	_ = os.MkdirAll(dirApp, 0o755)
	if f, err := os.OpenFile(filepath.Join(dirApp, "registro.txt"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644); err == nil {
		log.SetOutput(io.MultiWriter(f, os.Stderr))
	}
	cargarRutas()
	arg := ""
	if len(os.Args) > 1 {
		arg = os.Args[1]
	}
	switch arg {
	case "--detener":
		c := &http.Client{Timeout: 3 * time.Second}
		if r, err := c.Post("http://127.0.0.1:"+PUERTO+"/__ma/salir", "text/plain", nil); err == nil {
			r.Body.Close()
		}
	case "--servir", "--fondo": // de fondo, sin abrir el navegador (arranque de Windows)
		if yaCorre() {
			return
		}
		if err := servir(); err != nil {
			log.Fatal(err)
		}
	case "--desinstalar":
		desinstalar()
	default: // doble clic
		instalarYAbrir()
	}
}
