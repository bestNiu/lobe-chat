#!/usr/bin/env python3
"""Offline design checks ONLY. No authentication, authorization, DB or network IO.

The transition function is a fixture oracle, NOT a production revocation service.
Requires an existing Python environment with jsonschema >=3.2,<5 (Draft 7).
"""

import json
from copy import deepcopy
from datetime import datetime
from importlib.metadata import version
from pathlib import Path

from jsonschema import Draft7Validator

ROOT = Path(__file__).resolve().parent
SCHEMA = json.loads((ROOT / 'contracts.schema.json').read_text(encoding='utf-8'))
EXAMPLES = json.loads((ROOT / 'examples.json').read_text(encoding='utf-8'))
EXPORTS = ('RevocationCommand', 'RevocationState', 'AccessIntent', 'SubjectRevokedEvent')
MAX_VERSION = 9007199254740991


def assert_local_refs(value):
    """Reject external refs before validation; never fetch a schema from a URL."""
    if isinstance(value, dict):
        for key, child in value.items():
            if key == '$ref':
                if not isinstance(child, str) or not child.startswith('#/definitions/'):
                    raise ValueError('Only local definition references are allowed')
                name = child.removeprefix('#/definitions/')
                if name not in SCHEMA['definitions']:
                    raise ValueError('Unknown local definition')
            assert_local_refs(child)
    elif isinstance(value, list):
        for child in value:
            assert_local_refs(child)


assert_local_refs(SCHEMA)
Draft7Validator.check_schema(SCHEMA)


def validate(name, instance):
    """Validate shape, then the few explicitly modeled cross-field invariants.

    No inference of trust from passing this function. In particular, a valid
    AccessIntent can still target a foreign workspace and MUST be rejected by PDP.
    """
    if name not in EXPORTS:
        raise ValueError('Unknown contract export')
    validator = Draft7Validator({
        '$schema': SCHEMA['$schema'],
        'definitions': SCHEMA['definitions'],
        '$ref': '#/definitions/' + name,
    })
    validator.validate(instance)
    if name == 'SubjectRevokedEvent':
        # Draft 7 format=date-time is optional in many toolchains; explicitly
        # check the calendar here as well as the UTC-only pattern in the schema.
        datetime.fromisoformat(instance['time'].replace('Z', '+00:00'))
        data = instance['data']
        subject = data['subjectRef']
        if instance['subject'] != f"{subject['kind']}/{subject['id']}":
            raise ValueError('Event subject does not match payload')
        if data['authEpoch'] != data['previousEpoch'] + 1:
            raise ValueError('Producer transition must advance epoch by one')


def fixture_revocation_transition(current, command):
    """Pure expected-value oracle; no locking, persistence or idempotency store.

    A real service checks caller rights and an existing idempotency receipt FIRST,
    then performs CAS + deny + audit + outbox atomically. This does none of those.
    """
    validate('RevocationState', current)
    validate('RevocationCommand', command)
    if current['subjectRef'] != command['subjectRef']:
        raise ValueError('Subject mismatch')
    if command['expectedEpoch'] != current['authEpoch']:
        raise ValueError('Epoch conflict')
    if command['sourceVersion'] <= current['sourceVersion']:
        raise ValueError('Stale source version')
    if current['authEpoch'] == MAX_VERSION:
        raise ValueError('Epoch exhausted; never wrap')
    result = deepcopy(current)
    result.update(authEpoch=current['authEpoch'] + 1,
                  sourceVersion=command['sourceVersion'], disabled=True)
    validate('RevocationState', result)
    return result


def main():
    if set(EXAMPLES) != set(EXPORTS):
        raise ValueError('Examples must cover exactly the exported contracts')
    for name in EXPORTS:
        validate(name, EXAMPLES[name])
    result = fixture_revocation_transition(EXAMPLES['RevocationState'], EXAMPLES['RevocationCommand'])
    event = EXAMPLES['SubjectRevokedEvent']['data']
    if result != {key: event[key] for key in result}:
        raise ValueError('Synthetic command/state/event are inconsistent')
    print(f'PASS: 4 draft contract examples; jsonschema={version("jsonschema")}')
    print('NOT VERIFIED: identity, authorization, database atomicity, queue durability, runtime SLA.')


if __name__ == '__main__':
    main()
