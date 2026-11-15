"""The deployed JavaScript adapter must preserve the canonical Python ranking."""
import json
import subprocess
import sys
import shutil
from pathlib import Path
import pytest

from app.retrieval import Index

ROOT = Path(__file__).resolve().parents[2]


def test_web_snapshot_is_current_and_ranking_matches_python():
    subprocess.run([sys.executable, 'scripts/export_web.py', '--check'],
                   cwd=ROOT/'backend', check=True)
    if not shutil.which('node'):
        pytest.skip('Node 20+ is needed for the cross-runtime ranking check')
    questions = ['exercise fitness', 'sleep irregular schedules', 'isolation confinement',
                 'crew teamwork', 'OSDR datasets', 'OSD-946', 'bed rest exercise study',
                 'What is the capital of France?', 'exercising muscles']
    script = """import {readFileSync} from 'node:fs';
    import {retrieve} from './web/research.mjs';
    const questions=JSON.parse(readFileSync(0,'utf8'));
    const corpus=JSON.parse(readFileSync('web/research-data.json','utf8'));
    console.log(JSON.stringify(questions.map(q=>retrieve(q,corpus).map(h=>h.chunk.chunkId))));"""
    actual = json.loads(subprocess.check_output(['node','--input-type=module','-e',script],
                                                input=json.dumps(questions), text=True, cwd=ROOT))
    index = Index.load(ROOT/'backend/sources/manifest.json', ROOT/'backend/sources/chunks.jsonl')
    assert actual == [[hit.chunk.chunk_id for hit in index.search(q,4,1.0)] for q in questions]
