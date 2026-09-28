#!/usr/bin/env bash
# One-time (idempotent) install of the host watchdog. Run on the VPS:
#   sudo bash deploy/scripts/install-monitor.sh
set -euo pipefail
SRC="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/monitor-resources.sh"
install -m 0755 "$SRC" /usr/local/bin/mzali-monitor
[[ -f /etc/mzali-monitor.env ]] || cat > /etc/mzali-monitor.env <<'CONF'
# Uncomment to push alerts somewhere you will actually see them
# (Slack/Discord webhook, https://ntfy.sh/<your-topic>, ...):
#ALERT_WEBHOOK_URL=
#LOAD_MAX=12
#MEM_AVAIL_MIN_PCT=12
CONF
cat > /etc/cron.d/mzali-monitor <<'CRON'
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
* * * * * root /usr/local/bin/mzali-monitor
CRON
chmod 644 /etc/cron.d/mzali-monitor
cat > /etc/logrotate.d/mzali-monitor <<'LR'
/var/log/mzali-monitor.log { weekly rotate 8 compress missingok notifempty }
LR
echo "installed; alerts -> /var/log/mzali-monitor.log (+ ALERT_WEBHOOK_URL if set in /etc/mzali-monitor.env)"
