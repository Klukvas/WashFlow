# Monitoring preparation

Status: **local checker and synthetic verification only**. No Prometheus server, exporter,
monitoring schedule, alert receiver, provider integration or offsite backup is activated.
Thresholds and routing below are proposals requiring service-owner selection before activation.
This runbook complements [backup/recovery](./backup-recovery.md) and the existing
[observability source map](../context/infrastructure.md#5-observability).

## One-shot checks

Python 3.11+ standard library; no dependency installation. Run from the repository root.
Choose an already running, approved local API explicitly; the checker never starts the app,
imports `.env`, sends credentials, follows redirects or uses environment proxies. Only HTTP
literal loopback addresses (`127.0.0.1`, `[::1]`) with explicit ports and `/api/v1/health`
are accepted. Change the example port to the API under inspection.

```bash
python3 -B scripts/operations/check.py health \
  --url http://127.0.0.1:3003/api/v1/health --timeout-seconds 5
```

Requires HTTP 200, Terminus `status: ok` and `details.database`, `details.redis`,
`details.queues` each with `status: up`. Supports the actual application's `{data, meta}`
success envelope and raw Terminus JSON. An absent dependency is unhealthy. HTTP failures,
redirects, malformed/oversized JSON and socket timeout/refusal fail. Timeout must be finite,
positive and at most 60 seconds; it is a socket-operation timeout. Use an outer invocation
deadline in a future scheduler to bound a server that continuously trickles bytes.
Queue health currently verifies Redis connectivity for the three BullMQ queues; it does
**not** prove that workers are processing jobs, that deliveries succeeded or that backlog is low.

Backup checking requires separate, existing, operator-approved roots containing only the
accepted tool's attempt JSON records and bundles. This command **only reads** them:

```bash
python3 -B scripts/operations/check.py backup \
  --attempts /APPROVED/attempts --bundles /APPROVED/backups \
  --max-age-seconds 21600 --grace-seconds 1800 --running-timeout-seconds 7200
```

Replace the inert `/APPROVED` placeholders; no such directories are created. The checker reads
top-level `*.json` records with format `washflow-backup-attempt-v1`, validates status,
timezone-aware ordered timestamps and bundle confinement to the supplied backup root, and
reuses [the accepted backup tool's `verify()`](../../scripts/backup/backup.py) read-only.
Success requires both the success record **and** an intact supported manifest, matching
SHA-256 sizes/checksums, dump marker and safe uploads archive. Manifest creation must fall
inside the recorded attempt. Freshness uses that manifest time, never directory mtime or
the most recent attempt's existence. Verification reads payload bytes and may take time
proportional to backup size; plan capacity and an outer process deadline before scheduling.
Integrity is not authenticity or a substitute for an isolated restore drill.

No fresh verified success within interval plus grace fails. A newer failed attempt also fails
while preserving `last_verified_success_at` and `verified_successes`. A running retry keeps
that failure active (`latest_attempt_failed`) while `latest_attempt_status` reports `running`;
only a later **verified** successful completion resolves it. Malformed records, corrupt success bundles and
any stale running record fail independently, even if another success is fresh. A running
attempt below its deadline is reported as running and does not hide an overdue success.
`--running-timeout-seconds` bounds **total attempt age from `started_at`**, including dump,
tar, hashing and grace; choose it from measured backup duration. The backup CLI's own timeout
is per PostgreSQL child command and does not define total backup duration. Unknown JSON files
in the attempts root are errors. Keep reviewed history separately rather than disabling checks;
the checker never deletes, rewrites or acknowledges a record. Keep roots trusted and stable
during verification. Missing/inaccessible roots are an input/check failure.

Both commands emit one concise JSON result on stdout. Normal failures never echo response
bodies, exception details, URL/record paths, database names, tenant data or credentials.
`--help` prints CLI usage. Exit codes:

| Code | Meaning | Proposed handling |
| --- | --- | --- |
| `0` | Required checks passed | Record last observation; no notification |
| `1` | Health unhealthy or backup evidence unhealthy/stale | Route the concise issue codes |
| `2` | Invalid arguments, unavailable roots or checker could not complete | Treat as a monitoring failure; never convert to healthy |

Output is ephemeral JSON only. There is no status file, `.prom` output, exporter, daemon or
notification sender. A future authorized integration must separately track **last invocation
time** and alert on missing results; an old successful result must not stand in for a new check.

## Inert Prometheus examples

These are **documentation examples**, not installed configuration. The actual custom metrics
in [MetricsService](../../src/modules/metrics/metrics.service.ts) are `http_requests_total`
and histogram `http_request_duration_seconds` (`_bucket`, `_sum`, `_count`), with labels
`method`, `route`, `status`. Histogram buckets are 0.01–5 seconds. Production metrics require
`METRICS_TOKEN`; provision a protected credentials file separately, never paste a token into
YAML, command history or this repository. `backend:3000` assumes an approved private scraper
on the service network; no new published port is needed.

```yaml
# INERT: do not install until scrape access and credentials are authorized.
scrape_configs:
  - job_name: washflow-backend
    metrics_path: /api/v1/metrics
    scrape_interval: 30s
    scrape_timeout: 5s
    authorization:
      type: Bearer
      credentials_file: /PRIVATE/metrics-token
    static_configs:
      - targets: ['backend:3000']
```

```yaml
# INERT: proposed thresholds; no receiver or rule_files wiring exists here.
groups:
  - name: washflow-proposed
    rules:
      - alert: WashflowMetricsUnavailable
        expr: up{job="washflow-backend"} == 0
        for: 2m
        labels: {severity: critical}
        annotations: {summary: 'Metrics scrape failed; inspect reachability and auth'}
      - alert: WashflowObserved5xxRatio
        expr: |
          (sum(rate(http_requests_total{job="washflow-backend",status=~"5.."}[5m]))
            / clamp_min(sum(rate(http_requests_total{job="washflow-backend"}[5m])), 0.001)) > 0.05
          and sum(increase(http_requests_total{job="washflow-backend"}[5m])) >= 20
        for: 5m
        labels: {severity: critical}
        annotations: {summary: 'Observed 5xx ratio exceeds proposed 5 percent'}
      - alert: WashflowObservedLatency
        expr: |
          histogram_quantile(0.95,
            sum by (le) (rate(http_request_duration_seconds_bucket{job="washflow-backend"}[5m]))) > 1
          and sum(increase(http_request_duration_seconds_count{job="washflow-backend"}[5m])) >= 20
        for: 10m
        labels: {severity: warning}
        annotations: {summary: 'Observed request p95 exceeds proposed 1 second'}
```

`up` is generated by Prometheus and describes the metrics scrape, **not** application health.
There is no current health/backup Prometheus gauge: route the JSON health and backup results
through a separately approved runner/adapter rather than inventing an existing metric.
The current [MetricsInterceptor](../../src/modules/metrics/metrics.interceptor.ts) reads
`res.statusCode` in its error callback before exception filters may set the final response.
Guard rejections can also occur before interceptors. Therefore these 5xx/latency rules cover
only the observed instrumentation and may undercount final HTTP failures. Validate final-status
coverage separately before relying on them; retain health checks and approved ingress access
metrics/log investigation. Correcting instrumentation is separate backend work.

## Owner decisions and response

Before activation, record an incident owner, backup operator, primary/secondary contacts,
quiet-hours policy, notification service, escalation timeout, maintenance suppression and
test-delivery evidence. No real contact/channel or provider has been configured or called.

| Signal | Proposed threshold | Proposed route/action |
| --- | --- | --- |
| Health HTTP/overall/dependency failure | Two consecutive 30-second checks | Incident owner; inspect DB/Redis/queue connectivity and local logs; do not auto-restart or mutate data |
| Metrics unavailable | Two minutes | Incident owner; distinguish token/access failure from outage using health |
| Observed 5xx / latency | Rules above; owner must tune after baseline | Incident owner for errors; working-hours investigation for latency unless correlated with outage |
| Latest backup failed, malformed, corrupt or stale running | First failed observation | Backup operator immediately; incident owner if recovery point is threatened; preserve known good bundles |
| No fresh verified backup | Proposed six-hour interval plus 30-minute grace | Backup operator + incident owner; report actual age/RPO exposure and follow backup/recovery runbook |
| Checker exit 2 or missed invocation | First failure / two expected intervals without result | Monitoring owner; restore observation, never assume healthy |

Health does not verify external email/billing delivery, Redis durability, queue throughput,
offsite recovery, public DNS/TLS or frontend reachability. Production verification, schedules,
offsite copies, credentials and notification activation require separate authorized work.

## Reproducible local verification

```bash
python3 -B -m pytest -p no:cacheprovider test/operations -q
```

Tests create only temporary synthetic fixtures inside `test/operations/`, remove their own
fixtures, and bind ephemeral loopback HTTP ports. No Docker, real API, port 15433, database,
Redis, `.env`, real backup or external provider is used. Coverage includes raw/enveloped health,
each missing/down component, HTTP error/redirect/timeout/refusal, JSON/argument redaction,
empty/stale/corrupt backups, failed-latest versus known success, active/stale running attempts,
timestamp/path boundaries and read-only evidence preservation.
