precision highp float;
varying vec2 v_uv;

uniform sampler2D u_mask;
uniform float u_time;
uniform float u_speed;
uniform vec2 u_resolution;
uniform int u_colorCount;
uniform vec3 u_colors[8];

vec3 colorAtIndex(int idx) {
    for (int i = 0; i < 8; i++) {
        if (i == idx) return u_colors[i];
    }
    return u_colors[0];
}

vec3 gradientColor(float t) {
    if (u_colorCount <= 1) return u_colors[0];
    float scaled = t * float(u_colorCount - 1);
    int idx = int(floor(scaled));
    float frac = fract(scaled);
    int nextIdx = idx + 1;
    if (nextIdx >= u_colorCount) nextIdx = u_colorCount - 1;
    return mix(colorAtIndex(idx), colorAtIndex(nextIdx), frac);
}

// ── 3D Noise — time as third dimension for stationary animation ──
float hash31(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}

float noise3D(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(
            mix(hash31(i), hash31(i + vec3(1.0, 0.0, 0.0)), u.x),
            mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), u.x),
            u.y
        ),
        mix(
            mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), u.x),
            mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), u.x),
            u.y
        ),
        u.z
    );
}

float fbm3D(vec3 p) {
    float value = 0.0;
    float amplitude = 0.55;
    float frequency = 1.0;
    for (int i = 0; i < 3; i++) {
        value += amplitude * noise3D(p * frequency);
        frequency *= 1.7;
        amplitude *= 0.5;
    }
    return value;
}

// Keep a fast 2D FBM for static flow warp
float fbm2D(vec2 p) {
    return fbm3D(vec3(p, 0.0));
}

void main() {
    vec2 uv = v_uv;
    float time = u_time * u_speed;

    // Static flow warp — gives each blob its organic shape
    vec2 flow = vec2(
        fbm2D(uv * 1.2 + 0.7),
        fbm2D(uv * 1.2 + 1.8)
    );
    vec2 warped = uv + (flow - 0.5) * 0.18;

    // 3D noise — time as Z axis makes noise evolve in place
    float field = fbm3D(vec3(warped * 1.5, time * 0.12));

    // Detail cutter — multiplicative to keep distribution centered
    float detail = fbm3D(vec3(warped * 4.5 + 2.3, time * 0.18));
    float cutter = 1.0 - detail * 0.55;
    field = field * cutter;

    // Stretch distribution so every color band gets equal screen time
    field = (field - 0.2) * 2.0 + 0.5;
    field = clamp(field, 0.0, 1.0);

    // Quantize with anti-aliasing — soft blend at boundaries only
    float levels = max(float(u_colorCount - 1), 1.0);
    float scaled = field * levels;
    float aa = 2.0 / u_resolution.y;  // ~2px anti-alias width

    float hard = floor(scaled + 0.5) / levels;          // crisp color
    float soft = scaled / levels;                        // smooth gradient
    float dist_to_step = abs(fract(scaled + 0.5) - 0.5); // distance from boundary
    float t = smoothstep(0.0, aa, dist_to_step);         // 0 at boundary, 1 in flats
    field = mix(soft, hard, t);

    vec3 color = gradientColor(field);

    // Subtle highlight that also evolves in place
    float highlight = fbm3D(vec3(warped * 2.5, time * 0.15 + 0.5));
    color += highlight * 0.08;

    color = clamp(color, 0.0, 1.0);

    // Sample mask — canvas 2D already anti-aliases the path
    float alpha = texture2D(u_mask, vec2(uv.x, 1.0 - uv.y)).a;
    gl_FragColor = vec4(color * alpha, alpha);
}
