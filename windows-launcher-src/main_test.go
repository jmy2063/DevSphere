package main

import "testing"

func TestHandleRejectsUnknownOption(t *testing.T) {
    if err := handle(t.TempDir(), "--does-not-exist"); err == nil {
        t.Fatal("unknown option must fail")
    }
}
