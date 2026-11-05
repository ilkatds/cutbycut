# Keeps a Whisper model in memory for the assistant's voice input.
# Reads one JSON request per line from stdin: {"id", "wav", "model", "language", "prompt"}
# and answers one JSON line on stdout: {"id", "text"} or {"id", "error"}.
# Loading torch + the model is the slow part (tens of seconds), so it happens once.
import json
import sys
import warnings

warnings.filterwarnings("ignore")
sys.stdout.reconfigure(encoding="utf-8")
sys.stdin.reconfigure(encoding="utf-8")


def say(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


import whisper  # noqa: E402

models = {}


def model(name):
    if name not in models:
        models.clear()  # one model in memory at a time
        models[name] = whisper.load_model(name)
    return models[name]


say({"ready": True})
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    req = {}
    try:
        req = json.loads(line)
        if req.get("warm"):
            model(req.get("model") or "small")
            say({"id": req.get("id"), "warm": True})
            continue
        lang = req.get("language")
        res = model(req.get("model") or "small").transcribe(
            req["wav"],
            language=None if not lang or lang == "auto" else lang,
            initial_prompt=req.get("prompt") or None,
            fp16=False,
            condition_on_previous_text=False,
        )
        say({"id": req.get("id"), "text": res.get("text", "").strip()})
    except Exception as e:  # report and keep serving
        say({"id": req.get("id"), "error": str(e)})
