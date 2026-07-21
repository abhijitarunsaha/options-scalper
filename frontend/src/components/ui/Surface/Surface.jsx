import clsx from "clsx";
import styles from "./Surface.module.css";

export default function Surface({
    children,
    className = "",
    variant = "default",
    padding = "md",
    hover = false,
    clickable = false,
    style = {},
    ...props
}) {

    return (

        <div
            className={clsx(

                styles.surface,

                styles[variant],

                styles[`pad-${padding}`],

                hover && styles.hover,

                clickable && styles.clickable,

                className

            )}
            style={style}
            {...props}
        >

            {children}

        </div>

    );

}