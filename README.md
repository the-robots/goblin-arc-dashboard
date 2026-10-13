# 🧌 Goblin GitHub ARC Dashboard

A lightweight, real-time health dashboard for GitHub Actions Runner Controller (ARC) without the overhead of large monitoring tools.

---

## 🧠 What This Is

Goblin GitHub ARC Dashboard is a simple full-stack app that:

* Connects to the Kubernetes cluster hosting ARC
* Checks ARC controller and runner health
* Tracks pods across namespaces
* Streams updates in real time
* Displays everything in a clean UI

It's built for quick visibility and fast feedback — not enterprise bloat.

The dashboard uses the standard Kubernetes API, so ARC can run on any
conformant Kubernetes distribution (not only K3s).
It monitors one cluster/context per backend instance; simultaneous multi-cluster
monitoring is not currently supported. The Hyper-V K3s setup below is a local
installation example, not a requirement.

### ARC health

The ARC panel checks controller deployment availability and observed rollout,
legacy runner readiness and desired/available capacity, ARC pod readiness,
autoscaler bounds, and matching warning events from the last hour. It refreshes
every 30 seconds; the backend shares snapshots for 15 seconds. It discovers legacy
ARC (`actions.summerwind.dev`) and scale-set CRDs (`actions.github.com`).
Scale-set resource counts are informational and remain unverified rather than
being labeled healthy. Missing permissions/read failures produce **unknown**
health, not a green result. Warning events request inspection, not proof of an
ongoing outage. Zero runners can be intentional.

These are **Kubernetes-side checks**, not proof of GitHub registration,
online/busy status, authentication, autoscaling reconciliation, or successful job
execution. The kubeconfig needs read-only list access to deployments, pods, events,
CRDs and the installed ARC custom resources across namespaces. Controller discovery
uses known deployment names/labels; nonstandard installations may not be detected.
Only selected status/configuration fields are returned by `/api/arc`, never ARC
registration tokens or secrets.

---

## 📋 Requirements

Before running the dashboard, make sure you have the following installed and available:

| Requirement | Version | Description | Link |
|---|---|---|---|
| **Kubernetes (K8s)** or **K3s** | K8s 1.24+ / K3s 1.24+ | A running cluster to monitor. K3s is a lightweight alternative ideal for edge, IoT, and dev environments. | [Kubernetes](https://kubernetes.io/) · [K3s](https://k3s.io/) |
| **Node.js** | 18.18 or later | JavaScript runtime used by both the backend and the frontend. | [nodejs.org](https://nodejs.org/) |
| **npm** | 9 or later (ships with Node.js) | Package manager for installing dependencies. | [npmjs.com](https://www.npmjs.com/) |
| **kubeconfig file** | — | Credentials file that lets the dashboard authenticate to your cluster. | [Kubernetes docs – kubeconfig](https://kubernetes.io/docs/concepts/configuration/organize-cluster-access-kubeconfig/) |
| **kubectl** *(optional)* | — | Helpful for verifying cluster access before starting the dashboard. | [Install kubectl](https://kubernetes.io/docs/tasks/tools/#kubectl) |
| **Git** *(optional)* | — | For cloning the repository. | [git-scm.com](https://git-scm.com/) |

### Kubeconfig

The backend uses the standard Kubernetes configuration: `KUBECONFIG` when set,
otherwise `~/.kube/config`. Set `KUBE_CONTEXT` to override the file's current context.
It exits with an error when no cluster is configured.

For a local Windows installation with a Hyper-V K3s VM, place a dedicated
kubeconfig at `$HOME\.kube\goblin-k3s.yaml`. Replace its loopback API server
address with the VM's reachable hostname or IP, which must also match the API
server certificate. Keep TLS verification enabled and keep credentials outside
this repository. The dashboard only reads the cluster.

```powershell
npm.cmd run install:all
npm.cmd run start:local
```

`start:local` uses that dedicated file unless `KUBECONFIG` is already set. It does
not change your kubectl current context. Open http://localhost:3001.

To use another file:

```powershell
$env:KUBECONFIG = 'C:\path\to\kubeconfig'
npm.cmd run start:local
```

---

## ⚙️ How It Works

The app has two parts:

* **Backend (port 3000)**
  Handles Kubernetes communication and streams updates

  ![Goblin Dashboard Backend](goblin-dashboard-backend.png)

* **Frontend (port 3001)**
  Displays the dashboard UI

  ![Goblin Dashboard Frontend](goblin-dashboard-frontend.png)

👉 You only need to open the frontend in your browser.

---

## 🚀 Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/the-robots/goblin-arc-dashboard.git
cd goblin-arc-dashboard
```

### 2. Install dependencies

Install both backend and frontend dependencies in one step:

```bash
npm run install:all
```

Or install them separately:

```bash
# Backend (from repo root)
npm install

# Frontend
cd frontend
npm install
cd ..
```

### 3. Start both servers

Run the backend and frontend together:

```bash
npm run dev
```

Or start them separately:

```bash
# Backend (from repo root)
node server.js

# Frontend (from the frontend directory)
cd frontend
npm run dev -- --hostname 127.0.0.1 --port 3001
```

### 4. Open the dashboard

```text
http://localhost:3001
```

Example:

```text
http://localhost:3001
```

---

## 🔄 Real-Time UI Updates

The dashboard updates **dynamically in real time** — no page reloads required.

### How it works

1. **Kubernetes Watch (backend)**
   The backend uses the Kubernetes Watch API to subscribe to pod events across all namespaces. Whenever a pod is added, modified, or deleted, Kubernetes pushes the change to the backend immediately.

2. **WebSocket Push (backend → frontend)**
   The backend runs a [Socket.IO](https://socket.io/) server. When it receives a pod event from the Kubernetes watch, it broadcasts a `pods:update` message to every connected browser over a persistent WebSocket connection.

3. **Live React State (frontend)**
   The frontend connects to the backend WebSocket on page load. Incoming `pods:update` events are applied directly to React state, which causes the UI to re-render instantly:

   * **Kube Blocks** — Pod cards appear, disappear, or update their status in place as pods are added, deleted, or modified.
   * **Event Log** — Each change is prepended to the log with a color-coded icon (🟢 added, 🟡 modified, 🔴 deleted), giving you a live feed of cluster activity.

Because updates flow through a persistent WebSocket rather than polling or page refreshes, the dashboard reflects cluster changes within moments of them happening.

The UI includes namespace/status filters, pod search, readiness and restart counts,
container waiting reasons, and a bounded 50-event log. Click a pod goblin to
toggle its read-only container health report. Each has a stable, pod-specific
appearance; healthy goblins are small, while those needing attention are larger.
They grin green/teal for ready workloads, turn amber for pending/unready containers
or restarts in the last 10 minutes, and worry pink for failures (including init
container failures). Completed/terminating pods sleep; missing health stays gray.
Lifetime restart totals alone do not trigger an alarm. The chief goblin reflects
overall health and turns gray when the watch is offline. Hover/focus and click
animations respect reduced-motion preferences. Connection and watch errors
are shown explicitly; disconnected data may be stale. Pods are identified by both
namespace and name, so identical names in different namespaces remain distinct.

The collapsible Goblin key shows each mood's live face and explains colors, expressions and decorative variations.
Moods are animated: grinning goblins blink and bob, waiting goblins glance around, worried goblins fidget and
sweat, sleepy goblins snooze, and unknown goblins scan. Animations are disabled when the OS requests reduced motion.
Inside a goblin report, expand an individual container (including init containers)
to see its image, readiness/restarts, current state and messages, startup time,
current/previous exit details, declared ports, and resource requests/limits.
Configured containers without a status are also listed. Resource values are
configuration, not live CPU/memory usage; timestamps are shown as Kubernetes
reports them. Environment variables and credentials are not displayed.

By default both servers bind to loopback, and the backend allows the UI origin
`http://localhost:3001`. For deliberate LAN use, set `HOST` and `FRONTEND_ORIGIN`
on the backend, and `NEXT_PUBLIC_BACKEND_URL` on the frontend, then launch the
frontend with the desired `--hostname`. `PORT` overrides the backend port.
There is no dashboard authentication, so do not expose it to untrusted networks.

---

## ⚠️ Important Notes

* **Port 3001 = dashboard UI**
* **Port 3000 = backend only**

If you open port 3000 in a browser, you may see a placeholder page or raw output — this is expected.

---

## 🧌 Final Words

This is a fast, scrappy dashboard for seeing what your cluster is doing right now.

If it works — don't touch it.
If it breaks — welcome back to goblin mode.

---
