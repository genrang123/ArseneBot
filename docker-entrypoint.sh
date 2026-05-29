#!/bin/sh
set -eu

cookie_file="${YOUTUBE_COOKIE_FILE:-/app/cookies.txt}"

if [ -n "${YOUTUBE_COOKIE:-}" ]; then
  python3 - <<'PY'
import json
import os

cookie_file = os.environ.get('YOUTUBE_COOKIE_FILE', '/app/cookies.txt')
cookies = json.loads(os.environ['YOUTUBE_COOKIE'])
with open(cookie_file, 'w', encoding='utf-8') as f:
    f.write('# Netscape HTTP Cookie File\n')
    for cookie in cookies:
        domain = cookie['domain']
        include_subdomains = 'TRUE' if domain.startswith('.') else 'FALSE'
        path = cookie.get('path', '/')
        secure = 'TRUE' if cookie.get('secure') else 'FALSE'
        expires = int(cookie.get('expirationDate', 0))
        name = cookie['name']
        value = cookie['value']
        f.write(f'{domain}\t{include_subdomains}\t{path}\t{secure}\t{expires}\t{name}\t{value}\n')
PY
  chmod 600 "$cookie_file"
fi

# Do not auto-run Playwright at boot: it adds noisy logs and can race on the
# Chromium profile lock. Refresh auth via the scheduled job or manual trigger.
exec node src/index.js
