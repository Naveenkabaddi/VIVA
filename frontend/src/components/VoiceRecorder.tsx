import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mic, MicOff, Volume2 } from "lucide-react";
import {
  createRecognition,
  speak,
  speechRecognitionSupported,
  speechSynthesisSupported,
  stopSpeaking,
  type SpeechRecognitionLike,
} from "../lib/speech";
import { Button } from "./UI";

export function VoiceRecorder({
  onTranscript,
  disabled,
  language = "en-US",
}: {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  language?: string;
}) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const supported = speechRecognitionSupported();

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
    setInterim("");
  }, []);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    };
  }, []);

  const start = () => {
    setError("");
    const recognition = createRecognition(language);
    if (!recognition) {
      setError("This browser does not support speech recognition. Chrome or Edge is recommended; you can also type.");
      return;
    }
    recognitionRef.current = recognition;

    recognition.onstart = () => setListening(true);
    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) finalText += `${transcript} `;
        else interimText += transcript;
      }
      setInterim(interimText);
      if (finalText.trim()) {
        onTranscript(finalText.trim());
      }
    };
    recognition.onerror = (event) => {
      const messages: Record<string, string> = {
        "not-allowed": "Microphone permission was denied. Allow access in your browser settings.",
        "service-not-allowed": "Speech recognition is blocked by this browser.",
        "no-speech": "No speech detected. Try speaking a little closer to the microphone.",
        network: "The browser speech service is offline. Type your answer instead.",
      };
      setError(messages[event.error] ?? `Speech recognition error: ${event.error}`);
      stop();
    };
    recognition.onend = () => {
      setListening(false);
      setInterim("");
      recognitionRef.current = null;
    };

    try {
      recognition.start();
    } catch {
      setError("Could not start the microphone. Close other recording tabs and try again.");
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {listening ? (
          <Button variant="danger" size="sm" icon={<MicOff className="h-4 w-4" />} onClick={stop}>
            Stop recording
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            icon={<Mic className="h-4 w-4" />}
            onClick={start}
            disabled={disabled || !supported}
          >
            Answer by voice
          </Button>
        )}
        {listening && (
          <span className="inline-flex items-center gap-2 text-xs font-medium text-rose-600 dark:text-rose-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
            Listening… speak naturally
          </span>
        )}
        {!supported && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Voice dictation is unavailable in this browser — type instead.
          </span>
        )}
      </div>
      {interim && (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs italic text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {interim}
        </p>
      )}
      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}

export function SpeakButton({
  text,
  label = "Read aloud",
  size = "sm",
}: {
  text: string;
  label?: string;
  size?: "sm" | "md";
}) {
  const [speaking, setSpeaking] = useState(false);
  if (!speechSynthesisSupported()) return null;
  return (
    <Button
      variant="ghost"
      size={size}
      icon={speaking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Volume2 className="h-3.5 w-3.5" />}
      onClick={() => {
        if (speaking) {
          stopSpeaking();
          setSpeaking(false);
          return;
        }
        const started = speak(text, {
          onEnd: () => setSpeaking(false),
        });
        setSpeaking(started);
      }}
    >
      {speaking ? "Stop" : label}
    </Button>
  );
}
