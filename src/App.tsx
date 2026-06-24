import { WebGLLogo } from "./WebGLLogo";
import "./App.css";

function App() {
    return (
        <div className="container">
            <div className="logo-stage">
                <WebGLLogo className="logo-canvas" speed={0.7} />
                {/* Outer glow via CSS */}
                <div className="logo-glow" aria-hidden="true" />
            </div>

            <h1 className="title">SplashOS</h1>
            <p className="subtitle">Coming Soon</p>
        </div>
    );
}

export default App;
