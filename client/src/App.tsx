import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";

import {
  Activity,
  Circle,
  Clock3,
  Copy,
  MousePointer2,
  Radio,
  RotateCcw,
  Users,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";

import "./App.css";

type User = {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
};

type Cursor = {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
};

type SharedObject = {
  x: number;
  y: number;
};

type ServerMessage = {
  type?: string;
  id?: string;
  name?: string;
  color?: string;
  x?: number;
  y?: number;
  timestamp?: number;
  users?: User[];
  state?: {
    object?: SharedObject;
  };
  updatedBy?: {
    id?: string;
    name?: string;
  };
};

const WS_URL = "ws://localhost:8080";

const COLORS = [
  "#ff4d8d",
  "#7c5cff",
  "#00c2ff",
  "#00d68f",
  "#ff9f43",
  "#ff5c5c",
];

function createUserId(): string {
  const existing = sessionStorage.getItem(
    "flamsync-user-id"
  );

  if (existing) {
    return existing;
  }

  const id = crypto.randomUUID();

  sessionStorage.setItem(
    "flamsync-user-id",
    id
  );

  return id;
}

function createUserColor(): string {
  const existing = sessionStorage.getItem(
    "flamsync-user-color"
  );

  if (existing) {
    return existing;
  }

  const color =
    COLORS[
      Math.floor(Math.random() * COLORS.length)
    ];

  sessionStorage.setItem(
    "flamsync-user-color",
    color
  );

  return color;
}

function createUserName(id: string): string {
  return `User ${id.slice(0, 5)}`;
}

function App() {
  const userIdRef = useRef(createUserId());
  const userColorRef = useRef(createUserColor());

  const userName = createUserName(
    userIdRef.current
  );

  const [connection, setConnection] =
    useState<
      "connecting" | "connected" | "disconnected"
    >("connecting");

  const [users, setUsers] = useState<User[]>([]);

  const [remoteCursors, setRemoteCursors] =
    useState<Record<string, Cursor>>({});

  const [latency, setLatency] = useState<
    number | null
  >(null);

  const [messagesPerSecond, setMessagesPerSecond] =
    useState(0);

  const [sharedObject, setSharedObject] =
    useState<SharedObject>({
      x: 50,
      y: 50,
    });

  const [lastUpdatedBy, setLastUpdatedBy] =
    useState("");

  const socketRef = useRef<WebSocket | null>(
    null
  );

  const reconnectTimerRef = useRef<number | null>(
    null
  );

  const reconnectAttemptRef = useRef(0);

  const pingIntervalRef = useRef<number | null>(
    null
  );

  const statsIntervalRef = useRef<number | null>(
    null
  );

  const messageCountRef = useRef(0);

  const draggingObjectRef = useRef(false);

  const lastStateSentRef = useRef(0);

  const sendMessage = useCallback(
    (message: object) => {
      const socket = socketRef.current;

      if (
        socket &&
        socket.readyState === WebSocket.OPEN
      ) {
        socket.send(JSON.stringify(message));
      }
    },
    []
  );

  useEffect(() => {
    let disposed = false;

    const connect = () => {
      if (disposed) {
        return;
      }

      const existingSocket =
        socketRef.current;

      if (
        existingSocket &&
        (existingSocket.readyState ===
          WebSocket.OPEN ||
          existingSocket.readyState ===
            WebSocket.CONNECTING)
      ) {
        return;
      }

      setConnection("connecting");

      const socket = new WebSocket(WS_URL);

      socketRef.current = socket;

      socket.onopen = () => {
        if (disposed) {
          socket.close();
          return;
        }

        setConnection("connected");

        reconnectAttemptRef.current = 0;

        sendMessage({
          type: "join",
          id: userIdRef.current,
          name: userName,
          color: userColorRef.current,
        });

        if (pingIntervalRef.current !== null) {
          window.clearInterval(
            pingIntervalRef.current
          );
        }

        pingIntervalRef.current =
          window.setInterval(() => {
            sendMessage({
              type: "ping",
              timestamp: Date.now(),
            });
          }, 1000);
      };

      socket.onmessage = (event) => {
        messageCountRef.current += 1;

        try {
          const message =
            JSON.parse(
              event.data
            ) as ServerMessage;

          if (message.type === "welcome") {
            return;
          }

          if (message.type === "presence") {
            const nextUsers =
              message.users ?? [];

            setUsers(nextUsers);

            const activeIds = new Set(
              nextUsers.map(
                (user) => user.id
              )
            );

            setRemoteCursors(
              (previous) => {
                const next: Record<
                  string,
                  Cursor
                > = {};

                Object.entries(
                  previous
                ).forEach(
                  ([id, cursor]) => {
                    if (
                      activeIds.has(id)
                    ) {
                      next[id] = cursor;
                    }
                  }
                );

                return next;
              }
            );

            return;
          }

          if (
            message.type === "cursor"
          ) {
            if (
              !message.id ||
              message.id ===
                userIdRef.current
            ) {
              return;
            }

            if (
              typeof message.x !==
                "number" ||
              typeof message.y !==
                "number" ||
              !message.name ||
              !message.color
            ) {
              return;
            }

            setRemoteCursors(
              (previous) => ({
                ...previous,

                [message.id!]: {
                  id: message.id!,
                  name: message.name!,
                  color: message.color!,
                  x: message.x!,
                  y: message.y!,
                },
              })
            );

            return;
          }

          if (
            message.type === "state"
          ) {
            const object =
              message.state?.object;

            if (
              object &&
              typeof object.x ===
                "number" &&
              typeof object.y ===
                "number"
            ) {
              setSharedObject({
                x: object.x,
                y: object.y,
              });
            }

            if (
              message.updatedBy?.name
            ) {
              setLastUpdatedBy(
                message.updatedBy.name
              );
            }

            return;
          }

          if (
            message.type === "pong"
          ) {
            if (
              typeof message.timestamp ===
              "number"
            ) {
              setLatency(
                Math.max(
                  0,
                  Date.now() -
                    message.timestamp
                )
              );
            }

            return;
          }
        } catch {
          console.warn(
            "Received invalid server message."
          );
        }
      };

      socket.onclose = () => {
        if (disposed) {
          return;
        }

        setConnection("disconnected");

        if (
          pingIntervalRef.current !==
          null
        ) {
          window.clearInterval(
            pingIntervalRef.current
          );

          pingIntervalRef.current =
            null;
        }

        const attempt =
          reconnectAttemptRef.current;

        const delay = Math.min(
          1000 * 2 ** attempt,
          8000
        );

        reconnectAttemptRef.current =
          attempt + 1;

        if (
          reconnectTimerRef.current !==
          null
        ) {
          window.clearTimeout(
            reconnectTimerRef.current
          );
        }

        reconnectTimerRef.current =
          window.setTimeout(() => {
            reconnectTimerRef.current =
              null;

            connect();
          }, delay);
      };

      socket.onerror = () => {
        socket.close();
      };
    };

    connect();

    statsIntervalRef.current =
      window.setInterval(() => {
        setMessagesPerSecond(
          messageCountRef.current
        );

        messageCountRef.current = 0;
      }, 1000);

    return () => {
      disposed = true;

      if (
        reconnectTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          reconnectTimerRef.current
        );

        reconnectTimerRef.current =
          null;
      }

      if (
        pingIntervalRef.current !==
        null
      ) {
        window.clearInterval(
          pingIntervalRef.current
        );

        pingIntervalRef.current =
          null;
      }

      if (
        statsIntervalRef.current !==
        null
      ) {
        window.clearInterval(
          statsIntervalRef.current
        );

        statsIntervalRef.current =
          null;
      }

      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [sendMessage, userName]);

  const sendCursorPosition = (
    event: PointerEvent<HTMLDivElement>
  ) => {
    const workspace =
      event.currentTarget.getBoundingClientRect();

    if (
      workspace.width === 0 ||
      workspace.height === 0
    ) {
      return;
    }

    const x =
      ((event.clientX -
        workspace.left) /
        workspace.width) *
      100;

    const y =
      ((event.clientY -
        workspace.top) /
        workspace.height) *
      100;

    const safeX = Math.max(
      0,
      Math.min(100, x)
    );

    const safeY = Math.max(
      0,
      Math.min(100, y)
    );

    if (
      draggingObjectRef.current
    ) {
      const now =
        performance.now();

      setSharedObject({
        x: safeX,
        y: safeY,
      });

      if (
        now -
          lastStateSentRef.current >=
        33
      ) {
        sendMessage({
          type: "state:update",
          x: safeX,
          y: safeY,
        });

        lastStateSentRef.current =
          now;
      }

      return;
    }

    sendMessage({
      type: "cursor",
      x: safeX,
      y: safeY,
    });
  };

  const handleObjectPointerDown = (
    event: PointerEvent<HTMLDivElement>
  ) => {
    draggingObjectRef.current = true;

    event.currentTarget.setPointerCapture(
      event.pointerId
    );

    event.stopPropagation();
  };

  const handleObjectPointerUp = (
    event: PointerEvent<HTMLDivElement>
  ) => {
    draggingObjectRef.current = false;

    try {
      if (
        event.currentTarget.hasPointerCapture(
          event.pointerId
        )
      ) {
        event.currentTarget.releasePointerCapture(
          event.pointerId
        );
      }
    } catch {
      // Pointer capture may already be released.
    }

    event.stopPropagation();
  };

  const handleObjectPointerCancel = (
    event: PointerEvent<HTMLDivElement>
  ) => {
    draggingObjectRef.current = false;

    try {
      if (
        event.currentTarget.hasPointerCapture(
          event.pointerId
        )
      ) {
        event.currentTarget.releasePointerCapture(
          event.pointerId
        );
      }
    } catch {
      // Pointer capture may already be released.
    }

    event.stopPropagation();
  };

  const resetSharedObject = () => {
    const center = {
      x: 50,
      y: 50,
    };

    setSharedObject(center);

    sendMessage({
      type: "state:update",
      ...center,
    });
  };

  const copySessionId = async () => {
    try {
      await navigator.clipboard.writeText(
        "FLAM-DEMO"
      );
    } catch {
      console.warn(
        "Clipboard access unavailable."
      );
    }
  };

  const connectionLabel =
    connection === "connected"
      ? "Connected"
      : connection === "connecting"
        ? "Connecting"
        : "Reconnecting";

  const connectionIcon =
    connection === "connected" ? (
      <Wifi size={15} />
    ) : (
      <WifiOff size={15} />
    );

  const visibleCursors =
    Object.values(remoteCursors);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            F
          </div>

          <div>
            <div className="brand-name">
              FlamSync
            </div>

            <div className="brand-subtitle">
              Real-time state synchronization
            </div>
          </div>
        </div>

        <div className="topbar-right">
          <div className="session-chip">
            <span>SESSION</span>

            <strong>
              FLAM-DEMO
            </strong>

            <button
              className="icon-button"
              onClick={copySessionId}
              title="Copy session ID"
            >
              <Copy size={14} />
            </button>
          </div>

          <div
            className={`connection-pill ${connection}`}
          >
            {connectionIcon}

            <span>
              {connectionLabel}
            </span>
          </div>
        </div>
      </header>

      <main className="main-content">
        <section className="hero">
          <div>
            <div className="eyebrow">
              <span className="eyebrow-dot" />
              MULTIPLAYER WORKSPACE
            </div>

            <h1>
              Move together.
              <br />
              <span>
                In real time.
              </span>
            </h1>

            <p className="hero-description">
              A low-latency WebSocket
              workspace where cursor
              presence and shared
              application state stay
              synchronized across
              connected clients.
            </p>
          </div>

          <div className="hero-status">
            <div className="live-indicator">
              <span />
              LIVE SESSION
            </div>

            <div className="hero-stat">
              <Zap size={16} />

              <strong>
                {latency !== null
                  ? `${latency} ms`
                  : "—"}
              </strong>

              <span>
                latency
              </span>
            </div>
          </div>
        </section>

        <section className="workspace-card">
          <div className="workspace-toolbar">
            <div className="workspace-title">
              <div className="workspace-icon">
                <MousePointer2
                  size={17}
                />
              </div>

              <div>
                <strong>
                  Shared Workspace
                </strong>

                <span>
                  Move your pointer or
                  drag the shared object
                </span>
              </div>
            </div>

            <div className="toolbar-actions">
              <div className="sync-badge">
                <Radio size={14} />
                STATE SYNCED
              </div>

              <button
                className="reset-button"
                onClick={
                  resetSharedObject
                }
              >
                <RotateCcw
                  size={14}
                />
                Reset
              </button>
            </div>
          </div>

          <div
            className="workspace"
            onPointerMove={
              sendCursorPosition
            }
            onPointerUp={() => {
              draggingObjectRef.current =
                false;
            }}
          >
            <div className="grid-lines" />

            <div className="workspace-center">
              <div className="center-ring" />

              <span>
                REAL-TIME CANVAS
              </span>
            </div>

            <div
              className="shared-object"
              style={{
                left: `${sharedObject.x}%`,
                top: `${sharedObject.y}%`,
                borderColor:
                  userColorRef.current,
              }}
              onPointerDown={
                handleObjectPointerDown
              }
              onPointerUp={
                handleObjectPointerUp
              }
              onPointerCancel={
                handleObjectPointerCancel
              }
            >
              <div
                className="shared-object-dot"
                style={{
                  background:
                    userColorRef.current,
                }}
              />

              <div>
                <strong>
                  Shared State
                </strong>

                <span>
                  Drag me
                </span>
              </div>
            </div>

            {visibleCursors.map(
              (cursor) => (
                <div
                  key={cursor.id}
                  className="remote-cursor"
                  style={{
                    left: `${cursor.x}%`,
                    top: `${cursor.y}%`,
                    color: cursor.color,
                  }}
                >
                  <MousePointer2
                    size={20}
                    strokeWidth={2.5}
                    fill={cursor.color}
                  />

                  <div
                    className="cursor-label"
                    style={{
                      background:
                        cursor.color,
                    }}
                  >
                    {cursor.name}
                  </div>
                </div>
              )
            )}

            <div className="workspace-corner top-left">
              <Circle size={8} />
              LIVE
            </div>

            <div className="workspace-corner bottom-right">
              {lastUpdatedBy
                ? `Updated by ${lastUpdatedBy}`
                : "Shared state ready"}
            </div>
          </div>
        </section>

        <section className="dashboard-grid">
          <div className="panel presence-panel">
            <div className="panel-header">
              <div>
                <div className="panel-kicker">
                  <Users size={14} />
                  PRESENCE
                </div>

                <h2>
                  Active collaborators
                </h2>
              </div>

              <div className="user-count">
                {users.length}
              </div>
            </div>

            <div className="user-list">
              {users.map((user) => {
                const isCurrentUser =
                  user.id ===
                  userIdRef.current;

                return (
                  <div
                    className="user-row"
                    key={user.id}
                  >
                    <div
                      className="avatar"
                      style={{
                        background:
                          user.color,
                      }}
                    >
                      {user.name
                        .slice(0, 1)
                        .toUpperCase()}
                    </div>

                    <div className="user-info">
                      <strong>
                        {isCurrentUser
                          ? "You"
                          : user.name}
                      </strong>

                      <span>
                        {isCurrentUser
                          ? "This browser"
                          : "Connected"}
                      </span>
                    </div>

                    <div
                      className="online-dot"
                      title="Online"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="panel metrics-panel">
            <div className="panel-header">
              <div>
                <div className="panel-kicker">
                  <Activity size={14} />
                  TELEMETRY
                </div>

                <h2>
                  Connection health
                </h2>
              </div>
            </div>

            <div className="metrics-list">
              <div className="metric-row">
                <div className="metric-label">
                  <Wifi size={15} />
                  Connection
                </div>

                <strong>
                  {connectionLabel}
                </strong>
              </div>

              <div className="metric-row">
                <div className="metric-label">
                  <Users size={15} />
                  Active users
                </div>

                <strong>
                  {users.length}
                </strong>
              </div>

              <div className="metric-row">
                <div className="metric-label">
                  <Clock3 size={15} />
                  Round-trip latency
                </div>

                <strong>
                  {latency !== null
                    ? `${latency} ms`
                    : "—"}
                </strong>
              </div>

              <div className="metric-row">
                <div className="metric-label">
                  <Activity size={15} />
                  Messages / sec
                </div>

                <strong>
                  {messagesPerSecond}
                </strong>
              </div>
            </div>
          </div>

          <div className="panel identity-panel">
            <div className="panel-header">
              <div>
                <div className="panel-kicker">
                  <Circle size={14} />
                  YOUR CLIENT
                </div>

                <h2>
                  Session identity
                </h2>
              </div>
            </div>

            <div className="identity-content">
              <div className="identity-color">
                <span
                  style={{
                    background:
                      userColorRef.current,
                  }}
                />
              </div>

              <div>
                <strong>
                  {userName}
                </strong>

                <span>
                  Persistent for this
                  browser tab
                </span>
              </div>
            </div>

            <div className="identity-id">
              <span>
                CLIENT ID
              </span>

              <code>
                {userIdRef.current}
              </code>
            </div>
          </div>
        </section>

        <footer className="footer">
          <div>
            FlamSync · WebSocket
            multiplayer synchronization
            demo
          </div>

          <div className="footer-right">
            <span>
              <span className="footer-dot" />

              {connection ===
              "connected"
                ? "System operational"
                : "Connection recovering"}
            </span>
          </div>
        </footer>
      </main>
    </div>
  );
}

export default App;