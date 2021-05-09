package main

import (
	"context"
	"fmt"
	"math/rand"
	"net/http"
	"sync"
	"time"

	"nhooyr.io/websocket"
)

type Room map[*websocket.Conn]struct{}

type ChatHandler struct {
	rooms      map[string]Room
	roomsMutex sync.RWMutex
	cookies    map[string]string
	logf       func(string, ...interface{})
}

func newChatHandler(cookies map[string]string) *ChatHandler {
	return &ChatHandler{
		rooms:   map[string]Room{},
		cookies: cookies,
		logf:    func(f string, v ...interface{}) {}, //log.Printf,
	}
}

func (handler *ChatHandler) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	id := request.URL.Query().Get("id")
	if id == "" {
		http.Error(writer, "no 'id' specified", http.StatusBadRequest)
		return
	}

	user := "\"(anon)\""
	for _, c := range request.Cookies() {
		if c.Name == "verification" && handler.cookies[c.Value] != "" {
			user = handler.cookies[c.Value]
			break
		}
	}

	connection, err := websocket.Accept(writer, request, &websocket.AcceptOptions{})
	if err != nil {
		handler.logf("%v", err)
		return
	}
	defer connection.Close(websocket.StatusInternalError, "Unknown server error")

	handler.roomsMutex.Lock()
	if handler.rooms[id] == nil {
		handler.rooms[id] = make(Room)
	}
	room := handler.rooms[id]
	room[connection] = struct{}{}
	handler.roomsMutex.Unlock()

	for {
		messageType, message, err := connection.Read(context.TODO())
		if err != nil || messageType != websocket.MessageText {
			handler.logf("%v", err)
			return
		}
		handler.roomsMutex.RLock()
		t := time.Now()
		for recipient := range room {
			recipient.Write(context.TODO(), websocket.MessageText, []byte(fmt.Sprintf(`{"user":%v,"message":%v,"datetime":"%v","id":%v}`, user, string(message), t.Format("2006-01-02 15:04:05.0000"), rand.Int())))
		}
		handler.roomsMutex.RUnlock()
	}
}
