#!/usr/bin/env bash
# S-LLM public release activation. Usage: sudo bash activate-public.sh RELEASE_ID
set -euo pipefail
[[ $(id -u) == 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
release_id=${1:?Supply the reviewed release ID}
[[ $release_id =~ ^[a-f0-9]{40}-public$ ]] || { echo 'Invalid release ID.' >&2; exit 1; }
base=/var/www/sllm
release="$base/releases/$release_id"
[[ -d "$release" && ! -L "$release" ]]
[[ $(cat "$release/RELEASE_COMMIT") == "${release_id%-public}" ]]
[[ -s "$release/packages/scratch-gui/build/index.html" ]]
[[ -s "$release/packages/scratch-gui/build/source/sllm-source.tar.gz" ]]
[[ -s "$base/shared/backend.env" ]]
# Exclude stale or altered source/build files before making any changes.
(cd "$release" && sha256sum --check --status RELEASE_SHA256SUMS)
previous=$(readlink -f "$base/current")
[[ $previous == "$base/releases/"* && $previous != "$release" ]]
backup="$base/deploy/backup-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -m 700 "$backup"
cp -a /etc/systemd/system/sllm.service "$backup/sllm.service"
cp -a /etc/nginx/sites-available/sllm "$backup/sllm.nginx"
printf '%s\n' "$previous" > "$backup/previous-release"
rollback() {
    status=${1:-1}
    trap - ERR INT TERM
    set +e
    echo "Activation failed. Restoring $previous" >&2
    cp -a "$backup/sllm.service" /etc/systemd/system/sllm.service
    cp -a "$backup/sllm.nginx" /etc/nginx/sites-available/sllm
    ln -s "$previous" "$base/current.rollback"
    mv -Tf "$base/current.rollback" "$base/current"
    systemctl daemon-reload
    systemctl restart sllm.service
    /usr/sbin/nginx -t && systemctl reload nginx
    exit "$status"
}
trap 'rollback $?' ERR
trap 'rollback 130' INT
trap 'rollback 143' TERM
install -m 644 "$release/deploy/public.service" /etc/systemd/system/sllm.service
install -m 644 "$release/deploy/public.nginx" /etc/nginx/sites-available/sllm
# Existing nginx logrotate policy covers /var/log/nginx/*.log, daily, 14 rotations.
# Do not install public-logrotate.conf as a duplicate matching stanza.
/usr/sbin/nginx -t
ln -s "$release" "$base/current.next"
mv -Tf "$base/current.next" "$base/current"
systemctl daemon-reload
systemctl restart sllm.service
healthy=0
for attempt in {1..20}; do
    if curl --max-time 2 -fsS http://127.0.0.1:3002/api/status >/dev/null 2>&1; then healthy=1; break; fi
    sleep 1
done
if [[ $healthy != 1 ]]; then journalctl -u sllm.service -n 30 --no-pager; false; fi
[[ $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3002/admin) == 404 ]]
[[ $(curl -s -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' -d '{}' http://127.0.0.1:3002/api/llm) == 403 ]]
systemctl reload nginx
curl -fsS https://sllm.kyurururn.net/credits.html | grep -Fq 'S-LLM'
[[ $(curl -s -o /dev/null -w '%{http_code}' https://sllm.kyurururn.net/admin) == 404 ]]
[[ $(curl -s -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' -d '{}' https://sllm.kyurururn.net/api/llm) == 403 ]]
trap - ERR INT TERM
printf 'Published %s\nPrevious release: %s\nConfig backup: %s\n' "$release_id" "$previous" "$backup"
