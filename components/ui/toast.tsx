export function Toast({ message }: { message: string }) {
  return (
    <div className="fixed left-1/2 top-4 z-[3000] -translate-x-1/2 rounded-xl border border-line bg-panel px-4 py-2.5 text-sm font-semibold text-slate-100 shadow-2xl">
      {message}
    </div>
  );
}
