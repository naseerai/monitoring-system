# Neon Sentry: Agentless Infrastructure Monitoring for Modern DevOps Teams

**Category:** Engineering · Platform Overview  
**Read time:** ~15 min

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Platform Overview](#2-platform-overview)
3. [Core Features](#3-core-features)
4. [System Architecture](#4-system-architecture)
5. [Technology Stack](#5-technology-stack)
6. [Engineering Challenges Solved](#6-engineering-challenges-solved)
7. [Deployment Architecture](#7-deployment-architecture)
8. [Performance Optimizations](#8-performance-optimizations)
9. [Future Roadmap](#9-future-roadmap)
10. [Conclusion](#10-conclusion)

---

## 1. Introduction

Infrastructure monitoring has long been fragmented. Teams cobble together multiple tools — one for metrics, another for container management, a separate terminal client for SSH access — each with its own authentication model, deployment overhead, and operational surface area. The result is tooling sprawl that slows incident response and increases cognitive load across engineering teams.

Neon Sentry is built to consolidate this stack. It is an agentless, multi-tenant SaaS platform that provides real-time server monitoring, Docker container orchestration, and browser-based SSH terminal access — all within a single, unified interface.

## Live Platform

🌐 Website: https://servers.myaccess.cloud  
🔐 Secure Browser SSH Access · Real-Time Monitoring · Docker Management

### The Problem with Traditional Monitoring

Conventional monitoring systems require deploying and maintaining agents on every monitored host. This introduces deployment complexity, version drift, security exposure on the host OS, and ongoing maintenance overhead. When server counts scale, agent-based systems become operationally expensive to manage. Team-level access control is often bolted on as an afterthought rather than built into the platform architecture.

> **Neon Sentry eliminates the agent entirely.** Telemetry collection, SSH access, and container management are all brokered through the platform's backend using standard SSH connections — requiring only network access and valid credentials, not software installed on the target host.

### Agentless by Design

The agentless model means monitored servers remain unmodified. Neon Sentry's backend establishes SSH sessions, executes system commands, parses Linux telemetry output, and streams results to connected clients in real time. There is no persistent process running on monitored infrastructure, and no additional attack surface introduced on the host.

---

## 2. Platform Overview

Neon Sentry is a purpose-built platform combining five capabilities that infrastructure teams commonly manage through separate tooling:

| Capability | Description |
|---|---|
| **Real-Time Monitoring** | Live CPU, memory, disk, and network telemetry streamed via WebSocket to connected dashboards |
| **Docker Orchestration** | View, start, stop, restart containers and inspect logs and resource usage |
| **Browser SSH Terminal** | Full interactive terminal access to any registered server, streamed securely through the browser |
| **Multi-Tenant SaaS** | Organisation-scoped data isolation with team management and role-based access controls built in |
| **Security by Default** | AES-256 encrypted credential storage, JWT-authenticated APIs, and encrypted SSH tunneling throughout |
| **WebSocket Infrastructure** | Socket.io-powered real-time communication layer for efficient, low-latency metric delivery |

The platform is deployed as a Dockerized stack on a VPS, with Nginx handling reverse proxying and TLS termination. PostgreSQL serves as the primary data store for all organisational, user, server, and credential data.

---

## 3. Core Features

### Real-Time Monitoring

Neon Sentry continuously polls registered servers via SSH and delivers live telemetry to the dashboard. Metrics are collected, parsed, and streamed with minimal latency, giving teams an accurate and current view of infrastructure health.

- **CPU Monitoring** — Per-core and aggregate CPU utilisation, idle percentage, and usage trends via `/proc/stat` parsing
- **RAM Monitoring** — Total, used, free, and cached memory from `/proc/meminfo`, with live percentage tracking
- **Disk Usage** — Filesystem capacity and utilisation per mount point using `df` output parsing
- **Network Statistics** — Inbound and outbound byte rates per interface, derived from `/proc/net/dev`
- **Live Telemetry** — All metrics are pushed via Socket.io to subscribed clients as they are collected, with no polling required from the frontend

### Docker Management

Container visibility and control are first-class features. Neon Sentry uses the Docker socket on remote servers (accessed over SSH) to enumerate containers and expose management controls through the UI.

- List all containers with status, image, uptime, and port mappings
- Start, stop, and restart containers with immediate UI feedback
- Stream and view container logs in real time
- Monitor per-container CPU and memory resource consumption

### Browser-Based SSH Terminal

Neon Sentry embeds a fully functional terminal directly in the browser using `xterm.js`. Each terminal session is backed by a live SSH connection brokered by the backend, with the terminal stream transported over WebSocket.

- Full interactive shell access from the browser — no local SSH client required
- Sessions are authenticated through the platform's credential store; credentials are never exposed to the frontend
- Terminal resize events are propagated to the remote PTY in real time
- Multiple concurrent sessions are supported per user and per server

### Multi-Tenant Architecture

The platform is built for SaaS-grade multi-tenancy from the ground up. All data — servers, users, credentials, telemetry — is scoped to an organisation. Cross-organisation data access is prevented at the query level, not just the UI layer.

- Organisation-based data isolation enforced at the database query layer
- Team members are associated with a single organisation and inherit access accordingly
- Organisation administrators can onboard team members and assign roles without platform intervention

### Role-Based Access Control

Neon Sentry implements a four-tier RBAC model that maps to common organisational structures:

#### Super Admin
- Full platform access
- Manage all organisations
- Platform-level configuration
- User provisioning across tenants

#### Admin
- Manage servers and credentials
- Add/remove team members
- Assign roles within the organisation
- Full monitoring access

#### Employee
- View monitoring dashboards
- Access SSH terminal
- Docker management access
- Read-only credential view

#### Intern
- Dashboard view access only
- No SSH terminal access
- No Docker control actions
- No credential visibility

### Security Features

Security is a foundational constraint, not a feature layer. Neon Sentry protects sensitive credentials and communications at every boundary.

- **AES-256 Credential Encryption** — SSH credentials are encrypted before database storage; decryption occurs in-memory only at connection time
- **JWT Authentication** — All API endpoints are gated by JWT middleware with role validation on sensitive operations
- **Encrypted SSH Storage** — Private keys and passwords are never stored or transmitted in plaintext
- **TLS Termination** — Nginx terminates HTTPS at the edge; all backend communication remains on the internal Docker network
- **Org-Level Data Isolation** — Every database query includes an explicit `organisation_id` filter
- **Role-Gated API Endpoints** — Sensitive operations enforce role checks server-side, independent of UI state

### Real-Time WebSocket Infrastructure

All live data in Neon Sentry flows through a Socket.io layer built on top of the Node.js backend. Clients subscribe to server-specific rooms and receive metric updates as they arrive from the SSH polling loop. Terminal I/O is routed through the same transport, ensuring consistent behaviour across both monitoring and interactive features.

---

## 4. System Architecture

Neon Sentry's architecture is composed of four primary layers: the frontend client, the Node.js backend, the SSH orchestration layer, and the PostgreSQL database. These layers communicate over well-defined interfaces, with the WebSocket layer threading real-time data from backend to client.

```
[ Browser Client ]     React + Vite + xterm.js + Recharts
        ↕  WebSocket (Socket.io)  ↕  REST API (JWT)
[ Backend Layer ]      Node.js + Express.js + Socket.io
        ↕  SSH Sessions (SSH2 / Node-SSH)
[ SSH Orch. Layer ]    Connection Pool · Command Exec · Stream Parser
        ↕  Direct SSH over TCP
[ Monitored Hosts ]    Linux VPS / Ubuntu Servers (no agents installed)

[ Database ]           PostgreSQL — all persistent state
[ Reverse Proxy ]      Nginx — TLS termination, routing to backend
```

### Frontend Architecture

The frontend is a React single-page application built with Vite. Recharts handles metric visualisations, `xterm.js` renders the terminal, and Framer Motion drives UI transitions. The frontend communicates with the backend exclusively through the REST API (for CRUD operations) and Socket.io (for real-time telemetry and terminal streams).

### Backend Architecture

The backend is a Node.js application running Express.js. It exposes REST endpoints for authentication, server management, and user administration. Socket.io runs on the same Node.js process, managing namespaced rooms per server. The backend maintains a connection pool of SSH sessions to avoid repeated handshake overhead per metric collection cycle.

### SSH Orchestration Layer

At the core of the agentless model is the SSH orchestration layer. For each registered server, the backend schedules periodic SSH command executions — reading from `/proc` and `/sys` filesystems and calling Docker CLI commands. Results are parsed into structured objects and emitted over Socket.io. For terminal sessions, a persistent PTY is allocated over SSH and its I/O is piped directly to the WebSocket stream.

### Database Architecture

PostgreSQL is the sole data store. Tables are organised around core domain entities: `organisations`, `users`, `servers`, `credentials`, and `roles`. Foreign key constraints enforce organisation-level scoping. Credential data is stored encrypted; no plaintext sensitive values are written to the database.

---

## 5. Technology Stack

### Frontend

| Package | Purpose |
|---|---|
| React.js | UI component model and rendering |
| Vite | Build tooling and development server |
| Tailwind CSS | Utility-first styling |
| Framer Motion | Animations and UI transitions |
| xterm.js | In-browser terminal emulation |
| Recharts | Metric charting and visualisation |

### Backend

| Package | Purpose |
|---|---|
| Node.js | Runtime — event-driven I/O model |
| Express.js | HTTP API framework |
| Socket.io | WebSocket-based real-time transport |
| SSH2 | Low-level SSH protocol implementation |
| Node-SSH | Higher-level SSH session management |

### Database

| Package | Purpose |
|---|---|
| PostgreSQL | Relational data store for all platform state |

### Infrastructure

| Component | Purpose |
|---|---|
| Docker | Application containerisation |
| Docker Compose | Multi-service orchestration |
| Nginx | Reverse proxy and TLS termination |
| Ubuntu VPS | Hosting environment |

The stack is deliberately lean. Node.js provides the right primitive model for I/O-heavy, event-driven workloads like SSH streaming and WebSocket management. React with Vite gives fast development iteration and strong ecosystem support for the visualisation libraries the platform requires. PostgreSQL provides the relational integrity and query expressiveness needed for multi-tenant data scoping.

---

## 6. Engineering Challenges Solved

### Multi-Tenant Isolation

Ensuring complete data isolation between organisations required systematic enforcement at the database query layer. Every query that returns user, server, or credential data includes an explicit `organisation_id` filter. API middleware validates that the requesting user belongs to the organisation referenced in the route, preventing horizontal privilege escalation even if a valid JWT is misused.

### Linux Telemetry Parsing

Reading metrics from `/proc` and `/sys` filesystems over SSH requires careful parsing of raw Linux virtual file output. CPU utilisation, for example, requires two successive reads of `/proc/stat` with a defined interval to compute delta values. The backend handles this stateful sampling correctly for each server independently, without conflating metric windows across different hosts.

### WebSocket Optimization

Naive real-time metric delivery results in an unbounded message rate as server count grows. Neon Sentry implements per-server metric batching and rate limiting on the Socket.io emission layer. Clients receive batched updates on a defined interval rather than an event per system call, dramatically reducing message volume under load without meaningfully degrading perceived data freshness.

### React Re-Render Optimization

Continuously arriving metric data will cause performance degradation in React applications if component update boundaries are not managed carefully. Neon Sentry uses memoisation (`React.memo`, `useMemo`, `useCallback`) and separates telemetry-driven state from structural UI state to ensure only chart and metric components re-render on each update cycle, leaving the rest of the dashboard tree untouched.

### Secure SSH Credential Handling

SSH credentials — including private keys — must be stored persistently to support automatic metric collection without repeated manual input. All credentials are encrypted with AES-256 before database insertion and decrypted in memory only at the moment an SSH connection is established. Decrypted credential material is never logged, cached in plaintext, or transmitted beyond the backend process boundary.

### Real-Time Monitoring Scalability

As the number of registered servers in an organisation grows, the polling loop must scale without bottlenecking on a shared thread. The Node.js event loop handles SSH I/O asynchronously, and each server's polling cycle operates independently. Connection pooling ensures that established SSH sessions are reused across polling intervals, avoiding the latency and overhead of repeated connection establishment.

---

## 7. Deployment Architecture

The entire platform stack is defined as a Docker Compose application, enabling reproducible, environment-consistent deployments. The composition includes three core services:

```yaml
# Service topology
postgres   — PostgreSQL 15 · persistent volume · internal network only
backend    — Node.js app · port 4000 internal · depends_on: postgres
nginx      — Reverse proxy · binds :80 and :443 · proxies to backend
```

- **PostgreSQL Container** — Runs on an isolated internal Docker network. The data directory is persisted to a named volume, surviving container restarts and redeployments.
- **Backend Container** — Built from the application source. Environment variables supply database credentials, JWT secrets, and the AES encryption key. The container is not exposed directly to the host network.
- **Nginx Reverse Proxy** — The only publicly exposed service. Handles TLS termination using Let's Encrypt or custom CA certificates, and forwards requests to the backend container over the internal network. WebSocket upgrade headers are explicitly proxied to support Socket.io connections.

The entire stack deploys with a single `docker compose up -d` command. Updates are performed by rebuilding the backend image and restarting the service without downtime to the database or proxy layers.

---

## 8. Performance Optimizations

Real-time monitoring platforms face specific performance constraints: high message rates, persistent connections, and CPU-intensive parsing cycles. Neon Sentry addresses these at each layer of the stack.

| Optimization | Layer | Description |
|---|---|---|
| **SSH Connection Pooling** | Backend | Established SSH sessions are held open and reused across polling intervals, eliminating per-cycle TCP and cryptographic handshake cost |
| **Metric Batching** | Backend | Telemetry updates are batched before Socket.io emission, reducing client message processing overhead |
| **React Memoisation** | Frontend | `React.memo`, `useMemo`, and `useCallback` prevent full-tree re-renders on each metric update |
| **WebSocket Message Batching** | Transport | Socket.io emissions are rate-limited per server room, preventing message flood conditions |
| **Polling Interval Tuning** | Backend | Per-server polling intervals are configurable, allowing teams to trade metric resolution against SSH load on target hosts |
| **Efficient Telemetry Parsing** | Backend | Raw `/proc` output is parsed in-process with minimal allocations, avoiding intermediate serialisation overhead |

---

## 9. Future Roadmap

The platform's current capability set covers the core monitoring, access, and orchestration use cases. The following capabilities are on the engineering roadmap for upcoming releases:

### R-01 — AI-Powered Diagnostics
Integrate an AI inference layer that analyses metric streams to surface anomalies, identify likely root causes, and suggest remediation steps — directly within the monitoring dashboard.

### R-02 — Alerting System
Threshold-based and anomaly-driven alerts with configurable notification channels including email, webhook, Slack, and PagerDuty integrations.

### R-03 — Mobile Application
Native iOS and Android applications providing dashboard access and push notification delivery for critical infrastructure alerts.

### R-04 — Predictive Analytics
Time-series forecasting on CPU, memory, and disk trends to surface capacity exhaustion warnings before thresholds are breached.

### R-05 — Push Notifications
Real-time push delivery of alert and status events to mobile and desktop clients, ensuring on-call engineers are notified without polling the dashboard.

---

## 10. Conclusion

Neon Sentry addresses a real operational problem: infrastructure monitoring and access management tooling is unnecessarily fragmented, and most agent-based solutions introduce more operational complexity than they remove. By building on SSH as the universal primitive for both telemetry collection and interactive access, Neon Sentry delivers a unified platform without requiring any changes to monitored hosts.

The agentless model provides meaningful advantages: no agent lifecycle management, no version drift across a fleet, and no additional host-level attack surface. Combined with AES-256 credential encryption, JWT authentication, and organisation-scoped data isolation, the platform is designed to meet the security requirements of teams managing production infrastructure.

> For DevOps and infrastructure teams, Neon Sentry consolidates server monitoring, Docker management, and SSH access into a single authenticated interface — accessible from any browser, without client software installation or agent deployment on any monitored host.

The Dockerized deployment model ensures the platform itself is low-maintenance and reproducible. The multi-tenant architecture makes it suitable for managed service providers, internal platform teams, and SaaS operators who need to extend infrastructure visibility to multiple teams without compromising isolation between them.

As the roadmap progresses toward AI-assisted diagnostics and predictive analytics, the platform's telemetry foundation — consistent, structured, real-time metric streams from every registered host — positions it well to support increasingly intelligent observability features without requiring architectural changes to the data collection layer.

---

*Neon Sentry Engineering · Infrastructure & Platform*