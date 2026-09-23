"""Structural validation of draft design metadata; never validates real approvals."""

import json
import re
from pathlib import Path

DESIGN = {'planned', 'draft', 'in_review', 'approved', 'superseded'}
DELIVERY = {'not_started', 'in_development', 'merged', 'in_verification', 'verified', 'accepted', 'released'}


def validate_spec_catalog(root: Path, wbs: dict, fr_ids: set, ac_ids: set) -> list[str]:
    errors = []

    def check(ok, message):
        if not ok:
            errors.append('Spec catalog: ' + message)

    base = root / 'plan/specs'
    try:
        catalog = json.loads((base / 'catalog.json').read_text(encoding='utf-8'))
    except (OSError, ValueError) as exc:
        return [f'Spec catalog: cannot read catalog: {exc}']
    if not isinstance(catalog, dict) or not isinstance(catalog.get('specs'), list):
        return ['Spec catalog: expected object with specs array']
    check(catalog.get('schemaVersion') == 1, 'unsupported schemaVersion')
    records = catalog['specs']
    contexts = catalog.get('milestoneContexts', {})
    if not isinstance(contexts, dict):
        return ['Spec catalog: milestoneContexts must be an object']
    check(set(contexts) == {f'M{m:02d}' for m in range(15)}, 'milestone contexts differ from M00..M14')
    for milestone, context in contexts.items():
        if not isinstance(context, dict):
            errors.append(f'Spec catalog: invalid context {milestone}')
            continue
        for field, known in [('frContext', fr_ids), ('acContext', ac_ids)]:
            values = context.get(field)
            check(isinstance(values, list) and bool(values) and all(isinstance(v, str) and v in known for v in values), f'{milestone}: invalid {field}')

    seen = set()
    paths = set()
    graph = {}
    for row in records:
        if not isinstance(row, dict) or not isinstance(row.get('specId'), str):
            errors.append('Spec catalog: record must have string specId')
            continue
        sid = row['specId']
        check(sid not in seen, f'duplicate {sid}')
        seen.add(sid)
        check(sid in wbs, f'unknown ID {sid}')
        check(row.get('title') == wbs.get(sid), f'{sid}: title differs from WBS')
        milestone = sid[5:8]
        check(row.get('milestone') == milestone, f'{sid}: wrong milestone')
        check(row.get('contextRef') == milestone, f'{sid}: wrong contextRef')
        design = row.get('designStatus')
        delivery = row.get('deliveryStatus')
        check(isinstance(design, str) and design in DESIGN, f'{sid}: invalid designStatus')
        check(isinstance(delivery, str) and delivery in DELIVERY, f'{sid}: invalid deliveryStatus')
        for field in ['accountableRole', 'designWindow', 'reviewWindow']:
            check(isinstance(row.get(field), str) and bool(row[field].strip()), f'{sid}: missing {field}')
        check(type(row.get('deliveryWeek')) is int and 1 <= row['deliveryWeek'] <= 32, f'{sid}: invalid deliveryWeek')
        for field in ['decisionRefs', 'contractRefs', 'specDependencies', 'blockedBy', 'schemaRefs', 'approvalEvidence', 'implementationEvidence', 'verificationEvidence', 'acceptanceEvidence', 'releaseEvidence']:
            check(isinstance(row.get(field), list), f'{sid}: {field} must be an array')
        decisions = row.get('decisionRefs', [])
        if isinstance(decisions, list):
            check(all(isinstance(v, str) and v in {f'D{n:02d}' for n in range(1, 18)} for v in decisions), f'{sid}: unknown decision')
        deps = row.get('specDependencies', [])
        if isinstance(deps, list):
            check(all(isinstance(v, str) and v in wbs and v != sid for v in deps), f'{sid}: invalid dependency')
            graph[sid] = [v for v in deps if isinstance(v, str) and v in wbs]
        contracts = row.get('contractRefs', [])
        if isinstance(contracts, list):
            for contract in contracts:
                valid = isinstance(contract, str) and contract in {f'K{n:02d}' for n in range(1, 9)}
                check(valid and len(list((base / 'contracts').glob(f'{contract}-*.md'))) == 1, f'{sid}: missing/invalid contract {contract}')
        refs = row.get('requirementRefs', {})
        if not isinstance(refs, dict):
            errors.append(f'Spec catalog: {sid}: invalid requirementRefs')
        else:
            for field, known in [('fr', fr_ids), ('ac', ac_ids)]:
                values = refs.get(field)
                check(isinstance(values, list) and all(isinstance(v, str) and v in known for v in values), f'{sid}: invalid requirementRefs.{field}')
                if design not in ('planned', 'superseded'):
                    check(bool(values), f'{sid}: detailed design needs {field} references')

        path = row.get('designPath')
        if path is None:
            check(design == 'planned', f'{sid}: non-planned design lacks file')
        elif isinstance(path, str):
            expected = f'{milestone}/{sid}.md'
            check(path == expected, f'{sid}: unexpected designPath')
            check(path not in paths, f'{sid}: duplicate path')
            paths.add(path)
            if path == expected and (base / path).is_file():
                text = (base / path).read_text(encoding='utf-8')
                check(text.startswith(f'# {sid}：{row.get("title")}\n'), f'{sid}: detail title mismatch')
                check(f'designStatus: {design}' in text and f'deliveryStatus: {delivery}' in text, f'{sid}: detail status mismatch')
                for heading in range(1, 9):
                    check(f'## {heading}. ' in text, f'{sid}: missing detail section {heading}')
                check(bool(re.search(rf'{re.escape(sid)}-T\d{{2}}', text)), f'{sid}: missing test cases')
            else:
                errors.append(f'Spec catalog: {sid}: missing detail file')
        else:
            errors.append(f'Spec catalog: {sid}: designPath must be string or null')

        # Presence is a structural gate only: an actual reviewer must validate evidence.
        if design == 'approved' or delivery != 'not_started':
            check(isinstance(row.get('owner'), str) and bool(row['owner'].strip()), f'{sid}: approval requires named owner')
            check(bool(row.get('approvalEvidence')), f'{sid}: approval requires evidence')
            check(row.get('blockedBy') == [], f'{sid}: approved/delivering with blockers')
            if milestone != 'M00':
                check(bool(row.get('schemaRefs')), f'{sid}: approval requires schemas or explicit reviewed N/A records')
        if delivery != 'not_started':
            check(design == 'approved', f'{sid}: delivery requires approved design')
        stages = ['merged', 'in_verification', 'verified', 'accepted', 'released']
        if delivery in stages:
            check(bool(row.get('implementationEvidence')), f'{sid}: missing implementation evidence')
        if delivery in ['verified', 'accepted', 'released']:
            check(bool(row.get('verificationEvidence')), f'{sid}: missing verification evidence')
        if delivery in ['accepted', 'released']:
            check(bool(row.get('acceptanceEvidence')), f'{sid}: missing acceptance evidence')
        if delivery == 'released':
            check(bool(row.get('releaseEvidence')), f'{sid}: missing release evidence')
    check(seen == set(wbs), 'coverage differs from WBS')
    actual_paths = {str(p.relative_to(base)) for p in base.glob('M*/SPEC-*.md')}
    check(actual_paths == paths, 'orphan/missing detail files')

    for milestone in contexts:
        if not re.fullmatch(r'M\d{2}', milestone):
            continue
        index_path = base / milestone / 'README.md'
        if not index_path.is_file():
            errors.append(f'Spec catalog: missing milestone index {milestone}')
            continue
        index_text = index_path.read_text(encoding='utf-8')
        subset = [row for row in records if isinstance(row, dict) and row.get('milestone') == milestone]
        indexed = re.findall(r'^\| \[?(SPEC-M\d{2}-\d{3})', index_text, re.M)
        check(len(indexed) == len(subset) and set(indexed) == {row.get('specId') for row in subset}, f'{milestone}: index coverage mismatch')
        for row in subset:
            line = next((line for line in index_text.splitlines() if line.startswith('| ') and row.get('specId', '') in line), '')
            check(f"| {row.get('designStatus')} |" in line, f"{row.get('specId')}: index status mismatch")

    active, done = set(), set()

    def visit(node):
        if node in active:
            errors.append(f'Spec catalog: dependency cycle at {node}')
            return
        if node in done:
            return
        active.add(node)
        for dep in graph.get(node, []):
            visit(dep)
        active.remove(node)
        done.add(node)

    for node in graph:
        visit(node)
    return errors
