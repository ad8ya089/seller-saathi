import importlib.util
import json
import sys
import os
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('envfile', Path(__file__).parents[2] / 'deploy/aws-ec2/envfile.py')
envfile = importlib.util.module_from_spec(spec)
spec.loader.exec_module(envfile)
sys.path.insert(0, str(Path(__file__).parents[2] / 'deploy/aws-ec2'))
from dns_gate import matches

class EnvironmentTests(unittest.TestCase):
    def test_dns_gate_rejects_extra_missing_ipv6_and_invalid_expected(self):
        self.assertTrue(matches('203.0.113.1', {'203.0.113.1'}))
        for addresses in [set(), {'203.0.113.2'}, {'203.0.113.1', '203.0.113.2'}, {'203.0.113.1', '::1'}]:
            self.assertFalse(matches('203.0.113.1', addresses))
        with self.assertRaises(ValueError):
            matches('not-an-address', {'203.0.113.1'})

    def test_compose_literal_roundtrip_and_controls(self):
        value = 'literal$part#value"with\\slash'
        self.assertEqual(envfile.decode(envfile.encode(value)), value)
        for bad in ['line\nfeed', 'carriage\rreturn', 'nul\0byte']:
            with self.assertRaises(ValueError):
                envfile.encode(bad)

    def test_current_defaults_and_required_securestrings(self):
        defaults = envfile.load(Path(__file__).parents[2] / '.env.example')
        parameters = [{'Name': '/snapdeal-kam/' + name, 'Type': 'SecureString', 'Value': 'synthetic-' + name} for name in envfile.REQUIRED]
        values = envfile.prepare(defaults, parameters, 'seller.example.test')
        self.assertEqual(values['SARVAM_STT_MODEL'], 'saaras:v4')
        self.assertEqual(values['SARVAM_TTS_MODEL'], 'bulbul:v4-flash')
        self.assertEqual(values['DATA_DIR'], '/data')
        self.assertEqual(values['NODE_ENV'], 'production')
        self.assertEqual(values['DOMAIN'], 'seller.example.test')
        self.assertEqual(values['LOG_TRANSCRIPTS'], 'false')
        preserved = envfile.prepare(defaults, parameters, 'seller.example.test', existing={'DAILY_TURN_CAP': '20', 'GEMINI_MODEL': 'operator-choice'})
        self.assertEqual(preserved['DAILY_TURN_CAP'], '20')
        self.assertEqual(preserved['GEMINI_MODEL'], 'operator-choice')
        for wrong in [parameters[:-1], [dict(p, Type='String') for p in parameters]]:
            with self.assertRaises(ValueError):
                envfile.prepare(defaults, wrong, 'seller.example.test')
        with self.assertRaises(ValueError):
            envfile.prepare(defaults, parameters, 'https://evil/path')

    def test_atomic_replace_is_private_and_preserves_existing_on_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / '.env'
            envfile.atomic_write(path, {'KEY': 'first'})
            envfile.atomic_write(path, {'KEY': 'second$literal'})
            self.assertEqual(envfile.load(path), {'KEY': 'second$literal'})
            if os.name == 'posix':
                self.assertEqual(path.stat().st_mode & 0o077, 0)
            with self.assertRaises(ValueError):
                envfile.atomic_write(path, {'KEY': 'bad\nline'})
            self.assertEqual(envfile.load(path), {'KEY': 'second$literal'})

if __name__ == '__main__':
    unittest.main()
