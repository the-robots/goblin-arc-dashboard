# goblin-arc-dashboard

# 🧌 Goblin ARC Dashboard

A lightweight, real-time Kubernetes (k3s) dashboard for watching pods without the bloat.

---

## 🧠 What This Is

Goblin ARC Dashboard is a simple full-stack app that:

* 📡 Fetches pod data from a Kubernetes cluster
* 🔄 Streams real-time updates via WebSockets
* 🧱 Displays pods in a clean UI
* ⚡ Gives fast visibility into cluster activity

Built for speed, clarity, and not dealing with massive dashboards when you don’t need them.

---

## ⚙️ Tech Stack

* **Backend:** Node.js, Express, Socket.IO
* **Frontend:** Next.js
* **Kubernetes Client:** `@kubernetes/client-node`
* **Cluster:** k3s (tested locally)

---

## 🗺️ Architecture

```
Frontend (Next.js)  --->  Backend (Express)  --->  Kubernetes API
        |                        |
        |                        +-- /api/pods (REST)
        |
        +------ WebSocket <------+-- live updates
```

* **Port 3001** → Frontend (UI)
* **Port 3000** → Backend (API + sockets)

Frontend UI
![](https://github.com/the-robots/goblin-arc-dashboard/blob/main/goblin-dashboard-sshot.png)


---

## 🚀 Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/the-robots/goblin-arc-dashboard.git
cd goblin-arc-dashboard
```

---

### 2. Install dependencies

Install both backend and frontend dependencies at once:

```bash
npm run install:all
```

---

### 3. Start the app

Run both the backend and frontend with a single command from the repo root:

```bash
npm run dev
```

This starts:
* **Backend** on port `3000`
* **Frontend** on port `3001`

You can also run them individually if needed:

```bash
# Backend only
npm start

# Frontend only (from the frontend directory)
cd frontend
npm run dev -- --hostname 0.0.0.0 --port 3001
```

---

### 4. Open the dashboard

```
http://<your-server-ip>:3001
```

Example:

```
http://192.168.1.229:3001
```

---

## 🔍 API Endpoints

### Health Check

```
GET /healthz
```

### Pod List

```
GET /api/pods
```

---

## 🔄 Real-Time Events

WebSocket events used by the dashboard:

* `pods:init` → initial pod list
* `pods:update` → live updates

---

## ⚠️ Requirements

* Access to a Kubernetes cluster
* Valid kubeconfig at:

```
/etc/rancher/k3s/k3s.yaml
```

If needed, update in `server.js`:

```js
kc.loadFromFile('/path/to/your/kubeconfig');
```

---

## 🧌 Notes

* `npm run dev` starts both frontend and backend together
* Backend serves API + sockets only
* Frontend is the actual dashboard UI
* Port assignments:

  * `3000 = backend`
  * `3001 = UI`

---

## 🛠️ Future Ideas

* Namespace filtering
* Pod logs viewer
* Metrics integration
* Ingress / custom domain
* Authentication

---

## 🧌 Final Words

Fast, scrappy, and built to get visibility without friction.

If it works — don’t touch it.
If it breaks — welcome back to goblin mode.

---

