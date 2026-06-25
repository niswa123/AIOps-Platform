# AIOps Platform - Kubernetes Deployment Guide

This guide details how to self-host the **AIOps Platform** telemetry ingestion pipeline and Next.js web observability dashboard on a private Kubernetes cluster using Helm.

---

## Architecture Overview

AIOps Platform is composed of the following services:
*   **Collector API:** High-throughput telemetry ingestion service. Resolved API Keys are cached in Redis. Ingested traces are pushed to a Kafka queue.
*   **Next.js Dashboard:** Frontend visualizer for traces, FinOps cost aggregates, prompts playground, and exceptions tracking.
*   **PostgreSQL:** Stores relational auth metadata (organizations, projects, members, API Keys catalogs).
*   **Redis:** Dynamic rate-limiting registry and API key authentication cache.
*   **Kafka (Redpanda):** Buffer ingestion queue storing telemetry events before bulk ingestion.
*   **ClickHouse:** High-performance OLAP column-oriented datastore housing traces and aggregated hourly metrics.

---

## Prerequisites

To install this chart, you will need:
*   Kubernetes cluster 1.25+
*   Helm 3.8.0+ installed
*   An Ingress Controller (such as `ingress-nginx`) active in the cluster
*   `kubectl` CLI configured with admin access

---

## Quick Start (Local Kubernetes testing using Minikube / Kind)

1.  **Clone the Repository and navigate to the deployment folder:**
    ```bash
    cd deploy
    ```

2.  **Verify local templates compile successfully:**
    ```bash
    helm template my-release ./helm
    ```

3.  **Install the Helm Chart in a custom namespace:**
    ```bash
    kubectl create namespace aiops
    helm install aiops-platform ./helm -n aiops
    ```

4.  **Wait for all pods to reach Running status:**
    ```bash
    kubectl get pods -n aiops -w
    ```

5.  **Expose the Dashboard using local Port-Forwarding (if Ingress is not configured):**
    ```bash
    kubectl port-forward svc/aiops-platform-dashboard 3000:3000 -n aiops
    ```
    Open `http://localhost:3000` to access the Settings Dashboard.

---

## Configuration Parameter Reference

Use `--set` or supply a custom `my-values.yaml` override file to configure variables. Key settings from [values.yaml](helm/values.yaml) include:

### Ingestion Service Settings
| Parameter | Description | Default |
|---|---|---|
| `collector.replicaCount` | Collector scaling pods count | `2` |
| `collector.resources.limits.memory` | Memory hard limit | `1Gi` |
| `collector.env.redisRateLimitMaxRequests` | Max telemetry posts allowed per window | `100` |

### Database Bundling Settings
For enterprise deployments, it is highly recommended to use managed instances (e.g., AWS RDS, ClickHouse Cloud, Upstash Redis) and disable the bundled test components:
```yaml
# Disable internal subcharts in your custom values.yaml
postgres:
  enabled: false
clickhouse:
  enabled: false
redis:
  enabled: false
redpanda:
  enabled: false
```
Then, update the `ConfigMap` and `Secret` references with your external connection endpoints:
*   `POSTGRES_HOST`, `CLICKHOUSE_HOST`, `REDIS_HOST`, `KAFKA_BOOTSTRAP_SERVERS`
*   Provide corresponding secrets for `POSTGRES_PASSWORD`, `CLICKHOUSE_PASSWORD`, `REDIS_PASSWORD` in K8s secrets.

---

## Production Hardening Recommendations

1.  **Enable Ingress TLS Encryption:**
    Configure a certificate manager (e.g., cert-manager with Let's Encrypt) to secure telemetry endpoints:
    ```yaml
    ingress:
      enabled: true
      className: nginx
      tls:
        - secretName: aiops-platform-tls
          hosts:
            - aiops.yourcompany.com
    ```

2.  **Resource Allocations (Sizing guidelines):**
    *   **ClickHouse:** Allocate minimum 8GB RAM and 4 CPUs for standard workloads. Ensure Persistent Volumes use SSD block storage (`gp3` on AWS or equivalent).
    *   **Kafka/Redpanda:** Sized based on retention. Maintain at least 3 brokers for replication high availability.
