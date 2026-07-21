import React, {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useState
} from "react";

import {
    light,
    warmInk,
    spacing,
    radius,
    typography,
    shadows,
    motion
} from "./design-system";

const STORAGE_KEY = "option-scalper-theme";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {

    const [themeName, setThemeName] = useState(() => {

        return localStorage.getItem(STORAGE_KEY) || "warmInk";

    });

    useEffect(() => {

        localStorage.setItem(STORAGE_KEY, themeName);

        document.documentElement.setAttribute(
            "data-theme",
            themeName
        );

    }, [themeName]);

    const theme = useMemo(() => {

        const base = themeName === "light"
            ? light
            : warmInk;

        return {

            ...base,

            spacing,

            radius,

            typography,

            shadows,

            motion

        };

    }, [themeName]);

    const value = {

        theme,

        themeName,

        isDark: themeName === "warmInk",

        setTheme: setThemeName,

        toggleTheme: () => {

            setThemeName(current =>
                current === "light"
                    ? "warmInk"
                    : "light"
            );

        }

    };

    return (

        <ThemeContext.Provider value={value}>

            {children}

        </ThemeContext.Provider>

    );

}

export function useTheme() {

    return useContext(ThemeContext);

}