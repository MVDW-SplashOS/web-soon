import { useState } from "react";
import { WebGLLogo } from "./WebGLLogo";
import "./App.css";

function App() {
    const [ready, setReady] = useState(false);

    return (
        <>
            {!ready && (
                <div className="loader">
                    <span className="dot" />
                    <span className="dot" />
                    <span className="dot" />
                </div>
            )}

            <div className={`container${ready ? " loaded" : ""}`}>
                <div className="content">
                    <div className="logo-stage">
                        <WebGLLogo
                            className="logo-canvas"
                            speed={0.7}
                            onReady={() => setReady(true)}
                        />
                        {/* Outer glow via CSS */}
                        <div className="logo-glow" aria-hidden="true" />
                    </div>

                    <div className="text-group">
                        <h1 className="title">SplashOS</h1>
                        <p className="subtitle">Coming Soon</p>
                    </div>
                </div>

                <footer className="footer">
                    Copyright &copy; 2020-{new Date().getFullYear()} SplashOS.
                    All rights reserved. Logo by{" "}
                    <a
                        href="https://github.com/nidrax"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        @nidrax
                    </a>
                </footer>
            </div>
        </>
    );
}

export default App;
