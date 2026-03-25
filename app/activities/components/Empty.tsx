"use client";

export function Empty({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-2">
      <div className="text-2xl opacity-10 select-none">◌</div>
      <p className="text-xs text-zinc-600">{label}</p>
    </div>
  );
}
