import React, { createContext, useContext, useState, useEffect } from "react";

export const ThemeContext = createContext({ dark: true, toggle: () => {} });

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem("scalper-theme") !== "light"; } catch { return true; }
  });

  useEffect(() => {
    document.body.classList.toggle("light-mode", !dark);
    try { localStorage.setItem("scalper-theme", dark ? "dark" : "light"); } catch {}
  }, [dark]);

  return (
    <ThemeContext.Provider value={{ dark, toggle: () => setDark(d => !d) }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
