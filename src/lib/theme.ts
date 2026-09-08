export type ThemeName = "dark" | "dim" | "light";
export const THEME_COOKIE = "tracker-theme";
export const THEMES: { id: ThemeName; label: string }[] = [
  { id: "dark", label: "Dark" },
  { id: "dim", label: "Dim" },
  { id: "light", label: "Light" },
];

export function isThemeName(v: string): v is ThemeName {
  return v === "dark" || v === "dim" || v === "light";
}

export function readThemeCookie(): ThemeName {
  if (typeof document === "undefined") return "dark";
  const m = document.cookie.match(/(?:^|; )tracker-theme=([^;]*)/);
  const v = m ? decodeURIComponent(m[1]).trim() : "";
  return isThemeName(v) ? v : "dark";
}

export function writeThemeCookie(theme: ThemeName) {
  if (typeof document === "undefined") return;
  document.cookie = `${THEME_COOKIE}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax`;
  document.documentElement.setAttribute("data-theme", theme);
}

export const THEME_BOOT_SCRIPT =
  "(function(){try{var m=document.cookie.match(/(?:^|; )tracker-theme=([^;]*)/);var t=m&&decodeURIComponent(m[1]);if(t==='light'||t==='dim'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();";
