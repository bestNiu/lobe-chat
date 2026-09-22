#!/usr/bin/env python3
"""Offline structural checks for this planning set; not product acceptance."""

import json
import re
import sys
import zipfile
from collections import Counter
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent.parent
errors = []


def require(condition, message):
    if not condition:
        errors.append(message)


def unique(items, label):
    duplicates = [item for item, count in Counter(items).items() if count > 1]
    require(not duplicates, f'{label}: duplicate IDs {duplicates}')


files = sorted(ROOT.rglob('*.md'))
for path in files:
    text = path.read_text(encoding='utf-8')
    fence = None
    language = ''
    block = []
    prose = []
    for line_no, line in enumerate(text.splitlines(), 1):
        marker = re.match(r'^\s*(`{3,}|~{3,})(.*)$', line)
        if fence is None:
            if marker:
                fence = marker.group(1)
                language = marker.group(2).strip()
                block = []
            else:
                prose.append(line)
        elif marker and marker.group(1)[0] == fence[0] and len(marker.group(1)) >= len(fence) and not marker.group(2).strip():
            if language == 'json':
                try:
                    json.loads('\n'.join(block))
                except json.JSONDecodeError as exc:
                    errors.append(f'{path.relative_to(ROOT)}:{line_no}: JSON: {exc}')
            fence = None
        else:
            block.append(line)
    require(fence is None, f'{path.relative_to(ROOT)}: unclosed fence')
    # Inline relative links only; external URLs and anchors are not fetched.
    for target in re.findall(r'\]\(([^)]+)\)', '\n'.join(prose)):
        if target.startswith(('./', '../')):
            local = unquote(target.split('#', 1)[0])
            require((path.parent / local).exists(), f'{path.relative_to(ROOT)}: missing link {local}')

spec_text = (ROOT / 'plan/01-mvp-development-milestone-specs.md').read_text()
spec_ids = re.findall(r'^\| (SPEC-M\d{2}-\d{3}) \|', spec_text, re.M)
unique(spec_ids, 'Spec')
for milestone in range(15):
    require(f'## M{milestone}：' in spec_text, f'missing milestone M{milestone}')
    prefix = f'SPEC-M{milestone:02d}-'
    numbers = sorted(int(item.rsplit('-', 1)[1]) for item in spec_ids if item.startswith(prefix))
    require(bool(numbers) and numbers == list(range(1, len(numbers) + 1)), f'{prefix}: missing/discontinuous IDs')

prd = (ROOT / '07-mvp-product-spec.md').read_text()
ac_ids = re.findall(r'^### (AC-\d{2}) ', prd, re.M)
fr_ids = re.findall(r'^### (FR-[A-Z]\d{2}) ', prd, re.M)
unique(ac_ids, 'AC')
unique(fr_ids, 'FR')
require(ac_ids == [f'AC-{n:02d}' for n in range(1, 34)], 'PRD AC sequence differs from 01..33')
matrix = (ROOT / 'plan/02-traceability-and-delivery-gates.md').read_text()
mapped = re.findall(r'^\| (AC-\d{2}) \|', matrix, re.M)
unique(mapped, 'AC mapping')
require(set(mapped) == set(ac_ids), 'AC mapping differs from PRD')

# Expand FR shorthand ranges in the dedicated FR mapping table.
details = (ROOT / 'plan/05-spec-design-and-verification-details.md').read_text()
covered = set()
for cell in re.findall(r'^\| (FR-[^|]+) \|', details, re.M):
    match = re.fullmatch(r'FR-([A-Z])(\d{2})(?:～(\d{2}))?', cell.strip())
    require(match is not None, f'unrecognized FR range: {cell}')
    if match:
        letter, start, end = match.groups()
        covered.update(f'FR-{letter}{n:02d}' for n in range(int(start), int(end or start) + 1))
require(covered == set(fr_ids), f'FR mapping mismatch: missing={set(fr_ids)-covered}, extra={covered-set(fr_ids)}')

known_specs = set(spec_ids)
for path in files:
    # Includes compact references such as M01-006～009 and M01-007/012.
    for match in re.finditer(r'(?<![A-Z0-9])(?:SPEC-)?M(\d{2})-(\d{3})(?:～(\d{3}))?((?:/\d{3})*)', path.read_text()):
        milestone, start, end, extra = match.groups()
        numbers = list(range(int(start), int(end or start) + 1))
        numbers.extend(int(n) for n in extra.split('/') if n)
        for number in numbers:
            spec = f'SPEC-M{milestone}-{number:03d}'
            require(spec in known_specs, f'{path.relative_to(ROOT)}: unknown {spec}')

for path in sorted((ROOT / 'know').iterdir()):
    if path.suffix in ('.docx', '.xlsx'):
        try:
            with zipfile.ZipFile(path) as archive:
                require(archive.testzip() is None, f'{path.name}: corrupt archive entry')
                entry = 'word/document.xml' if path.suffix == '.docx' else 'xl/workbook.xml'
                require(entry in archive.namelist(), f'{path.name}: missing {entry}')
        except (OSError, zipfile.BadZipFile) as exc:
            errors.append(f'{path.name}: {exc}')
    elif path.suffix == '.png':
        with path.open('rb') as image:
            require(image.read(8) == b'\x89PNG\r\n\x1a\n', f'{path.name}: invalid PNG signature')

if errors:
    print('\n'.join(errors), file=sys.stderr)
    sys.exit(1)
print(f'PASS: {len(files)} Markdown files, {len(spec_ids)} Specs, {len(ac_ids)} ACs, {len(fr_ids)} FRs; local links/fences/JSON/reference containers.')
print('Not checked: external links, anchor rendering, business facts, deployed APIs or runtime acceptance.')
