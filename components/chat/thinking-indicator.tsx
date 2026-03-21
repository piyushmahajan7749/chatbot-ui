"use client";

export function ThinkingIndicator() {
  return (
    <div className="self-start">
      <div className="bg-background border border-slate-200 dark:border-zinc-700 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex gap-1 items-center">
        <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-zinc-500 animate-bounce [animation-delay:0ms]" />
        <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-zinc-500 animate-bounce [animation-delay:150ms]" />
        <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-zinc-500 animate-bounce [animation-delay:300ms]" />
      </div>
    </div>
  );
}