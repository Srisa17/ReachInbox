export function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="border border-dashed border-ink-600 rounded-lg py-16 flex flex-col items-center text-center">
      <p className="text-paper font-medium mb-1">{title}</p>
      <p className="text-slate-400 text-sm max-w-xs">{hint}</p>
    </div>
  );
}
