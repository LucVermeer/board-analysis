const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

const existingEnhanceMiddleware = config.server?.enhanceMiddleware;

function nullableEnv(name) {
  const value = process.env[name];
  return value && value.length > 0 ? value : null;
}

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
}

config.server = {
  ...config.server,
  enhanceMiddleware: (middleware, server) => {
    const enhancedMiddleware = existingEnhanceMiddleware ? existingEnhanceMiddleware(middleware, server) : middleware;

    return (request, response, next) => {
      const pathName = request.url?.split('?')[0];
      if (pathName === '/_boardsesh/metro-info') {
        sendJson(response, 200, {
          version: 1,
          branchName: nullableEnv('BOARDSESH_DEV_BRANCH_NAME'),
          commitSha: nullableEnv('BOARDSESH_DEV_COMMIT_SHA'),
          rootDir: nullableEnv('BOARDSESH_DEV_ROOT_DIR'),
          label: nullableEnv('BOARDSESH_DEV_WORKTREE_LABEL'),
          port: process.env.BOARDSESH_METRO_PORT ? Number(process.env.BOARDSESH_METRO_PORT) : null,
          startedAt: nullableEnv('BOARDSESH_DEV_STARTED_AT'),
          qaNotes: nullableEnv('BOARDSESH_DEV_QA_NOTES'),
          qaNotesFilePath: nullableEnv('BOARDSESH_DEV_QA_NOTES_FILE'),
        });
        return;
      }

      enhancedMiddleware(request, response, next);
    };
  },
};

module.exports = config;
