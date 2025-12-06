const $ = (q) => document.querySelector(q);
const messagesEl = $("#messages");
const onlineEl = $("#onlineList");
const roomTitleEl = $("#roomTitle");
const userInfoEl = $("#userInfo");
const typingEl = $("#typingIndicator");

let ws;
let me = { id: null, name: null, room: null };

// Persist last used name/room
$("#name").value = localStorage.getItem("name") || "";
$("#room").value = localStorage.getItem("room") || "general";

function connect() {
  ws = new WebSocket(getWsUrl());
  ws.onopen = () => console.log("Connected");
  ws.onclose = () => addSystem("Disconnected");
  ws.onmessage = (evt) => handle(JSON.parse(evt.data));
}

function getWsUrl() {
  // Match the server host; change port if needed
  const loc = window.location;
  const proto = loc.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${loc.hostname}:${loc.port || 3000}`;
}

function join(name, room) {
  ws.send(JSON.stringify({ type: "join", name, room }));
}

function sendChat(text) {
  if (!text.trim()) return;
  ws.send(JSON.stringify({ type: "chat", text }));
}

function sendTyping(isTyping) {
  ws.send(JSON.stringify({ type: "typing", isTyping }));
}

function switchRoom(room) {
  ws.send(JSON.stringify({ type: "switchRoom", room }));
}

function sendPM(to, text) {
  if (!to.trim() || !text.trim()) return;
  ws.send(JSON.stringify({ type: "pm", to, text }));
}

function handle(msg) {
  switch (msg.type) {
    case "joined":
      me = { id: msg.id, name: msg.name, room: msg.room };
      roomTitleEl.textContent = `Room: ${me.room}`;
      userInfoEl.textContent = `You are ${me.name} (${me.id})`;
      addSystem(`Joined ${me.room} as ${me.name}`);
      break;

    case "system":
      addSystem(msg.text);
      break;

    case "chat":
      addMessage(msg.from.name, msg.text, msg.from.id === me.id, msg.ts);
      break;

    case "typing":
      typingEl.textContent = msg.isTyping ? `${msg.from} is typing...` : "";
      break;

    case "users":
      renderUsers(msg.users);
      break;

    case "pm":
      addPM(msg.from.name, msg.text, msg.ts);
      break;

    case "error":
      addSystem(`Error: ${msg.text}`);
      break;
  }
}

function addMessage(sender, text, isMe, ts) {
  const wrap = document.createElement("div");
  wrap.className = `message${isMe ? " me" : ""}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = `${sender} • ${formatTs(ts)}`;

  wrap.appendChild(bubble);
  wrap.appendChild(meta);
  messagesEl.appendChild(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addPM(sender, text, ts) {
  const wrap = document.createElement("div");
  wrap.className = "message";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = `[PM from ${sender}] ${text}`;
  bubble.style.border = "1px dashed #f59e0b";
  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = `private • ${formatTs(ts)}`;
  wrap.appendChild(bubble);
  wrap.appendChild(meta);
  messagesEl.appendChild(wrap);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addSystem(text) {
  const div = document.createElement("div");
  div.className = "system";
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderUsers(users) {
  onlineEl.innerHTML = "";
  for (const u of users) {
    const li = document.createElement("li");
    li.textContent = `${u.name} (${u.id})`;
    onlineEl.appendChild(li);
  }
}

function formatTs(ts) {
  const d = new Date(ts || Date.now());
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// UI wiring
$("#joinBtn").addEventListener("click", () => {
  const name = $("#name").value.trim() || `User_${Math.random().toString(36).slice(2,6)}`;
  const room = $("#room").value.trim() || "general";
  localStorage.setItem("name", name);
  localStorage.setItem("room", room);
  $(".join").classList.add("hidden");
  $(".chat").classList.remove("hidden");
  connect();
  ws.addEventListener("open", () => join(name, room));
});

$("#sendBtn").addEventListener("click", () => sendChat($("#messageInput").value));
$("#messageInput").addEventListener("input", () => {
  sendTyping($("#messageInput").value.length > 0);
});
$("#messageInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    sendChat($("#messageInput").value);
    $("#messageInput").value = "";
    sendTyping(false);
  }
});

$("#switchRoomBtn").addEventListener("click", () => {
  const target = $("#switchRoomInput").value.trim();
  if (target) switchRoom(target);
});

$("#pmSend").addEventListener("click", () => {
  const to = $("#pmTo").value.trim();
  const text = $("#pmText").value.trim();
  sendPM(to, text);
  $("#pmText").value = "";
});
