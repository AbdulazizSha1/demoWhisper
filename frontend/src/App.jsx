import { useEffect, useRef, useState } from "react";
import "./App.css";

const BACKEND_URL = "http://localhost:3001/api/transcribe";

const SILENCE_TIMEOUT_MS = 3000;
const RMS_THRESHOLD = 0.015;

export default function App() {
  const [status, setStatus] = useState("idle"); // idle | recording | processing
  const [text, setText] = useState("");
  const [audioURL, setAudioURL] = useState("");
  const [error, setError] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);

  // WebAudio VAD
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const lastVoiceAtRef = useRef(Date.now());

  const cleanup = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;

    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => { });
      audioCtxRef.current = null;
    }
    analyserRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const startRecording = async () => {
    setError("");
    setText("");
    setAudioURL("");
    setIsSpeaking(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // MediaRecorder
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = async () => {
        try {
          setStatus("processing");
          setIsSpeaking(false);

          const blob = new Blob(chunksRef.current, { type: mr.mimeType });
          const url = URL.createObjectURL(blob);
          setAudioURL(url);

          const form = new FormData();
          form.append("audio", blob, "recording.webm");

          const res = await fetch(BACKEND_URL, { method: "POST", body: form });
          const data = await res.json();

          if (!res.ok) throw new Error(data?.error || "Transcription failed");
          setText((data.text || "").trim());
        } catch (err) {
          setError(err?.message || "Something went wrong");
        } finally {
          setStatus("idle");
          cleanup();
        }
      };

      mediaRecorderRef.current = mr;
      mr.start();

      // Voice Activity Detection (RMS)
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;
      source.connect(analyser);

      lastVoiceAtRef.current = Date.now();
      setStatus("recording");

      const data = new Uint8Array(analyser.fftSize);

      const tick = () => {
        if (!analyserRef.current) return;

        analyser.getByteTimeDomainData(data);

        let sumSquares = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sumSquares += v * v;
        }
        const rms = Math.sqrt(sumSquares / data.length);

        const now = Date.now();
        const speakingNow = rms > RMS_THRESHOLD;

        if (speakingNow) lastVoiceAtRef.current = now;
        setIsSpeaking(speakingNow);

        if (now - lastVoiceAtRef.current > SILENCE_TIMEOUT_MS) {
          stopRecording();
          return;
        }

        rafRef.current = requestAnimationFrame(tick);
      };

      rafRef.current = requestAnimationFrame(tick);
    } catch {
      setStatus("idle");
      cleanup();
      setError("ما قدرت أفتح المايك. تأكد إنك سمحت بإذن المايك للمتصفح.");
    }
  };

  const stopRecording = () => {
    if (status !== "recording") return;
    try {
      mediaRecorderRef.current?.stop();
    } catch { }
  };

  useEffect(() => {
    return () => cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recording = status === "recording";
  const processing = status === "processing";

  return (
    <div className="page">
      <div className="container">
        <div className="header">
          <div className="title">Whisper STT Demo</div>
          <div className="subtitle">
            اضغط على المايك وتكلم… إذا سكت <b>3 ثواني</b> بيوقف تلقائيًا ويطلع النص.
          </div>
        </div>

        <div className="micWrap">
          <div className="micShell">
            {recording && (
              <>
                <div className={"ring " + (isSpeaking ? "speaking" : "")} />
                <div className={"ring delay1 " + (isSpeaking ? "speaking" : "")} />
                <div className={"ring delay2 " + (isSpeaking ? "speaking" : "")} />
              </>
            )}

            <button
              className={"micBtn " + (recording ? "recording" : "")}
              onClick={recording ? stopRecording : startRecording}
              disabled={processing}
              aria-label={recording ? "Stop recording" : "Start recording"}
              title={recording ? "Stop" : "Start"}
            >
              <svg className="micIcon" viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <path
                  d="M19 11a7 7 0 0 1-14 0"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <path
                  d="M12 18v3"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
                <path
                  d="M8 21h8"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>

            <div className="hint">
              {processing
                ? "جارٍ التفريغ..."
                : recording
                  ? (isSpeaking ? "جالس أسمعك..." : "تكلم…")
                  : "اضغط وابدأ"}
            </div>
          </div>
        </div>

        <div className="grid">
          {error && <div className="card error">{error}</div>}

          {audioURL && (
            <div className="card">
              <div className="audioWrap">
                <audio className="audio" controls src={audioURL} />
              </div>
            </div>
          )}


          <div className="card">
            <div className="cardTitleRow">
              <div className="cardTitle">النص المستخرج</div>
              <div className="smallMeta">{text ? `${text.length} chars` : ""}</div>
            </div>
            <div className="box">
              {text ? text : <span className="placeholder">—</span>}
            </div>
          </div>
        </div>


      </div>
    </div>
  );
}
