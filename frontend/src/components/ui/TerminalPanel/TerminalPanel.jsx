import React from "react";

export default function TerminalPanel({

    icon,

    title,

    subtitle,

    status,

    actions,

    children,

    style = {}

}) {

    return (

        <div
            style={{
                background: "var(--glass2)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius2)",
                overflow: "hidden",
                backdropFilter: "blur(12px)",
                boxShadow: "var(--shadow)",
                ...style
            }}
        >

            {(title || actions) && (

                <div
                    style={{
                        padding: "12px 16px",
                        background: "var(--bg3)",
                        borderBottom: "1px solid var(--border)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12
                    }}
                >

                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12
                        }}
                    >

                        {icon &&

                            <div
                                style={{
                                    width: 34,
                                    height: 34,
                                    borderRadius: 9,
                                    background: "var(--bg4)",
                                    border: "1px solid var(--border)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: 17,
                                    flexShrink: 0
                                }}
                            >
                                {icon}
                            </div>

                        }

                        <div>

                            {title &&

                                <div
                                    style={{
                                        fontSize: 13,
                                        fontWeight: 700,
                                        color: "var(--text)"
                                    }}
                                >
                                    {title}
                                </div>

                            }

                            {subtitle &&

                                <div
                                    style={{
                                        fontSize: 10,
                                        color: "var(--muted)",
                                        marginTop: 2
                                    }}
                                >
                                    {subtitle}
                                </div>

                            }

                        </div>

                    </div>

                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            flexWrap: "wrap"
                        }}
                    >

                        {status}

                        {actions}

                    </div>

                </div>

            )}

            <div
                style={{
                    padding: "14px 16px"
                }}
            >
                {children}
            </div>

        </div>

    );

}