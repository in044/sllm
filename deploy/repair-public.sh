#!/usr/bin/env bash
# Restore the interrupted public activation, with the pre-activation backup as fallback.
set -euo pipefail
[[ $(id -u) == 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
base=/var/www/sllm
backup=${1:?Supply the original pre-activation backup directory}
[[ $backup == "$base/deploy/backup-"* && -d "$backup" && ! -L "$backup" ]]
[[ -f "$backup/sllm.service" && -f "$backup/sllm.nginx" && -f "$backup/previous-release" ]]
previous=$(cat "$backup/previous-release")
[[ $previous == "$base/releases/"* && -d "$previous" ]]
current=$(readlink -f "$base/current")
[[ $current == "$base/releases/"* && -s "$current/server/app.py" ]]
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
[[ -f "$script_dir/public.service" && -f "$script_dir/public.nginx" ]]
rollback() {
    status=${1:-1}
    trap - ERR INT TERM
    set +e
    echo "Recovery failed; restoring pre-activation release $previous" >&2
    journalctl -u sllm.service -n 30 --no-pager
    cp -a "$backup/sllm.service" /etc/systemd/system/sllm.service
    cp -a "$backup/sllm.nginx" /etc/nginx/sites-available/sllm
    ln -s "$previous" "$base/current.recovery"
    mv -Tf "$base/current.recovery" "$base/current"
    systemctl daemon-reload
    systemctl restart sllm.service
    /usr/sbin/nginx -t && systemctl reload nginx
    exit "$status"
}
trap 'rollback $?' ERR
trap 'rollback 130' INT
trap 'rollback 143' TERM
echo 'Recent service startup diagnostics:'
journalctl -u sllm.service -n 15 --no-pager
install -m 644 "$script_dir/public.service" /etc/systemd/system/sllm.service
install -m 644 "$script_dir/public.nginx" /etc/nginx/sites-available/sllm
/usr/sbin/nginx -t
systemctl daemon-reload
systemctl restart sllm.service
healthy=0
for attempt in {1..20}; do
    if curl --max-time 2 -fsS http://127.0.0.1:3002/api/status >/dev/null 2>&1; then healthy=1; break; fi
    sleep 1
done
[[ $healthy == 1 ]]
[[ $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3002/admin) == 404 ]]
[[ $(curl -s -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' -d '{}' http://127.0.0.1:3002/api/llm) == 403 ]]
systemctl reload nginx
curl --max-time 10 -fsS https://sllm.kyurururn.net/api/status
curl --max-time 10 -fsS https://sllm.kyurururn.net/credits.html >/dev/null
[[ $(curl -s -o /dev/null -w '%{http_code}' https://sllm.kyurururn.net/admin) == 404 ]]
[[ $(curl -s -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' -d '{}' https://sllm.kyurururn.net/api/llm) == 403 ]]
trap - ERR INT TERM
printf '\nS-LLM public API and website recovered: https://sllm.kyurururn.net/\n'
