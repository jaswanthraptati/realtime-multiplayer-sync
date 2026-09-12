const { WebSocketServer } = require("ws");
const crypto = require("crypto");

const PORT = 8080;

const wss = new WebSocketServer({ port: PORT });

const users = new Map();

function broadcast(message, exclude = null) {
  const payload = JSON.stringify(message);

  for (const client of wss.clients) {
    if (client !== exclude && client.readyState === 1) {
      client.send(payload);
    }
  }
}

function getPresence() {
  return Array.from(users.values()).map((user) => ({
    id: user.id,
    name: user.name,
    color: user.color,
    x: user.x,
    y: user.y,
  }));
}

wss.on("connection", (ws) => {
  let user = null;

  ws.on("message", (raw) => {
    try {
      const message = JSON.parse(raw.toString());

      if (message.type === "join") {
        const id =
          typeof message.id === "string" && message.id.length > 0
            ? message.id
            : crypto.randomUUID();

        user = {
          id,
          name:
            typeof message.name === "string" && message.name.trim()
              ? message.name.trim().slice(0, 20)
              : `User ${id.slice(0, 5)}`,
          color:
            typeof message.color === "string"
              ? message.color
              : "#111111",
          x: 50,
          y: 50,
          ws,
        };

        users.set(id, user);

        ws.send(
          JSON.stringify({
            type: "welcome",
            user: {
              id: user.id,
              name: user.name,
              color: user.color,
            },
          })
        );

        broadcast({
          type: "presence",
          users: getPresence(),
        });

        console.log(`User connected: ${user.name} (${user.id})`);
        console.log(`Active users: ${users.size}`);

        return;
      }

      if (!user) return;

      if (message.type === "cursor") {
        const x = Number(message.x);
        const y = Number(message.y);

        if (!Number.isFinite(x) || !Number.isFinite(y)) return;

        user.x = Math.max(0, Math.min(100, x));
        user.y = Math.max(0, Math.min(100, y));

        broadcast(
          {
            type: "cursor",
            id: user.id,
            name: user.name,
            color: user.color,
            x: user.x,
            y: user.y,
          },
          ws
        );

        return;
      }

      if (message.type === "ping") {
        ws.send(
          JSON.stringify({
            type: "pong",
            timestamp: message.timestamp,
          })
        );
      }
    } catch (error) {
      console.error("Invalid message:", error.message);
    }
  });

  ws.on("close", () => {
    if (!user) return;

    users.delete(user.id);

    broadcast({
      type: "presence",
      users: getPresence(),
    });

    console.log(`User disconnected: ${user.name} (${user.id})`);
    console.log(`Active users: ${users.size}`);
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error.message);
  });
});

console.log(`FlamSync WebSocket server running on ws://localhost:${PORT}`);