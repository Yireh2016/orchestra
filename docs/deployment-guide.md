# Orchestra -- Deployment Guide

This guide covers deploying Orchestra in both local development and production Kubernetes environments.

---

## Local Development (Docker Compose)

### Prerequisites

- Docker Engine 24+ and Docker Compose v2
- Node.js 22+
- pnpm 10+

### Option 1: Infrastructure Only (Recommended for Development)

Run PostgreSQL and Redis in containers while running the application natively for hot-reload:

```bash
# Start database and cache
docker compose up -d postgres redis

# Verify services are healthy
docker compose ps

# Set up the database schema
cp apps/core/.env.example apps/core/.env
# Edit .env with your local configuration
pnpm db:push

# Start the backend (watches for changes)
pnpm --filter @orchestra/core dev

# Start the frontend (separate terminal, watches for changes)
pnpm --filter @orchestra/web dev
```

The backend will be available at `http://localhost:3001` and the frontend at `http://localhost:3000`.

### Option 2: Full Stack in Docker

Run everything in containers:

```bash
docker compose up -d
```

This starts PostgreSQL, Redis, the core API, and the web frontend. Source directories are mounted as volumes for hot-reload.

### Local Environment Variables

Create `apps/core/.env` with the following:

```env
DATABASE_URL=postgresql://orchestra:orchestra_dev@localhost:5433/orchestra
REDIS_URL=redis://localhost:6379
PORT=3001
NODE_ENV=development
JWT_SECRET=dev-secret-change-in-prod
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

Create `apps/web/.env.local` with the following:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=dev-secret-change-in-prod
```

---

## Production Deployment (Kubernetes)

### Prerequisites

- A Kubernetes cluster (1.27+)
- `kubectl` configured with cluster access
- An ingress controller (nginx-ingress recommended)
- cert-manager for TLS certificate automation
- A container registry (e.g., ghcr.io, Docker Hub, ECR)

### 1. Build and Push Container Images

```bash
# Build all images
docker build -t ghcr.io/orchestra-platform/core:stable -f apps/core/Dockerfile .
docker build -t ghcr.io/orchestra-platform/web:stable -f apps/web/Dockerfile .
docker build -t ghcr.io/orchestra-platform/agent:stable -f containers/agent/Dockerfile .

# Push to your registry
docker push ghcr.io/orchestra-platform/core:stable
docker push ghcr.io/orchestra-platform/web:stable
docker push ghcr.io/orchestra-platform/agent:stable
```

### 2. Configure Secrets

Before deploying, create the required secrets in your cluster. Do **not** store real credentials in the manifest files.

```bash
# Create the namespace
kubectl create namespace orchestra

# Core application secrets
kubectl -n orchestra create secret generic orchestra-core-secrets \
  --from-literal=DATABASE_URL='postgresql://orchestra:STRONG_PASSWORD@orchestra-postgres:5432/orchestra' \
  --from-literal=REDIS_URL='redis://orchestra-redis:6379' \
  --from-literal=JWT_SECRET='your-production-jwt-secret' \
  --from-literal=GOOGLE_CLIENT_ID='your-google-client-id' \
  --from-literal=GOOGLE_CLIENT_SECRET='your-google-client-secret'

# PostgreSQL password
kubectl -n orchestra create secret generic orchestra-postgres-secret \
  --from-literal=password='STRONG_PASSWORD'

# Agent API key
kubectl -n orchestra create secret generic orchestra-agent-secrets \
  --from-literal=api-key='your-agent-api-key'
```

For production, consider using an external secrets manager (e.g., HashiCorp Vault, AWS Secrets Manager, or the External Secrets Operator) instead of kubectl-created secrets.

### 3. Configure the Ingress

Edit `k8s/base/ingress.yaml` and replace `orchestra.example.com` with your actual domain. Ensure you have:

- A DNS A record pointing your domain to the ingress controller's external IP.
- cert-manager installed with a `ClusterIssuer` named `letsencrypt-prod`.

### 4. Review Production Overlays

The production overlay at `k8s/overlays/prod/kustomization.yaml` applies the following changes over the base manifests:

| Resource | Change |
|----------|--------|
| orchestra-core Deployment | 3 replicas, higher CPU/memory limits (2 CPU, 1Gi) |
| orchestra-web Deployment | 3 replicas, higher CPU/memory limits (1 CPU, 512Mi) |
| orchestra-redis Deployment | Higher CPU/memory limits (1 CPU, 1Gi) |
| orchestra-postgres StatefulSet | Higher CPU/memory limits (2 CPU, 2Gi), 100Gi storage |
| HPA (core) | Min 3 replicas, max 20 replicas |
| Agent Jobs | Higher limits (4 CPU, 4Gi) |
| Container images | Pulled from `ghcr.io/orchestra-platform/*:stable` |

Adjust these values in the overlay to match your cluster capacity and expected load.

### 5. Deploy

```bash
# Preview the rendered manifests
kubectl kustomize k8s/overlays/prod

# Apply to the cluster
kubectl apply -k k8s/overlays/prod

# Watch rollout progress
kubectl -n orchestra rollout status deployment/orchestra-core
kubectl -n orchestra rollout status deployment/orchestra-web
```

### 6. Verify the Deployment

```bash
# Check all pods are running
kubectl -n orchestra get pods

# Check services
kubectl -n orchestra get svc

# Check ingress and TLS
kubectl -n orchestra get ingress
kubectl -n orchestra describe ingress orchestra-ingress

# Check HPA status
kubectl -n orchestra get hpa

# Test health endpoint
curl -s https://orchestra.example.com/api/health | jq
```

---

## Kubernetes Manifest Overview

### Base Manifests (`k8s/base/`)

| File | Resources |
|------|-----------|
| `namespace.yaml` | `orchestra` namespace |
| `core-deployment.yaml` | Core API Deployment, Service, ConfigMap, Secret |
| `web-deployment.yaml` | Web frontend Deployment, Service, ConfigMap |
| `postgres-statefulset.yaml` | PostgreSQL StatefulSet, headless Service, Secret |
| `redis-deployment.yaml` | Redis Deployment, Service |
| `agent-job-template.yaml` | Agent Job template, ServiceAccount, Secret |
| `ingress.yaml` | Nginx Ingress with TLS and WebSocket support |
| `hpa.yaml` | HorizontalPodAutoscaler for the core API |
| `network-policy.yaml` | NetworkPolicies restricting inter-component traffic |
| `serviceaccount.yaml` | ServiceAccount and RBAC for core to manage agent Jobs |

### Network Policies

The network policies enforce least-privilege communication:

- **PostgreSQL** only accepts connections from `orchestra-core`.
- **Redis** only accepts connections from `orchestra-core`.
- **Web frontend** can only reach `orchestra-core` (and receive traffic from the ingress).
- **Core API** can reach PostgreSQL, Redis, and external HTTPS endpoints (for webhooks and APIs).
- **Agent containers** can reach the core API (for callbacks), and external HTTPS/SSH (for git and API calls).

### Autoscaling

The HPA scales the `orchestra-core` deployment based on:
- CPU utilization target: 70%
- Memory utilization target: 80%
- Production range: 3 to 20 replicas

---

## Database Management

### Migrations

Run Prisma migrations against the production database:

```bash
# Port-forward to the PostgreSQL pod
kubectl -n orchestra port-forward svc/orchestra-postgres 5432:5432

# In another terminal, run migrations
DATABASE_URL='postgresql://orchestra:PASSWORD@localhost:5432/orchestra' \
  pnpm --filter @orchestra/core exec prisma migrate deploy
```

### Backups

For production, configure automated PostgreSQL backups. Options include:

- **pg_dump** via a CronJob in the cluster
- **WAL-G** for continuous archiving to object storage (S3, GCS)
- **Managed PostgreSQL** (RDS, Cloud SQL, etc.) with automated backups

---

## Monitoring and Observability

### Health Checks

The core API exposes a `/health` endpoint used by Kubernetes probes:
- **Startup probe**: checks every 5s, allows up to 60s for initial startup.
- **Readiness probe**: checks every 10s, removes pod from service if unhealthy.
- **Liveness probe**: checks every 20s, restarts pod if persistently unhealthy.

### Logging

All application components log to stdout in structured JSON format. Collect logs with your preferred stack:
- Fluentd / Fluent Bit to Elasticsearch
- Loki + Grafana
- Cloud-native solutions (CloudWatch, Stackdriver)

### Metrics

Expose application metrics via a `/metrics` endpoint (Prometheus format) for dashboarding and alerting. Key metrics to monitor:

- Workflow run counts by state
- Phase transition latency
- Agent container spawn time and resource usage
- Task queue depth and processing rate
- API request latency (p50, p95, p99)

---

## Upgrading

### Rolling Updates

The default deployment strategy is `RollingUpdate`. To deploy a new version:

```bash
# Update the image tag in the prod overlay or use kubectl set image
kubectl -n orchestra set image deployment/orchestra-core core=ghcr.io/orchestra-platform/core:v1.2.0
kubectl -n orchestra set image deployment/orchestra-web web=ghcr.io/orchestra-platform/web:v1.2.0

# Watch the rollout
kubectl -n orchestra rollout status deployment/orchestra-core
```

### Rollback

```bash
# Roll back to the previous revision
kubectl -n orchestra rollout undo deployment/orchestra-core
```

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Pods stuck in `Pending` | `kubectl -n orchestra describe pod <name>` -- look for resource or scheduling issues |
| Core API not reachable | Verify Service and Ingress: `kubectl -n orchestra get svc,ingress` |
| Database connection refused | Check NetworkPolicy, verify Secret values, check PostgreSQL pod logs |
| Agent jobs not starting | Verify the core ServiceAccount has RBAC permissions: `kubectl -n orchestra auth can-i create jobs --as=system:serviceaccount:orchestra:orchestra-core` |
| TLS certificate not provisioning | Check cert-manager logs: `kubectl -n cert-manager logs -l app=cert-manager` |
| HPA not scaling | Check metrics server: `kubectl top pods -n orchestra` |
