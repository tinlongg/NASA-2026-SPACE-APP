"""Generate the bundled check-in voice clips with ElevenLabs text-to-speech.

Reads the phrase list in ios/CrewSafety/Resources/Voice/phrases.json (the app looks clips up by the
exact text) and writes one mp3 per phrase next to it. The clips are committed; the key is not.

    ELEVENLABS_API_KEY=... python backend/scripts/generate_voice.py [--force]

The key is read from the environment or backend/.env (git-ignored). Optional: ELEVENLABS_VOICE_ID
(default: Sarah, a calm reassuring premade voice) and ELEVENLABS_MODEL (default eleven_multilingual_v2).
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
DEFAULT_VOICE = "EXAVITQu4vr4xnSDxMaL"  # Sarah - Mature, Reassuring, Confident


def load_key() -> str:
    key = os.environ.get("ELEVENLABS_API_KEY", "")
    env_file = ROOT / "backend" / ".env"
    if not key and env_file.exists():
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


def synthesize(key: str, voice: str, model: str, text: str) -> bytes:
    body = json.dumps({
        "text": text,
        "model_id": model,
        "voice_settings": {"stability": 0.65, "similarity_boost": 0.75, "speed": 0.95},
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
    voice = os.environ.get("ELEVENLABS_VOICE_ID", DEFAULT_VOICE)
    model = os.environ.get("ELEVENLABS_MODEL", "eleven_multilingual_v2")
    force = "--force" in sys.argv
    for phrase in json.loads((VOICE_DIR / "phrases.json").read_text()):
        target = VOICE_DIR / f"{phrase['name']}.mp3"
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
