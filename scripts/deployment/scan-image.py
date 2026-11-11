"""Scan a docker save archive and every decoded layer. Secrets arrive only on stdin."""
import gzip
import hashlib
import io
import json
import sys
import tarfile


def main():
    secrets = [value.encode() for value in json.load(sys.stdin) if value]
    if not secrets:
        raise SystemExit('Supply nonempty secret values privately on stdin')
    scanned = hits = layers = 0
    with tarfile.open(sys.argv[1]) as archive:
        for entry in archive:
            if not entry.isfile():
                continue
            raw = archive.extractfile(entry).read()
            scanned += 1
            hits += sum(raw.count(secret) for secret in secrets)
            # Docker Engine may export OCI gzip blobs or legacy layer.tar entries.
            decoded = gzip.decompress(raw) if raw[:2] == b'\x1f\x8b' else raw
            if decoded is not raw:
                hits += sum(decoded.count(secret) for secret in secrets)
            try:
                with tarfile.open(fileobj=io.BytesIO(decoded)) as layer:
                    layers += 1
                    for item in layer:
                        if item.isfile():
                            content = layer.extractfile(item).read()
                            hits += sum(content.count(secret) for secret in secrets)
            except tarfile.ReadError:
                pass
    digest = hashlib.file_digest(open(sys.argv[1], 'rb'), 'sha256').hexdigest() if hasattr(hashlib, 'file_digest') else 'not calculated (Python <3.11)'
    print(json.dumps({'archiveEntries': scanned, 'layers': layers, 'secretValues': len(secrets), 'hits': hits, 'archiveSha256': digest}))
    if hits or not layers:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
