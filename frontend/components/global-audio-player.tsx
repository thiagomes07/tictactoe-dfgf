"use client";

import { useEffect, useRef, useState } from "react";

import { AUDIO_EVENT_NAME, AUDIO_SRC, AUDIO_STORAGE_KEY, getAudioEnabled } from "@/lib/audio";

interface AudioPreferenceEvent {
  detail?: {
    enabled?: boolean;
  };
}

export function GlobalAudioPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [blockedByAutoplay, setBlockedByAutoplay] = useState(false);

  useEffect(() => {
    setEnabled(getAudioEnabled());

    const onPreferenceChange = (event: Event) => {
      const custom = event as AudioPreferenceEvent;
      if (typeof custom.detail?.enabled === "boolean") {
        setEnabled(custom.detail.enabled);
      } else {
        setEnabled(getAudioEnabled());
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === AUDIO_STORAGE_KEY) {
        setEnabled(getAudioEnabled());
      }
    };

    window.addEventListener(AUDIO_EVENT_NAME, onPreferenceChange);
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener(AUDIO_EVENT_NAME, onPreferenceChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!enabled) {
      audio.pause();
      setBlockedByAutoplay(false);
      return;
    }

    audio.volume = 0.45;
    audio.muted = false;
    void audio
      .play()
      .then(() => {
        setBlockedByAutoplay(false);
      })
      .catch(() => {
        // Browser blocked autoplay with sound; we'll retry on first user interaction.
        setBlockedByAutoplay(true);
      });
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !blockedByAutoplay) return;

    const audio = audioRef.current;
    if (!audio) return;

    const tryResume = () => {
      void audio
        .play()
        .then(() => {
          setBlockedByAutoplay(false);
        })
        .catch(() => {
          // Keep waiting for another interaction.
        });
    };

    const options: AddEventListenerOptions = { passive: true };
    window.addEventListener("pointerdown", tryResume, options);
    window.addEventListener("keydown", tryResume, options);
    window.addEventListener("touchstart", tryResume, options);

    return () => {
      window.removeEventListener("pointerdown", tryResume);
      window.removeEventListener("keydown", tryResume);
      window.removeEventListener("touchstart", tryResume);
    };
  }, [blockedByAutoplay, enabled]);

  return <audio ref={audioRef} src={AUDIO_SRC} loop preload="auto" />;
}
