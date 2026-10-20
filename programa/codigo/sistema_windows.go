//go:build windows

package main

import (
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

func oculto(c *exec.Cmd) *exec.Cmd {
	c.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
	return c
}

func abrirNavegador() {
	_ = oculto(exec.Command("rundll32", "url.dll,FileProtocolHandler", "http://localhost:"+PUERTO+"/")).Start()
}

func escritorio() string {
	out, err := oculto(exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", "[Environment]::GetFolderPath('Desktop')")).Output()
	if d := strings.TrimSpace(string(out)); err == nil && d != "" {
		return d
	}
	return filepath.Join(os.Getenv("USERPROFILE"), "Desktop")
}

// instalarYAbrir: se copia a %LOCALAPPDATA%\DashboardMA, se agrega al inicio de Windows (solo este usuario, sin administrador),
// crea el acceso "Dashboard M&A" en el escritorio, arranca de fondo y abre el dashboard.
func instalarYAbrir() {
	destino := filepath.Join(dirApp, "DashboardMA.exe")
	yo, _ := os.Executable()
	if !strings.EqualFold(filepath.Clean(yo), filepath.Clean(destino)) {
		{
			if err := copiar(yo, destino); err != nil {
				log.Printf("no se pudo copiar el programa: %v", err)
				destino = yo
			}
		}
	}
	_ = oculto(exec.Command("reg", "add", `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, "/v", "DashboardMA", "/t", "REG_SZ",
		"/d", `"`+destino+`" --servir`, "/f")).Run()
	acc := filepath.Join(escritorio(), "Dashboard M&A.url")
	_ = os.WriteFile(acc, []byte("[InternetShortcut]\r\nURL=http://localhost:"+PUERTO+"/\r\nIconFile="+destino+"\r\nIconIndex=0\r\n"), 0o644)
	if !yaCorre() {
		_ = oculto(exec.Command(destino, "--servir")).Start()
		for i := 0; i < 40 && !yaCorre(); i++ {
			time.Sleep(250 * time.Millisecond)
		}
	}
	abrirNavegador()
}

func desinstalar() {
	_ = oculto(exec.Command("reg", "delete", `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, "/v", "DashboardMA", "/f")).Run()
	_ = oculto(exec.Command("taskkill", "/IM", "DashboardMA.exe", "/F")).Run()
	_ = os.Remove(filepath.Join(escritorio(), "Dashboard M&A.url"))
	log.Printf("desinstalado del inicio de Windows")
}

func existe(p string) bool { _, err := os.Stat(p); return err == nil }
func copiar(a, b string) error {
	in, err := os.Open(a)
	if err != nil {
		return err
	}
	defer in.Close()
	tmp := b + ".nuevo"
	out, err := os.Create(tmp)
	if err != nil {
		return err
	}
	if _, err = io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	out.Close()
	_ = oculto(exec.Command("taskkill", "/IM", "DashboardMA.exe", "/F")).Run()
	time.Sleep(300 * time.Millisecond)
	_ = os.Remove(b)
	return os.Rename(tmp, b)
}
