#!/usr/bin/env python3
"""Synthetic contract-design regression tests, not product acceptance."""

import unittest
from copy import deepcopy
from unittest.mock import patch

from jsonschema import Draft7Validator, ValidationError

from check_contracts import (
    EXAMPLES, EXPORTS, MAX_VERSION, SCHEMA, assert_local_refs,
    fixture_revocation_transition, main, validate,
)


class ContractDesignTests(unittest.TestCase):
    def sample(self, name):
        return deepcopy(EXAMPLES[name])

    def reject(self, name, value):
        with self.assertRaises((ValidationError, ValueError)):
            validate(name, value)

    def test_examples_and_consistency(self):
        main()

    def test_validation_requires_no_network(self):
        with patch('socket.socket', side_effect=AssertionError('Network forbidden')), \
                patch('socket.getaddrinfo', side_effect=AssertionError('DNS forbidden')):
            for name, value in EXAMPLES.items():
                Draft7Validator(SCHEMA).validate(value)
                validate(name, value)

    def test_root_schema_and_export_examples(self):
        self.assertEqual(set(EXAMPLES), set(EXPORTS))
        for value in EXAMPLES.values():
            Draft7Validator(SCHEMA).validate(value)

    def test_unknown_root_fields_rejected(self):
        for name in EXPORTS:
            with self.subTest(name=name):
                value = self.sample(name)
                value['accessToken'] = 'synthetic-not-a-token'
                self.reject(name, value)

    def test_missing_required_fields_rejected(self):
        for name in EXPORTS:
            for key in SCHEMA['definitions'][name]['required']:
                with self.subTest(name=name, key=key):
                    value = self.sample(name)
                    del value[key]
                    self.reject(name, value)

    def test_nested_actor_claim_rejected(self):
        value = self.sample('AccessIntent')
        value['scope']['roles'] = ['admin']
        self.reject('AccessIntent', value)

    def test_caller_identity_not_accepted_in_body(self):
        for name in ('RevocationCommand', 'AccessIntent'):
            value = self.sample(name)
            value['actor'] = {'id': 'synthetic-admin'}
            self.reject(name, value)

    def test_versions_are_bounded_integers(self):
        for bad in (-1, 1.5, True, '7', None, MAX_VERSION + 1):
            with self.subTest(bad=bad):
                value = self.sample('RevocationCommand')
                value['expectedEpoch'] = bad
                self.reject('RevocationCommand', value)

    def test_ids_are_bounded_nonempty_tokens(self):
        for bad in ('', 'x' * 129, 'with space', '../path', 'a\n', None):
            with self.subTest(bad=bad):
                value = self.sample('RevocationCommand')
                value['subjectRef']['id'] = bad
                self.reject('RevocationCommand', value)

    def test_unknown_action_rejected(self):
        value = self.sample('AccessIntent')
        value['action'] = 'superuser'
        self.reject('AccessIntent', value)

    def test_project_nullable_but_not_omittable(self):
        value = self.sample('AccessIntent')
        validate('AccessIntent', value)
        value['scope']['projectId'] = 'synthetic-project-a'
        validate('AccessIntent', value)
        del value['scope']['projectId']
        self.reject('AccessIntent', value)

    def test_versioned_resource_required(self):
        value = self.sample('AccessIntent')
        del value['resource']['version']
        self.reject('AccessIntent', value)

    def test_schema_cannot_resolve_external_or_unknown_refs(self):
        for ref in ('https://example.invalid/schema.json', '#/definitions/Missing'):
            with self.assertRaises(ValueError):
                assert_local_refs({'$ref': ref})

    def test_unknown_contract_fails(self):
        with self.assertRaises(ValueError):
            validate('Missing', {})

    def test_event_calendar_and_utc(self):
        for bad in ('2026-02-30T00:00:00Z', '2026-01-01T25:00:00Z',
                    '2026-01-01T00:00:00', '2026-01-01T00:00:00+08:00'):
            with self.subTest(bad=bad):
                value = self.sample('SubjectRevokedEvent')
                value['time'] = bad
                self.reject('SubjectRevokedEvent', value)

    def test_event_subject_must_match_payload(self):
        value = self.sample('SubjectRevokedEvent')
        value['subject'] = 'user/synthetic-other'
        self.reject('SubjectRevokedEvent', value)

    def test_producer_epoch_must_advance_exactly_once(self):
        for epoch in (6, 7, 9):
            value = self.sample('SubjectRevokedEvent')
            value['data']['authEpoch'] = epoch
            self.reject('SubjectRevokedEvent', value)

    def test_revocation_event_cannot_reenable(self):
        value = self.sample('SubjectRevokedEvent')
        value['data']['disabled'] = False
        self.reject('SubjectRevokedEvent', value)

    def test_event_profile_rejects_wrong_version(self):
        value = self.sample('SubjectRevokedEvent')
        value['specversion'] = '0.3'
        self.reject('SubjectRevokedEvent', value)

    def test_oracle_does_not_mutate_input(self):
        current = self.sample('RevocationState')
        result = fixture_revocation_transition(current, EXAMPLES['RevocationCommand'])
        self.assertEqual(current, EXAMPLES['RevocationState'])
        self.assertTrue(result['disabled'])
        self.assertEqual(result['authEpoch'], 8)

    def test_oracle_rejects_stale_source_or_conflicting_epoch(self):
        for key, bad in (('sourceVersion', 12), ('sourceVersion', 11), ('expectedEpoch', 6)):
            command = self.sample('RevocationCommand')
            command[key] = bad
            with self.assertRaises(ValueError):
                fixture_revocation_transition(EXAMPLES['RevocationState'], command)

    def test_oracle_rejects_subject_mismatch(self):
        command = self.sample('RevocationCommand')
        command['subjectRef']['id'] = 'synthetic-other'
        with self.assertRaises(ValueError):
            fixture_revocation_transition(EXAMPLES['RevocationState'], command)

    def test_epoch_does_not_wrap(self):
        current = self.sample('RevocationState')
        command = self.sample('RevocationCommand')
        current['authEpoch'] = command['expectedEpoch'] = MAX_VERSION
        with self.assertRaises(ValueError):
            fixture_revocation_transition(current, command)

    def test_shape_validation_does_not_authorize_foreign_workspace(self):
        # Deliberately passes: only a real PDP can reject this semantic attack.
        value = self.sample('AccessIntent')
        value['scope']['workspaceId'] = 'synthetic-foreign-workspace'
        validate('AccessIntent', value)

    def test_service_subject_uses_distinct_kind(self):
        value = self.sample('SubjectRevokedEvent')
        value['data']['subjectRef']['kind'] = 'service'
        value['subject'] = 'service/synthetic-user-01'
        validate('SubjectRevokedEvent', value)


if __name__ == '__main__':
    unittest.main()
