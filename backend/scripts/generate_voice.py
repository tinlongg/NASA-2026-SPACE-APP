"""Generate the bundled check-in voice clips with ElevenLabs text-to-speech.

Reads the phrase list in ios/CrewSafety/Resources/Voice/phrases.json (the app looks clips up by the
exact text) and writes one mp3 per phrase next to it. Phrases named web-* go to web/dist/voice/. The clips are committed; the key is not.

    ELEVENLABS_API_KEY=... python backend/scripts/generate_voice.py [--force]

The key is read from the environment, the repo-root .env or backend/.env (all git-ignored). Optional: ELEVENLABS_VOICE_ID
(default: the voice set on the CrewSafety Check-in agent, found through the API; Eric if that lookup fails) and ELEVENLABS_MODEL (default eleven_multilingual_v2).
"""
import json
import os
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VOICE_DIR = ROOT / "ios" / "CrewSafety" / "Resources" / "Voice"
WEB_VOICE_DIR = ROOT / "web" / "dist" / "voice"  # phrases named web-* are for the website, not the app
DEFAULT_VOICE = "tnSpp4vdxKPjI9w0GnoV"  # Hope - upbeat and clear: the voice of the CrewSafety agents (Hope - Smooth talker before 2026-11-15 evening)


def load_key() -> str:
    """ELEVENLABS_API_KEY from the environment, then the repo-root .env, then backend/.env (all git-ignored)."""
    key = os.environ.get("ELEVENLABS_API_KEY", "")
    for env_file in (ROOT / ".env", ROOT / "backend" / ".env"):
        if key or not env_file.exists():
            continue
        for line in env_file.read_text().splitlines():
            if line.startswith("ELEVENLABS_API_KEY="):
                key = line.split("=", 1)[1].strip().strip('"')
    return key


def tls_context() -> ssl.SSLContext:
    # python.org builds on macOS ship without root certificates; fall back to the system bundle.
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        system = "/etc/ssl/cert.pem"
        return ssl.create_default_context(cafile=system if os.path.exists(system) else None)


def api_get(key: str, path: str):
    request = urllib.request.Request(f"https://api.elevenlabs.io{path}", headers={"xi-api-key": key})
    with urllib.request.urlopen(request, timeout=30, context=tls_context()) as response:
        return json.loads(response.read())


def agent_voice(key: str):
    """The voice currently set on the CrewSafety Check-in agent (or ELEVENLABS_AGENT_ID), or None."""
    try:
        agent_id = os.environ.get("ELEVENLABS_AGENT_ID")
        if not agent_id:
            agents = api_get(key, "/v1/convai/agents").get("agents", [])
            named = lambda agent: (agent.get("name") or "").lower()
            match = next((agent for agent in agents if "crewsafety" in named(agent) and "check" in named(agent)), None) \
                or next((agent for agent in agents if "crewsafety" in named(agent)), None)
            agent_id = match["agent_id"] if match else None
        if not agent_id:
            return None
        return api_get(key, f"/v1/convai/agents/{agent_id}")["conversation_config"]["tts"]["voice_id"]
    except Exception:
        return None


def synthesize(key: str, voice: str, model: str, text: str) -> bytes:
    body = json.dumps({
        "text": text,
        "model_id": model,
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.8, "speed": 1.0},
    }).encode()
    request = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_128",
        data=body, method="POST",
        headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"},
    )
    with urllib.request.urlopen(request, timeout=60, context=tls_context()) as response:
        return response.read()


def main() -> int:
    key = load_key()
    if not key:
        print("Set ELEVENLABS_API_KEY in the environment or backend/.env.", file=sys.stderr)
        return 1
    # Clips follow the voice set on the ElevenLabs agent, so changing the agent and re-running this
    # script updates the app and the website. ELEVENLABS_VOICE_ID overrides; Eric is the fallback.
    voice = os.environ.get("ELEVENLABS_VOICE_ID") or agent_voice(key) or DEFAULT_VOICE
    try:
        print(f"voice: {api_get(key, '/v1/voices/' + voice).get('name', voice)} ({voice})")
    except Exception:
        print(f"voice: {voice}")
    model = os.environ.get("ELEVENLABS_MODEL", "eleven_multilingual_v2")
    force = "--force" in sys.argv
    for phrase in json.loads((VOICE_DIR / "phrases.json").read_text()):
        target = (WEB_VOICE_DIR if phrase["name"].startswith("web-") else VOICE_DIR) / f"{phrase['name']}.mp3"
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists() and not force:
            print(f"keep {target.name} (use --force to regenerate)")
            continue
        try:
            target.write_bytes(synthesize(key, voice, model, phrase["text"]))
        except urllib.error.HTTPError as error:
            print(f"ElevenLabs returned HTTP {error.code} for {phrase['name']}.", file=sys.stderr)
            return 1
        print(f"wrote {target.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
