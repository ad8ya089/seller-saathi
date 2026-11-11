#!/usr/bin/env python3
"""Compose-only dotenv preparation; plaintext is captured in-process, never printed."""
import argparse
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path

REQUIRED = ('GEMINI_API_KEY', 'SARVAM_API_KEY', 'TRUSTED_PROXY_TOKEN', 'INTERNAL_METRICS_TOKEN')
PREFIX = '/snapdeal-kam/'
DOMAIN = re.compile(r'(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}')


def encode(value):
    if not isinstance(value, str) or any(ord(c) < 32 or ord(c) == 127 for c in value):
        raise ValueError('Environment values must be single-line text')
    return json.dumps(value, ensure_ascii=False).replace('$', '$$')


def decode(value):
    if value.startswith('"'):
        return json.loads(value).replace('$$', '$')
    if value.startswith("'") and value.endswith("'"):
        return value[1:-1].replace("\\'", "'")
    return value


def load(path):
    values = {}
    for line in path.read_text(encoding='utf-8-sig').splitlines():
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        key, value = line.split('=', 1)
        key = key.strip()
        if not re.fullmatch(r'[A-Z][A-Z0-9_]*', key) or key in values:
            raise ValueError('Invalid or repeated environment name')
        values[key] = decode(value.strip())
    return values


def prepare(defaults, parameters, domain, include_demo=False, existing=None):
    if not DOMAIN.fullmatch(domain):
        raise ValueError('Use a DNS hostname, without a scheme or port')
    names = REQUIRED + (('DEMO_ACCESS_CODE',) if include_demo else ())
    required = {PREFIX + name for name in names}
    received = {p['Name']: p for p in parameters}
    if set(received) != required or len(parameters) != len(required):
        raise ValueError('Missing or unexpected parameter')
    values = dict(defaults)
    values.update({key: value for key, value in (existing or {}).items() if key in defaults})
    if not include_demo:
        values["DEMO_ACCESS_CODE"] = ""
    for name in names:
        parameter = received[PREFIX + name]
        if parameter['Type'] != 'SecureString' or not parameter['Value'].strip():
            raise ValueError('All required parameters must be nonempty SecureString')
        encode(parameter['Value'])
        values[name] = parameter['Value']
    values.update(NODE_ENV='production', PORT='3000', HOSTNAME='0.0.0.0',
                  DATA_DIR='/data', MOCK_DATA_DIR='/app/data', DOMAIN=domain,
                  LOG_TRANSCRIPTS='false')
    return values


def atomic_write(path, values):
    contents = ''.join(key + '=' + encode(value) + '\n' for key, value in values.items())
    fd, temporary = tempfile.mkstemp(prefix='.env.next-', dir=path.parent)
    try:
        os.fchmod(fd, 0o600) if hasattr(os, 'fchmod') else None
        with os.fdopen(fd, 'w', encoding='utf-8', newline='\n') as stream:
            stream.write(contents)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--defaults', type=Path, required=True)
    parser.add_argument('--domain', required=True)
    parser.add_argument('--existing', type=Path)
    parser.add_argument('--region', default='ap-south-1')
    parser.add_argument('--include-demo-code', action='store_true')
    args = parser.parse_args()
    try:
        names = REQUIRED + (('DEMO_ACCESS_CODE',) if args.include_demo_code else ())
        result = subprocess.run(['aws', 'ssm', 'get-parameters', '--region', args.region,
                                 '--names', *(PREFIX + name for name in names),
                                 '--with-decryption', '--output', 'json', '--no-cli-pager'],
                                capture_output=True, text=True, check=True, timeout=30)
        payload = json.loads(result.stdout)
        if payload.get('InvalidParameters'):
            raise ValueError('Required parameter unavailable')
        values = prepare(load(args.defaults), payload['Parameters'], args.domain, args.include_demo_code, load(args.existing) if args.existing else None)
        atomic_write(args.output, values)
    except (ValueError, KeyError, OSError, subprocess.SubprocessError):
        raise SystemExit('Environment preparation failed; check names, SecureString types and scoped SSM/KMS permissions. Values were not printed.') from None
    print('Private Compose environment written atomically (0600).')


if __name__ == '__main__':
    main()
