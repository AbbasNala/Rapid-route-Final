import type { Notifier, NotificationPayload } from "./notificationProvider";

export function createBrowserNotifier(): Notifier {
  const supported = typeof window !== "undefined" && "Notification" in window;
  return {
    name: "browser-notifications",
    isAvailable: () => supported && Notification.permission === "granted",
    async requestPermission() {
      if (!supported) return false;
      return (await Notification.requestPermission()) === "granted";
    },
    notify(payload: NotificationPayload) {
      if (!this.isAvailable()) return;
      try {
        new Notification(payload.title, {
          body: payload.body,
          tag: payload.tag,
        });
      } catch {
        /* Some browsers restrict constructor notifications; silently ignore. */
      }
    },
  };
}

/** Short two-pulse alert tone via Web Audio (no audio assets needed). */
export function playAlertSound(): void {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.value = 0.0001;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 880;
    osc.connect(gain);
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.18, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    gain.gain.setValueAtTime(0.0001, t + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.18, t + 0.33);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    osc.start(t);
    osc.stop(t + 0.6);
    osc.onended = () => void ctx.close();
  } catch {
    /* Audio blocked until user gesture — alerts remain visible + vibratory UI. */
  }
}
