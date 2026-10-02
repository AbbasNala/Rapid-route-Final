export function Splash({ label = "RapidRoute" }: { label?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-ink">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emergency">
        <svg viewBox="0 0 16 16" width="26" height="26">
          <path d="M6 1.5h4v4.5h4.5v4H10v4.5H6V10H1.5V6H6z" fill="#fff" />
        </svg>
      </div>
      <div className="flex items-center gap-2 text-sm font-semibold tracking-[0.2em] text-muted">
        <span className="h-3 w-3 animate-pulse rounded-full bg-success" />
        {label}
      </div>
    </div>
  );
}
