package main

import (
	"database/sql"
	"fmt"
	"hash/fnv"
	"log"
	"math/rand"
	"net/http"
	"os"

	_ "github.com/mattn/go-sqlite3"
)

func hash(s string) uint32 {
	h := fnv.New32a()
	h.Write([]byte(s))
	return h.Sum32()
}

func main() {
	db, _ := sql.Open("sqlite3", ":memory:")
	db.Exec(`CREATE TABLE users (
		name TEXT,
		hash INTEGER
	)`)
	db.Exec(`CREATE TABLE favorites (
		name    TEXT,
		station INTEGER
	)`)
	cookies := map[string]string{}
	http.HandleFunc("/register", func(writer http.ResponseWriter, request *http.Request) {
		q := request.URL.Query()
		name := q.Get("name")
		password := q.Get("password")
		row := db.QueryRow("SELECT name FROM users WHERE name=?", name)
		var x string
		err := row.Scan(&x)
		if err == nil {
			http.Error(writer, "username already exists", http.StatusBadRequest)
			return
		}
		db.Exec("INSERT INTO users VALUES (?,?)", name, hash(password))
		key := fmt.Sprint(rand.Int())
		cookies[key] = name
		http.SetCookie(writer, &http.Cookie{
			Name: "verification", Value: fmt.Sprint(key),
		})
		http.Redirect(writer, request, "/", http.StatusSeeOther)
	})
	http.HandleFunc("/login", func(writer http.ResponseWriter, request *http.Request) {
		q := request.URL.Query()
		name := q.Get("name")
		password := q.Get("password")
		row := db.QueryRow("SELECT hash FROM users WHERE name=?", name)
		if row == nil {
			http.Error(writer, "username doesn't exist", http.StatusBadRequest)
			return
		}
		var hashed int
		row.Scan(&hashed)
		if int(hash(password)) != hashed {
			http.Error(writer, "invalid password", http.StatusBadRequest)
			return
		}
		key := fmt.Sprint(rand.Int())
		cookies[key] = name
		http.SetCookie(writer, &http.Cookie{
			Name: "verification", Value: key,
		})
		http.Redirect(writer, request, "/", http.StatusSeeOther)
	})
	http.HandleFunc("/user", func(writer http.ResponseWriter, request *http.Request) {
		for _, c := range request.Cookies() {
			if c.Name == "verification" && cookies[c.Value] != "" {
				writer.Write([]byte(cookies[c.Value]))
				return
			}
		}
		http.Error(writer, "no valid cookie", http.StatusBadRequest)
	})

	fileServer := http.FileServer(http.Dir("static/"))
	http.Handle("/", http.StripPrefix("/", fileServer))
	http.Handle("/chat", newChatHandler(cookies))
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("listening on port %v", port)
	http.ListenAndServe(":"+port, nil)
}
