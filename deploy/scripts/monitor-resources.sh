#!/usr/bin/env bash
# Host watchdog — run every minute from cron (see install-monitor.sh).
#
# Exists because the 2026-09-24 (CPU) and 2026-09-28 (memory/OOM) outages were
# both discovered only after the site was fully down. This checks the things
# that preceded both, and says so while there is still time to act:
#   load, available RAM, swap use, disk, container state/health, new kernel
#   OOM kills, and whether the public sites actually answer.
#
# Every alert is written to LOG_FILE and syslog. If ALERT_WEBHOOK_URL is set
# (Slack/Discord/ntfy/any endpoint that accepts a POSTed text body) it is also
# pushed there. Each distinct alert is rate-limited to once per COOLDOWN_MIN.
# Config lives in /etc/mzali-monitor.env (optional, plain KEY=value lines).
set -uo pipefail

CONF=${MONITOR_CONF:-/etc/mzali-monitor.env}
# shellcheck disable=SC1090
[[ -r "$CONF" ]] && source "$CONF"

LOAD_MAX=${LOAD_MAX:-12}            # 1-min load average (2 vCPU; ~5 is normal here)
MEM_AVAIL_MIN_PCT=${MEM_AVAIL_MIN_PCT:-12}
SWAP_USED_MAX_PCT=${SWAP_USED_MAX_PCT:-50}
DISK_MAX_PCT=${DISK_MAX_PCT:-88}
COOLDOWN_MIN=${COOLDOWN_MIN:-30}
SITE_URLS=${SITE_URLS:-https://ahmedmzaliboutique.tn/ https://facture.ahmedmzaliboutique.tn/}
LOG_FILE=${LOG_FILE:-/var/log/mzali-monitor.log}
STATE_DIR=${STATE_DIR:-/var/lib/mzali-monitor}
ALERT_WEBHOOK_URL=${ALERT_WEBHOOK_URL:-}
HOST=$(hostname)

mkdir -p "$STATE_DIR"
alerts=()

alert() { alerts+=("$1|$2"); }   # key|message

# --- load -------------------------------------------------------------------
load1=$(cut -d' ' -f1 /proc/loadavg)
if awk -v l="$load1" -v m="$LOAD_MAX" 'BEGIN{exit !(l>m)}'; then
  alert load "load average $load1 > $LOAD_MAX (cpus: $(nproc))"
fi

# --- memory / swap ----------------------------------------------------------
mem_total=$(awk '/^MemTotal:/{print $2}' /proc/meminfo)
mem_avail=$(awk '/^MemAvailable:/{print $2}' /proc/meminfo)
swap_total=$(awk '/^SwapTotal:/{print $2}' /proc/meminfo)
swap_free=$(awk '/^SwapFree:/{print $2}' /proc/meminfo)
avail_pct=$(( mem_avail * 100 / mem_total ))
if (( avail_pct < MEM_AVAIL_MIN_PCT )); then
  alert mem "available memory ${avail_pct}% (< ${MEM_AVAIL_MIN_PCT}%), $((mem_avail/1024)) MiB free of $((mem_total/1024)) MiB"
fi
if (( swap_total == 0 )); then
  alert noswap "no swap configured — the OOM killer has no cushion"
else
  swap_pct=$(( (swap_total - swap_free) * 100 / swap_total ))
  (( swap_pct > SWAP_USED_MAX_PCT )) && alert swap "swap ${swap_pct}% used (> ${SWAP_USED_MAX_PCT}%) — box is thrashing"
fi

# --- disk -------------------------------------------------------------------
disk_pct=$(df --output=pcent / | tail -1 | tr -dc '0-9')
(( disk_pct > DISK_MAX_PCT )) && alert disk "root disk ${disk_pct}% full (> ${DISK_MAX_PCT}%)"

# --- kernel OOM kills since last run -----------------------------------------
oom_now=$(dmesg 2>/dev/null | grep -c 'Out of memory: Killed process' || true)
oom_prev=$(cat "$STATE_DIR/oom_count" 2>/dev/null || echo "$oom_now")
if (( oom_now > oom_prev )); then
  victim=$(dmesg -T 2>/dev/null | grep 'Out of memory: Killed process' | tail -1 | sed 's/.*Killed process [0-9]* (\([^)]*\)).*/\1/')
  # bypass the cooldown: a kill is always news
  rm -f "$STATE_DIR/sent.oom"
  alert oom "kernel OOM killer fired $((oom_now-oom_prev)) time(s); last victim: ${victim:-unknown}"
fi
echo "$oom_now" > "$STATE_DIR/oom_count"

# --- containers ----------------------------------------------------------------
if command -v docker >/dev/null; then
  bad=$(docker ps -a --format '{{.Names}} {{.Status}}' 2>/dev/null \
        | grep -E '^(mzali-|facture-)' \
        | grep -v -E '^mzali-minio-init-|^mzali-worker-' \
        | grep -v -E ' Up .*\(healthy\)$' || true)
  [[ -n "$bad" ]] && alert containers "unhealthy/stopped containers: $(echo "$bad" | tr '\n' ';')"
fi

# --- sites really answer -----------------------------------------------------------
for url in $SITE_URLS; do
  code=$(curl -s -o /dev/null -m 15 -w '%{http_code}' "$url" || true)
  [[ "$code" =~ ^[23] ]] || alert "site_${url//[^a-zA-Z0-9]/_}" "$url returned HTTP ${code:-000}"
done

# --- deliver (rate-limited per key) ---------------------------------------------------
now=$(date +%s)
for entry in "${alerts[@]:-}"; do
  [[ -z "$entry" ]] && continue
  key=${entry%%|*}; msg=${entry#*|}
  stamp="$STATE_DIR/sent.$key"
  if [[ -f "$stamp" ]] && (( now - $(stat -c %Y "$stamp") < COOLDOWN_MIN * 60 )); then continue; fi
  touch "$stamp"
  line="$(date -Is) ALERT[$key] $HOST: $msg"
  echo "$line" >> "$LOG_FILE"
  logger -t mzali-monitor -p user.crit "$line"
  if [[ -n "$ALERT_WEBHOOK_URL" ]]; then
    curl -s -m 10 -X POST -H 'Content-Type: text/plain' --data "$line" "$ALERT_WEBHOOK_URL" >/dev/null || true
  fi
done

# clear cooldown stamps for alerts that are no longer firing, so a recurrence alerts immediately
active=" $(printf '%s ' "${alerts[@]:-}" | sed 's/|[^ ]*//g') "
for f in "$STATE_DIR"/sent.*; do
  [[ -e "$f" ]] || continue
  k=${f##*/sent.}
  [[ "$active" == *" $k "* ]] || rm -f "$f"
done
exit 0
