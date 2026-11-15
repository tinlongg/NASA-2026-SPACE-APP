import httpx
import pytest

from app import llm
from app.config import load_settings
from app.retrieval import Chunk, Hit, Source

HITS = [Hit(Chunk('fixture-1', 'fixture', 'Fixture section', 'Artificial exercise reference.'),
            Source('fixture', 'Artificial test reference', 'https://example.invalid'), 2.0)]


def test_meta_sends_only_question_and_retrieved_passages(monkeypatch):
    captured = {}
    def post(url, **kwargs):
        captured.update(url=url, **kwargs)
        return httpx.Response(200, request=httpx.Request('POST', url),
                              json={'choices': [{'finish_reason': 'stop', 'message': {'content': 'Answer.'}}]})
    monkeypatch.setenv('META_API_KEY', 'test-only-secret')
    monkeypatch.setattr(httpx, 'post', post)
    assert llm.generate('exercise?', HITS, 'muse-spark-1.3') == 'Answer.'
    assert captured['url'] == 'https://api.meta.ai/v1/chat/completions'
    assert captured['timeout'] == 12
    assert captured['json']['messages'][0]['role'] == 'developer'
    assert captured['json']['messages'][1]['content'] == llm.build_user_message('exercise?', HITS)
    assert 'test-only-secret' not in str(captured['json'])


@pytest.mark.parametrize('status,body', [(401, {}), (429, {}), (200, {}),
    (200, {'choices': [{'finish_reason': 'length', 'message': {'content': 'partial'}}]}),
    (200, {'choices': [{'finish_reason': 'stop', 'message': {'content': ''}}]})])
def test_meta_errors_are_safe_for_extractive_fallback(monkeypatch, status, body):
    monkeypatch.setattr(httpx, 'post', lambda url, **kwargs:
                        httpx.Response(status, request=httpx.Request('POST', url), json=body))
    with pytest.raises(llm.LLMError):
        llm.generate('exercise?', HITS, 'muse-spark-1.3')


def test_meta_default_is_enabled_only_with_server_credential(monkeypatch):
    monkeypatch.delenv('META_API_KEY', raising=False)
    monkeypatch.delenv('MUSE_LLM_PROVIDER', raising=False)
    monkeypatch.delenv('MUSE_LLM_MODEL', raising=False)
    assert not load_settings().llm_configured
    monkeypatch.setenv('META_API_KEY', 'test-only-secret')
    assert load_settings().llm_configured
    assert load_settings().llm_model == 'muse-spark-1.3'
    monkeypatch.setenv('MUSE_LLM_ENABLED', '0')
    assert not load_settings().llm_configured
