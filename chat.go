package main

import (
	"context"
	"fmt"
	"log"
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
	logf       func(string, ...interface{})
}

func newChatHandler() *ChatHandler {
	return &ChatHandler{
		rooms: map[string]Room{},
		logf:  log.Printf,
	}
}

func (handler *ChatHandler) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	id := request.URL.Query().Get("id")
	if id == "" {
		http.Error(writer, "no 'id' specified", http.StatusBadRequest)
		return
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
			recipient.Write(context.TODO(), websocket.MessageText, []byte(fmt.Sprintf(`{"user":"","message":%v,"datetime":"%v","id":%v}`, string(message), t.Format("2006-01-02 15:04:05.0000"), rand.Int())))
		}
		handler.roomsMutex.RUnlock()
	}
}
