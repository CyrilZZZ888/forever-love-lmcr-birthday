(() => {
  'use strict';

  function decodeBase64(base64) {
    const binary = atob(base64);
    const result = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) result[i] = binary.charCodeAt(i);
    return result;
  }

  function shader(gl, type, source) {
    const result = gl.createShader(type);
    gl.shaderSource(result, source);
    gl.compileShader(result);
    if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(result) || 'GLB shader compilation failed');
    }
    return result;
  }

  async function load(gl, base64, options = {}) {
    const bytes = decodeBase64(base64);
    const view = new DataView(bytes.buffer);
    if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) {
      throw new Error('The selected file is not GLB 2.0');
    }
    const jsonLength = view.getUint32(12, true);
    const document = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
    const binaryStart = 20 + jsonLength + 8;
    const primitive = document.meshes[0].primitives[0];
    const hasSkin = Boolean(document.skins && primitive.attributes.JOINTS_0 !== undefined);
    const enableEntrance = Boolean(options.entrance);
    const glbView = accessorIndex => {
      const accessor = document.accessors[accessorIndex];
      const bufferView = document.bufferViews[accessor.bufferView];
      const components = accessor.type === 'MAT4' ? 16 : accessor.type === 'VEC4' ? 4 :
        accessor.type === 'VEC3' ? 3 : accessor.type === 'VEC2' ? 2 : 1;
      const componentBytes = accessor.componentType === 5121 ? 1 :
        accessor.componentType === 5125 || accessor.componentType === 5126 ? 4 : 2;
      const stride = bufferView.byteStride || components * componentBytes;
      const offset = binaryStart + (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
      return { accessor, stride, data: bytes.subarray(offset, offset + accessor.count * stride) };
    };
    const indices = glbView(primitive.indices);
    const positions = glbView(primitive.attributes.POSITION);
    const indexData = new DataView(indices.data.buffer, indices.data.byteOffset, indices.data.byteLength);
    const parents = Int32Array.from({ length: positions.accessor.count }, (_, i) => i);
    const sizes = new Int32Array(parents.length).fill(1);
    function root(i) {
      while (parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i]; }
      return i;
    }
    function union(i, j) {
      i = root(i); j = root(j);
      if (i === j) return;
      if (sizes[i] < sizes[j]) [i, j] = [j, i];
      parents[j] = i;
      sizes[i] += sizes[j];
    }
    // The selected C file has six disconnected white-shoe shells. Their component
    // IDs were measured against candidate-C-v2.glb; all other islands stay rigid.
    for (let i = 0; i < indices.accessor.count; i += 3) {
      const first = indexData.getUint32(i * 4, true);
      union(first, indexData.getUint32((i + 1) * 4, true));
      union(first, indexData.getUint32((i + 2) * 4, true));
    }
    const shoeComponents = new Map([
      [106418, 1], [107346, 1], [114798, 1],
      [185796, -1], [190431, -1], [191693, -1]
    ]);
    const shoeSide = new Float32Array(parents.length);
    for (let i = 0; i < shoeSide.length; i++) shoeSide[i] = shoeComponents.get(root(i)) || 0;

    const vertexSource = `#version 300 es
      layout(location=0) in vec3 aPosition;
      layout(location=1) in vec3 aNormal;
      layout(location=2) in vec2 aUv;
      layout(location=3) in float aShoeSide;
      ${hasSkin ? 'layout(location=4) in vec4 aJoints; layout(location=5) in vec4 aWeights; uniform mat4 uSkin[21];' : ''}
      uniform mat4 uModel;
      uniform mat4 uViewProjection;
      uniform float uWalkPhase;
      uniform float uWalkAmount;
      uniform float uDressLag;
      out vec3 vNormal;
      out vec2 vUv;
      out vec3 vWorldPosition;
      void main() {
        vec3 position = aPosition;
        if (aShoeSide != 0.0 && ${hasSkin ? 'false' : 'true'}) {
          float stepPhase = uWalkPhase + (aShoeSide < 0.0 ? 3.14159265 : 0.0);
          position.y += max(0.0, sin(stepPhase)) * 0.013 * uWalkAmount;
          position.x += cos(stepPhase) * 0.015 * uWalkAmount;
        }
        float skirt = (1.0 - smoothstep(-0.29, 0.045, position.y))
          * smoothstep(0.055, 0.12, length(position.xz - vec2(0.0235, -0.0155)))
          * (1.0 - abs(aShoeSide));
        position.z += skirt * (0.005 * sin(uWalkPhase * 0.5 - position.y * 12.0) * uWalkAmount
          + 0.006 * uDressLag);
        position.x += skirt * 0.0025 * cos(uWalkPhase - position.y * 8.0) * uWalkAmount;
        ${hasSkin ? `mat4 skin = aWeights.x * uSkin[int(aJoints.x)] + aWeights.y * uSkin[int(aJoints.y)]
          + aWeights.z * uSkin[int(aJoints.z)] + aWeights.w * uSkin[int(aJoints.w)];
        vec4 world = uModel * skin * vec4(position, 1.0);
        vec3 skinnedNormal = mat3(skin) * aNormal;` : `vec4 world = uModel * vec4(position, 1.0);
        vec3 skinnedNormal = aNormal;`}
        vWorldPosition = world.xyz;
        vNormal = normalize(mat3(uModel) * skinnedNormal);
        vUv = aUv;
        gl_Position = uViewProjection * world;
      }`;
    const fragmentSource = `#version 300 es
      precision highp float;
      in vec3 vNormal;
      in vec2 vUv;
      in vec3 vWorldPosition;
      uniform sampler2D uBaseColor;
      uniform sampler2D uRoughness;
      uniform sampler2D uNormalMap;
      uniform vec3 uCameraPosition;
      uniform float uReveal;
      out vec4 outColor;
      void main() {
        if (uReveal < 0.999) {
          float threshold = smoothstep(0.28, 0.92, uReveal);
          float noise = fract(sin(dot(floor(vUv * 1536.0), vec2(127.1, 311.7))) * 43758.5453);
          if (noise > threshold) discard;
        }
        vec3 normal = normalize(vNormal);
        vec3 q1 = dFdx(vWorldPosition);
        vec3 q2 = dFdy(vWorldPosition);
        vec2 st1 = dFdx(vUv);
        vec2 st2 = dFdy(vUv);
        float determinant = st1.x * st2.y - st1.y * st2.x;
        if (abs(determinant) > 0.00001) {
          vec3 tangent = normalize((q1 * st2.y - q2 * st1.y) / determinant);
          vec3 bitangent = normalize((-q1 * st2.x + q2 * st1.x) / determinant);
          vec3 mapNormal = texture(uNormalMap, vUv).rgb * 2.0 - 1.0;
          normal = normalize(mat3(tangent, bitangent, normal) * mapNormal);
        }
        vec3 light = normalize(vec3(-0.35, 0.75, 0.65));
        float brightness = 0.72 + 0.28 * max(dot(normal, light), 0.0);
        vec2 material = texture(uRoughness, vUv).gb;
        float roughness = clamp(material.x, 0.12, 1.0);
        float metallic = material.y;
        vec3 viewDirection = normalize(uCameraPosition - vWorldPosition);
        vec3 halfVector = normalize(light + viewDirection);
        float specular = pow(max(dot(normal, halfVector), 0.0), mix(70.0, 8.0, roughness));
        vec3 base = texture(uBaseColor, vUv).rgb;
        outColor = vec4(base * brightness + vec3(specular * (0.035 + 0.11 * metallic)), 1.0);
      }`;
    const program = gl.createProgram();
    gl.attachShader(program, shader(gl, gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, shader(gl, gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || 'GLB shader link failed');
    }

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    for (const [name, slot, size] of [['POSITION', 0, 3], ['NORMAL', 1, 3], ['TEXCOORD_0', 2, 2]]) {
      const attribute = glbView(primitive.attributes[name]);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, attribute.data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(slot);
      gl.vertexAttribPointer(slot, size, gl.FLOAT, false, attribute.stride, 0);
    }
    const shoeBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, shoeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, shoeSide, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 0, 0);
    if (hasSkin) {
      for (const [name, slot] of [['JOINTS_0', 4], ['WEIGHTS_0', 5]]) {
        const attribute = glbView(primitive.attributes[name]);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, attribute.data, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(slot);
        gl.vertexAttribPointer(slot, 4, gl.UNSIGNED_BYTE, name === 'WEIGHTS_0', attribute.stride, 0);
      }
    }
    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices.data, gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    async function uploadTexture(textureIndex, slot) {
      const imageIndex = document.textures[textureIndex].source;
      const image = document.images[imageIndex];
      const imageView = document.bufferViews[image.bufferView];
      const imageOffset = binaryStart + imageView.byteOffset;
      const blob = new Blob([bytes.subarray(imageOffset, imageOffset + imageView.byteLength)], { type: image.mimeType });
      const bitmap = await createImageBitmap(blob);
      const texture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + slot);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      const channels = image.mimeType === 'image/png' ? gl.RGBA : gl.RGB;
      gl.texImage2D(gl.TEXTURE_2D, 0, channels, channels, gl.UNSIGNED_BYTE, bitmap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.generateMipmap(gl.TEXTURE_2D);
      bitmap.close();
      return texture;
    }
    const material = document.materials[primitive.material];
    const textures = [
      await uploadTexture(material.pbrMetallicRoughness.baseColorTexture.index, 1),
      await uploadTexture(material.pbrMetallicRoughness.metallicRoughnessTexture.index, 2),
      await uploadTexture(material.normalTexture.index, 3)
    ];

    let particles = null;
    if (enableEntrance) {
      const pointVertex = `#version 300 es
        layout(location=0) in vec3 aPosition;
        layout(location=1) in vec2 aUv;
        layout(location=2) in vec3 aScatter;
        layout(location=3) in float aSeed;
        layout(location=4) in float aWarm;
        uniform mat4 uModel;
        uniform mat4 uViewProjection;
        uniform float uProgress;
        out vec2 vUv;
        out float vAlpha;
        out float vWarm;
        void main() {
          float settle = smoothstep(0.10, 0.76, uProgress);
          vec3 local = aPosition + aScatter * (1.0 - settle);
          vec4 clip = uViewProjection * uModel * vec4(local, 1.0);
          gl_Position = clip;
          gl_PointSize = (1.5 + 3.0 * aSeed) * clamp(6.0 / max(clip.w, 0.1), 0.7, 2.1);
          vUv = aUv;
          vWarm = aWarm;
          vAlpha = smoothstep(0.0, 0.17, uProgress) *
            (1.0 - smoothstep(0.73, 1.0, uProgress)) * (0.5 + 0.5 * aSeed);
        }`;
      const pointFragment = `#version 300 es
        precision highp float;
        in vec2 vUv;
        in float vAlpha;
        in float vWarm;
        uniform sampler2D uBaseColor;
        out vec4 outColor;
        void main() {
          float radius = length(gl_PointCoord - 0.5);
          if (radius > 0.5) discard;
          float glow = 1.0 - smoothstep(0.12, 0.5, radius);
          vec3 sampled = texture(uBaseColor, vUv).rgb;
          vec3 color = mix(sampled * 1.7 + vec3(0.08, 0.16, 0.18),
            vec3(1.0, 0.73, 0.36), vWarm);
          outColor = vec4(color, glow * vAlpha);
        }`;
      const pointProgram = gl.createProgram();
      gl.attachShader(pointProgram, shader(gl, gl.VERTEX_SHADER, pointVertex));
      gl.attachShader(pointProgram, shader(gl, gl.FRAGMENT_SHADER, pointFragment));
      gl.linkProgram(pointProgram);
      if (!gl.getProgramParameter(pointProgram, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(pointProgram) || 'Entrance particle shader link failed');
      }
      const uv = glbView(primitive.attributes.TEXCOORD_0);
      const posView = new DataView(positions.data.buffer, positions.data.byteOffset, positions.data.byteLength);
      const uvView = new DataView(uv.data.buffer, uv.data.byteOffset, uv.data.byteLength);
      let seed = 0x64c0de;
      const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      const count = Math.min(6000, positions.accessor.count);
      const points = new Float32Array(count * 10);
      for (let i = 0; i < count; i++) {
        const index = Math.floor(random() * positions.accessor.count);
        const angle = random() * Math.PI * 2;
        const elevation = random() * 2 - 1;
        const radius = 0.10 + random() * 0.24;
        const horizontal = Math.sqrt(1 - elevation * elevation) * radius;
        const p = i * 10;
        for (let axis = 0; axis < 3; axis++) points[p + axis] = posView.getFloat32(index * positions.stride + axis * 4, true);
        for (let axis = 0; axis < 2; axis++) points[p + 3 + axis] = uvView.getFloat32(index * uv.stride + axis * 4, true);
        points[p + 5] = Math.cos(angle) * horizontal;
        points[p + 6] = elevation * radius;
        points[p + 7] = Math.sin(angle) * horizontal;
        points[p + 8] = random();
        points[p + 9] = random() < 0.07 ? 1 : 0;
      }
      const pointVao = gl.createVertexArray();
      gl.bindVertexArray(pointVao);
      const pointBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, pointBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, points, gl.STATIC_DRAW);
      for (const [slot, size, offset] of [[0, 3, 0], [1, 2, 12], [2, 3, 20], [3, 1, 32], [4, 1, 36]]) {
        gl.enableVertexAttribArray(slot);
        gl.vertexAttribPointer(slot, size, gl.FLOAT, false, 40, offset);
      }
      gl.bindVertexArray(null);
      particles = { program: pointProgram, vao: pointVao, count, uniforms: {
        model: gl.getUniformLocation(pointProgram, 'uModel'),
        viewProjection: gl.getUniformLocation(pointProgram, 'uViewProjection'),
        progress: gl.getUniformLocation(pointProgram, 'uProgress'),
        baseColor: gl.getUniformLocation(pointProgram, 'uBaseColor')
      } };
    }

    const uniforms = {
      model: gl.getUniformLocation(program, 'uModel'),
      viewProjection: gl.getUniformLocation(program, 'uViewProjection'),
      baseColor: gl.getUniformLocation(program, 'uBaseColor'),
      roughness: gl.getUniformLocation(program, 'uRoughness'),
      normalMap: gl.getUniformLocation(program, 'uNormalMap'),
      cameraPosition: gl.getUniformLocation(program, 'uCameraPosition'),
      walkPhase: gl.getUniformLocation(program, 'uWalkPhase'),
      walkAmount: gl.getUniformLocation(program, 'uWalkAmount'),
      dressLag: gl.getUniformLocation(program, 'uDressLag')
    };
    uniforms.reveal = gl.getUniformLocation(program, 'uReveal');
    if (hasSkin) uniforms.skin = gl.getUniformLocation(program, 'uSkin[0]');
    const skin = hasSkin ? document.skins[0] : null;
    const inverseView = hasSkin ? glbView(skin.inverseBindMatrices) : null;
    const inverseMatrices = hasSkin ? Array.from({ length: skin.joints.length }, (_, i) => {
      const result = new Float32Array(16);
      const src = new DataView(inverseView.data.buffer, inverseView.data.byteOffset + i * inverseView.stride, 64);
      for (let j = 0; j < 16; j++) result[j] = src.getFloat32(j * 4, true);
      return result;
    }) : null;
    const identity = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    const multiply = (a, b) => {
      const result = new Float32Array(16);
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
        for (let k = 0; k < 4; k++) result[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
      return result;
    };
    const translation = xyz => { const m = identity(); m[12] = xyz[0]; m[13] = xyz[1]; m[14] = xyz[2]; return m; };
    const rotationZ = angle => { const m = identity(), c = Math.cos(angle), s = Math.sin(angle);
      m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; };
    function poseMatrices(motion) {
      const phase = motion.walkPhase || 0, amount = motion.walkAmount || 0;
      const angle = name => {
        const swing = Math.sin(phase) * amount;
        if (name === 'UpperLeg.L') return -0.16 * swing;
        if (name === 'UpperLeg.R') return 0.16 * swing;
        if (name === 'LowerLeg.L') return -0.09 * Math.max(0, -swing);
        if (name === 'LowerLeg.R') return -0.09 * Math.max(0, swing);
        if (name === 'UpperArm.L') return 0.025 * swing;
        if (name === 'UpperArm.R') return -0.025 * swing;
        if (name === 'Skirt.L') return 0.025 * swing;
        if (name === 'Skirt.R') return -0.025 * swing;
        return 0;
      };
      const globals = new Map(), result = new Float32Array(skin.joints.length * 16);
      const visit = index => {
        if (globals.has(index)) return globals.get(index);
        const node = document.nodes[index];
        const parent = skin.joints.find(j => (document.nodes[j].children || []).includes(index));
        const local = multiply(translation(node.translation || [0, 0, 0]), rotationZ(angle(node.name)));
        const global = parent === undefined ? local : multiply(visit(parent), local);
        globals.set(index, global);
        return global;
      };
      skin.joints.forEach((index, i) => result.set(multiply(visit(index), inverseMatrices[i]), i * 16));
      return result;
    }
    return {
      triangles: indices.accessor.count / 3,
      rigged: hasSkin,
      particleCount: particles ? particles.count : 0,
      draw(model, viewProjection, cameraPosition, motion = {}) {
        const reveal = Math.max(0, Math.min(1, motion.revealProgress === undefined ? 1 : motion.revealProgress));
        if (particles && reveal < 1) {
          gl.useProgram(particles.program);
          gl.uniformMatrix4fv(particles.uniforms.model, false, model);
          gl.uniformMatrix4fv(particles.uniforms.viewProjection, false, viewProjection);
          gl.uniform1f(particles.uniforms.progress, reveal);
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, textures[0]);
          gl.uniform1i(particles.uniforms.baseColor, 1);
          gl.depthMask(false);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
          gl.bindVertexArray(particles.vao);
          gl.drawArrays(gl.POINTS, 0, particles.count);
          gl.bindVertexArray(null);
          gl.depthMask(true);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        }
        if (particles && reveal < 0.28) return;
        gl.useProgram(program);
        gl.uniformMatrix4fv(uniforms.model, false, model);
        gl.uniformMatrix4fv(uniforms.viewProjection, false, viewProjection);
        gl.uniform3fv(uniforms.cameraPosition, cameraPosition);
        gl.uniform1f(uniforms.walkPhase, motion.walkPhase || 0);
        gl.uniform1f(uniforms.walkAmount, motion.walkAmount || 0);
        gl.uniform1f(uniforms.dressLag, motion.dressLag || 0);
        gl.uniform1f(uniforms.reveal, reveal);
        if (hasSkin) gl.uniformMatrix4fv(uniforms.skin, false, poseMatrices(motion));
        for (let index = 0; index < textures.length; index++) {
          gl.activeTexture(gl.TEXTURE1 + index);
          gl.bindTexture(gl.TEXTURE_2D, textures[index]);
        }
        gl.uniform1i(uniforms.baseColor, 1);
        gl.uniform1i(uniforms.roughness, 2);
        gl.uniform1i(uniforms.normalMap, 3);
        gl.bindVertexArray(vao);
        gl.drawElements(gl.TRIANGLES, indices.accessor.count, gl.UNSIGNED_INT, 0);
        gl.bindVertexArray(null);
      }
    };
  }

  window.CandidateGlbLoader = { load };
})();
