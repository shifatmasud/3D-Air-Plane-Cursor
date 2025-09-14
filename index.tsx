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

const PaperPlaneApp = () => {
  const mountRef = useRef(null);
  const MAX_PARTICLES = 500;
  
  const { 
    _vec3, _mat4, _lookAt, _flowFieldForce,
    _bankQuat, _targetQuat, _tailOffset, _worldTailPosition,
    _normalizedVelocity, _steeringForce, _desiredVelocity
  } = useMemo(() => ({
      _vec3: new THREE.Vector3(),
      _mat4: new THREE.Matrix4(),
      _lookAt: new THREE.Vector3(),
      _flowFieldForce: new THREE.Vector3(),
      _bankQuat: new THREE.Quaternion(),
      _targetQuat: new THREE.Quaternion(),
      _tailOffset: new THREE.Vector3(0, 0, 15),
      _worldTailPosition: new THREE.Vector3(),
      _normalizedVelocity: new THREE.Vector3(),
      _steeringForce: new THREE.Vector3(),
      _desiredVelocity: new THREE.Vector3(),
  }), []);

  const state = useRef({
    mouseTarget: new THREE.Vector3(),
    plane: {
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        acceleration: new THREE.Vector3(),
    },
    trailParticles: [],
    noise: new SimplexNoise(),
    lastEmitTime: 0,
    hasMoved: false,
  }).current;

  useEffect(() => {
    const mountNode = mountRef.current;
    if (!mountNode) return;

    // --- Scene setup ---
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(
      -window.innerWidth / 2, window.innerWidth / 2,
      window.innerHeight / 2, -window.innerHeight / 2,
      1, 2000
    );
    camera.position.z = 1000;

    const renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
    renderer.setSize(window.innerWidth, window.innerHeight);
    mountNode.appendChild(renderer.domElement);

    // --- Post-processing (Bloom) ---
    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.0, 0.4, 0.85);
    const composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);

    // --- Lighting ---
    scene.add(new THREE.AmbientLight(0xffffff, 0.2));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(500, 500, 1000);
    scene.add(dirLight);
    
    // --- Cursor Target Reticle ---
    const cursorGeometry = new THREE.TorusGeometry(15, 0.5, 8, 32);
    const cursorMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.5 });
    const cursorTarget = new THREE.Mesh(cursorGeometry, cursorMaterial);
    scene.add(cursorTarget);

    // --- Paper Plane Model with Fresnel Shader ---
    const planeGeometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([0,2,-15, -20,-1,10, 20,-1,10, 0,2,15, 0,-2,15, 0,-2,-10]);
    const indices = [0,1,2, 1,3,2, 0,5,1, 1,5,4, 1,4,3, 0,2,5, 2,4,5, 2,3,4];
    planeGeometry.setIndex(indices);
    planeGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    planeGeometry.computeVertexNormals();
    
    const planeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 1.0 },
        glowColor: { value: new THREE.Color(0x00ffff) }
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform vec3 glowColor;
        varying vec3 vNormal;
        varying vec3 vPosition;
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

    // --- Particle Trail System with Custom Shader ---
    const particleGeometry = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(MAX_PARTICLES * 3);
    const particleAlphas = new Float32Array(MAX_PARTICLES);
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3).setUsage(THREE.DynamicDrawUsage));
    particleGeometry.setAttribute('alpha', new THREE.BufferAttribute(particleAlphas, 1).setUsage(THREE.DynamicDrawUsage));
    
    const particleMaterial = new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(0x00aaff) },
      },
      vertexShader: `
        attribute float alpha;
        varying float vAlpha;
        void main() {
          vAlpha = alpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = (10.0 * alpha) + 2.0;
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        varying float vAlpha;
        void main() {
          float r = distance(gl_PointCoord, vec2(0.5, 0.5));
          if (r > 0.5) { discard; }
          gl_FragColor = vec4(color, vAlpha * (1.0 - r * 2.0));
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const particleSystem = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particleSystem);

    for (let i = 0; i < MAX_PARTICLES; i++) {
        state.trailParticles.push({
            position: new THREE.Vector3(), velocity: new THREE.Vector3(),
            life: 0, maxLife: Math.random() * 2.0 + 1.5,
        });
    }
    let particleIndex = 0;
    
    // --- Event Handlers ---
    const handleResize = () => {
      camera.left = -window.innerWidth / 2; camera.right = window.innerWidth / 2;
      camera.top = window.innerHeight / 2; camera.bottom = -window.innerHeight / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      composer.setSize(window.innerWidth, window.innerHeight);
    };

    const handleMouseMove = (e) => {
      if (!state.hasMoved) state.hasMoved = true;
      state.mouseTarget.x = e.clientX - window.innerWidth / 2;
      state.mouseTarget.y = -(e.clientY - window.innerHeight / 2);
    };
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);

    // --- Realistic Flight Parameters ---
    const flightParams = {
        bankFactor: 0.001,
        maxBank: Math.PI / 4,
        maxSpeed: 800,
        maxForce: 25, // Steering force
        damping: 0.98, // Fluid resistance
        slowingRadius: 300, // Distance at which to start slowing down
    };
    
    const clock = new THREE.Clock();
    const animate = () => {
      requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.1);
      const elapsedTime = clock.getElapsedTime();
      if (delta === 0) return;

      const { plane } = state;
      
      // --- Physics: Steering Behavior (Arrival) ---
      // 1. Calculate desired velocity vector pointing from plane to target
      _desiredVelocity.subVectors(state.mouseTarget, plane.position);
      const distance = _desiredVelocity.length();

      // 2. Scale speed based on distance to target (the "arrival" logic)
      let desiredSpeed = flightParams.maxSpeed;
      if (distance < flightParams.slowingRadius) {
          // As we get closer, the desired speed decreases
          desiredSpeed = flightParams.maxSpeed * (distance / flightParams.slowingRadius);
      }
      
      // 3. Scale desired velocity to the calculated speed for this frame
      _desiredVelocity.normalize().multiplyScalar(desiredSpeed * delta);

      // 4. Calculate steering force: desired - current velocity
      _steeringForce.subVectors(_desiredVelocity, plane.velocity);

      // 5. Limit the steering force to a maximum value
      _steeringForce.clampLength(0, flightParams.maxForce * delta);
      
      // 6. Apply the force to acceleration (assuming mass = 1)
      plane.acceleration.add(_steeringForce);

      // 7. Update velocity with acceleration
      plane.velocity.add(plane.acceleration);
      // 8. Apply damping to simulate fluid resistance
      plane.velocity.multiplyScalar(flightParams.damping);
      // 9. Update position with velocity
      plane.position.add(plane.velocity);
      // 10. Reset acceleration for the next frame
      plane.acceleration.multiplyScalar(0);

      // --- Update Meshes ---
      planeGroup.position.copy(plane.position);
      cursorTarget.position.copy(state.mouseTarget);
      
      // Update rotation to face velocity and bank into turns
      if (plane.velocity.lengthSq() > 0.01) {
          // a. Base orientation: Look where you're going
          _lookAt.addVectors(plane.position, plane.velocity);
          _mat4.lookAt(plane.position, _lookAt, planeGroup.up);
          _targetQuat.setFromRotationMatrix(_mat4);

          // b. Banking calculation based on lateral steering force
          const sideVector = _flowFieldForce.copy(plane.velocity).normalize().cross(planeGroup.up);
          const lateralForce = _steeringForce.dot(sideVector);
          const targetBankAngle = THREE.MathUtils.clamp(
              -lateralForce * flightParams.bankFactor, 
              -flightParams.maxBank, 
              flightParams.maxBank
          );
          
          // c. Create a quaternion for the bank and combine it
          _normalizedVelocity.copy(plane.velocity).normalize();
          _bankQuat.setFromAxisAngle(_normalizedVelocity, targetBankAngle);
          _targetQuat.multiply(_bankQuat);
          
          // d. Smoothly rotate towards the target orientation
          const turnSpeed = 1 - Math.pow(0.01, delta);
          planeGroup.quaternion.slerp(_targetQuat, turnSpeed);
      }

      // --- Particle Emission ---
      const speed = plane.velocity.length() / delta; // Get speed in units/sec
      const emitInterval = 1 / (Math.min(speed / 20, 50) + 10);
      
      if (state.hasMoved && speed > 10 && elapsedTime - state.lastEmitTime > emitInterval) {
          state.lastEmitTime = elapsedTime;
          const p = state.trailParticles[particleIndex];
          
          _worldTailPosition.copy(_tailOffset).applyMatrix4(planeGroup.matrixWorld);
          p.position.copy(_worldTailPosition);

          p.velocity.copy(plane.velocity).multiplyScalar(-0.1 / delta); // Adjust for delta
          p.life = p.maxLife;
          particleIndex = (particleIndex + 1) % MAX_PARTICLES;
      }
      
      // --- Particle Physics & Updates ---
      const posAttr = particleGeometry.getAttribute('position');
      const alphaAttr = particleGeometry.getAttribute('alpha');
      const noiseScale = 0.02, noiseTime = elapsedTime * 0.8, noiseStrength = 350;
      
      for (let i = 0; i < MAX_PARTICLES; i++) {
        const p = state.trailParticles[i];
        if (p.life > 0) {
          p.life -= delta;
          const t = Math.max(0, p.life / p.maxLife);
          alphaAttr.setX(i, Math.pow(t, 2));

          const nx = state.noise.noise3D(p.position.x * noiseScale, p.position.y * noiseScale, noiseTime);
          const ny = state.noise.noise3D(p.position.y * noiseScale, p.position.x * noiseScale, noiseTime + 100);
          _flowFieldForce.set(nx, ny, 0).multiplyScalar(noiseStrength);
          
          p.velocity.addScaledVector(_flowFieldForce, delta);
          p.position.addScaledVector(p.velocity, delta);
          p.velocity.multiplyScalar(1 - 1.5 * delta);

          posAttr.setXYZ(i, p.position.x, p.position.y, p.position.z);
        } else {
          alphaAttr.setX(i, 0);
        }
      }
      posAttr.needsUpdate = true;
      alphaAttr.needsUpdate = true;

      planeMaterial.uniforms.time.value = elapsedTime;

      composer.render();
    };

    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      if (mountNode) mountNode.removeChild(renderer.domElement);
      renderer.dispose();
      composer.dispose();
    };
  }, []);

  return <div ref={mountRef} />;
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<PaperPlaneApp />);