/** Review-time hardening for generated additive Youlin DDL, not a parser for untrusted SQL. */
export const hardenIdentityMigration = (generated) => {
  const statements = generated
    .split('--> statement-breakpoint')
    .map((value) => value.trim())
    .filter(Boolean);
  const tables = new Set(
    statements
      .map((statement) => /^CREATE TABLE "(youlin_\w+)" \(/.exec(statement)?.[1])
      .filter(Boolean),
  );
  if (!tables.size) throw new Error('No additive identity tables found');
  const hardened = statements.map((statement) => {
    if (/^CREATE TABLE "youlin_\w+" \(/.test(statement))
      return statement.replace('CREATE TABLE ', 'CREATE TABLE IF NOT EXISTS ');
    const index = /^CREATE (?:UNIQUE )?INDEX "youlin_\w+" ON "(youlin_\w+)" /.exec(statement);
    if (index && tables.has(index[1]))
      return statement.replace(/^(CREATE (?:UNIQUE )?INDEX) /, '$1 IF NOT EXISTS ');
    const constraint =
      /^ALTER TABLE "(youlin_\w+)" ADD CONSTRAINT "(youlin_\w+)" FOREIGN KEY /.exec(statement);
    if (constraint && tables.has(constraint[1]))
      return `ALTER TABLE "${constraint[1]}" DROP CONSTRAINT IF EXISTS "${constraint[2]}";\n--> statement-breakpoint\n${statement}`;
    throw new Error('Unexpected generated DDL; manual scope review is required');
  });
  return `${hardened.join('\n--> statement-breakpoint\n')}\n`;
};
