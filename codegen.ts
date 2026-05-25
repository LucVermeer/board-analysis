import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: 'packages/shared-schema/src/generated/schema.graphql',
  ignoreNoDocuments: true,
  generates: {
    'packages/shared-schema/src/generated/types.ts': {
      plugins: [{ add: { content: '/* eslint-disable */' } }, 'typescript', 'typescript-resolvers'],
      config: {
        contextType: '../types#ConnectionContext',
        useIndexSignature: true,
        scalars: {
          JSON: 'unknown',
          DateTime: 'string',
        },
        enumsAsTypes: true,
      },
    },
    'packages/shared/graphql/src/generated/': {
      preset: 'client',
      documents: [
        'packages/shared/graphql/src/**/*.ts',
        '!packages/shared/graphql/src/generated/**',
        'packages/web/app/**/*.{ts,tsx}',
        '!packages/web/app/lib/graphql/**',
        '!packages/web/**/*.test.{ts,tsx}',
      ],
      presetConfig: {
        fragmentMasking: false,
      },
      config: {
        scalars: {
          JSON: 'unknown',
          DateTime: 'string',
        },
        enumsAsTypes: true,
      },
    },
  },
};

export default config;
