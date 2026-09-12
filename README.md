\# Real-Time Multiplayer Cursor \& State Sync



A real-time multiplayer workspace built as an independent FE R\&D assignment.



The application demonstrates low-latency synchronization of user cursors, presence, and shared application state across multiple connected clients using WebSockets.



\## Live Demo



https://realtime-multiplayer-sync-client.onrender.com



\## GitHub



https://github.com/jaswanthraptati/realtime-multiplayer-sync



\## Features



\- Real-time multiplayer cursor synchronization

\- Live collaborator presence

\- Shared application state synchronization

\- Draggable shared object synchronized across clients

\- WebSocket-based bidirectional communication

\- Automatic reconnection with exponential backoff

\- Connection status monitoring

\- Round-trip latency measurement

\- Messages-per-second telemetry

\- Stable per-tab client identity

\- Input validation and coordinate clamping

\- Responsive interface

\- Production deployment on Render



\## Architecture



```text

&#x20;                   WebSocket

&#x20;       ┌─────────────────────────────────┐

&#x20;       │                                 │

&#x20;       ▼                                 ▼

┌───────────────┐                ┌───────────────┐

│   Browser A   │                │   Browser B   │

│ React + TS    │                │ React + TS    │

│               │                │               │

│ Cursor        │                │ Cursor        │

│ Shared State  │                │ Shared State  │

└───────┬───────┘                └───────┬───────┘

&#x20;       │                                │

&#x20;       └──────────────┬─────────────────┘

&#x20;                      │

&#x20;                      ▼

&#x20;             ┌─────────────────┐

&#x20;             │ Node.js WebSocket│

&#x20;             │      Server      │

&#x20;             │                  │

&#x20;             │ Presence         │

&#x20;             │ Cursor Broadcast │

&#x20;             │ Shared State     │

&#x20;             │ Ping/Pong        │

&#x20;             └─────────────────┘

