# Neon Sentry: How I Built a Futuristic Cyber-Security Command Center Using Agentic AI Development

**A full-stack engineering story about agent-less server monitoring, multi-tenant SaaS architecture, and what happens when you let multiple AI systems collaborate to build something real.**

---

## Introduction

There's a moment every developer knows well — that 2 AM feeling when you're SSH'd into three different servers simultaneously, copying metrics into a spreadsheet, wondering why infrastructure tooling in the year we live in still feels like it was designed in 2009. I had that moment one too many times. And instead of complaining about it, I built something.

This is the story of Neon Sentry: a high-performance, agent-less server monitoring and orchestration platform that combines live telemetry, Docker management, and a browser-based SSH terminal into a single futuristic dashboard. But more than just a product story, this is a case study in *how* I built it — using a multi-AI development workflow that I now consider one of the most powerful engineering approaches I've ever adopted.

By the time you finish reading this, you'll understand not just the architecture of a real-world SaaS monitoring platform, but also what it looks like to let Gemini, Claude, ChatGPT, and DeepSeek collaborate as a kind of distributed engineering team — each with different strengths, each serving a different layer of the development lifecycle.

Let's start from the beginning.

---

## The Idea Behind the Project

The idea came from frustration. Not with any single tool, but with the fragmented ecosystem of tools that system administrators are expected to juggle daily. You have one dashboard for CPU metrics, another for Docker container health, a separate terminal window for SSH access, and yet another tool for alerting. Each has its own authentication, its own learning curve, its own cost.

The industry calls this "tool fatigue," and it's real. The deeper problem isn't just convenience — it's security. Every agent you install on a target server is a new attack surface. Every third-party monitoring service you connect to is another place your infrastructure credentials might live. For teams operating in regulated environments, or for any organization that takes data sovereignty seriously, these aren't minor concerns.

I wanted to build what security engineers call a **Single Pane of Glass** — one unified interface where you can see everything that matters, control everything you need, and do it all without leaving a footprint on the servers you're monitoring. No agents. No bloat. Just a secure SSH tunnel and a clean, modern dashboard.

I called it **Neon Sentry**.

---

## Research & UI Inspiration

Before writing a single line of code, I spent time on Dribbble looking at how other people had imagined the future of infrastructure tooling. Most enterprise dashboards are built for function over form — they look like they haven't been redesigned since jQuery was cutting-edge. But the cyberpunk and cyber-security design community on Dribbble had a completely different aesthetic: dark backgrounds, neon accent colors, high-density data layouts, geometric grids. Futuristic but legible.

That visual direction felt right. A server monitoring platform should feel like a mission control room, not an Excel spreadsheet.

With a strong aesthetic direction in mind, I turned to **Stitch — Design with AI** to generate initial layout concepts and UI component ideas. Rather than building wireframes from scratch, I used Stitch to rapidly prototype how a high-density monitoring dashboard could be structured — how cards could be arranged, how terminal panels could coexist with metric graphs, how a sidebar navigation hierarchy might reflect the multi-tenant organizational structure I had in mind.

The visual result was something I described internally as "a NOC dashboard from a near-future thriller." Dark theme, electric cyan accents, monospace typography for metric values, and a layout dense enough to surface critical information at a glance without being overwhelming.

---

## Planning the System Architecture

Here is where the project shifted from idea to engineering. And here is where AI became not just a helper, but a genuine co-architect.

I took my rough ideas into **Google AI Studio with Gemini 1.5 Pro**. Not to generate code — that would come later — but to think. I described the platform I wanted to build in natural language: agent-less monitoring, SSH-based telemetry collection, Docker management, multi-tenant support, role-based access control, browser-based terminal access. I asked Gemini to help me think through the architecture, identify design challenges I hadn't considered, and refine my mental model into something technically coherent.

What came back wasn't just a plan — it was a structured engineering document. Gemini helped me think through the master-agent proxy model, the implications of tenant isolation at the database level, the WebSocket streaming architecture needed for real-time telemetry, and the security risks of storing SSH credentials in a multi-tenant system.

One of Gemini's most valuable contributions was asking me the right questions. When I described multi-tenant support, it asked: *How do you want to handle credential isolation? Will Super Admins have visibility across all organizations, or are they scoped?* That single question led to the four-tier role hierarchy that became the backbone of Neon Sentry's access model: **Super Admin → Admin → Employee → Intern**.

Google AI Studio also helped me refine the prompts I would later use when moving into implementation. It essentially acted as a technical editor, transforming my casual descriptions into precise, structured specifications that could be handed off to a code generation model.

---

## AI-Assisted Development Workflow

This is the part of the story I'm most excited to tell, because I think it represents something genuinely new in how software gets built.

Once I had a solid architectural plan, I moved into **Antigravity**, an agentic editor designed for multi-model AI development. Inside Antigravity, the workflow split into two tracks: **Gemini** handled planning, reasoning, and architectural decisions at the feature level. **Claude 3.5 Sonnet** handled implementation — writing the actual code.

This separation was intentional and powerful. Gemini is exceptional at high-level reasoning, at thinking through trade-offs, at asking "but what happens when this edge case occurs?" Claude 3.5 Sonnet, on the other hand, writes clean, idiomatic code with strong contextual consistency. It understands that when you're building a WebSocket-based telemetry system, the error handling patterns need to be consistent across every event emitter. It remembers architectural decisions made earlier in the session.

For debugging, UI adjustments, and optimization passes, I also pulled in **ChatGPT** and **DeepSeek**. ChatGPT was particularly useful for explaining obscure Node.js behavior and suggesting alternative approaches when I hit walls. DeepSeek excelled at low-level debugging — feeding it a stack trace and getting back a precise root cause analysis was remarkably reliable.

What I built was effectively an **agentic AI development team**: each model playing to its strengths, with me as the orchestrator directing the workflow, reviewing outputs, and making final architectural calls. This is what "Agentic AI Development" means in practice — not replacing the developer, but dramatically expanding what a single developer can build and at what speed.

---

## Tech Stack Breakdown

Every technology choice in Neon Sentry was deliberate. Let me walk through the reasoning.

**React.js with Vite and Tailwind CSS** formed the frontend foundation. Vite's development server and build performance are simply superior to Create React App for a project of this complexity, and Tailwind allowed rapid UI iteration without context-switching into a separate CSS file. For animation, **Framer Motion** provided the smooth transitions and entrance animations that give the dashboard its polished, futuristic feel — metric cards that slide in, terminal panels that expand with spring physics. **xterm.js** powered the browser-based SSH terminal, and **Recharts** handled the real-time telemetry graphs.

On the backend, **Node.js with Express** was the obvious choice — fast, event-driven, and excellent for WebSocket workloads. The **SSH2** and **Node-SSH** libraries handled the core tunneling logic. **Socket.io** managed real-time bidirectional communication between the backend and all connected dashboard clients. For authentication, **JWT** and **Bcrypt** were the standard choices for a reason: stateless, scalable, and battle-tested.

The database is **PostgreSQL**, running as a standalone Dockerized instance. The decision to move away from a managed service to a self-hosted PostgreSQL became one of the most consequential architectural choices of the entire project — more on that in the challenges section.

---

## Frontend Development

The frontend of Neon Sentry is designed around what I call "high-density information architecture." Every pixel is intentional. The main dashboard is a grid of monitoring cards, each representing a server node, surfacing CPU usage, RAM consumption, disk utilization, and network I/O at a glance. Color coding communicates health status instantly — green for nominal, amber for warning, red for critical — without requiring the user to read a number.

Building this with React required careful attention to performance. When you have twenty server nodes each emitting telemetry updates every few seconds, you're dealing with a high-frequency state update problem. Naive React patterns would cause catastrophic re-rendering. The solution was architectural: telemetry data streams were managed through a dedicated WebSocket context, with individual metric components subscribing only to their own node's data stream. This kept re-renders scoped and performant.

The **NOC Monitoring Mode** deserves special mention. This was a feature inspired by Network Operations Centers — large rooms where screens display rotating infrastructure views for teams doing continuous monitoring. In Neon Sentry, NOC Mode automatically cycles through server nodes in full-screen view on a configurable interval, making it suitable for mounting on a dedicated monitor in a server room or operations center.

The browser-based terminal, powered by **xterm.js**, presented interesting UX challenges. Getting terminal input focus management right — ensuring that keyboard shortcuts behave correctly, that paste operations work as expected, and that the terminal doesn't capture input when the user is interacting with other dashboard elements — required careful event handling. The terminal panel also needed to coexist visually with the monitoring dashboard, which meant designing a resizable split-panel layout that maintained clean proportions across different screen sizes.

---

## Backend Engineering

The backend is where the real engineering lives. Neon Sentry's core architecture is what I call a **master-agent hybrid proxy** — but it's important to clarify the "agent" terminology here, because it's different from the traditional monitoring agent model.

There are no agents installed on target servers. Instead, the Neon Sentry backend acts as an SSH orchestration layer. When a user adds a server node to their organization, they provide the SSH connection credentials — hostname, port, username, and either a password or private key. These credentials are stored **encrypted with AES-256** in the PostgreSQL database. When telemetry is requested, the backend opens an SSH connection to the target server, executes a series of shell commands (`top`, `df`, `free`, `ifconfig`/`ip`, `docker ps`), parses the output, and streams the results back to the frontend via WebSocket.

This architecture has a profound security advantage: the target server never needs to have any ports opened beyond SSH (port 22). There's no agent process, no inbound connection, no persistent listener. The monitoring platform is entirely pull-based from the SSH perspective.

Parsing Linux command output turned out to be one of the most underestimated engineering challenges of the project. The output of `df -h` or `free -m` varies subtly across different Linux distributions and kernel versions. A column that appears in a fixed position on Ubuntu 22.04 might shift on CentOS or Alpine Linux. Building reliable parsers required extensive regex work and a test suite built against real output samples from multiple distributions.

Here's a simplified example of the kind of parsing logic involved:

```javascript
function parseCpuUsage(topOutput) {
  const cpuLine = topOutput.split('\n').find(line => line.startsWith('%Cpu'));
  if (!cpuLine) return null;
  
  const idleMatch = cpuLine.match(/(\d+\.\d+)\s+id/);
  if (!idleMatch) return null;
  
  const idle = parseFloat(idleMatch[1]);
  return parseFloat((100 - idle).toFixed(1));
}
```

Simple in principle, but multiply this by every metric, across every Linux variant, with edge cases for containerized environments, and you begin to understand why robust parsing was a multi-week effort.

---

## Database Design & Multi-Tenant Security

The multi-tenant architecture is the backbone of Neon Sentry's SaaS model, and it was designed from first principles rather than bolted on afterward.

Every data entity in the system — users, server nodes, Docker configurations, SMTP settings — carries a `organization_id` foreign key. All queries, at every layer, filter by this key. This is the first line of tenant isolation. But the second line is more interesting: a `created_by` tenant-linking system that creates an ownership chain for every record, enabling the Super Admin to perform cross-tenant queries while maintaining the guarantee that regular users can never see data outside their organization.

The four-tier role system governs what each user level can do:

- **Super Admin** — Platform-level access. Can create and manage organizations, set user quotas, and view cross-tenant system health. This is the SaaS operator's interface.
- **Admin** — Organization-level access. Can add server nodes, manage team members, configure SMTP settings, and view all monitoring data within their organization.
- **Employee** — Operational access. Can view monitoring dashboards, access terminals, and manage Docker containers.
- **Intern** — Read-only access. Can view dashboards but cannot execute commands or access terminal functionality.

Enforcing this hierarchy at the database level — rather than just at the application layer — was critical for genuine security. Row-level security and carefully designed PostgreSQL functions ensure that even a compromised application layer cannot expose cross-tenant data.

---

## Real-Time Monitoring System

The real-time monitoring system is built on a **Socket.io** event architecture with server-side polling intervals managed by the Node.js backend. When a user opens a server node's detail view, the frontend emits a `subscribe` event with the node's identifier. The backend registers this subscription, initiates (or joins) a polling loop for that node, and begins streaming telemetry events back to the client.

The polling loop itself is managed as a per-node process: a setInterval that executes the SSH telemetry commands, parses the results, and emits them over the socket. When the last subscriber unsubscribes from a node, the polling loop is cleared. This prevents orphaned background processes from accumulating and consuming resources.

Handling disconnections gracefully was essential. Network drops, browser tab closes, and session timeouts all needed to trigger clean subscription teardown. Socket.io's built-in disconnect event handling, combined with a subscription registry in the backend, ensured that no polling loops outlived their subscribers.

The React infinite loop problem emerged here in an interesting way. Early versions of the telemetry subscription logic used `useEffect` hooks with dependency arrays that inadvertently included functions that were being recreated on every render. This caused a cascade: effect fires → socket subscription created → state updates → re-render → new function reference created → effect fires again. The fix required wrapping all socket event handlers in `useCallback` with carefully audited dependency arrays, and separating subscription management from rendering logic entirely.

---

## Docker Orchestration System

Docker management was a feature I knew users would love but underestimated how complex it would be to implement cleanly. The challenge is that Docker's command-line interface, while powerful, is not designed to be parsed programmatically. `docker ps --format json` helps, but container status, resource usage (`docker stats`), and log streaming each require different commands with different output formats and different latency profiles.

The Neon Sentry Docker orchestration layer executes Docker commands over the same SSH tunnel used for system telemetry, parsing the results into a normalized container object model. Users can view all running containers, see CPU and memory consumption per container, start/stop/restart containers, and stream container logs — all from the browser.

One architectural decision that paid off significantly: keeping Docker operations strictly asynchronous and user-initiated. Rather than streaming `docker stats` continuously for every container (which would be prohibitively expensive at scale), the dashboard polls container status on a configurable interval and only streams logs and stats for containers the user has explicitly opened. This keeps the SSH session overhead manageable even for hosts running dozens of containers.

---

## Browser-Based SSH Terminal

The browser-based terminal is the feature users react to most viscerally. Opening a full terminal session to a remote server from a browser tab — no SSH client installed, no VPN required — still feels like magic even to experienced engineers.

Under the hood, the architecture is elegant: **xterm.js** in the browser renders a terminal emulator, handling ANSI escape codes, cursor positioning, and color rendering. Keystrokes are captured and sent over a Socket.io connection to the Node.js backend, which forwards them to an SSH channel opened via the **SSH2** library. Output from the SSH channel flows back through Socket.io to xterm.js, which renders it in the terminal.

```javascript
// Backend: bridge between WebSocket and SSH channel
socket.on('terminal:input', ({ nodeId, data }) => {
  const session = activeSessions.get(nodeId);
  if (session && session.stream) {
    session.stream.write(data);
  }
});

sshStream.on('data', (data) => {
  socket.emit('terminal:output', { nodeId, data: data.toString() });
});
```

The subtle engineering work is in session lifecycle management: ensuring that terminal sessions are tied to authenticated user sessions, that they terminate cleanly when the browser tab closes, and that the SSH connection is properly closed and the socket room cleaned up when the user navigates away.

Terminal sessions are also role-gated. Intern accounts receive a dashboard-only view with no terminal access. Employee and above accounts can open terminal sessions, but terminal activity is scoped to their organization's registered nodes. No lateral movement between organizations is possible, even theoretically, because node lookup is always filtered by organization context.

---

## Authentication & Security

Security was never an afterthought in Neon Sentry — it was baked into every architectural decision from the start.

**JWT authentication** handles stateless session management. Access tokens are short-lived; refresh token logic handles session persistence without long-lived credentials sitting in local storage. Password storage uses **Bcrypt** with a cost factor calibrated for modern hardware — secure without introducing login latency.

The most sensitive data in the system is SSH credentials. Storing private keys and passwords in a database is inherently risky, but it's unavoidable for an automated monitoring platform. The mitigation is **AES-256 encryption** applied to all credential fields before they're written to the database. The encryption key lives in environment configuration, separate from the database. A database breach alone cannot expose plaintext SSH credentials.

Tenant isolation at the query level means that even if an application-layer bug allowed an unauthenticated query to reach the database, row-level filtering would ensure only records belonging to the authenticated user's organization could be returned. Defense in depth.

SMTP configuration — used for automated onboarding emails — is stored per-organization and encrypted at rest. Each organization can configure their own email sending infrastructure, which means Super Admins never need access to individual organizations' email credentials.

---

## Deployment Architecture

Neon Sentry runs on a **self-hosted Ubuntu 22.04 VPS**. The deployment stack is fully containerized with **Docker Compose**, which orchestrates the Node.js backend and the PostgreSQL database as linked services.

```yaml
services:
  backend:
    build: .
    ports:
      - "5000:5000"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - JWT_SECRET=${JWT_SECRET}
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
    depends_on:
      - postgres

  postgres:
    image: postgres:15-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=neonsentry
      - POSTGRES_USER=${DB_USER}
      - POSTGRES_PASSWORD=${DB_PASSWORD}

volumes:
  pgdata:
```

The frontend is a static build served directly by the Express backend — no separate web server process required. The Express server serves the React build from a `/public` directory for all non-API routes, and handles API requests at `/api/*`. This single-process architecture simplifies deployment and keeps operational overhead low.

A reverse proxy (Nginx) sits in front of the Express server, handling TLS termination via Let's Encrypt certificates. All traffic is HTTPS. WebSocket connections upgrade correctly through the Nginx proxy with appropriate `Upgrade` and `Connection` header configuration.

---

## Challenges Faced

No engineering story worth reading is without its war stories. Here are the challenges that genuinely tested me.

**The Supabase Migration Crisis.** The original version of Neon Sentry used Supabase as the managed PostgreSQL backend. Supabase's Row Level Security (RLS) is powerful, but implementing the Super Admin cross-tenant query logic required recursive RLS policy checks that triggered deadlocks under certain query patterns. The policies were checking organization membership, which required querying a table that was itself protected by an RLS policy — a circular dependency that Supabase's automatic policy enforcement couldn't resolve cleanly. After several days attempting increasingly complex workarounds, the decision was made: migrate to standalone PostgreSQL.

**React Infinite Loops.** The telemetry polling architecture created subtle React infinite loop scenarios that were difficult to debug because they didn't always manifest immediately. An effect hook subscribing to a socket event, with a dependency on a callback function, with that callback defined inline in the component — a classic setup for an infinite re-render cycle. The fix required not just adding `useCallback`, but a systematic audit of every component in the monitoring system to ensure effect dependencies were correctly specified.

**Linux Command Output Parsing.** This one was humbling. I assumed that Linux command output was standardized. It is not. `df -h` on a Raspberry Pi with a custom kernel produces subtly different column alignment than on a standard Ubuntu server. `free -m` output changed between kernel versions. Building parsers that worked reliably required collecting real-world output samples from a dozen different Linux configurations and iterating the regex patterns against them.

**Multi-Tenant Isolation at Scale.** Enforcing strict tenant isolation while supporting a Super Admin who needs cross-tenant visibility is a genuinely hard architectural problem. The naive solution — just filter by `organization_id` everywhere — breaks down for Super Admin queries. The sophisticated solution requires a query architecture that is tenant-context-aware at the function level, with Security Definer functions in PostgreSQL handling the elevated-privilege operations that Super Admin workflows require.

---

## How I Solved Them

The Supabase migration, counterintuitively, turned out to be one of the best things that happened to the project. Moving to standalone PostgreSQL gave complete control over the database schema, the RLS policies, and the Security Definer function implementations. Instead of working within Supabase's abstractions, I could write precise PostgreSQL functions that executed with appropriate privilege levels for Super Admin operations, bypassing RLS where needed while maintaining strict isolation for all other users.

```sql
-- Security Definer function for Super Admin cross-tenant node listing
CREATE OR REPLACE FUNCTION get_all_nodes_admin()
RETURNS SETOF nodes
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM nodes ORDER BY created_at DESC;
$$;
```

The `SECURITY DEFINER` attribute causes the function to execute with the privileges of the function owner, not the calling user — effectively a controlled privilege escalation that only occurs through a defined, auditable code path.

The React infinite loop fixes required developing a mental model I now apply to every WebSocket-integrated React component: **subscription effects must be isolated from data-processing effects**, and every function referenced in an effect's dependency array must be wrapped in `useCallback` with its own correctly specified dependencies. Once this pattern was established and applied consistently, the loop problems disappeared.

For the Linux output parsing, the solution was building a small internal library of parser functions with multiple parsing strategies per metric: a primary strategy for the most common output format, and fallback strategies for known variants. Each parser also included a validation step that sanity-checked the parsed values — a CPU usage value above 100% or a negative memory figure indicates a parsing failure, not a real metric value.

---

## Performance Optimizations

Performance at scale in a real-time monitoring platform means different things than performance in a typical web application. The bottleneck isn't database query time or static asset loading — it's the overhead of maintaining N simultaneous SSH sessions, each polling M metrics at K-second intervals.

Several optimizations proved critical. **SSH connection pooling** reuses established SSH connections rather than opening a new connection for each telemetry poll. Establishing an SSH connection involves a cryptographic handshake that takes measurable time — pooling eliminates this overhead for steady-state operation. **Metric batching** combines multiple SSH commands into a single session execution rather than opening the channel once per command, reducing round-trip overhead dramatically.

On the frontend, **virtualized list rendering** for organization node lists means the dashboard renders smoothly even when managing hundreds of server nodes. Only the nodes currently visible in the viewport are mounted as React components; off-screen nodes are represented as empty DOM placeholders. This was implemented using a standard virtualization approach and cut initial render time for large organizations from several seconds to near-instant.

WebSocket message batching prevents socket event flooding. Rather than emitting a telemetry event for each individual metric as it's collected, the backend batches all metrics for a given node into a single socket emission. This reduces the number of React state updates triggered per poll cycle from N (one per metric) to 1 (one per node), which is a significant reduction in render pressure.

---

## Lessons Learned

Building Neon Sentry taught me things that no tutorial could.

**Agentic AI development is real, and it works.** The combination of Gemini for architecture planning, Claude for implementation, and ChatGPT/DeepSeek for debugging and refinement is genuinely powerful. The key insight is that different models have different strengths, and a workflow that uses each model where it excels is more productive than trying to do everything with one tool. I now think of AI models the way I think of specialized engineering roles — you wouldn't ask your frontend designer to write your database migrations.

**Agent-less architecture is harder than it looks, but worth it.** The SSH-based telemetry approach is significantly more complex to implement than installing an agent on target servers. But the security and operational benefits are substantial. No firewall rule changes, no agent update management, no attack surface expansion on monitored servers. For security-conscious environments, this is not a nice-to-have — it's a requirement.

**Multi-tenant SaaS is not a feature you add later.** The organizational hierarchy, role system, and tenant isolation in Neon Sentry were designed from day one. Retrofitting multi-tenancy into a single-tenant application is extraordinarily difficult. If you're building something that will ever support multiple customers or organizations, model that from the first schema migration.

**Real-time is a system-level problem, not a library problem.** Adding Socket.io to a project doesn't make it real-time. Real-time requires thinking about state management, re-render optimization, connection lifecycle, backpressure handling, and session cleanup at every layer of the stack simultaneously. The debugging skills required for real-time systems are fundamentally different from those for request-response systems.

---

## Future Improvements

Neon Sentry as it stands today is a complete, production-ready platform. But the roadmap is long and genuinely exciting.

A **React Native mobile application** is the first priority — infrastructure monitoring doesn't stop when you step away from your desk, and the NOC monitoring mode translates naturally to a tablet interface. Push notifications for critical threshold breaches would make the mobile version genuinely operational rather than just informational.

**AI-powered diagnostics using Gemini** is the feature I'm most excited to build. The vision is a conversational diagnostics interface: you describe a symptom — "response times on node-3 have been spiking for the last hour" — and the system correlates that with the actual telemetry data and surfaces probable causes. Gemini's reasoning capabilities applied to real infrastructure telemetry is a genuinely novel capability that existing monitoring tools don't offer.

A **push and SMS alert engine** would make Neon Sentry viable for on-call workflows. Currently, monitoring is passive — the dashboard shows you what's happening when you look at it. Active alerting would push critical threshold violations to on-call engineers via Slack, SMS, or PagerDuty-compatible webhooks.

**Predictive infrastructure analytics** is the longer-term vision: using historical telemetry data to forecast resource exhaustion, identify anomalous patterns before they become outages, and recommend proactive scaling actions. This is the difference between reactive monitoring and proactive infrastructure intelligence.

---

## Final Thoughts

Neon Sentry started as a personal frustration with fragmented infrastructure tooling. It became something larger: a case study in what a single developer can build when armed with a clear architectural vision, modern full-stack tooling, and a thoughtful multi-AI development workflow.

The technical decisions — agent-less SSH architecture, standalone PostgreSQL, multi-tenant role hierarchy, real-time WebSocket streaming — were not arbitrary. Each one was the result of genuine engineering reasoning, informed by planning sessions with Gemini, implemented with the assistance of Claude, and refined through debugging cycles with ChatGPT and DeepSeek. The AI tools didn't replace engineering judgment. They amplified it.

What I hope readers take from this story isn't a specific technology recommendation. The stack will evolve. What won't change is the underlying principle: **good software starts with deep problem understanding, patient architecture planning, and the humility to recognize that the first solution is rarely the best one.** The Supabase migration was painful. The infinite loop debugging sessions were exhausting. But every challenge taught something that made the system better.

If you're a system administrator drowning in dashboard tabs, or a developer building the next generation of infrastructure tooling, I hope Neon Sentry is an interesting example of what's possible. The future of DevOps tooling is unified, secure, agent-less, and AI-augmented.

And it can run on a single VPS.

---

*If you're interested in the project or want to discuss the architecture in more detail, I'd love to connect. The engineering decisions behind Neon Sentry are the kind that only get better with rigorous critique.*