# Goblin dashboard frontend

From the repository root, run `npm run start:local` for the local Hyper-V K3s
installation, or `npm run dev` with `KUBECONFIG` set for another cluster.
The UI is at http://localhost:3001 and connects to http://localhost:3000 by default.

To run only the frontend:

```powershell
npm.cmd run dev -- --hostname 127.0.0.1 --port 3001
```

Set `NEXT_PUBLIC_BACKEND_URL` before starting or building to use another backend.
See the root README for cluster configuration and network exposure settings.
