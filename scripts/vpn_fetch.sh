#!/usr/bin/env bash
# Run ONE fetch step through WireGuard with an IPv4/IPv6 firewall kill switch.
# GitHub Actions must only invoke this with USE_WIREGUARD=true and WG_CONFIG_B64 set.
set -euo pipefail
: "${WG_CONFIG_B64:?WG_CONFIG_B64 is required}"
if [[ "$(id -u)" == '0' ]]; then SUDO=''; else SUDO='sudo'; fi
$SUDO install -d -m 700 /etc/wireguard
printf %s "$WG_CONFIG_B64" | base64 -d | $SUDO tee /etc/wireguard/wg0.conf >/dev/null
$SUDO chmod 600 /etc/wireguard/wg0.conf
unset WG_CONFIG_B64
$SUDO wg-quick up wg0
RULES_ON=0
finish() {
  local result=$?
  if [[ "$RULES_ON" == '1' ]]; then
    $SUDO iptables -D OUTPUT -o lo -j ACCEPT 2>/dev/null || true
    $SUDO iptables -D OUTPUT -o wg0 -j ACCEPT 2>/dev/null || true
    $SUDO iptables -D OUTPUT -p udp -d "$ENDPOINT_IP" --dport "$ENDPOINT_PORT" -j ACCEPT 2>/dev/null || true
    $SUDO iptables -D OUTPUT -j REJECT 2>/dev/null || true
    $SUDO ip6tables -D OUTPUT -o lo -j ACCEPT 2>/dev/null || true
    $SUDO ip6tables -D OUTPUT -o wg0 -j ACCEPT 2>/dev/null || true
    $SUDO ip6tables -D OUTPUT -j REJECT 2>/dev/null || true
  fi
  $SUDO wg-quick down wg0 >/dev/null 2>&1 || true
  exit "$result"
}
trap finish EXIT
$SUDO wg show wg0 allowed-ips | grep -q '0.0.0.0/0' || { echo 'Full-tunnel WireGuard required' >&2; exit 1; }
endpoint=$($SUDO wg show wg0 endpoints | awk 'NR==1{print $2}')
# IPv4 endpoint is required for this firewall setup (no partial IPv6 allowance).
if [[ "$endpoint" =~ ^([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+):([0-9]+)$ ]]; then
 ENDPOINT_IP="${BASH_REMATCH[1]}"; ENDPOINT_PORT="${BASH_REMATCH[2]}"
else
 echo 'This runner supports only an IPv4 WireGuard peer endpoint' >&2; exit 1
fi
# Deny all non-tunnel output including IPv6; allow only VPN peer handshake & VPN interface.
$SUDO iptables -I OUTPUT 1 -j REJECT
RULES_ON=1
$SUDO iptables -I OUTPUT 1 -o wg0 -j ACCEPT
$SUDO iptables -I OUTPUT 1 -o lo -j ACCEPT
$SUDO iptables -I OUTPUT 1 -p udp -d "$ENDPOINT_IP" --dport "$ENDPOINT_PORT" -j ACCEPT
$SUDO ip6tables -I OUTPUT 1 -j REJECT
$SUDO ip6tables -I OUTPUT 1 -o wg0 -j ACCEPT
$SUDO ip6tables -I OUTPUT 1 -o lo -j ACCEPT
ip -4 route get 1.1.1.1 | grep -q 'dev wg0' || { echo 'VPN is not the default route' >&2; exit 1; }
# Fail if public egress has stopped; never fall back to ordinary network.
curl --fail --silent --show-error --max-time 25 https://api.ipify.org >/dev/null
python scripts/sync.py
