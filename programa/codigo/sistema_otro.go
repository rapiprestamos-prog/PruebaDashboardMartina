//go:build !windows

package main

import "log"

// Solo para probar fuera de Windows: sirve en primer plano.
func instalarYAbrir() {
	if err := servir(); err != nil {
		log.Fatal(err)
	}
}
func desinstalar() {}
