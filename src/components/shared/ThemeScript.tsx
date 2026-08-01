import { DEFAULT_THEME, THEME_STORAGE_KEY } from "@/lib/theme";

export function ThemeScript() {
  const script = `
    (function () {
      try {
        var storageKey = ${JSON.stringify(THEME_STORAGE_KEY)};
        var theme = localStorage.getItem(storageKey) || ${JSON.stringify(DEFAULT_THEME)};
        var resolved =
          theme === "system"
            ? window.matchMedia("(prefers-color-scheme: dark)").matches
              ? "dark"
              : "light"
            : theme;
        if (resolved === "dark") {
          document.documentElement.classList.add("dark");
        } else {
          document.documentElement.classList.remove("dark");
        }
        document.documentElement.style.colorScheme = resolved;
      } catch (e) {
        document.documentElement.classList.add("dark");
        document.documentElement.style.colorScheme = "dark";
      }
    })();
  `;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}