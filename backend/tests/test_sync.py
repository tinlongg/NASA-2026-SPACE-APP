import copy
import sqlite3
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture()
def setup(tmp_path, monkeypatch):
    database = tmp_path / 'sync.sqlite3'
    monkeypatch.setenv('CREW_SYNC_DB', str(database))
    return TestClient(create_app()), database


def pair(client):
    response = client.post('/sync/sessions')
    assert response.status_code == 201
    assert response.headers['cache-control'] == 'no-store'
    return {'Authorization': 'Bearer ' + response.json()['pairingCode']}


def snapshot():
    member = str(uuid4())
    return {'deviceID': str(uuid4()), 'monitoredCrewMemberID': member,
            'crew': [{'id': member, 'displayName': 'Demo crew', 'role': 'Commander',
                      'status': 'nominal', 'lastUpdated': 1794680000000}],
            'events': [{'id': str(uuid4()), 'crewMemberID': member, 'type': 'possibleUnresponsive',
                        'timestamp': 1794680000000, 'severity': 2, 'source': 'replay',
                        'details': 'Synthetic test, not a real fall.', 'acknowledged': False}],
            'telemetry': [{'id': str(uuid4()), 'crewMemberID': member, 'timestamp': 1794680000000,
                           'heartRateBPM': 72, 'activityLevel': .3, 'source': 'simulated'}]}


def test_pair_upload_acknowledge_and_offline_retry(setup):
    client, _ = setup
    headers = pair(client)
    assert client.get('/sync/state', headers=headers).json() == {'snapshot': None}
    payload = snapshot()
    payload['events'][0]['source'] = 'webCamera'
    payload['events'][0]['checkIn'] = {'requestedHelp': {'after': 12.5}}
    assert client.put('/sync/state', headers=headers, json=payload).status_code == 200
    event_id = payload['events'][0]['id']
    assert client.post(f'/sync/events/{event_id}/acknowledge', headers=headers).status_code == 200
    # An offline phone sends its older unacknowledged copy: it must not undo website acknowledgement.
    result = client.put('/sync/state', headers=headers, json=payload).json()['snapshot']
    assert len(result['events']) == 1
    assert result['events'][0]['acknowledged'] is True
    assert result['events'][0]['acknowledgedAt'] is not None
    assert result['telemetry'][0]['source'] == 'simulated'
    # Phone acknowledgement is also monotonic.
    payload['events'].append({**payload['events'][0], 'id': str(uuid4()), 'acknowledged': True})
    result = client.put('/sync/state', headers=headers, json=payload).json()['snapshot']
    assert all(e['acknowledged'] for e in result['events'])


def test_session_isolation_device_binding_and_revocation(setup):
    client, _ = setup
    headers, other = pair(client), pair(client)
    payload = snapshot()
    assert client.get('/sync/state').status_code == 401
    assert client.put('/sync/state', headers=headers, json=payload).status_code == 200
    assert client.get('/sync/state', headers=other).json()['snapshot'] is None
    event_id = payload['events'][0]['id']
    assert client.post(f'/sync/events/{event_id}/acknowledge', headers=other).status_code == 404
    payload['deviceID'] = str(uuid4())
    assert client.put('/sync/state', headers=headers, json=payload).status_code == 409
    assert client.delete('/sync/session', headers=headers).status_code == 204
    assert client.get('/sync/state', headers=headers).status_code == 401


def test_persists_on_app_restart_and_expires(setup):
    client, database = setup
    headers = pair(client)
    payload = snapshot()
    client.put('/sync/state', headers=headers, json=payload)
    another_process = TestClient(create_app())
    assert another_process.get('/sync/state', headers=headers).json()['snapshot']['deviceID'] == payload['deviceID']
    with sqlite3.connect(database) as db:
        stored = db.execute('SELECT token FROM sessions').fetchone()[0]
        assert headers['Authorization'][7:] not in stored
        db.execute('UPDATE sessions SET expires=0')
    assert client.get('/sync/state', headers=headers).status_code == 401


def test_rejects_private_content_bad_references_and_duplicate_events(setup):
    client, _ = setup
    headers = pair(client)
    payload = snapshot()
    for invalid in [dict(payload, journal='private text'), dict(payload, video='frame')]:
        assert client.put('/sync/state', headers=headers, json=invalid).status_code == 422
    invalid = copy.deepcopy(payload)
    invalid['events'][0]['crewMemberID'] = str(uuid4())
    assert client.put('/sync/state', headers=headers, json=invalid).status_code == 422
    invalid = copy.deepcopy(payload)
    invalid['events'] *= 2
    assert client.put('/sync/state', headers=headers, json=invalid).status_code == 422


def test_serves_dashboard_and_allows_only_configured_web_origins(setup):
    client, _ = setup
    assert client.get('/dashboard/').status_code == 200
    assert client.get('/dashboard/crew-sync.js').status_code == 200
    assert client.get('/dashboard/data/nasa-research.json').json()['schemaVersion'] == 1
    allowed = client.options('/sync/state', headers={'Origin':'http://localhost:4173', 'Access-Control-Request-Method':'PUT', 'Access-Control-Request-Headers':'authorization,content-type'})
    assert allowed.status_code == 200
    denied = client.options('/sync/state', headers={'Origin':'https://unrelated.example', 'Access-Control-Request-Method':'PUT'})
    assert denied.status_code == 400
