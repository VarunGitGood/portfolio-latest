import { bus } from "../bus";

/**
 * Living-infrastructure background — WebGL2 dye-advection field.
 *
 * The "smoke" is a persistent single-channel dye texture (ping-ponged at half
 * resolution). Each frame:
 *   1. SIM pass — advect the dye semi-Lagrangian along a velocity field
 *      (the cursor's motion pushes the dye where it passes), then relax the dye
 *      back toward an animated FBM "ambient" pattern so the field stays alive
 *      when idle and *returns* to flow after being disturbed.
 *   2. RENDER pass — map dye intensity through a graphite → deep-red → ember
 *      ramp, add the click ink-drop, resting vertical gradient, and vignette.
 *
 * Because the cursor moves a persistent medium (not a coordinate lens), it
 * reads as displacing smoke rather than distorting the image.
 */

const CONFIG = {
  maxDPR: 1.5,
  simScale: 0.5, // dye sim runs at half the display resolution
  ambientSpeed: 0.07, // idle flow speed
  relax: 0.05, // how fast dye returns to the ambient pattern (0..1 per frame)
  pushStrength: 2.4, // how hard the cursor shoves the dye
  cursorRadius: 72.0, // gaussian tightness of the cursor's push (higher = tighter/smaller)
};

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

const VERT = `#version 300 es
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const NOISE = `
float hash(vec2 p){ p = fract(p*vec2(123.34,345.45)); p += dot(p,p+34.345); return fract(p.x*p.y); }
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  float a=hash(i), b=hash(i+vec2(1,0)), c=hash(i+vec2(0,1)), d=hash(i+vec2(1,1));
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
float fbm(vec2 p){
  float v=0.0, a=0.5; mat2 m=mat2(1.6,1.2,-1.2,1.6);
  for(int i=0;i<5;i++){ v+=a*noise(p); p=m*p; a*=0.5; }
  return v;
}`;

const SIM = `#version 300 es
precision highp float;
out vec4 O;
uniform sampler2D uPrev;
uniform vec2  uTexel;
uniform float uTime;
uniform vec2  uMouse;     // uv
uniform vec2  uMouseVel;  // uv / frame
uniform float uAspect;
uniform float uEnergy;
uniform float uConverge;  // 0..1 — pulls the smoke into a center vortex
uniform float uRelease;   // 1 -> 0 impulse when the answer lands
uniform vec2  uClickPos;  // uv
uniform float uClickAge;  // seconds since click
${NOISE}
float ambient(vec2 uv){
  vec2 p = uv - 0.5; p.x *= uAspect; p *= 2.4;
  // energy factor tuned down with the faster ambient so interactions don't overspeed
  float t = uTime * ${CONFIG.ambientSpeed.toFixed(3)} * (1.0 + uEnergy * 0.15);
  vec2 q = vec2(fbm(p + vec2(0.0,t)), fbm(p + vec2(5.2,1.3)+t));
  vec2 r = vec2(fbm(p + 2.0*q + vec2(1.7,9.2)+t*1.1), fbm(p + 2.0*q + vec2(8.3,2.8)-t));
  return clamp(fbm(p + 2.5*r) * 1.15 + 0.03, 0.0, 1.0); // a touch more fume
}
void main(){
  vec2 uv = gl_FragCoord.xy * uTexel;
  // cursor velocity field — an anisotropic teardrop (elongates along motion)
  // with a noise-wobbled edge, so it's a natural moving shape, not a disc.
  // Uniform-gated: skip the fbm entirely while the cursor is still.
  vec2 vel = vec2(0.0);
  if (dot(uMouseVel, uMouseVel) > 1e-10) {
    vec2 d = uv - uMouse; d.x *= uAspect;
    float speed = length(uMouseVel);
    vec2 vdir = uMouseVel / (speed + 1e-5);
    vec2 perp = vec2(-vdir.y, vdir.x);
    vec2 dd = vec2(dot(d, vdir), dot(d, perp));
    float stretch = 1.0 + speed * 26.0;                 // longer along the stroke
    float shape = (dd.x * dd.x) / stretch + (dd.y * dd.y) * 1.7;
    float wob = 0.7 + 0.6 * fbm(uv * 7.0 + uTime * 0.4); // organic, non-circular
    float infl = exp(-shape * ${CONFIG.cursorRadius.toFixed(1)} * wob);
    vel = uMouseVel * infl * ${CONFIG.pushStrength.toFixed(1)};
  }

  vec2 toC = vec2(0.5) - uv; toC.x *= uAspect;
  float rad = length(toC) + 1e-4;
  vec2 tang = vec2(-toC.y, toC.x);                 // magnitude = rad
  // "thinking": gather inward (strong) + rotate with a radius-dependent angular
  // speed — fast core, slower rim. That differential shear smears the dye into
  // spinning spiral streaks. Gated: idle frames pay none of this noise.
  if (uConverge > 0.002) {
    float omega = mix(0.075, 0.016, smoothstep(0.0, 0.6, rad)); // core spins faster
    // unruly: wobble the spin speed and jitter the pull so the vortex shakes
    float omegaW = omega * (0.75 + 0.6 * noise(vec2(uTime * 2.3, rad * 9.0)));
    vec2 jit = vec2(fbm(uv * 6.0 + uTime * 1.6), fbm(uv * 6.0 + 37.2 - uTime * 1.4)) - 0.5;
    vel += (toC * 0.09 + tang * omegaW + jit * 0.05) * uConverge;
  }

  // answer release: fling the gathered dye back outward with a residual spin
  if (uRelease > 0.002) vel += (-toC * 0.22 + tang * 0.05) * uRelease;

  // semi-Lagrangian advection: pull dye from where this parcel came from
  float dye = texture(uPrev, uv - vel).r;

  // while converging (vortex), suppress the ambient regen in the periphery so ALL
  // the gas collects at the center (outskirts go black instead of leaving remnant smoke)
  float amb = ambient(uv) * (1.0 - uConverge * smoothstep(0.055, 0.42, rad));
  // during release the regen speeds up so the field refills behind the shockwave
  dye = mix(dye, amb, ${CONFIG.relax.toFixed(3)} * (1.0 - 0.7 * uConverge + uRelease));

  // click carves a dark void; it refills as the carve fades and the fluid
  // relaxes/advects back in
  vec2 cl = uv - uClickPos; cl.x *= uAspect;
  float carve = exp(-dot(cl, cl) * 90.0) * exp(-uClickAge * 3.5);
  dye *= 1.0 - carve * 0.9;

  O = vec4(vec3(dye), 1.0);
}`;

const RENDER = `#version 300 es
precision highp float;
out vec4 O;
uniform sampler2D uDye;
uniform vec2  uRes;
uniform float uAspect;
uniform float uEnergy;
uniform vec2  uMouse;     // uv
uniform vec2  uMouseVel;  // uv / frame
uniform float uMouseGlow;
uniform float uConverge;  // 0..1 thinking effect
uniform float uTime;
${NOISE}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float n = texture(uDye, uv).r;

  // thinking maelstrom: fbm sheared azimuthally around the center — ragged
  // streaks smeared into a swirl, no countable arms, never repeats. The whole
  // core jitters so it reads unruly, not mechanical. Uniform-gated: the fbm
  // only runs while actually thinking.
  vec2 cc = (uv - 0.5) * vec2(uAspect, 1.0);
  float cdist = length(cc);
  if (uConverge > 0.002) {
    cc += vec2(sin(uTime * 7.3), cos(uTime * 5.9)) * 0.012 * uConverge;
    cdist = length(cc);
    float ang = atan(cc.y, cc.x);
    float aa = ang + cdist * 14.0 - uTime * 1.6;         // swirl-sheared angle
    vec2 sp = vec2(cos(aa), sin(aa)) * (0.7 + cdist * 4.0); // seamless around the circle
    float spiral = smoothstep(0.25, 0.85, fbm(sp + uTime * 0.35));
    float core = smoothstep(0.64, 0.0, cdist);
    n += uConverge * core * mix(0.20, 0.58, spiral);
  }

  // color ramp: pitch black -> deep teal -> space-indigo crest
  vec3 base   = vec3(0.007, 0.008, 0.013); // pitch black, faint indigo
  vec3 teal   = vec3(0.090, 0.380, 0.380); // #176161
  vec3 indigo = vec3(0.290, 0.270, 0.660); // space indigo
  vec3 col = mix(base, teal, smoothstep(0.34, 0.82, n));
  float hot = smoothstep(0.58, 0.99, n + uEnergy * 0.12);
  col = mix(col, indigo, pow(hot, 2.0) * 0.55); // brightest veins shift indigo

  // thinking blackout — outside the core the whole screen falls to black
  col *= 1.0 - uConverge * smoothstep(0.175, 0.66, cdist) * 0.88;

  // faint warmth trailing a moving cursor — same teardrop shape, not a disc.
  // Gated: no per-pixel fbm while the cursor rests.
  if (uMouseGlow > 0.003) {
    vec2 md = uv - uMouse; md.x *= uAspect;
    float rspeed = length(uMouseVel);
    vec2 rdir = uMouseVel / (rspeed + 1e-5);
    vec2 rperp = vec2(-rdir.y, rdir.x);
    vec2 mdd = vec2(dot(md, rdir), dot(md, rperp));
    float rshape = (mdd.x * mdd.x) / (1.0 + rspeed * 22.0) + (mdd.y * mdd.y) * 1.7;
    float rwob = 0.7 + 0.6 * fbm(uv * 7.0);
    col += teal * exp(-rshape * 59.0 * rwob) * uMouseGlow * 0.14;
  }

  // resting vertical gradient — lower half darker, ink can stir into it
  float grad = smoothstep(0.02, 0.95, uv.y);
  col *= mix(0.34, 1.0, grad);

  // vignette (deepened for contrast)
  vec2 vc = uv - 0.5; vc.x *= uAspect;
  float vig = smoothstep(1.0, 0.08, length(vc));
  col *= 0.22 + 0.78 * vig;

  // dither to kill banding
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.018;

  O = vec4(col, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || "compile failed");
  return sh;
}
function program(gl: WebGL2RenderingContext, frag: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "link failed");
  return p;
}

export function initBackground(): void {
  const canvas = document.getElementById("bg") as HTMLCanvasElement;
  const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
  if (!gl) {
    canvas.style.background = "radial-gradient(120% 120% at 50% 40%, #0e2b2b 0%, #0b0c0f 70%)";
    return;
  }

  gl.bindVertexArray(gl.createVertexArray()); // required default VAO for attribute-less draw

  const simProg = program(gl, SIM);
  const renderProg = program(gl, RENDER);
  const uSim = {
    prev: gl.getUniformLocation(simProg, "uPrev"),
    texel: gl.getUniformLocation(simProg, "uTexel"),
    time: gl.getUniformLocation(simProg, "uTime"),
    mouse: gl.getUniformLocation(simProg, "uMouse"),
    mouseVel: gl.getUniformLocation(simProg, "uMouseVel"),
    aspect: gl.getUniformLocation(simProg, "uAspect"),
    energy: gl.getUniformLocation(simProg, "uEnergy"),
    converge: gl.getUniformLocation(simProg, "uConverge"),
    release: gl.getUniformLocation(simProg, "uRelease"),
    clickPos: gl.getUniformLocation(simProg, "uClickPos"),
    clickAge: gl.getUniformLocation(simProg, "uClickAge"),
  };
  const uRen = {
    dye: gl.getUniformLocation(renderProg, "uDye"),
    res: gl.getUniformLocation(renderProg, "uRes"),
    aspect: gl.getUniformLocation(renderProg, "uAspect"),
    energy: gl.getUniformLocation(renderProg, "uEnergy"),
    mouse: gl.getUniformLocation(renderProg, "uMouse"),
    mouseVel: gl.getUniformLocation(renderProg, "uMouseVel"),
    mouseGlow: gl.getUniformLocation(renderProg, "uMouseGlow"),
    converge: gl.getUniformLocation(renderProg, "uConverge"),
    time: gl.getUniformLocation(renderProg, "uTime"),
  };

  let W = 0,
    H = 0,
    DPR = 1,
    simW = 0,
    simH = 0,
    aspect = 1;
  let tex: WebGLTexture[] = [];
  let fbo: WebGLFramebuffer[] = [];
  let read = 0;

  function makeTarget(w: number, h: number): [WebGLTexture, WebGLFramebuffer] {
    const t = gl!.createTexture()!;
    gl!.bindTexture(gl!.TEXTURE_2D, t);
    gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, w, h, 0, gl!.RGBA, gl!.UNSIGNED_BYTE, null);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    const f = gl!.createFramebuffer()!;
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, f);
    gl!.framebufferTexture2D(gl!.FRAMEBUFFER, gl!.COLOR_ATTACHMENT0, gl!.TEXTURE_2D, t, 0);
    return [t, f];
  }

  const mouse = { x: 0, y: 0, tx: 0, ty: 0, vx: 0, vy: 0, glow: 0 }; // CSS px
  const click = { x: 0.5, y: 0.5, t0: -10 };
  let energy = 0;
  let converge = 0,
    convergeTarget = 0;
  let release = 0; // 1 -> 0 shockwave impulse when the answer arrives

  function resize() {
    DPR = Math.min(devicePixelRatio || 1, CONFIG.maxDPR);
    W = innerWidth;
    H = innerHeight;
    aspect = W / H;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    simW = Math.max(2, Math.floor(W * CONFIG.simScale));
    simH = Math.max(2, Math.floor(H * CONFIG.simScale));
    tex.forEach((t) => gl!.deleteTexture(t));
    fbo.forEach((f) => gl!.deleteFramebuffer(f));
    const a = makeTarget(simW, simH);
    const b = makeTarget(simW, simH);
    tex = [a[0], b[0]];
    fbo = [a[1], b[1]];
    read = 0;

    if (mouse.tx === 0 && mouse.ty === 0) {
      mouse.x = mouse.tx = W / 2;
      mouse.y = mouse.ty = H / 2;
    }
  }
  // debounced — raw resize fires per-frame during a window drag and each call
  // rebuilds both sim FBO textures
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  });
  resize();

  addEventListener(
    "pointermove",
    (e) => {
      mouse.tx = e.clientX;
      mouse.ty = e.clientY;
    },
    { passive: true },
  );
  addEventListener(
    "pointerdown",
    (e) => {
      click.x = e.clientX / W;
      click.y = 1 - e.clientY / H;
      click.t0 = performance.now() / 1000;
      energy = Math.min(1, energy + 0.15);
    },
    { passive: true },
  );

  const boost = (amt: number) => (energy = Math.min(1, energy + amt));
  bus.on("thinking", (on) => {
    convergeTarget = on ? 1 : 0;
    if (on) {
      release = 0;
    } else {
      release = 1; // outward shockwave when the answer arrives
      boost(0.7);
    }
  });
  bus.on("boost", () => boost(0.4));
  bus.on("react", (sec) => boost(sec === "skills" ? 0.6 : 0.5));
  bus.on("converge", () => boost(0.55));
  bus.on("ping", () => {
    boost(0.55);
    setTimeout(() => boost(0.3), 700);
  });

  function simPass(now: number) {
    // smoothed cursor (inertia) + velocity in uv space
    const nx = mouse.x + (mouse.tx - mouse.x) * 0.14;
    const ny = mouse.y + (mouse.ty - mouse.y) * 0.14;
    mouse.vx = nx - mouse.x;
    mouse.vy = ny - mouse.y;
    mouse.x = nx;
    mouse.y = ny;
    const spd = Math.hypot(mouse.vx, mouse.vy);
    mouse.glow += (Math.min(1, spd / 22) - mouse.glow) * 0.08;

    gl!.useProgram(simProg);
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo[1 - read]);
    gl!.viewport(0, 0, simW, simH);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, tex[read]);
    gl!.uniform1i(uSim.prev, 0);
    gl!.uniform2f(uSim.texel, 1 / simW, 1 / simH);
    gl!.uniform1f(uSim.time, now);
    gl!.uniform2f(uSim.mouse, mouse.x / W, 1 - mouse.y / H);
    gl!.uniform2f(uSim.mouseVel, mouse.vx / W, -mouse.vy / H);
    gl!.uniform1f(uSim.aspect, aspect);
    gl!.uniform1f(uSim.energy, energy);
    gl!.uniform1f(uSim.converge, converge);
    gl!.uniform1f(uSim.release, release);
    gl!.uniform2f(uSim.clickPos, click.x, click.y);
    gl!.uniform1f(uSim.clickAge, now - click.t0);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    read = 1 - read;
  }

  function renderPass(now: number) {
    gl!.useProgram(renderProg);
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    gl!.viewport(0, 0, canvas.width, canvas.height);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, tex[read]);
    gl!.uniform1i(uRen.dye, 0);
    gl!.uniform2f(uRen.res, canvas.width, canvas.height);
    gl!.uniform1f(uRen.aspect, aspect);
    gl!.uniform1f(uRen.energy, energy);
    gl!.uniform2f(uRen.mouse, mouse.x / W, 1 - mouse.y / H);
    gl!.uniform2f(uRen.mouseVel, mouse.vx / W, -mouse.vy / H);
    gl!.uniform1f(uRen.mouseGlow, mouse.glow);
    gl!.uniform1f(uRen.converge, converge);
    gl!.uniform1f(uRen.time, now);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
  }

  function frame(ms: number) {
    const now = ms / 1000;
    // ease the thinking effect up (fast) / down (faster now — the shockwave
    // covers the transition back to the ambient field)
    const rate = convergeTarget > converge ? 0.06 : 0.045;
    converge += (convergeTarget - converge) * rate;
    release *= 0.96; // shockwave impulse decays over ~1.5s

    simPass(now);
    renderPass(now);
    energy *= 0.99;
    requestAnimationFrame(frame);
  }

  if (reduce) {
    // warm up the dye field, then draw a single static frame
    for (let i = 0; i < 40; i++) simPass(0);
    renderPass(0);
  } else {
    requestAnimationFrame(frame);
    setTimeout(() => boost(0.9), 2760); // flare as the name materializes
  }
}
