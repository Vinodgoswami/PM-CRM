import base from '@salescrm/eslint-config/base';

export default [
  ...base,
  {
    rules: {
      // NestJS dependency injection reads constructor parameter types via emitDecoratorMetadata.
      // `import type` erases those imports and silently breaks DI, so this rule is off here.
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
];
