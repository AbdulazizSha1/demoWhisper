from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import whisper
import tempfile
import os

app = FastAPI()

# Call backend from frontend running on localhost:5173
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Download the model.
model = whisper.load_model("small")

@app.post("/api/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    # Save the uploaded file to a temporary location
    suffix = os.path.splitext(audio.filename)[1] or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await audio.read())
        tmp_path = tmp.name

    try:
        # Transcribe the audio file to Arabic text.
        result = model.transcribe(tmp_path, language="ar")
        return {"text": result.get("text", "").strip()}
    finally:
        try:
            os.remove(tmp_path)
        except:
            pass
