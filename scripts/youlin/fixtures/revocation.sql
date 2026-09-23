-- Disposable PostgreSQL experiment ONLY. Not a Drizzle migration or production schema.
-- No application imports this file. The harness creates a network-isolated empty DB.
CREATE SCHEMA youlin_security_spike;
REVOKE ALL ON SCHEMA youlin_security_spike FROM PUBLIC;

CREATE TABLE youlin_security_spike.subject_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_kind text NOT NULL CHECK (subject_kind IN ('user', 'service')),
  subject_id varchar(128) NOT NULL CHECK (length(subject_id) > 0),
  auth_epoch bigint NOT NULL CHECK (auth_epoch BETWEEN 0 AND 9007199254740991),
  source_version bigint NOT NULL CHECK (source_version BETWEEN 0 AND 9007199254740991),
  disabled boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_kind, subject_id)
);

CREATE TABLE youlin_security_spike.audit_events (
  id uuid PRIMARY KEY,
  subject_state_id uuid NOT NULL REFERENCES youlin_security_spike.subject_states(id),
  actor_kind text NOT NULL,
  actor_id varchar(128) NOT NULL,
  reason_code text NOT NULL,
  request_id varchar(128) NOT NULL,
  previous_epoch bigint NOT NULL,
  auth_epoch bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE youlin_security_spike.outbox_events (
  id uuid PRIMARY KEY,
  audit_id uuid NOT NULL REFERENCES youlin_security_spike.audit_events(id),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE youlin_security_spike.command_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_kind text NOT NULL,
  actor_id varchar(128) NOT NULL,
  operation text NOT NULL CHECK (operation = 'revoke_subject'),
  idempotency_key varchar(128) NOT NULL,
  -- Canonical server-built JSONB, not a caller-supplied hash. Request/trace IDs
  -- are excluded so a network retry with a new request ID can replay the receipt.
  command jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (actor_kind, actor_id, operation, idempotency_key)
);

CREATE FUNCTION youlin_security_spike.read_subject_state(p_kind text, p_id text)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT jsonb_build_object(
    'subjectRef', jsonb_build_object('kind', subject_kind, 'id', subject_id),
    'authEpoch', auth_epoch, 'sourceVersion', source_version, 'disabled', disabled
  ) FROM youlin_security_spike.subject_states
  WHERE subject_kind = p_kind AND subject_id = p_id;
$$;

-- Invoker rights. This does NOT authenticate/authorize p_actor_*; a future
-- authenticated service must do that before every attempt, including replays.
CREATE FUNCTION youlin_security_spike.revoke_subject(
  p_actor_kind text, p_actor_id text, p_key text,
  p_subject_kind text, p_subject_id text,
  p_expected_epoch bigint, p_source_version bigint,
  p_reason text, p_request_id text
) RETURNS jsonb LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE
  current_state youlin_security_spike.subject_states%ROWTYPE;
  old_receipt youlin_security_spike.command_receipts%ROWTYPE;
  canonical_command jsonb;
  result jsonb;
  audit_id uuid := gen_random_uuid();
  event_id uuid := gen_random_uuid();
BEGIN
  IF p_actor_kind IS NULL OR p_actor_kind NOT IN ('user', 'service')
     OR p_subject_kind IS NULL OR p_subject_kind NOT IN ('user', 'service')
     OR p_actor_id IS NULL OR length(p_actor_id) NOT BETWEEN 1 AND 128
     OR p_subject_id IS NULL OR length(p_subject_id) NOT BETWEEN 1 AND 128
     OR p_key IS NULL OR length(p_key) NOT BETWEEN 1 AND 128
     OR p_request_id IS NULL OR length(p_request_id) NOT BETWEEN 1 AND 128
     OR p_expected_epoch IS NULL OR p_expected_epoch NOT BETWEEN 0 AND 9007199254740991
     OR p_source_version IS NULL OR p_source_version NOT BETWEEN 0 AND 9007199254740991
     OR p_reason IS NULL OR p_reason NOT IN ('employment_ended', 'security_response', 'administrative_disable') THEN
    RAISE EXCEPTION 'INVALID_COMMAND';
  END IF;

  canonical_command := jsonb_build_object(
    'subjectRef', jsonb_build_object('kind', p_subject_kind, 'id', p_subject_id),
    'expectedEpoch', p_expected_epoch, 'sourceVersion', p_source_version,
    'reasonCode', p_reason
  );

  -- Serialize the actor/operation/key before locking a subject, including when
  -- two requests reuse the key across different subjects. Hash collisions only
  -- cause extra serialization, never a false idempotency match.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    jsonb_build_array(p_actor_kind, p_actor_id, 'revoke_subject', p_key)::text, 0
  ));
  SELECT * INTO old_receipt FROM youlin_security_spike.command_receipts
    WHERE actor_kind = p_actor_kind AND actor_id = p_actor_id
      AND operation = 'revoke_subject' AND idempotency_key = p_key;
  IF FOUND THEN
    IF old_receipt.command IS DISTINCT FROM canonical_command THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN old_receipt.result;
  END IF;

  SELECT * INTO current_state FROM youlin_security_spike.subject_states
    WHERE subject_kind = p_subject_kind AND subject_id = p_subject_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SUBJECT_NOT_FOUND'; END IF;
  IF current_state.auth_epoch <> p_expected_epoch THEN RAISE EXCEPTION 'EPOCH_CONFLICT'; END IF;
  IF p_source_version <= current_state.source_version THEN RAISE EXCEPTION 'STALE_SOURCE'; END IF;
  IF current_state.auth_epoch = 9007199254740991 THEN RAISE EXCEPTION 'EPOCH_EXHAUSTED'; END IF;

  UPDATE youlin_security_spike.subject_states
    SET auth_epoch = current_state.auth_epoch + 1,
        source_version = p_source_version, disabled = true, updated_at = now()
    WHERE id = current_state.id;

  INSERT INTO youlin_security_spike.audit_events
    (id, subject_state_id, actor_kind, actor_id, reason_code, request_id, previous_epoch, auth_epoch)
    VALUES (audit_id, current_state.id, p_actor_kind, p_actor_id, p_reason,
            p_request_id, current_state.auth_epoch, current_state.auth_epoch + 1);

  INSERT INTO youlin_security_spike.outbox_events (id, audit_id, payload)
    VALUES (event_id, audit_id, jsonb_build_object(
      'specversion', '1.0', 'id', event_id::text,
      'source', '/youlin/identity', 'type', 'com.youlin.identity.subject.revoked.v1',
      'subject', p_subject_kind || '/' || p_subject_id,
      'time', to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'datacontenttype', 'application/json',
      'dataschema', 'https://schemas.youlin.invalid/design/identity-scope-events/0.1.json#/definitions/RevocationEventData',
      'correlationid', p_request_id,
      'data', jsonb_build_object(
        'subjectRef', jsonb_build_object('kind', p_subject_kind, 'id', p_subject_id),
        'previousEpoch', current_state.auth_epoch, 'authEpoch', current_state.auth_epoch + 1,
        'sourceVersion', p_source_version, 'disabled', true, 'auditRef', audit_id::text
      )
    ));

  result := jsonb_build_object(
    'subjectRef', jsonb_build_object('kind', p_subject_kind, 'id', p_subject_id),
    'authEpoch', current_state.auth_epoch + 1, 'auditId', audit_id::text, 'eventId', event_id::text
  );
  INSERT INTO youlin_security_spike.command_receipts
    (actor_kind, actor_id, operation, idempotency_key, command, result)
    VALUES (p_actor_kind, p_actor_id, 'revoke_subject', p_key, canonical_command, result);
  RETURN result;
END;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA youlin_security_spike FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA youlin_security_spike FROM PUBLIC;
