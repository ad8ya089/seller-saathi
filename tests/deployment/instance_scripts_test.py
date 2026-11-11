"""Execute the real rollout scripts with a hermetic fake command PATH, never AWS/Docker."""
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).parents[2]
SHA = 'a' * 40
COMMON = r"""set -euo pipefail
fail() { printf '%s\n' "$1" >&2; exit 1; }
require_root() { :; }
preflight_host() { :; }
capacity() { :; }
validate_caddy() { :; }
healthy() { return 0; }
configure() {
 DEPLOY_DIR=$CASE_DIR
 DEPLOY_BRANCH=main
 REPO_URL=https://github.com/ad8ya089/seller-saathi.git
 COMPOSE_PROJECT_NAME=fixture
 APP_ENV_FILE=$CASE_DIR/.env
 compose=(docker compose)
}
"""
GIT = r"""#!/usr/bin/env bash
printf 'git %s\n' "$*" >> "$COMMAND_LOG"
case "$*" in
 'status --porcelain') ;;
 'remote get-url origin') echo https://github.com/ad8ya089/seller-saathi.git ;;
 'rev-parse FETCH_HEAD') printf '%040d\n' 0 | tr 0 a ;;
 'fetch --no-tags origin main'|'merge-base --is-ancestor HEAD '*|'merge --ff-only '*) ;;
 *) exit 71 ;;
esac
"""
DOCKER = r"""#!/usr/bin/env bash
printf 'docker %s image=%s\n' "$*" "${APP_IMAGE:-unset}" >> "$COMMAND_LOG"
case "$*" in
 'volume inspect fixture_kamdata') ;;
 'compose ps -q app') echo fixture-app ;;
 'compose ps -q caddy') ;;
 inspect*'/data'*) echo fixture_kamdata ;;
 inspect*'.Image'*) echo sha256:previous ;;
 'compose config --quiet') ;;
 'compose build app') [[ ${BUILD_FAIL:-0} != 1 ]] ;;
 'compose up '*)
   if [[ ${HEALTH_FAIL:-0} == 1 && ! -e $CASE_DIR/up-attempt ]]; then
     touch "$CASE_DIR/up-attempt"; exit 1
   fi ;;
 *) exit 72 ;;
esac
"""

class RolloutTests(unittest.TestCase):
    def execute(self, filename, **settings):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        scripts = root / 'deploy/aws-ec2'
        scripts.mkdir(parents=True)
        shutil.copy(ROOT / 'deploy/aws-ec2' / filename, scripts / filename)
        (scripts / 'common.sh').write_text(COMMON, encoding='utf-8', newline='\n')
        (root / 'bin').mkdir()
        for name, contents in [('git', GIT), ('docker', DOCKER), ('python3', '#!/usr/bin/env bash\nexit 1\n')]:
            file = root / 'bin' / name
            file.write_text(contents, encoding='utf-8', newline='\n')
            file.chmod(0o700)
        environment = dict(os.environ, CASE_DIR=root.as_posix(), COMMAND_LOG=(root / 'commands').as_posix(), EXPECTED_COMMIT=SHA)
        environment.update(settings)
        environment['PATH'] = str(root / 'bin') + os.pathsep + environment['PATH']
        command = [shutil.which('bash'), str(scripts / filename)]
        if filename == 'start-caddy.sh':
            command.append('203.0.113.1')
        result = subprocess.run(command, env=environment, capture_output=True, text=True, timeout=20)
        log = (root / 'commands').read_text() if (root / 'commands').exists() else ''
        return result, log

    def test_failed_build_keeps_running_app(self):
        result, log = self.execute('deploy.sh', BUILD_FAIL='1')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('compose build app', log)
        self.assertNotIn('compose up ', log)

    def test_wrong_expected_commit_fails_before_checkout_or_build(self):
        result, log = self.execute('deploy.sh', EXPECTED_COMMIT='b' * 40)
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('merge --ff-only', log)
        self.assertNotIn('compose build', log)

    def test_unhealthy_new_image_attempts_previous_image_rollback(self):
        result, log = self.execute('deploy.sh', HEALTH_FAIL='1')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('image=seller-saathi:' + SHA, log)
        self.assertIn('image=sha256:previous', log)
        self.assertEqual(log.count('compose up '), 2)

    def test_dns_failure_never_starts_caddy(self):
        result, log = self.execute('start-caddy.sh')
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('compose up ', log)

if __name__ == '__main__':
    unittest.main()
