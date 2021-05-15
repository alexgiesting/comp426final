package main

import (
	"fmt"
	"io"
	"log"
	"math/rand"
	"net/http"
	"time"
)

type Room map[chan string]struct{}
type Connect struct {
	id      string
	channel chan string
}
type Post struct {
	id      string
	user    string
	message string
}

type ChatHandler struct {
	rooms   map[string]Room
	cookies map[string]string
	logf    func(string, ...interface{})
	opening chan Connect
	closing chan Connect
	posting chan Post
}

func newChatHandler(cookies map[string]string) *ChatHandler {
	handler := &ChatHandler{
		rooms:   map[string]Room{},
		cookies: cookies,
		logf:    log.Printf,
		opening: make(chan Connect),
		closing: make(chan Connect),
		posting: make(chan Post),
	}
	go handler.handleEvents()
	return handler
}

func (handler *ChatHandler) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	id := request.URL.Query().Get("id")
	if id == "" {
		http.Error(writer, "no 'id' specified", http.StatusBadRequest)
		return
	}

	switch request.Method {
	case "GET":
		flusher, ok := writer.(http.Flusher)
		if !ok {
			http.Error(writer, "streaming not supported", http.StatusInternalServerError)
			return
		}
		channel := make(chan string)
		connect := Connect{id, channel}
		handler.opening <- connect
		defer func() { handler.closing <- connect }()

		writer.Header().Set("Content-Type", "text/event-stream")
		writer.Header().Set("Connection", "keep-alive")
		for {
			select {
			case response := <-channel:
				_, err := fmt.Fprintf(writer, "data: %s\n\n", response)
				if err != nil {
					handler.logf("%v", err)
					return
				}
				flusher.Flush()
			case <-request.Context().Done():
				handler.closing <- connect
			}
		}
	case "POST":
		user := "\"(anon)\""
		for _, cookie := range request.Cookies() {
			if cookie.Name == "verification" && handler.cookies[cookie.Value] != "" {
				user = handler.cookies[cookie.Value]
				break
			}
		}
		message := make([]byte, 1024)
		length, err := request.Body.Read(message)
		if err != io.EOF {
			handler.logf("%v", err)
			return
		}
		message = message[:length]
		handler.posting <- Post{id, user, string(message)}
	default:
		http.Error(writer, "", http.StatusMethodNotAllowed)
	}
}

func (handler *ChatHandler) handleEvents() {
	for {
		select {
		case open := <-handler.opening:
			if handler.rooms[open.id] == nil {
				handler.rooms[open.id] = make(Room)
			}
			handler.rooms[open.id][open.channel] = struct{}{}
		case close := <-handler.closing:
			delete(handler.rooms[close.id], close.channel)
		case post := <-handler.posting:
			message := fmt.Sprintf(
				`{"user":%v,"message":%v,"datetime":"%v","id":%v}`,
				post.user, post.message, time.Now().Format("2006-01-02 15:04:05.0000"), rand.Int(),
			)
			for channel := range handler.rooms[post.id] {
				channel <- message
			}
		}
	}
}
