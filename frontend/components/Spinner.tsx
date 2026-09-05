export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-16 justify-center text-slate-400 text-sm">
      <span className="w-4 h-4 rounded-full border-2 border-ink-600 border-t-amber-400 animate-spin" />
      {label ?? "Loading…"}
    </div>
  );
}
