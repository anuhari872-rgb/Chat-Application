const http = require("http");
const path = require("path");
const express = require("express");
const WebSocket = require("ws");

const app = express();
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

/**
 * In-memory store
 * users: Map<ws, {id, name, room}>
 * rooms: Map<roomName, Set<ws>>
 */
const users = new Map();
const rooms = new Map();

function broadcast(room, payload, except = null) {
  const clients = rooms.get(room);
  if (!clients) return;
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN && client !== except) {
      client.send(JSON.stringify(payload));
    }
  }
}

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function getOnlineUsers(room) {
  const clients = rooms.get(room);
  if (!clients) return [];
  const list = [];
  for (const ws of clients) {
    const u = users.get(ws);
    if (u) list.push({ id: u.id, name: u.name });
  }
  return list;
}

function joinRoom(ws, room) {
  if (!rooms.has(room)) rooms.set(room, new Set());
  rooms.get(room).add(ws);
}

function leaveRoom(ws) {
  const u = users.get(ws);
  if (!u) return;
  const { room, name } = u;
  const set = rooms.get(room);
  if (set) {
    set.delete(ws);
    broadcast(room, { type: "system", text: `${name} left ${room}` }, ws);
    broadcast(room, { type: "users", users: getOnlineUsers(room) });
    if (set.size === 0) rooms.delete(room);
  }
}

wss.on("connection", (ws) => {
  // Assign a lightweight id
  const id = Math.random().toString(36).slice(2, 8);

  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return send(ws, { type: "error", text: "Invalid JSON" });
    }

    // Expected messages: join, chat, typing, switchRoom, pm
    switch (msg.type) {
      case "join": {
        const name = String(msg.name || "").trim() || `User_${id}`;
        const room = String(msg.room || "").trim() || "general";

        // If already in a room, leave first
        if (users.has(ws)) leaveRoom(ws);

        users.set(ws, { id, name, room });
        joinRoom(ws, room);

        send(ws, { type: "joined", id, name, room });
        broadcast(room, { type: "system", text: `${name} joined ${room}` }, ws);
        broadcast(room, { type: "users", users: getOnlineUsers(room) });
        break;
      }

      case "chat": {
        const u = users.get(ws);
        if (!u) return send(ws, { type: "error", text: "Join a room first" });
        const payload = {
          type: "chat",
          from: { id: u.id, name: u.name },
          text: String(msg.text || ""),
          ts: Date.now(),
        };
        broadcast(u.room, payload);
        break;
      }

      case "typing": {
        const u = users.get(ws);
        if (!u) return;
        broadcast(u.room, { type: "typing", from: u.name, isTyping: !!msg.isTyping }, ws);
        break;
      }

      case "switchRoom": {
        const u = users.get(ws);
        if (!u) return send(ws, { type: "error", text: "Join first" });
        const newRoom = String(msg.room || "").trim() || "general";
        leaveRoom(ws);
        u.room = newRoom;
        joinRoom(ws, newRoom);
        send(ws, { type: "joined", id: u.id, name: u.name, room: newRoom });
        broadcast(newRoom, { type: "system", text: `${u.name} joined ${newRoom}` }, ws);
        broadcast(newRoom, { type: "users", users: getOnlineUsers(newRoom) });
        break;
      }

      case "pm": {
        const u = users.get(ws);
        if (!u) return;
        const targetName = String(msg.to || "").trim();
        const text = String(msg.text || "");
        let delivered = false;
        for (const [client, info] of users.entries()) {
          if (info.name === targetName && client.readyState === WebSocket.OPEN) {
            send(client, {
              type: "pm",
              from: { id: u.id, name: u.name },
              text,
              ts: Date.now(),
            });
            delivered = true;
            break;
          }
        }
        if (!delivered) send(ws, { type: "system", text: `User '${targetName}' not found.` });
        break;
      }

      default:
        send(ws, { type: "error", text: `Unknown type: ${msg.type}` });
    }
  });

  ws.on("close", () => {
    leaveRoom(ws);
    users.delete(ws);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
