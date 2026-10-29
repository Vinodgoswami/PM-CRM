// Conventional commits: type(scope)?: subject — e.g. "feat(partners): partner portal MVP".
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', ['feat', 'fix', 'perf', 'refactor', 'security', 'docs', 'test', 'build', 'ci', 'chore', 'style', 'revert']],
    'subject-case': [0],
    'header-max-length': [2, 'always', 100],
    'body-max-line-length': [0],
  },
};
