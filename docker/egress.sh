#!/bin/sh
# Container entrypoint (WS-3f, plan section 4): network-level egress rules,
# then the command as the unprivileged scan user.
#
# The engine's guard (src/guard.ts) and egress proxy (src/egress.ts) already
# refuse private addresses, but an app-level check can be beaten (DNS
# rebinding, a bug, a code path that skips the proxy). These rules make the
# kernel reject the same ranges for every process in the container.
#
# Fails closed: if any rule cannot be installed, the script exits non-zero and
# the command never runs. The ranges below must cover BLOCKED_IPV4 and
# BLOCKED_IPV6 in src/guard.ts; test/egress.test.ts checks that.
#
# Usage: egress.sh <command> [args...]
#        egress.sh /app/docker/selftest.sh   (checks the rules, see README)

set -eu

SCAN_USER="${SCAN_USER:-pwuser}"

# One range per line. Keep in step with src/guard.ts (the test enforces it).
BLOCKED_IPV4="
0.0.0.0/8
10.0.0.0/8
100.64.0.0/10
127.0.0.0/8
169.254.0.0/16
172.16.0.0/12
192.0.0.0/24
192.0.2.0/24
192.88.99.0/24
192.168.0.0/16
198.18.0.0/15
198.51.100.0/24
203.0.113.0/24
224.0.0.0/4
240.0.0.0/4
"

BLOCKED_IPV6="
::/128
::1/128
::ffff:0:0/96
64:ff9b::/96
64:ff9b:1::/48
100::/64
2001::/32
2001:db8::/32
2002::/16
fc00::/7
fe80::/10
ff00::/8
"

die() {
  echo "egress.sh: $*" >&2
  exit 1
}

[ "$#" -gt 0 ] || die "no command given"
[ "$(id -u)" = 0 ] || die "must start as root to install egress rules (is the image's USER changed?)"
id "$SCAN_USER" >/dev/null 2>&1 || die "scan user $SCAN_USER does not exist"

# $1: iptables or ip6tables. $2: ranges. $3: allow-list tail rule (optional).
install_rules() {
  tool="$1"
  ranges="$2"
  # Start from a known state, in case the container is restarted.
  "$tool" -F OUTPUT || die "$tool: cannot flush OUTPUT (missing NET_ADMIN?)"
  # Loopback first: the per-context egress proxy listens on 127.0.0.1 and
  # Docker's embedded DNS is 127.0.0.11. Rejecting 127.0.0.0/8 / ::1 below
  # then only affects packets that would leave through a real interface.
  "$tool" -A OUTPUT -o lo -j ACCEPT || die "$tool: cannot allow loopback"
  for range in $ranges; do
    reject "$tool" -d "$range"
  done
}

# Two rules per destination: TCP gets a reset, so a blocked connection fails
# at once (ICMPv6 errors are rate-limited to one a second, which turns a
# rejected IPv6 SYN into a slow timeout); everything else gets the default
# ICMP port-unreachable.
reject() {
  tool="$1"
  shift
  "$tool" -A OUTPUT "$@" -p tcp -j REJECT --reject-with tcp-reset || die "$tool: cannot reject TCP $*"
  "$tool" -A OUTPUT "$@" -j REJECT || die "$tool: cannot reject $*"
}

install_rules iptables "$BLOCKED_IPV4"
install_rules ip6tables "$BLOCKED_IPV6"
# The guard allows only global unicast IPv6 (2000::/3); mirror that too.
reject ip6tables ! -d 2000::/3

# Count what is in place, so a silently ignored rule still fails closed.
want4=$((2 * $(echo "$BLOCKED_IPV4" | grep -c .) + 1))
want6=$((2 * $(echo "$BLOCKED_IPV6" | grep -c .) + 3))
have4=$(iptables -S OUTPUT | grep -c '^-A OUTPUT')
have6=$(ip6tables -S OUTPUT | grep -c '^-A OUTPUT')
[ "$have4" -eq "$want4" ] || die "iptables: expected $want4 OUTPUT rules, found $have4"
[ "$have6" -eq "$want6" ] || die "ip6tables: expected $want6 OUTPUT rules, found $have6"
echo "egress.sh: $have4 IPv4 and $have6 IPv6 OUTPUT rules installed; dropping to $SCAN_USER" >&2

# Drop to the scan user with no capabilities and no way to regain them, so the
# scan (and anything a page gets Chromium to do) cannot change the rules.
exec setpriv --reuid="$SCAN_USER" --regid="$SCAN_USER" --init-groups \
  --no-new-privs --inh-caps=-all --bounding-set=-all -- "$@"
