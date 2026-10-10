// Voice, as progressive enhancement.
//
// The mic only exists when the browser actually has speech recognition. If it
// does not, the button never renders and the text field is simply the
// interface — no error, no disabled control, no layout shift. Voice is the
// fastest way to use Remi and never the only way, because a demo that depends
// on a microphone is a demo that depends on the room.
import { useCallback, useEffect, useRef, useState } from "react";
function getConstructor() {
    const w = window;
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
export function useSpeech(onTranscript) {
    const [supported] = useState(() => getConstructor() !== null);
    const [listening, setListening] = useState(false);
    const recognition = useRef(null);
    const callback = useRef(onTranscript);
    callback.current = onTranscript;
    useEffect(() => {
        return () => {
            recognition.current?.abort();
            recognition.current = null;
        };
    }, []);
    const start = useCallback(() => {
        const Constructor = getConstructor();
        if (Constructor === null)
            return;
        recognition.current?.abort();
        const instance = new Constructor();
        instance.lang = "en-US";
        instance.interimResults = false;
        instance.continuous = false;
        instance.onresult = (event) => {
            const first = event.results[0]?.[0]?.transcript;
            if (typeof first === "string" && first.trim() !== "")
                callback.current(first.trim());
        };
        // A denied microphone or a failed recognition is silent: the text field was
        // always there, so there is nothing the user needs to be told.
        instance.onerror = () => setListening(false);
        instance.onend = () => setListening(false);
        recognition.current = instance;
        try {
            instance.start();
            setListening(true);
        }
        catch {
            setListening(false);
        }
    }, []);
    const stop = useCallback(() => {
        recognition.current?.stop();
        setListening(false);
    }, []);
    return { supported, listening, start, stop };
}
