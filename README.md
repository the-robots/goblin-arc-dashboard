# 🧌 Goblin ARC Dashboard

A lightweight, real-time dashboard for watching Kubernetes pods without the overhead of large monitoring tools.

---

## 🧠 What This Is

Goblin ARC Dashboard is a simple full-stack app that:

* Connects to a Kubernetes cluster
* Tracks pods across namespaces
* Streams updates in real time
* Displays everything in a clean UI

It's built for quick visibility and fast feedback — not enterprise bloat.

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

By default the project is configured for **K3s** and loads the kubeconfig from:

```
/etc/rancher/k3s/k3s.yaml
```

If you use standard Kubernetes, update the kubeconfig path in `server.js`:

```js
kc.loadFromFile('/path/to/your/kubeconfig');
```

Or load the default kubeconfig (`~/.kube/config`):

```js
kc.loadFromDefault();
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
npm run dev -- --hostname 0.0.0.0 --port 3001
```

### 4. Open the dashboard

```text
http://<your-server-ip>:3001
```

Example:

```text
http://192.168.1.229:3001
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
