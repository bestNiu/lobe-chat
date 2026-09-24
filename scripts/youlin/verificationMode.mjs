// Pure CLI selection. Parse before loading fixtures or allocating Docker resources.
export const parseVerificationMode = (args) => {
  const sqlSuite = args.includes('--sql');
  const artifactOptions = args.filter((arg) => arg.startsWith('--identity-artifacts='));
  const shardOptions = args.filter((arg) => arg.startsWith('--identity-shard='));
  const artifactOption = artifactOptions[0];
  const shardOption = shardOptions[0];
  const schemaOnly = args.includes('--schema-only');
  const identitySuite = args.includes('--identity') || artifactOption !== undefined;
  const identityShard = shardOption?.slice('--identity-shard='.length);
  if (
    new Set(args).size !== args.length ||
    artifactOptions.length > 1 ||
    shardOptions.length > 1 ||
    args.some(
      (arg) =>
        !['--sql', '--identity', '--schema-only'].includes(arg) &&
        arg !== artifactOption &&
        arg !== shardOption,
    ) ||
    (sqlSuite && identitySuite) ||
    (schemaOnly && !identitySuite) ||
    (shardOption !== undefined &&
      (!identitySuite || schemaOnly || !/^[12]\/2$/.test(identityShard))) ||
    artifactOption === '--identity-artifacts='
  )
    throw new Error('Unknown or conflicting verification mode');
  return {
    artifactDirectory: artifactOption?.slice('--identity-artifacts='.length),
    identityShard,
    identitySuite,
    schemaOnly,
    sqlSuite,
  };
};
