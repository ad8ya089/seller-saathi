import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const statement = z.object({
  Effect: z.enum(['Allow', 'Deny']),
  Action: z.array(z.string()),
  Resource: z.array(z.string()).optional(),
  NotResource: z.array(z.string()).optional(),
});

describe('deployment preparation without AWS or Docker', () => {
  it('restricts parameter reads even when the SSM managed policy grants wildcard reads', async () => {
    const policy = z
      .object({ Statement: z.array(statement) })
      .parse(
        JSON.parse(
          await readFile(
            'deploy/aws-ec2/instance-policy.template.json',
            'utf8',
          ),
        ) as unknown,
      );
    const allow = policy.Statement.find((s) => s.Effect === 'Allow');
    const deny = policy.Statement.find((s) => s.Effect === 'Deny');
    expect(allow?.Resource).toHaveLength(5);
    expect(deny?.NotResource).toEqual(allow?.Resource);
    const effective = (resource: string): boolean =>
      !(deny?.NotResource && !deny.NotResource.includes(resource));
    for (const resource of allow?.Resource ?? [])
      expect(effective(resource)).toBe(true);
    expect(
      effective(
        'arn:aws:ssm:ap-south-1:123456789012:parameter/another-app/key',
      ),
    ).toBe(false);
    expect(
      effective(
        'arn:aws:ssm:${AWS_REGION}:${AWS_ACCOUNT_ID}:parameter/snapdeal-kam/unrelated',
      ),
    ).toBe(false);
    expect(allow?.Action).not.toContain('ssm:GetParametersByPath');
  });
  it('tests atomic private Compose environments and DNS disagreement with Python stdlib', () => {
    const result = spawnSync(
      process.platform === 'win32' ? 'python' : 'python3',
      ['tests/deployment/envfile_test.py'],
      { encoding: 'utf8' },
    );
    expect(result.stderr, result.stdout).toContain('OK');
    expect(result.status).toBe(0);
  }, 30000);
  it('keeps a running image on build failure, verifies pins, rolls back failed health and gates DNS', () => {
    const result = spawnSync(
      process.platform === 'win32' ? 'python' : 'python3',
      ['tests/deployment/instance_scripts_test.py'],
      { encoding: 'utf8' },
    );
    expect(result.stderr, result.stdout).toContain('OK');
    expect(result.status).toBe(0);
  }, 120000);
});
