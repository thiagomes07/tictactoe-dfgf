export const AUDIO_STORAGE_KEY = "dfgf:bgm-enabled:v1";
export const AUDIO_EVENT_NAME = "dfgf:audio-preference-changed";
export const AUDIO_SRC = "/audio/dfgf-theme.mp3";

export function getAudioEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(AUDIO_STORAGE_KEY) === "1";
}

export function setAudioEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(AUDIO_STORAGE_KEY, enabled ? "1" : "0");
  window.dispatchEvent(
    new CustomEvent(AUDIO_EVENT_NAME, {
      detail: { enabled }
    })
  );
}
