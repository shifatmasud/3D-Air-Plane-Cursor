/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, {useRef, useEffect, useMemo} from 'react';
import ReactDOM from 'react-dom/client';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';


// --- Simplex Noise for Fluid Motion ---
const SimplexNoise = (() => {
  const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
  const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;
  const F3 = 1.0 / 3.0;
  const G3 = 1.0 / 6.0;

  const grad3 = new Float32Array([
    1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1,
    0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
  ]);

  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;

  let n;
  for (let i = 255; i > 0; i--) {
    n = Math.floor((i + 1) * Math.random());
    const q = p[i];
    p[i] = p[n];
    p[n] = q;
  }
  const perm = new Uint8Array(512);
  const permMod12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
    permMod12[i] = perm[i] % 12;
  }

  return class SimplexNoise {
    noise3D(xin, yin, zin) {
      let n0, n1, n2, n3;
      const s = (xin + yin + zin) * F3;
      const i = Math.floor(xin + s);
      const j = Math.floor(yin + s);
      const k = Math.floor(zin + s);
      const t = (i + j + k) * G3;
      const X0 = i - t;
      const Y0 = j - t;
      const Z0 = k - t;
      const x0 = xin - X0;
      const y0 = yin - Y0;
      const z0 = zin - Z0;

      let i1, j1, k1;
      let i2, j2, k2;
      if (x0 >= y0) {
        if (y0 >= z0) { i1=1; j1=0; k1=0; i2=1; j2=1; k2=0; }
        else if (x0 >= z0) { i1=1; j1=0; k1=0; i2=1; j2=0; k2=1; }
        else { i1=0; j1=0; k1=1; i2=1; j2=0; k2=1; }
      } else {
        if (y0 < z0) { i1=0; j1=0; k1=1; i2=0; j2=1; k2=1; }
        else if (x0 < z0) { i1=0; j1=1; k1=0; i2=0; j2=1; k2=1; }
        else { i1=0; j1=1; k1=0; i2=1; j2=1; k2=0; }
      }

      const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
      const x2 = x0 - i2 + 2.0 * G3, y2 = y0 - j2 + 2.0 * G3, z2 = z0 - k2 + 2.0 * G3;
      const x3 = x0 - 1.0 + 3.0 * G3, y3 = y0 - 1.0 + 3.0 * G3, z3 = z0 - 1.0 + 3.0 * G3;

      const ii = i & 255, jj = j & 255, kk = k & 255;

      const gi0 = permMod12[ii+perm[jj+perm[kk]]] * 3;
      const gi1 = permMod12[ii+i1+perm[jj+j1+perm[kk+k1]]] * 3;
      const gi2 = permMod12[ii+i2+perm[jj+j2+perm[kk+k2]]] * 3;
      const gi3 = permMod12[ii+1+perm[jj+1+perm[kk+1]]] * 3;
      
      let t0 = 0.6 - x0*x0 - y0*y0 - z0*z0;
      n0 = (t0 < 0) ? 0.0 : Math.pow(t0, 4) * (grad3[gi0] * x0 + grad3[gi0+1] * y0 + grad3[gi0+2] * z0);
      let t1 = 0.6 - x1*x1 - y1*y1 - z1*z1;
      n1 = (t1 < 0) ? 0.0 : Math.pow(t1, 4) * (grad3[gi1] * x1 + grad3[gi1+1] * y1 + grad3[gi1+2] * z1);
      let t2 = 0.6 - x2*x2 - y2*y2 - z2*z2;
      n2 = (t2 < 0) ? 0.0 : Math.pow(t2, 4) * (grad3[gi2] * x2 + grad3[gi2+1] * y2 + grad3[gi2+2] * z2);
      let t3 = 0.6 - x3*x3 - y3*y3 - z3*z3;
      n3 = (t3 < 0) ? 0.0 : Math.pow(t3, 4) * (grad3[gi3] * x3 + grad3[gi3+1] * y3 + grad3[gi3+2] * z3);

      return 32.0 * (n0 + n1 + n2 + n3);
    }
  };
})();

// --- Plane Models ---
const planeModels = [
    { // Classic Dart
        vertices: new Float32Array([0,2,-15, -20,-1,10, 20,-1,10, 0,2,15, 0,-2,15, 0,-2,-10]),
        indices: [0,1,2, 1,3,2, 0,5,1, 1,5,4, 1,4,3, 0,2,5, 2,4,5, 2,3,4]
    },
    { // Glider
        vertices: new Float32Array([0,0,-15, -30,0,5, 30,0,5, 0,0,18, -4,0,15, 4,0,15]),
        indices: [0,1,2, 1,3,2, 3,4,5, 1,4,3, 2,3,5]
    },
    { // Futuristic
        vertices: new Float32Array([0,1,-18, -15,-2,20, 15,-2,20, 0,4,15, -2,-4,18, 2,-4,18]),
        indices: [0,1,2, 1,3,2, 1,4,3, 2,3,5, 4,5,3]
    }
];

const PaperPlaneApp = () => {
  const mountRef = useRef(null);
  const MAX_TRAIL_PARTICLES = 500;
  const MAX_EXPLOSION_PARTICLES = 300;
  
  const { 
    _vec3, _flowFieldForce, _tailOffset, _worldTailPosition,
    _camLookAt, _desiredCamPos, _currentCamLookAt,
    _yawQuat, _pitchQuat, _finalQuat, _planeUp, _euler,
    _planeDirection, _updateParticlesVec, _relativePosVec, _newParticlePos
  } = useMemo(() => ({
      _vec3: new THREE.Vector3(),
      _flowFieldForce: new THREE.Vector3(),
      _tailOffset: new THREE.Vector3(0, 0, 15),
      _worldTailPosition: new THREE.Vector3(),
      _camLookAt: new THREE.Vector3(),
      _desiredCamPos: new THREE.Vector3(),
      _currentCamLookAt: new THREE.Vector3(),
      _yawQuat: new THREE.Quaternion(),
      _pitchQuat: new THREE.Quaternion(),
      _finalQuat: new THREE.Quaternion(),
      _planeUp: new THREE.Vector3(0, 1, 0),
      _euler: new THREE.Euler(),
      _planeDirection: new THREE.Vector3(),
      _updateParticlesVec: new THREE.Vector3(),
      _relativePosVec: new THREE.Vector3(),
      _newParticlePos: new THREE.Vector3(),
  }), []);

  const state = useRef({
    mouse: new THREE.Vector2(),
    plane: {
        position: new THREE.Vector3(0,0,0),
        velocity: new THREE.Vector3(),
        rollVelocity: 0,
        currentBank: 0,
    },
    trailParticles: [],
    explosionParticles: [],
    orbs: [],
    noise: new SimplexNoise(),
    lastEmitTime: 0,
    hasMoved: false,
    isBoosting: false,
    isStarted: false,
    currentPlaneModel: 0,
  }).current;

  useEffect(() => {
    const mountNode = mountRef.current;
    if (!mountNode) return;

    // --- Scene setup ---
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 10000);

    const renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountNode.appendChild(renderer.domElement);

    // --- Post-processing (Bloom) ---
    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.7, 0.4, 0.85);
    const composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);

    // --- Lighting ---
    scene.add(new THREE.AmbientLight(0xffffff, 0.2));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(500, 500, 1000);
    scene.add(dirLight);

    // --- Infinite Starfield ---
    const STAR_COUNT = 5000;
    const starGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(STAR_COUNT * 3);
    const starColors = new Float32Array(STAR_COUNT * 3);
    const starRandoms = new Float32Array(STAR_COUNT);
    const starColor = new THREE.Color();
    const starRadius = 4000;
    for (let i = 0; i < STAR_COUNT; i++) {
        const r = Math.random() * starRadius + 100;
        const theta = Math.random() * 2 * Math.PI;
        const phi = Math.acos(2 * Math.random() - 1);
        starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        starPositions[i * 3 + 2] = r * Math.cos(phi);
        starColor.setHSL(0.55 + Math.random() * 0.1, 0.1, 0.9 + Math.random() * 0.1);
        starColors[i * 3] = starColor.r;
        starColors[i * 3 + 1] = starColor.g;
        starColors[i * 3 + 2] = starColor.b;
        starRandoms[i] = Math.random() * 10.0;
    }
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3).setUsage(THREE.DynamicDrawUsage));
    starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    starGeometry.setAttribute('random', new THREE.BufferAttribute(starRandoms, 1));

    const starMaterial = new THREE.ShaderMaterial({
        uniforms: { time: { value: 0.0 }, size: { value: 4.0 } },
        vertexShader: `
            uniform float time; uniform float size; attribute float random; attribute vec3 color; varying vec3 vColor;
            void main() {
                vColor = color;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                float twinkle = 0.5 * (1.0 + sin(time * (0.1 + random * 0.2) + random * 6.0));
                gl_PointSize = size * twinkle * (1500.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            void main() {
                float dist = distance(gl_PointCoord, vec2(0.5, 0.5));
                if (dist > 0.5) { discard; }
                float strength = 1.0 - dist * 2.0;
                gl_FragColor = vec4(vColor, pow(strength, 2.0));
            }
        `,
        blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    });
    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);

    // --- Infinite Background Dust ---
    const DUST_COUNT = 20000;
    const dustGeometry = new THREE.BufferGeometry();
    const dustPositions = new Float32Array(DUST_COUNT * 3);
    const dustColors = new Float32Array(DUST_COUNT * 3);
    const dustRadius = 6000;
    for (let i = 0; i < DUST_COUNT; i++) {
        const r = Math.random() * dustRadius + 500;
        const theta = Math.random() * 2 * Math.PI;
        const phi = Math.acos(2 * Math.random() - 1);
        dustPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        dustPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        dustPositions[i * 3 + 2] = r * Math.cos(phi);
        starColor.setHSL(0.6, 0.1, 0.6 + Math.random() * 0.2);
        dustColors[i * 3] = starColor.r;
        dustColors[i * 3 + 1] = starColor.g;
        dustColors[i * 3 + 2] = starColor.b;
    }
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3).setUsage(THREE.DynamicDrawUsage));
    dustGeometry.setAttribute('color', new THREE.BufferAttribute(dustColors, 3));
    const dustMaterial = new THREE.ShaderMaterial({
        uniforms: { size: { value: 1.0 } },
        vertexShader: `
            uniform float size; attribute vec3 color; varying vec3 vColor;
            void main() {
                vColor = color;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = size * (2000.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            void main() {
                float dist = distance(gl_PointCoord, vec2(0.5, 0.5));
                if (dist > 0.5) { discard; }
                gl_FragColor = vec4(vColor, 1.0 - dist);
            }
        `,
        blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
    });
    const dust = new THREE.Points(dustGeometry, dustMaterial);
    scene.add(dust);


    // --- Paper Plane Model with Fresnel Shader ---
    const planeGeometry = new THREE.BufferGeometry();
    const initialModel = planeModels[state.currentPlaneModel];
    planeGeometry.setIndex(initialModel.indices);
    planeGeometry.setAttribute('position', new THREE.BufferAttribute(initialModel.vertices, 3));
    planeGeometry.computeVertexNormals();
    
    const planeMaterial = new THREE.ShaderMaterial({
      uniforms: { time: { value: 1.0 }, glowColor: { value: new THREE.Color(0x00ffff) } },
      vertexShader: `
        varying vec3 vNormal; varying vec3 vPosition;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time; uniform vec3 glowColor; varying vec3 vNormal; varying vec3 vPosition;
        void main() {
          float intensity = pow(0.7 - dot(vNormal, normalize(-vPosition)), 2.0);
          intensity += (sin(time * 2.0) * 0.5 + 0.5) * 0.1; // Pulsing
          vec3 baseColor = vec3(0.9, 0.9, 0.9);
          gl_FragColor = vec4(baseColor + glowColor * intensity, 1.0);
        }
      `,
      side: THREE.DoubleSide
    });
    
    const planeMesh = new THREE.Mesh(planeGeometry, planeMaterial);
    const planeGroup = new THREE.Group();
    planeGroup.add(planeMesh);
    planeGroup.scale.set(1.8, 1.8, 1.8);
    scene.add(planeGroup);

    // --- Particle Trail System ---
    const trailParticleGeometry = new THREE.BufferGeometry();
    const trailParticlePositions = new Float32Array(MAX_TRAIL_PARTICLES * 3);
    const trailParticleAlphas = new Float32Array(MAX_TRAIL_PARTICLES);
    trailParticleGeometry.setAttribute('position', new THREE.BufferAttribute(trailParticlePositions, 3).setUsage(THREE.DynamicDrawUsage));
    trailParticleGeometry.setAttribute('alpha', new THREE.BufferAttribute(trailParticleAlphas, 1).setUsage(THREE.DynamicDrawUsage));
    const trailParticleMaterial = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(0x00aaff) }, },
      vertexShader: `
        attribute float alpha; varying float vAlpha;
        void main() { vAlpha = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = (10.0 * alpha) + 2.0; }`,
      fragmentShader: `
        uniform vec3 color; varying float vAlpha;
        void main() { float r = distance(gl_PointCoord, vec2(0.5, 0.5)); if (r > 0.5) { discard; } gl_FragColor = vec4(color, vAlpha * (1.0 - r * 2.0)); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
    });
    const trailParticleSystem = new THREE.Points(trailParticleGeometry, trailParticleMaterial);
    scene.add(trailParticleSystem);
    for (let i = 0; i < MAX_TRAIL_PARTICLES; i++) {
        state.trailParticles.push({
            position: new THREE.Vector3(), velocity: new THREE.Vector3(),
            life: 0, maxLife: Math.random() * 2.0 + 1.5,
        });
    }
    let trailParticleIndex = 0;
    
    // --- Orb Explosion Particle System ---
    const explosionParticleGeometry = new THREE.BufferGeometry();
    const explosionPositions = new Float32Array(MAX_EXPLOSION_PARTICLES * 3);
    const explosionAlphas = new Float32Array(MAX_EXPLOSION_PARTICLES);
    explosionParticleGeometry.setAttribute('position', new THREE.BufferAttribute(explosionPositions, 3).setUsage(THREE.DynamicDrawUsage));
    explosionParticleGeometry.setAttribute('alpha', new THREE.BufferAttribute(explosionAlphas, 1).setUsage(THREE.DynamicDrawUsage));
    const explosionMaterial = new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color(0xffd700) } },
        vertexShader: `
          attribute float alpha; varying float vAlpha;
          void main() { vAlpha = alpha; vec4 mvPosition = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mvPosition; gl_PointSize = (20.0 * alpha) * (300.0 / -mvPosition.z); }`,
        fragmentShader: `
          uniform vec3 color; varying float vAlpha;
          void main() { float r = distance(gl_PointCoord, vec2(0.5, 0.5)); if (r > 0.5) { discard; } gl_FragColor = vec4(color, vAlpha * (1.0 - r * 2.0)); }`,
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
    });
    const explosionSystem = new THREE.Points(explosionParticleGeometry, explosionMaterial);
    scene.add(explosionSystem);
    for (let i = 0; i < MAX_EXPLOSION_PARTICLES; i++) {
        state.explosionParticles.push({
            position: new THREE.Vector3(), velocity: new THREE.Vector3(),
            life: 0, maxLife: Math.random() * 0.8 + 0.4,
        });
    }
    let explosionParticleIndex = 0;

    const triggerExplosion = (position) => {
        const numParticlesToEmit = 50;
        for (let i = 0; i < numParticlesToEmit; i++) {
            const p = state.explosionParticles[explosionParticleIndex];
            p.position.copy(position);
            p.velocity.set( (Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5) ).normalize().multiplyScalar(Math.random() * 150 + 50);
            p.life = p.maxLife;
            explosionParticleIndex = (explosionParticleIndex + 1) % MAX_EXPLOSION_PARTICLES;
        }
    };

    // --- Energy Orbs (Purple & Gold) ---
    const ORB_COUNT = 50;
    const orbGeometry = new THREE.SphereGeometry(15, 16, 16);
    const orbMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0.0 },
        glowColor: { value: new THREE.Color(0xFFD700) }, // Gold
        purpleColor: { value: new THREE.Color(0x9400D3) }, // Purple
      },
      vertexShader: `
        varying vec3 vNormal;
        void main() { vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform float time; uniform vec3 glowColor; uniform vec3 purpleColor; varying vec3 vNormal;
        void main() {
          float pulse = 0.5 * (1.0 + sin(time * 2.0));
          float intensity = pow(0.8 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
          vec3 mixedGlow = mix(purpleColor, glowColor, pow(intensity, 1.5));
          gl_FragColor = vec4(mixedGlow, (intensity + pulse * 0.5) * 0.8);
        }
      `,
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    });
    for (let i = 0; i < ORB_COUNT; i++) {
      const orbMesh = new THREE.Mesh(orbGeometry, orbMaterial.clone());
      orbMesh.position.set( (Math.random() - 0.5) * 8000, (Math.random() - 0.5) * 8000, (Math.random() - 0.5) * 8000 - 1000);
      scene.add(orbMesh);
      state.orbs.push(orbMesh);
    }
    
    // --- Event Handlers ---
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      composer.setSize(window.innerWidth, window.innerHeight);
    };
    const handleMouseMove = (e) => {
      if (!state.hasMoved) state.hasMoved = true;
      state.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      state.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    const handleMouseDown = () => {
      if (!state.isStarted) {
        state.isStarted = true;
        const instructions = document.getElementById('instructions');
        if (instructions) {
          instructions.classList.add('hidden');
        }
      }
      state.isBoosting = true;
    };
    const handleMouseUp = () => { state.isBoosting = false; };
    const handleKeyDown = (e) => {
        if (e.key.toLowerCase() === 'c') {
            state.currentPlaneModel = (state.currentPlaneModel + 1) % planeModels.length;
            const newModel = planeModels[state.currentPlaneModel];
            planeMesh.geometry.setIndex(newModel.indices);
            planeMesh.geometry.setAttribute('position', new THREE.BufferAttribute(newModel.vertices, 3));
            planeMesh.geometry.computeVertexNormals();
            planeMesh.geometry.index.needsUpdate = true;
            planeMesh.geometry.attributes.position.needsUpdate = true;
            planeMesh.geometry.attributes.normal.needsUpdate = true;
        }
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('keydown', handleKeyDown);

    const flightParams = {
        baseSpeed: 300,
        boostMultiplier: 2.5,
        turnSpeed: 1.5,
        bankFactor: 1.2,
        rollSpring: 2.5, // How quickly it tries to bank
        rollDamping: 0.5, // How much it resists banking
    };
    
    const clock = new THREE.Clock();
    const cameraOffset = new THREE.Vector3(0, 50, 200);

    const updateInfiniteParticles = (particleSystem, radius) => {
        const positions = particleSystem.geometry.attributes.position;
        const center = planeGroup.position;
        
        // This vector points out the TAIL of the plane
        _planeDirection.set(0, 0, 1).applyQuaternion(planeGroup.quaternion);

        for (let i = 0; i < positions.count; i++) {
            _updateParticlesVec.fromBufferAttribute(positions, i);
            _relativePosVec.copy(_updateParticlesVec).sub(center);

            // Check if the particle is behind the plane
            if (_relativePosVec.dot(_planeDirection) > 100) { // A small threshold to avoid flicker
                // It's behind, so "summon" it again in front by giving it a new position
                
                // Create a random offset vector
                _newParticlePos
                    .set(
                        (Math.random() - 0.5),
                        (Math.random() - 0.5),
                        (Math.random() - 0.5)
                    )
                    .normalize()
                    .multiplyScalar(Math.random() * radius); // within a sphere of 'radius'

                // Add this offset to a point far in front of the plane
                _newParticlePos
                    .add(center) // start from plane's center
                    .addScaledVector(_planeDirection, -radius * 1.5); // move far in front
                
                positions.setXYZ(i, _newParticlePos.x, _newParticlePos.y, _newParticlePos.z);
            }
        }
        positions.needsUpdate = true;
    };

    const animate = () => {
      requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.1);
      const elapsedTime = clock.getElapsedTime();
      if (delta === 0) return;

      const { plane } = state;
      let currentSpeed = 0;
      
      if (state.isStarted) {
          currentSpeed = (state.isBoosting ? flightParams.baseSpeed * flightParams.boostMultiplier : flightParams.baseSpeed);
          
          // --- Fluid Reactive Motion System ---
          const targetYaw = -state.mouse.x * flightParams.turnSpeed * delta;
          const targetPitch = state.mouse.y * flightParams.turnSpeed * delta;
          
          _yawQuat.setFromAxisAngle({x:0, y:1, z:0}, targetYaw);
          _pitchQuat.setFromAxisAngle({x:1, y:0, z:0}, targetPitch);
          
          _finalQuat.copy(planeGroup.quaternion).multiply(_yawQuat).multiply(_pitchQuat);
          planeGroup.quaternion.slerp(_finalQuat, 1 - Math.pow(0.05, delta));

          // Physics-based banking/roll
          const targetBank = -state.mouse.x * flightParams.bankFactor;
          const bankError = targetBank - plane.currentBank;
          const rollForce = bankError * flightParams.rollSpring;
          const dampingForce = -plane.rollVelocity * flightParams.rollDamping;
          plane.rollVelocity += (rollForce + dampingForce) * delta;
          plane.currentBank += plane.rollVelocity * delta;

          // Add wobble/reactive motion
          const turnRate = Math.abs(state.mouse.x);
          const wobbleFreq = elapsedTime * (state.isBoosting ? 20 : 10);
          const wobbleAmount = turnRate * 0.05 * Math.sin(wobbleFreq);

          // Apply bank and wobble to the plane's up vector
          _euler.setFromQuaternion(planeGroup.quaternion, 'YXZ');
          _euler.z = plane.currentBank + wobbleAmount;
          planeGroup.quaternion.setFromEuler(_euler);
          
          // Update position
          plane.velocity.set(0, 0, -1).applyQuaternion(planeGroup.quaternion).multiplyScalar(currentSpeed * delta);
          plane.position.add(plane.velocity);
      }
      planeGroup.position.copy(plane.position);

      // --- Stable Lerp Camera ---
      _desiredCamPos.copy(cameraOffset).applyQuaternion(planeGroup.quaternion).add(plane.position);
      camera.position.lerp(_desiredCamPos, 1 - Math.pow(0.02, delta));
      
      _camLookAt.copy(plane.position).add(plane.velocity.clone().multiplyScalar(0.2));
      _currentCamLookAt.lerp(_camLookAt, 1 - Math.pow(0.01, delta));
      camera.lookAt(_currentCamLookAt);
      
      // Dynamic FOV
      const speedRatio = (currentSpeed / (flightParams.baseSpeed * flightParams.boostMultiplier));
      const boostFov = state.isBoosting ? 20 : 0;
      camera.fov = 75 + speedRatio * 15 + boostFov;
      camera.updateProjectionMatrix();

      // Subtle Camera Shake (Turbulence)
      const shakeIntensity = speedRatio * (state.isBoosting ? 0.3 : 0.15);
      camera.position.x += state.noise.noise3D(elapsedTime * 2, 0, 0) * shakeIntensity;
      camera.position.y += state.noise.noise3D(0, elapsedTime * 2, 0) * shakeIntensity;

      // --- Animate Shaders ---
      starMaterial.uniforms.time.value = elapsedTime;
      planeMaterial.uniforms.time.value = elapsedTime;
      state.orbs.forEach(orb => orb.material.uniforms.time.value = elapsedTime);
      trailParticleMaterial.uniforms.color.value.set(state.isBoosting ? 0x88ffff : 0x00aaff);

      // --- Infinite Starfield Logic ---
      updateInfiniteParticles(stars, starRadius);
      updateInfiniteParticles(dust, dustRadius);

      // --- Orb collision ---
      const collisionThreshold = 40; 
      for (const orb of state.orbs) {
        if (orb.visible && plane.position.distanceTo(orb.position) < collisionThreshold) {
          orb.visible = false;
          triggerExplosion(orb.position);
          setTimeout(() => {
              const respawnDist = 4000;
              const respawnDir = plane.velocity.clone().normalize();
              orb.position.copy(plane.position)
                .add(respawnDir.multiplyScalar(respawnDist))
                .add(new THREE.Vector3(
                    (Math.random() - 0.5) * 2000,
                    (Math.random() - 0.5) * 2000,
                    (Math.random() - 0.5) * 2000
                ));
              orb.visible = true;
          }, 1000); 
        }
      }

      // --- Trail Particle Emission ---
      const emitInterval = state.isBoosting ? 1 / 150 : 1 / (Math.min(currentSpeed / 20, 50) + 10);
      if (state.hasMoved && currentSpeed > 10 && elapsedTime - state.lastEmitTime > emitInterval) {
          state.lastEmitTime = elapsedTime;
          const p = state.trailParticles[trailParticleIndex];
          _worldTailPosition.copy(_tailOffset).applyMatrix4(planeGroup.matrixWorld);
          p.position.copy(_worldTailPosition);
          p.velocity.copy(plane.velocity).multiplyScalar(-0.2);
          p.life = p.maxLife;
          trailParticleIndex = (trailParticleIndex + 1) % MAX_TRAIL_PARTICLES;
      }
      
      // --- Trail Particle Physics & Updates ---
      const trailPosAttr = trailParticleGeometry.getAttribute('position');
      const trailAlphaAttr = trailParticleGeometry.getAttribute('alpha');
      const noiseScale = 0.02, noiseTime = elapsedTime * 0.8, noiseStrength = 350;
      for (let i = 0; i < MAX_TRAIL_PARTICLES; i++) {
        const p = state.trailParticles[i];
        if (p.life > 0) {
          p.life -= delta;
          const t = Math.max(0, p.life / p.maxLife);
          trailAlphaAttr.setX(i, Math.pow(t, 2));
          const nx = state.noise.noise3D(p.position.x*noiseScale, p.position.y*noiseScale, noiseTime);
          const ny = state.noise.noise3D(p.position.y*noiseScale, p.position.z*noiseScale, noiseTime+100);
          const nz = state.noise.noise3D(p.position.z*noiseScale, p.position.x*noiseScale, noiseTime+200);
          _flowFieldForce.set(nx, ny, nz).multiplyScalar(noiseStrength);
          p.velocity.addScaledVector(_flowFieldForce, delta);
          p.position.addScaledVector(p.velocity, delta);
          p.velocity.multiplyScalar(1 - 1.5 * delta);
          trailPosAttr.setXYZ(i, p.position.x, p.position.y, p.position.z);
        } else { trailAlphaAttr.setX(i, 0); }
      }
      trailPosAttr.needsUpdate = true;
      trailAlphaAttr.needsUpdate = true;
      
      // --- Explosion Particle Physics & Updates ---
      const explosionPosAttr = explosionParticleGeometry.getAttribute('position');
      const explosionAlphaAttr = explosionParticleGeometry.getAttribute('alpha');
      for (let i = 0; i < MAX_EXPLOSION_PARTICLES; i++) {
          const p = state.explosionParticles[i];
          if (p.life > 0) {
              p.life -= delta;
              const t = Math.max(0, p.life / p.maxLife);
              explosionAlphaAttr.setX(i, Math.pow(t, 2));
              p.velocity.multiplyScalar(1 - 0.5 * delta);
              p.position.addScaledVector(p.velocity, delta);
              explosionPosAttr.setXYZ(i, p.position.x, p.position.y, p.position.z);
          } else { explosionAlphaAttr.setX(i, 0); }
      }
      explosionPosAttr.needsUpdate = true;
      explosionAlphaAttr.needsUpdate = true;

      composer.render();
    };

    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('keydown', handleKeyDown);
      if (mountNode) mountNode.removeChild(renderer.domElement);
      renderer.dispose();
      composer.dispose();
    };
  }, []);

  return <div ref={mountRef} />;
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<PaperPlaneApp />);