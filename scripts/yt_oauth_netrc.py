#!/usr/bin/env python3
"""
yt-dlp OAuth netrc-cmd helper.
Called by yt-dlp before each request. Outputs netrc format with a fresh
OAuth access token, auto-refreshing using the long-lived refresh token.

Usage in yt-dlp:
  --netrc-cmd 'python3 /app/scripts/yt_oauth_netrc.py'

Cache files (mounted in container):
  /opt/arsenebot/oauth_tokens.json  — refresh_token + access_token
  /opt/arsenebot/oauth.json         — client_id + client_secret
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request

OAUTH_CFG = '/opt/arsenebot/oauth.json'
TOKEN_CACHE = '/opt/arsenebot/oauth_tokens.json'


def load_json(path):
    with open(path) as f:
        return json.load(f)


def save_json(path, data):
    tmp_path = f"{path}.tmp"
    with open(tmp_path, 'w') as f:
        json.dump(data, f, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp_path, path)


def get_fresh_access_token():
    """Return a valid access token, refreshing if needed."""
    cfg = load_json(OAUTH_CFG)['installed']
    tokens = load_json(TOKEN_CACHE)
    
    # Check if current token is still valid (with 60s buffer)
    if 'expires_at' in tokens and time.time() < tokens['expires_at'] - 60:
        return tokens['access_token']
    
    # Refresh the token
    data = urllib.parse.urlencode({
        'client_id': cfg['client_id'],
        'client_secret': cfg['client_secret'],
        'refresh_token': tokens['refresh_token'],
        'grant_type': 'refresh_token',
    }).encode()
    
    req = urllib.request.Request(cfg['token_uri'], data=data, method='POST')
    req.add_header('Content-Type', 'application/x-www-form-urlencoded')
    
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            new_tokens = json.loads(resp.read())
    except Exception as e:
        # If refresh fails, try the old token anyway
        sys.stderr.write(f"OAuth refresh failed: {e}\n")
        return tokens.get('access_token', '')
    
    tokens['access_token'] = new_tokens['access_token']
    tokens['expires_at'] = time.time() + new_tokens.get('expires_in', 3599)
    save_json(TOKEN_CACHE, tokens)
    return tokens['access_token']


def main():
    token = get_fresh_access_token()
    # yt-dlp netrc format for YouTube OAuth
    print("machine youtube login oauth2 password " + token)
    # Also output for yt-dlp's netrc-cmd which expects multi-line format
    sys.stderr.write(f"[oauth-netrc] token ready (len={len(token)})\n")


if __name__ == '__main__':
    main()
