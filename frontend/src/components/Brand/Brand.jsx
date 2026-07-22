import "./Brand.css";
import { useTheme } from "../../ThemeContext";

export default function Brand({
    compact = false,
    iconOnly = false,
    size = 42
}) {

    const { isDark } = useTheme();

    return (

        <div className={`brand ${compact ? "compact" : ""}`}>

            <div
                className="brand-mark"
                style={{
                    width: size,
                    height: size
                }}
            >

                <div className="brand-ring" />

                <div className="brand-sigma">

                    Σ

                </div>

                <div className="brand-trend" />

            </div>

            {!iconOnly && (

                <div className="brand-text">

                    <div className="brand-title">

                        SIGMATICS

                    </div>

                    <div className="brand-tagline">

                        Signals, Quantified.

                    </div>

                </div>

            )}

        </div>

    );

}