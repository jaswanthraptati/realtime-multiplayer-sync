import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Circle,
  MousePointer2,
  Radio,
  RefreshCw,
  Users,
  Wifi,
} from "lucide-react";
import "./App.css";

type ConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

type RemoteUser = {
  id: string;
  name: string;
  color: string;
  x?: number;
  y?: number;
};

type CursorPosition = {
  userId: string;
  name: string;
  color: string;
  x: number;
  y: number;
};

const WS_URL = "ws://localhost:8080";

const COLORS = [
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#059669",
  "#ea580c",
  "#0891b2",
  "#4f46e5",
  "#65a30d",
];

function getStableUserId() {
  const stored = sessionStorage.getItem("flamsync-user-id");

  if (stored) {
    return stored;
  }

  const id = crypto.randomUUID();

  sessionStorage.setItem("flamsync-user-id", id);

  return id;
}

function getStableUserColor() {
  const stored = sessionStorage.getItem("flamsync-user-color");

  if (stored) {
    return stored;
  }

  const id = getStableUserId();

  let hash = 0;

  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }

  const color = COLORS[hash % COLORS.length];

  sessionStorage.setItem("flamsync-user-color", color);

  return color;
}

function getUserName(id: string) {
  return `User ${id.slice(0, 5)}`;
}

function App() {
  const [connection, setConnection] =
    useState<ConnectionState>("connecting");

  const [userId, setUserId] = useState("");
  const [userColor, setUserColor] = useState("#2563eb");

  const [users, setUsers] = useState<RemoteUser[]>([]);
  const [cursors, setCursors] = useState<
    Record<string, CursorPosition>
  >({});

  const [latency, setLatency] = useState<number | null>(null);
  const [messagesPerSecond, setMessagesPerSecond] = useState(0);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);

  const messageCountRef = useRef(0);
  const lastCursorSentRef = useRef(0);

  const mountedRef = useRef(true);

  const connect = () => {
    if (!mountedRef.current) return;

    if (
      socketRef.current &&
      (socketRef.current.readyState === WebSocket.OPEN ||
        socketRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    setConnection(
      reconnectAttemptRef.current > 0
        ? "reconnecting"
        : "connecting"
    );

    const id = getStableUserId();
    const color = getStableUserColor();

    setUserId(id);
    setUserColor(color);

    const socket = new WebSocket(WS_URL);

    socketRef.current = socket;

    socket.onopen = () => {
      if (!mountedRef.current) return;

      reconnectAttemptRef.current = 0;
      setConnection("connected");

      socket.send(
        JSON.stringify({
          type: "join",
          id,
          name: getUserName(id),
          color,
        })
      );
    };

    socket.onmessage = (event) => {
      if (!mountedRef.current) return;

      messageCountRef.current += 1;

      try {
        const message = JSON.parse(event.data);

        if (message.type === "welcome") {
          const user = message.user;

          if (user) {
            setUserId(user.id);
            setUserColor(user.color);
          }

          return;
        }

        if (message.type === "presence") {
          const incomingUsers: RemoteUser[] =
            message.users || [];

          setUsers(incomingUsers);

          const activeIds = new Set(
            incomingUsers.map((user) => user.id)
          );

          setCursors((previous) => {
            const next: Record<string, CursorPosition> = {};

            for (const [id, cursor] of Object.entries(previous)) {
              if (activeIds.has(id)) {
                next[id] = cursor;
              }
            }

            return next;
          });

          return;
        }

        if (message.type === "cursor") {
          const cursor: CursorPosition = {
            userId: message.id,
            name:
              message.name || getUserName(message.id),
            color: message.color || "#111111",
            x: Number(message.x),
            y: Number(message.y),
          };

          setCursors((previous) => ({
            ...previous,
            [cursor.userId]: cursor,
          }));

          return;
        }

        if (message.type === "user:left") {
          setCursors((previous) => {
            const next = { ...previous };
            delete next[message.id];
            return next;
          });

          return;
        }

        if (message.type === "pong") {
          const sentAt = Number(message.timestamp);

          if (Number.isFinite(sentAt)) {
            setLatency(
              Math.max(
                0,
                Math.round(performance.now() - sentAt)
              )
            );
          }

          return;
        }
      } catch {
        console.warn("Received invalid WebSocket message");
      }
    };

    socket.onerror = () => {
      if (mountedRef.current) {
        setConnection("disconnected");
      }
    };

    socket.onclose = () => {
      if (!mountedRef.current) return;

      socketRef.current = null;
      setConnection("reconnecting");

      const attempt = reconnectAttemptRef.current;

      const delay = Math.min(1000 * 2 ** attempt, 8000);

      reconnectAttemptRef.current += 1;

      reconnectTimerRef.current = window.setTimeout(() => {
        connect();
      }, delay);
    };
  };

  useEffect(() => {
    mountedRef.current = true;

    connect();

    const pingInterval = window.setInterval(() => {
      const socket = socketRef.current;

      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "ping",
            timestamp: performance.now(),
          })
        );
      }
    }, 1000);

    const messageInterval = window.setInterval(() => {
      setMessagesPerSecond(messageCountRef.current);
      messageCountRef.current = 0;
    }, 1000);

    return () => {
      mountedRef.current = false;

      window.clearInterval(pingInterval);
      window.clearInterval(messageInterval);

      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }

      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  const handlePointerMove = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    const now = performance.now();

    // Limit cursor updates to approximately 30 messages/second.
    if (now - lastCursorSentRef.current < 33) {
      return;
    }

    lastCursorSentRef.current = now;

    const socket = socketRef.current;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const rect =
      event.currentTarget.getBoundingClientRect();

    const x =
      ((event.clientX - rect.left) / rect.width) * 100;

    const y =
      ((event.clientY - rect.top) / rect.height) * 100;

    socket.send(
      JSON.stringify({
        type: "cursor",
        x,
        y,
      })
    );
  };

  const onlineUsers = users.filter(
    (user) => user.id !== userId
  );

  const visibleCursors = Object.values(cursors).filter(
    (cursor) => cursor.userId !== userId
  );

  const connectionLabel =
    connection === "connected"
      ? "Connected"
      : connection === "reconnecting"
      ? "Reconnecting"
      : connection === "connecting"
      ? "Connecting"
      : "Disconnected";

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Radio size={18} />
          </div>

          <div>
            <div className="brand-name">FlamSync</div>

            <div className="brand-subtitle">
              Real-time collaboration
            </div>
          </div>
        </div>

        <div className={`connection-pill ${connection}`}>
          <Circle size={8} fill="currentColor" />
          {connectionLabel}
        </div>
      </header>

      <main className="main">
        <section className="hero">
          <div>
            <div className="eyebrow">
              MULTIPLAYER WORKSPACE
            </div>

            <h1>Real-time state synchronization</h1>

            <p>
              Move your cursor and watch connected users update
              instantly across every browser session.
            </p>
          </div>

          <div className="session-card">
            <span>SESSION</span>

            <strong>FLAM-DEMO</strong>

            <small>
              <span className="live-dot" />
              Live
            </small>
          </div>
        </section>

        <section className="workspace-card">
          <div className="workspace-header">
            <div className="workspace-title">
              <div className="workspace-icon">
                <MousePointer2 size={17} />
              </div>

              <div>
                <strong>Shared workspace</strong>

                <span>
                  Move your pointer inside the workspace
                </span>
              </div>
            </div>

            <div className="workspace-users">
              <div className="avatar-stack">
                <div
                  className="user-avatar"
                  style={{
                    backgroundColor: userColor,
                  }}
                  title="You"
                >
                  Y
                </div>

                {onlineUsers.slice(0, 4).map((user) => (
                  <div
                    key={user.id}
                    className="user-avatar"
                    style={{
                      backgroundColor: user.color,
                    }}
                    title={user.name}
                  >
                    {user.name.charAt(5).toUpperCase()}
                  </div>
                ))}

                {onlineUsers.length > 4 && (
                  <div className="more-users">
                    +{onlineUsers.length - 4}
                  </div>
                )}
              </div>

              <span>
                {users.length}{" "}
                {users.length === 1 ? "user" : "users"} online
              </span>
            </div>
          </div>

          <div
            className="workspace"
            onPointerMove={handlePointerMove}
          >
            <div className="workspace-grid" />

            <div className="workspace-center">
              <div className="center-badge">
                <Wifi size={15} />

                <span>
                  {connection === "connected"
                    ? "Live synchronization active"
                    : connectionLabel}
                </span>
              </div>

              <div className="center-text">
                <strong>Move your cursor</strong>

                <span>
                  Open this page in another browser window to
                  test multiplayer sync.
                </span>
              </div>
            </div>

            {visibleCursors.map((cursor) => (
              <div
                key={cursor.userId}
                className="remote-cursor"
                style={{
                  left: `${cursor.x}%`,
                  top: `${cursor.y}%`,
                }}
              >
                <MousePointer2
                  size={20}
                  strokeWidth={2.5}
                  fill={cursor.color}
                  color={cursor.color}
                />

                <div
                  className="cursor-label"
                  style={{
                    backgroundColor: cursor.color,
                  }}
                >
                  {cursor.name}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">
              <Activity size={18} />
            </div>

            <div>
              <span>Connection</span>
              <strong>{connectionLabel}</strong>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">
              <Users size={18} />
            </div>

            <div>
              <span>Active users</span>
              <strong>{users.length}</strong>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">
              <RefreshCw size={18} />
            </div>

            <div>
              <span>Latency</span>

              <strong>
                {latency !== null
                  ? `${latency} ms`
                  : "—"}
              </strong>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">
              <Radio size={18} />
            </div>

            <div>
              <span>Messages / sec</span>
              <strong>{messagesPerSecond}</strong>
            </div>
          </div>
        </section>

        <section className="session-stat">
          <div>
            <span>Your session ID</span>

            <code>
              {userId || "Connecting..."}
            </code>
          </div>

          <div className="color-info">
            <span
              className="color-dot"
              style={{
                backgroundColor: userColor,
              }}
            />

            <span>Your cursor color</span>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;