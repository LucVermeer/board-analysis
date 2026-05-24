import assert from 'node:assert/strict';
import { test } from 'node:test';
import { capturePreviousDeployment, findNewDeployment } from './railway-deployment-status.mjs';

void test('finds only a deployment newer than the captured previous deployment', () => {
  const previous = capturePreviousDeployment({
    deployments: [
      { id: 'deploy-2', status: 'SUCCESS', createdAt: '2026-05-31T10:00:00.000Z' },
      { id: 'deploy-1', status: 'SUCCESS', createdAt: '2026-05-31T09:00:00.000Z' },
    ],
  });

  assert.deepEqual(
    findNewDeployment(
      {
        deployments: [
          { id: 'deploy-2', status: 'SUCCESS', createdAt: '2026-05-31T10:00:00.000Z' },
          { id: 'deploy-1', status: 'SUCCESS', createdAt: '2026-05-31T09:00:00.000Z' },
        ],
      },
      previous,
    ),
    { id: '', status: '', createdAt: '' },
  );

  assert.deepEqual(
    findNewDeployment(
      {
        deployments: [
          { id: 'deploy-3', status: 'BUILDING', createdAt: '2026-05-31T10:01:00.000Z' },
          { id: 'deploy-2', status: 'SUCCESS', createdAt: '2026-05-31T10:00:00.000Z' },
          { id: 'deploy-1', status: 'SUCCESS', createdAt: '2026-05-31T09:00:00.000Z' },
        ],
      },
      previous,
    ),
    { id: 'deploy-3', status: 'BUILDING', createdAt: '2026-05-31T10:01:00.000Z' },
  );
});

void test('fails explicitly when the previous Railway deployment cannot be captured', () => {
  assert.throws(
    () => capturePreviousDeployment({ deployments: [] }),
    /could not capture previous Railway deployment ID/,
  );
});
