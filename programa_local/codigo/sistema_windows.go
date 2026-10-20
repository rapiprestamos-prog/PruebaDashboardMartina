//go:build windows

package main

import (
	"log"
	"syscall"
	"time"
	"unsafe"
)

// Sin ventana. No abre otros programas, no toca el registro, no se copia ni se agrega solo al inicio de Windows.
//   DashboardMA.exe            → arranca (si no estaba) y abre el dashboard en el navegador
//   DashboardMA.exe --fondo    → arranca sin abrir el navegador (para la carpeta Inicio de Windows)
//   DashboardMA.exe --detener  → lo detiene

var (
	shell32 = syscall.NewLazyDLL("shell32.dll")
	user32  = syscall.NewLazyDLL("user32.dll")
)

func abrirNavegador() {
	url, _ := syscall.UTF16PtrFromString("http://localhost:" + PUERTO + "/")
	op, _ := syscall.UTF16PtrFromString("open")
	shell32.NewProc("ShellExecuteW").Call(0, uintptr(unsafe.Pointer(op)), uintptr(unsafe.Pointer(url)), 0, 0, 1)
}

func aviso(texto string) {
	t, _ := syscall.UTF16PtrFromString("Dashboard M&A")
	m, _ := syscall.UTF16PtrFromString(texto)
	user32.NewProc("MessageBoxW").Call(0, uintptr(unsafe.Pointer(m)), uintptr(unsafe.Pointer(t)), 0x40)
}

func instalarYAbrir() {
	if yaCorre() {
		abrirNavegador()
		return
	}
	go func() {
		for i := 0; i < 40 && !yaCorre(); i++ {
			time.Sleep(250 * time.Millisecond)
		}
		abrirNavegador()
	}()
	if err := servir(); err != nil {
		log.Println(err)
		aviso("No se pudo arrancar el Dashboard M&A:\n\n" + err.Error())
	}
}

func desinstalar() {}
