import React, { createContext, useContext, useEffect, useState } from "react";

export type Theme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme] = useState<Theme>("dark");

  const setTheme = (_t: Theme) => {
    // Light theme temporarily disabled
  };

  const toggleTheme = () => {
    // Light theme temporarily disabled
  };

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    root.classList.remove("light");
    root.classList.add("dark");
    body.classList.remove("light");
    body.classList.add("dark");
    localStorage.removeItem("theme");
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
