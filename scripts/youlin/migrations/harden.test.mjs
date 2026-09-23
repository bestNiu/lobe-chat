import assert from 'node:assert/strict';
import test from 'node:test';

import { hardenIdentityMigration } from './harden.mjs';

const table = 'CREATE TABLE "youlin_sample" ("id" uuid PRIMARY KEY);';

test('hardens generated tables, indexes and foreign keys without changing referenced users', () => {
  const input = [
    table,
    'CREATE UNIQUE INDEX "youlin_sample_unique" ON "youlin_sample" USING btree ("id");',
    'ALTER TABLE "youlin_sample" ADD CONSTRAINT "youlin_sample_user_fk" FOREIGN KEY ("id") REFERENCES "public"."users"("id");',
  ].join('--> statement-breakpoint');
  const output = hardenIdentityMigration(input);
  assert.match(output, /CREATE TABLE IF NOT EXISTS/);
  assert.match(output, /CREATE UNIQUE INDEX IF NOT EXISTS/);
  assert.match(output, /DROP CONSTRAINT IF EXISTS "youlin_sample_user_fk"/);
  assert.match(output, /REFERENCES "public"\."users"\("id"\)/);
});

test('refuses existing-table alteration not created by this additive migration', () => {
  assert.throws(
    () =>
      hardenIdentityMigration(
        `${table}--> statement-breakpoint ALTER TABLE "youlin_other" ADD CONSTRAINT "youlin_other_fk" FOREIGN KEY ("id") REFERENCES "public"."users"("id");`,
      ),
    /Unexpected generated DDL/,
  );
});

test('refuses destructive and unrelated generated deltas', () => {
  assert.throws(
    () => hardenIdentityMigration(`${table}--> statement-breakpoint DROP TABLE "users";`),
    /Unexpected generated DDL/,
  );
  assert.throws(
    () => hardenIdentityMigration('CREATE TABLE "unrelated" ("id" text);'),
    /No additive identity tables/,
  );
});

test('refuses empty input rather than emitting a fake successful migration', () => {
  assert.throws(() => hardenIdentityMigration(''), /No additive identity tables/);
});
