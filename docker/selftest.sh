#!/bin/sh
# Egress self-test (WS-3f). Run through the entrypoint, so it executes as the
# unprivileged scan user with the rules in place:
#   docker compose -f docker/compose.yml run --rm --entrypoint /app/docker/egress.sh scan /app/docker/selftest.sh
# Exits 0 only if every blocked probe fails, the rules cannot be changed, and
# loopback still works. Makes no request to any public host.

set -u

failures=0

pass() { echo "PASS  $*"; }
fail() {
  echo "FAIL  $*"
  failures=$((failures + 1))
}

# Each probe must fail at once with "couldn't connect" (curl exit 7: refused or
# unreachable). A timeout (exit 28) is a failure too: it cannot tell a rejected
# packet from one that left the container and got no answer.
probe_blocked() {
  url="$1"
  out=$(curl -sS -m 3 -o /dev/null "$url" 2>&1)
  code=$?
  if [ "$code" -eq 7 ]; then
    pass "$url blocked ($out)"
  else
    fail "$url not rejected (curl exit $code: $out)"
  fi
}

echo "running as $(id -un) (uid $(id -u))"
[ "$(id -u)" != 0 ] && pass "not root" || fail "running as root"

probe_blocked http://169.254.169.254/
probe_blocked http://10.0.0.1/
probe_blocked http://172.16.0.1/
probe_blocked http://192.168.1.1/
probe_blocked http://100.64.0.1/
probe_blocked 'http://[fd00::1]/'
probe_blocked 'http://[fe80::1%25eth0]/'

# The scan user must not be able to change the rules.
if iptables -F OUTPUT 2>/dev/null; then fail "iptables -F OUTPUT succeeded"; else pass "iptables -F OUTPUT refused"; fi
if ip6tables -F OUTPUT 2>/dev/null; then fail "ip6tables -F OUTPUT succeeded"; else pass "ip6tables -F OUTPUT refused"; fi
if grep -q '^CapEff:[[:space:]]*0000000000000000$' /proc/self/status; then
  pass "no effective capabilities"
else
  fail "effective capabilities: $(grep '^CapEff' /proc/self/status)"
fi
if grep -q '^NoNewPrivs:[[:space:]]*1$' /proc/self/status; then pass "no_new_privs set"; else fail "no_new_privs not set"; fi

# Loopback must still work: the engine's egress proxy listens on 127.0.0.1.
node -e '
const net = require("node:net");
const srv = net.createServer((s) => s.end("ok")).listen(0, "127.0.0.1", () => {
  const c = net.connect(srv.address().port, "127.0.0.1");
  c.on("data", () => { c.destroy(); srv.close(); process.exit(0); });
  c.on("error", () => process.exit(1));
  setTimeout(() => process.exit(1), 3000);
});' && pass "loopback 127.0.0.1 works" || fail "loopback 127.0.0.1 broken"

if [ "$failures" -eq 0 ]; then
  echo "egress self-test: all checks passed"
  exit 0
fi
echo "egress self-test: $failures check(s) failed"
exit 1
