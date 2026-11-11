#!/usr/bin/env python3
"""Fail closed on any unexpected A or AAAA address, including resolver disagreement."""
import ipaddress
import socket
import subprocess
import sys
from pathlib import Path
from envfile import DOMAIN, load


def matches(expected, addresses):
    ipaddress.IPv4Address(expected)
    return bool(addresses) and {str(ipaddress.ip_address(a)) for a in addresses} == {expected}


def main():
    if len(sys.argv) != 3:
        raise SystemExit('Usage: dns_gate.py ENV_FILE EXPECTED_ELASTIC_IPV4')
    try:
        domain = load(Path(sys.argv[1]))['DOMAIN']
        if not DOMAIN.fullmatch(domain):
            raise ValueError('Invalid domain')
        expected = str(ipaddress.IPv4Address(sys.argv[2]))
        local = {a[4][0] for a in socket.getaddrinfo(domain, None, type=socket.SOCK_STREAM)}
        if not matches(expected, local):
            raise ValueError('Local DNS mismatch')
        for resolver in ('1.1.1.1', '8.8.8.8'):
            addresses = set()
            for record_type in ('A', 'AAAA'):
                result = subprocess.run(['dig', '+time=3', '+tries=1', '+short', '@' + resolver,
                                         domain, record_type], capture_output=True, text=True,
                                        check=True, timeout=8)
                for line in result.stdout.splitlines():
                    try:
                        addresses.add(str(ipaddress.ip_address(line)))
                    except ValueError:
                        pass  # A CNAME may precede the final address.
            if not matches(expected, addresses):
                raise ValueError('Public DNS mismatch')
    except (ValueError, KeyError, OSError, subprocess.SubprocessError):
        raise SystemExit('DNS gate failed; Caddy was not started. Check every A/AAAA answer and both public resolvers.') from None
    print('DNS gate passed: local and two public resolvers match the expected IPv4 only.')


if __name__ == '__main__':
    main()
