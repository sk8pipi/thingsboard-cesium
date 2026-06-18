# thingsboard+cesium

Full-stack archive for the ThingsBoard + Cesium project.

## Structure

- `frontend/` - Vue 3 frontend project.
- `backend/` - ThingsBoard backend source project.

## Local setup notes

Frontend environment files are intentionally not committed. Copy the example files before running the frontend:

```powershell
Copy-Item frontend/.env.example frontend/.env
Copy-Item frontend/.env.development.example frontend/.env.development
Copy-Item frontend/.env.production.example frontend/.env.production
Copy-Item frontend/.env.local.example frontend/.env.local
```

Set `VITE_CESIUM_ION_TOKEN` in `frontend/.env.local` locally.
