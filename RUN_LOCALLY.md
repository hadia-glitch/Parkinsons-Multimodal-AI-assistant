# Running this locally in VS Code

This project has **four** parts you run side by side, each in its own
terminal. No deployment needed — everything runs on localhost.

1. `ml-speech-service` (Python/FastAPI, port **8000**) — real speech screening
2. `ml-gait-service` (Python/FastAPI, port **8001**) — real gait screening
3. `api-server` (Node/Express, port from `.env`) — orchestrates everything
4. `parkinsons-assistant` (React/Vite) — the web UI, including a **Screening
   desk** page for speech+gait

## Prerequisites

- Node.js 22+ and `pnpm` (`corepack enable` will provide it, or `npm i -g pnpm`)
- Python 3.11+ with `venv`
- `ffmpeg` and `libsndfile1` (needed by the speech service):
  - macOS: `brew install ffmpeg libsndfile`
  - Ubuntu/Debian: `sudo apt-get install ffmpeg libsndfile1`
  - Windows: install [ffmpeg](https://ffmpeg.org/download.html) and add it to PATH;
    `libsndfile` ships bundled with the `soundfile` Python package on Windows.
- On Linux, the gait service's `opencv-python-headless` may need
  `libgl1`/`libglib2.0-0` (`sudo apt-get install libgl1 libglib2.0-0`) — not
  usually needed on macOS/Windows.

Recommended VS Code extensions: **ESLint**, **Python** (ms-python.python), **Prettier**.

Open **5 terminals** in VS Code (`` Ctrl/Cmd+Shift+` `` to add more, or split
the panel) — one per service below, plus one free for `curl`/git.

---

## 1. Install Node dependencies (once)

```bash
corepack enable
pnpm install
```

## 2. Set up environment variables (once)

```bash
cp .env.example .env
```

Leave everything blank for now except `SPEECH_SERVICE_URL` and
`GAIT_SERVICE_URL`, which you'll fill in once those services are running
(steps 3 and 4 below). Everything else (LLM chat, vision) is optional and
shows an honest "unavailable" state when unset — nothing crashes.

## 3. Terminal 1 — speech screening service

```bash
cd ml-speech-service
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt

cd app
python train.py                  # trains on the bundled Oxford dataset, ~2s
uvicorn main:app --reload --port 8000
```

Verify: `curl http://localhost:8000/health` → `{"status":"ok","model_loaded":true}`

## 4. Terminal 2 — gait screening service

```bash
cd ml-gait-service
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt

cd app
```

A model trained on **real CARE-PD data** (`DNE` + `BMCLab`) is already
included in `app/models/` — you can skip straight to starting the service
below. If you want to retrain it (e.g. with more data, a different
`--label-threshold`, or after updates to `pose_features.py`):

**With real CARE-PD data (what's already bundled here):**

1. Accept terms: <https://neurips2025.care-pd.ca/terms-of-use.html>
2. Follow <https://github.com/TaatiTeam/CARE-PD> to download the `DNE` and
   `BMCLab` canonicalized SMPL pickles.
3. Place them at `app/data/DNE_canonical.pkl` and `app/data/BMCLab_canonical.pkl`.
4. `python train.py --datasets DNE,BMCLab`

See `ml-gait-service/README.md`'s "Real training results" section for the
actual metrics this produces and exactly how DNE/BMCLab's different
labeling schemes are combined.

**Pipeline smoke test instead (no real data needed, e.g. to verify the code
still runs after an edit):**

```bash
python make_synthetic_dataset.py
python train.py --datasets SYNTHETIC_DEMO
```

The model card and every API response clearly label this
`SYNTHETIC PIPELINE-TEST DATA — NOT REAL`, so you'll always know which one
is loaded — check with `curl http://localhost:8001/model-card`.

Either way, then start the service:

```bash
uvicorn main:app --reload --port 8001
```

Verify: `curl http://localhost:8001/health` → `{"status":"ok","model_loaded":true}`
Check what's actually loaded: `curl http://localhost:8001/model-card` (look at `"dataset"."name"`)

## 5. Point the Node API at both services

Edit `.env` in the project root (created in step 2 with `cp .env.example .env`):

```env
SPEECH_SERVICE_URL=http://localhost:8000
GAIT_SERVICE_URL=http://localhost:8001
```

`PORT` and `NODE_ENV` are already set in `.env.example`, and the API server
reads this file automatically at startup — you do **not** need to export
anything in your shell each session (on Windows: no `$env:PORT=...` needed).

## 6. Terminal 3 — API server

```bash
pnpm --filter @workspace/api-server run dev
```

This builds then starts the server on the `PORT` from `.env` (5000 by
default). Re-run it after changing backend TypeScript; the `.env` file is
re-read on each start.

## 7. Terminal 4 — web client

```bash
pnpm --filter @workspace/parkinsons-assistant run dev
```

Open the printed URL (typically `http://localhost:5173`).

---

## Try it

- **Assistant desk** (`/`): ask a question in English or Urdu; attach an
  audio note or a walking video via **Add context** to fold speech/gait
  observations into the conversation.
- **Screening desk** (`/screening`) — the dedicated dashboard: upload a
  speech sample and/or a walking video, hit **Run screening**, and see the
  speech score, gait score, and combined multimodal score with feature
  breakdowns and limitations, side by side. Upload only one modality to see
  single-modality screening; upload both to see the fused score.
- Try a silent audio clip or a video with no person in frame — both
  services correctly return "insufficient quality" rather than a fabricated
  score. This is deliberate (see plan.md §63) and tested in each service's
  `pytest` suite.

## Everyday commands

```bash
# Typecheck / build everything (Node side)
pnpm run typecheck
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/parkinsons-assistant run typecheck

# Python test suites (from inside each service's activated venv)
cd ml-speech-service/app && pytest test_service.py -v
cd ml-gait-service/app && pytest test_service.py -v

# Direct API smoke tests, no browser needed
curl -X POST http://localhost:8080/api/analyze/audio -F "file=@sample.wav"
curl -X POST http://localhost:8080/api/analyze/video -F "file=@sample.mp4"
curl -X POST http://localhost:8080/api/screen -F "audio=@sample.wav" -F "video=@sample.mp4"
```

## What's still optional / not the current focus

- Chat/RAG LLM synthesis — shows "unavailable" until you configure
  `LLM_BASE_URL` + `LLM_MODEL` (OpenAI-compatible) or `OLLAMA_BASE_URL` +
  `OLLAMA_MODEL`. PubMed retrieval and attachment analysis work without it.
- Vision/image analysis — real now (calls an OpenAI-compatible or Ollama
  vision model), but off by default. Easiest path: install
  [Ollama](https://ollama.com), run `ollama pull llava`, then add to `.env`:
  ```env
  OLLAMA_BASE_URL=http://localhost:11434
  VISION_MODEL=llava
  ```
  Or use a hosted vision-capable model via `LLM_BASE_URL` + `LLM_API_KEY` + `VISION_MODEL`.
- Deployment (Vercel, hosting the two Python services, etc.) — see
  `ml-speech-service/DEPLOY.md` and `ml-gait-service/DEPLOY.md` when you're
  ready; nothing here requires it for local development.
