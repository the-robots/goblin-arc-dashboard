# 🧌 Goblin ARC Dashboard

A lightweight, real-time dashboard for watching Kubernetes pods without the overhead of large monitoring tools.

---

## 🧠 What This Is

Goblin ARC Dashboard is a simple full-stack app that:

* Connects to a Kubernetes cluster
* Tracks pods across namespaces
* Streams updates in real time
* Displays everything in a clean UI

It’s built for quick visibility and fast feedback — not enterprise bloat.

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

---

### 2. Install dependencies

Backend (from repo root):

```bash
npm install
```

Frontend:

```bash
cd frontend
npm install
cd ..
```

---

### 3. Start the backend

From the repo root:

```bash
node server.js
```

---

### 4. Start the frontend

⚠️ Must be run from the `frontend` directory:

```bash
cd frontend
npm run dev -- --hostname 0.0.0.0 --port 3001
```

---

### 5. Open the dashboard

```text
http://<your-server-ip>:3001
```

Example:

```text
http://192.168.1.229:3001
```

---

## ⚠️ Important Notes

* **Port 3001 = dashboard UI**
* **Port 3000 = backend only**

If you open port 3000 in a browser, you may see a placeholder page or raw output — this is expected.

---

## 🧌 Requirements

* Access to a Kubernetes cluster
* A valid kubeconfig file

By default, this project is configured for k3s using:

```
/etc/rancher/k3s/k3s.yaml
```

If you are using standard Kubernetes, update the kubeconfig path in `server.js`:

```js
kc.loadFromFile('/path/to/your/kubeconfig');
```

Alternatively, you can modify it to use your default kubeconfig:

```js
kc.loadFromDefault();
```

---

## 🧌 Final Words

This is a fast, scrappy dashboard for seeing what your cluster is doing right now.

If it works — don’t touch it.
If it breaks — welcome back to goblin mode.

---
