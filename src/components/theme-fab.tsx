import { useEffect, useRef, useState } from "react";
import { CloudMoon, Moon, Sun, SwatchBook } from "lucide-react";
import { THEMES, readThemeCookie, writeThemeCookie, type ThemeName } from "@/lib/theme";

export function ThemeFab() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeName>("dark");
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTheme(readThemeCookie());
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(next: ThemeName) {
    setTheme(next);
    writeThemeCookie(next);
    setOpen(false);
  }

  return (
    <div ref={root} className="pointer-events-auto absolute bottom-0 left-0 flex flex-col items-center gap-2">
      <div
        className={`flex flex-col items-center gap-2 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none ${
          open ? "translate-y-0 opacity-100" : "pointer-events-none invisible translate-y-2 opacity-0"
        }`}
        role="menu"
        aria-label="Theme"
        aria-hidden={!open}
      >
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="menuitemradio"
            aria-checked={theme === t.id}
            onClick={() => pick(t.id)}
            className={`flex min-h-11 min-w-11 items-center gap-2 rounded-full border px-3 py-2 text-sm ${
              theme === t.id
                ? "border-accent bg-accent text-accent-fg"
                : "border-border bg-surface text-fg hover:bg-elevated"
            }`}
          >
            {t.id === "light" ? (
              <Sun className="size-4" aria-hidden />
            ) : t.id === "dim" ? (
              <CloudMoon className="size-4" aria-hidden />
            ) : (
              <Moon className="size-4" aria-hidden />
            )}
            {t.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Theme"
        onClick={() => setOpen((v) => !v)}
        className="flex size-14 items-center justify-center rounded-full border border-border bg-surface text-fg shadow-sm hover:bg-elevated"
      >
        <SwatchBook className="size-5" aria-hidden />
      </button>
    </div>
  );
}
