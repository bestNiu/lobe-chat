"""Offline regression tests using temporary copies; no production or network I/O."""

import json
import re
import shutil
import tempfile
import unittest
from pathlib import Path

from validate_spec_catalog import validate_spec_catalog

ROOT = Path(__file__).resolve().parent.parent


class CatalogValidationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        wbs = (ROOT / 'plan/01-mvp-development-milestone-specs.md').read_text()
        cls.wbs = dict(re.findall(r'^\| (SPEC-M\d{2}-\d{3}) \| ([^|]+?) \|', wbs, re.M))
        prd = (ROOT / '07-mvp-product-spec.md').read_text()
        cls.fr = set(re.findall(r'^### (FR-[A-Z]\d{2}) ', prd, re.M))
        cls.ac = set(re.findall(r'^### (AC-\d{2}) ', prd, re.M))

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        shutil.copytree(ROOT / 'plan/specs', self.root / 'plan/specs')
        self.path = self.root / 'plan/specs/catalog.json'
        self.catalog = json.loads(self.path.read_text())

    def errors(self):
        self.path.write_text(json.dumps(self.catalog, ensure_ascii=False))
        return validate_spec_catalog(self.root, self.wbs, self.fr, self.ac)

    def assert_error(self, fragment):
        self.assertTrue(any(fragment in e for e in self.errors()), fragment)

    def test_baseline(self):
        self.assertEqual(self.errors(), [])

    def test_missing_and_duplicate(self):
        self.catalog['specs'][-1] = self.catalog['specs'][0].copy()
        self.assert_error('duplicate')
        self.assert_error('coverage differs')

    def test_status_cannot_fake_approval(self):
        self.catalog['specs'][0]['designStatus'] = 'approved'
        self.assert_error('approval requires named owner')
        self.assert_error('approval requires evidence')
        self.assert_error('with blockers')

    def test_detail_and_metadata_must_match(self):
        self.catalog['specs'][0]['designStatus'] = 'in_review'
        self.assert_error('detail status mismatch')

    def test_missing_design_file(self):
        (self.root / 'plan/specs' / self.catalog['specs'][0]['designPath']).unlink()
        self.assert_error('missing detail file')

    def test_bad_references(self):
        row = self.catalog['specs'][0]
        row['decisionRefs'] = ['D99']
        row['contractRefs'] = ['K99']
        row['requirementRefs']['ac'] = ['AC-99']
        self.assert_error('unknown decision')
        self.assert_error('missing/invalid contract')
        self.assert_error('invalid requirementRefs.ac')

    def test_dependency_cycle(self):
        a, b = self.catalog['specs'][:2]
        a['specDependencies'] = [b['specId']]
        b['specDependencies'] = [a['specId']]
        self.assert_error('dependency cycle')

    def test_verified_requires_separate_evidence(self):
        self.catalog['specs'][0]['deliveryStatus'] = 'verified'
        self.assert_error('delivery requires approved design')
        self.assert_error('missing implementation evidence')
        self.assert_error('missing verification evidence')

    def test_path_cannot_escape_workspace(self):
        self.catalog['specs'][0]['designPath'] = '../../README.md'
        self.assert_error('unexpected designPath')

    def test_malformed_record(self):
        self.catalog['specs'][0] = None
        self.assert_error('record must have string specId')


if __name__ == '__main__':
    unittest.main()
