export function burnNote(row, note, { onComplete, onError }) {
    row.classList.add("burning");
    const canvas = document.createElement("canvas");
    canvas.className = "burn-canvas";
    row.append(canvas);
    const bounds = row.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false });
    if (!gl) {
      onError("WebGL is unavailable, so the note will be removed without the fire effect.");
      window.setTimeout(() => {
        onComplete();
      }, 920);
      return;
    }
    canvas.width = Math.max(1, Math.floor(bounds.width * ratio));
    canvas.height = Math.max(1, Math.floor(bounds.height * ratio));
    const vertexSource = `
      attribute vec2 position;
      varying vec2 vUv;
      void main() {
        vUv = position * .5 + .5;
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;
    const fragmentSource = `
      precision mediump float;
      varying vec2 vUv;
      uniform float u_ratio;
      uniform float u_time;
      uniform float u_shape_offset;
      uniform float u_power;
      uniform float u_addition;

      vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
      float snoise(vec2 v) {
        const vec4 C = vec4(.2113248654, .3660254038, -.5773502692, .0243902439);
        vec2 i = floor(v + dot(v, C.yy));
        vec2 x0 = v - i + dot(i, C.xx);
        vec2 i1 = x0.x > x0.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod(i, 289.0);
        vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
        vec3 m = max(.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
        m = m * m * m * m;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - .5;
        vec3 ox = floor(x + .5);
        vec3 a0 = x - ox;
        m *= 1.7928427 - .8537347 * (a0 * a0 + h * h);
        vec3 g;
        g.x = a0.x * x0.x + h.x * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
      }
      vec3 hsv2rgb(vec3 c) {
        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
      }
      float flameNoise(vec2 uv, float t) {
        float noise = snoise(vec2(uv.x * 8.0, uv.y * 2.0 - t));
        noise += .2 * snoise(vec2(uv.x * 10.0 + 1.5 * t, uv.y * 3.0));
        return min(1.0, .5 * noise + u_addition);
      }
      void main() {
        vec2 uv = vUv;
        uv.y /= u_ratio;
        float noise = flameNoise(uv, u_time * 2.0);
        float shape = pow(.8 * uv.y * u_ratio, .5);
        shape += 3.0 * pow(abs(uv.x - .5), 2.0);
        shape *= u_shape_offset;
        float stepped = floor(noise * 4.0) / 4.0;
        float d = pow(max(stepped, 0.0), u_power) * (1.2 - shape);
        vec3 color = hsv2rgb(vec3(d * .15, .8 - .2 * d, d + .5 + .1 * uv.y));
        float alpha = smoothstep(shape, shape + .2, noise) * step(shape, noise);
        gl_FragColor = vec4(color, alpha * .9);
      }
    `;
    function createShader(type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`Fire shader compilation failed: ${message}`);
      }
      return shader;
    }
    let program;
    try {
      program = gl.createProgram();
      gl.attachShader(program, createShader(gl.VERTEX_SHADER, vertexSource));
      gl.attachShader(program, createShader(gl.FRAGMENT_SHADER, fragmentSource));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    } catch (error) {
      console.error("Fire effect could not start.", error);
      onError("The fire effect could not start, so the note will be removed.");
      window.setTimeout(() => {
        onComplete();
      }, 920);
      return;
    }
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.useProgram(program);
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const uniforms = {
      ratio: gl.getUniformLocation(program, "u_ratio"),
      time: gl.getUniformLocation(program, "u_time"),
      shape: gl.getUniformLocation(program, "u_shape_offset"),
      power: gl.getUniformLocation(program, "u_power"),
      addition: gl.getUniformLocation(program, "u_addition")
    };
    const started = performance.now();
    function frame(now) {
      const progress = Math.min(1, (now - started) / 900);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(uniforms.ratio, bounds.width / bounds.height);
      gl.uniform1f(uniforms.time, (now - started) / 1000);
      gl.uniform1f(uniforms.shape, 1.0 - progress * .6);
      gl.uniform1f(uniforms.power, .7 - progress * .3);
      gl.uniform1f(uniforms.addition, .5 + progress * .5);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (progress < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    window.setTimeout(() => {
      onComplete();
    }, 920);
  }

