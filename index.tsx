/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, {useRef, useEffect, useState} from 'react';
import ReactDOM from 'react-dom/client';
import * as THREE from 'three';

/**
 * Creates and manages the Three.js scene for the paper plane interaction.
 */
const PaperPlaneApp = () => {
  const mountRef = useRef(null);
  const [instructionsVisible, setInstructionsVisible] = useState(true);

  // Using a ref for state that changes in the animation loop prevents re-renders
  const state = useRef({
    isDragging: false,
    isFlying: false,
    isPathFading: false,
    pathFadeProgress: 1,
    dragStartTime: 0,
    mousePosition: new THREE.Vector3(),
    pathPoints: [],
    flightPathCurve: null,
    rawFlightProgress: 0,
    flightSpeed: 0,
    // Trail state
    trailParticles: [],
    lastTrailEmitTime: 0,
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

    // --- Lighting (Simplified) ---
    scene.add(new THREE.HemisphereLight(0xadd8e6, 0x444488, 1.5));

    // --- Paper Plane Model with Depth ---
    const planeGeometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([
       0,  2, -15, -20, -1,  10,  20, -1,  10,
       0,  2,  15,   0, -2,  15,   0, -2, -10,
    ]);
    const indices = [0, 1, 2, 1, 3, 2, 0, 5, 1, 1, 5, 4, 1, 4, 3, 0, 2, 5, 2, 4, 5, 2, 3, 4];
    planeGeometry.setIndex(indices);
    planeGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    planeGeometry.computeVertexNormals();
    const material = new THREE.MeshPhongMaterial({color: 0xffffff, shininess: 100, side: THREE.DoubleSide});
    const plane = new THREE.Mesh(planeGeometry, material);
    plane.scale.set(1.5, 1.5, 1.5);
    scene.add(plane);

    // --- Flight Path Line ---
    const lineMaterial = new THREE.LineBasicMaterial({ vertexColors: true, linewidth: 2, transparent: true });
    const lineGeometry = new THREE.BufferGeometry();
    const flightPathLine = new THREE.Line(lineGeometry, lineMaterial);
    scene.add(flightPathLine);
    const startColor = new THREE.Color(0xff4500);
    const endColor = new THREE.Color(0x00ffff);

    // --- Particle Trail System ---
    const MAX_PARTICLES = 300;
    const trailGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(MAX_PARTICLES * 3);
    const colors = new Float32Array(MAX_PARTICLES * 3);
    trailGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    trailGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const trailMaterial = new THREE.PointsMaterial({
        size: 5,
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const particleSystem = new THREE.Points(trailGeometry, trailMaterial);
    scene.add(particleSystem);

    for (let i = 0; i < MAX_PARTICLES; i++) {
        state.trailParticles.push({
            position: new THREE.Vector3(),
            life: 0,
            maxLife: Math.random() * 60 + 30, // Frames
        });
    }
    let particleIndex = 0;


    // --- Event Handlers ---
    const hideInstructions = () => {
        if (instructionsVisible) setInstructionsVisible(false);
    }
    const instructionTimeout = setTimeout(hideInstructions, 4000);
    
    const handleResize = () => {
      camera.left = -window.innerWidth / 2;
      camera.right = window.innerWidth / 2;
      camera.top = window.innerHeight / 2;
      camera.bottom = -window.innerHeight / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    const updateMousePosition = (e) => {
      state.mousePosition.x = e.clientX - window.innerWidth / 2;
      state.mousePosition.y = -(e.clientY - window.innerHeight / 2);
    };

    const handleInteractionStart = (e) => {
        hideInstructions();
        updateMousePosition(e);
        if (state.isFlying) return;
        state.isDragging = true;
        state.pathPoints = [state.mousePosition.clone()];
        state.dragStartTime = Date.now();
        
        // Reset path line visuals
        state.isPathFading = false;
        lineMaterial.opacity = 1;
        flightPathLine.visible = true;
        flightPathLine.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(), 3));
    }
    
    const handleInteractionMove = (e) => {
        updateMousePosition(e);
        if (state.isDragging) {
            state.pathPoints.push(state.mousePosition.clone());
            const positions = new Float32Array(state.pathPoints.length * 3);
            state.pathPoints.forEach((p, i) => p.toArray(positions, i * 3));
            flightPathLine.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            
            const colorAttribute = flightPathLine.geometry.getAttribute('color');
            if (!colorAttribute || colorAttribute.count !== state.pathPoints.length) {
                flightPathLine.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(state.pathPoints.length * 3), 3));
            }
        }
    };
    
    const handleInteractionEnd = () => {
        if (!state.isDragging || state.pathPoints.length < 5) {
            state.isDragging = false;
            state.pathPoints = [];
            flightPathLine.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(), 3));
            return;
        }
        state.isDragging = false;
        state.isFlying = true;
        state.flightPathCurve = new THREE.CatmullRomCurve3(state.pathPoints, false, 'catmullrom', 0.3);
        state.rawFlightProgress = 0;
        const dragDuration = (Date.now() - state.dragStartTime) / 1000;
        const dragDistance = state.pathPoints[0].distanceTo(state.pathPoints[state.pathPoints.length - 1]);
        state.flightSpeed = Math.max(0.005, Math.min(0.02, (dragDistance / 200) / (dragDuration * 50)));
        flightPathLine.visible = false;
    };
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleInteractionMove);
    window.addEventListener('mousedown', handleInteractionStart);
    window.addEventListener('mouseup', handleInteractionEnd);
    
    const clock = new THREE.Clock();
    const animate = () => {
      requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();
      const delta = clock.getDelta();

      // Path line glow effect
      if (state.isDragging && state.pathPoints.length > 1) {
          const colorAttribute = flightPathLine.geometry.getAttribute('color');
          if (colorAttribute) {
              const colors = colorAttribute.array;
              const hueShift = (Math.sin(elapsedTime * 2) + 1) / 2 * 0.1;
              for (let i = 0; i < state.pathPoints.length; i++) {
                  const t = i / (state.pathPoints.length - 1);
                  const baseColor = new THREE.Color().copy(startColor).lerp(endColor, t);
                  const hsl = { h: 0, s: 0, l: 0 };
                  baseColor.getHSL(hsl);
                  const lightnessPulse = 0.85 + Math.sin(elapsedTime * 8 - i * 0.5) * 0.15;
                  baseColor.setHSL((hsl.h + hueShift) % 1.0, hsl.s, hsl.l * lightnessPulse);
                  baseColor.toArray(colors, i * 3);
              }
              colorAttribute.needsUpdate = true;
          }
      }

      // Plane flight logic
      if (state.isFlying) {
        state.rawFlightProgress += state.flightSpeed;
        const flightProgress = 1 - Math.pow(1 - state.rawFlightProgress, 4);

        if (state.rawFlightProgress >= 1) {
          state.isFlying = false;
          state.isPathFading = true; // Start fading the path
          state.pathFadeProgress = 1.0;
        } else {
          const newPos = state.flightPathCurve.getPointAt(flightProgress);
          const tangent = state.flightPathCurve.getTangentAt(flightProgress).normalize();
          const worldUp = new THREE.Vector3(0, 1, 0);
          const sideVector = new THREE.Vector3().crossVectors(tangent, worldUp).normalize();
          const bankAmount = Math.max(-0.8, Math.min(0.8, tangent.x * -1.5));
          const upVector = new THREE.Vector3().copy(worldUp).add(sideVector.multiplyScalar(bankAmount)).normalize();
          const lookAtPos = newPos.clone().add(tangent);
          const targetMatrix = new THREE.Matrix4().lookAt(newPos, lookAtPos, upVector);
          const targetQuaternion = new THREE.Quaternion().setFromRotationMatrix(targetMatrix);
          plane.quaternion.slerp(targetQuaternion, 0.1);
          plane.position.copy(newPos);
          
          // Emit trail particle
          const p = state.trailParticles[particleIndex];
          p.position.copy(plane.position);
          p.life = p.maxLife;
          particleIndex = (particleIndex + 1) % MAX_PARTICLES;
        }
      } else {
        // Hover and follow logic
        const targetPosition = state.mousePosition.clone();
        const velocity = targetPosition.sub(plane.position).multiplyScalar(0.05);
        plane.position.add(velocity);

        if (velocity.length() > 0.1) {
            const lookAtPos = plane.position.clone().add(velocity);
            const targetQuaternion = new THREE.Quaternion().setFromRotationMatrix(
                new THREE.Matrix4().lookAt(plane.position, lookAtPos, plane.up)
            );
            plane.quaternion.slerp(targetQuaternion, 0.1);
        }
      }

      // Path fade-out logic
      if(state.isPathFading) {
          state.pathFadeProgress -= delta * 0.75; // Fade over ~1.3 seconds
          if(state.pathFadeProgress <= 0) {
              state.isPathFading = false;
              flightPathLine.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(), 3));
          } else {
              lineMaterial.opacity = state.pathFadeProgress;
          }
      }

      // Update particle trail
      const posAttr = trailGeometry.getAttribute('position');
      const colAttr = trailGeometry.getAttribute('color');
      for (let i = 0; i < MAX_PARTICLES; i++) {
        const p = state.trailParticles[i];
        if (p.life > 0) {
          p.life -= 1;
          const t = p.life / p.maxLife; // 1 -> 0
          const scale = t * t; // Ease in
          const alpha = Math.sin(t * Math.PI); // Fade in and out
          
          posAttr.setXYZ(i, p.position.x, p.position.y, p.position.z);
          // Trail color fades from cyan to a darker blue
          colAttr.setXYZ(i, 0.5 * scale, 0.8 * scale, 1.0 * alpha);
        } else {
          posAttr.setXYZ(i, 0, 0, -2000); // Hide dead particles
        }
      }
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
      trailGeometry.computeBoundingSphere();


      renderer.render(scene, camera);
    };

    animate();

    return () => {
      clearTimeout(instructionTimeout);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleInteractionMove);
      window.removeEventListener('mousedown', handleInteractionStart);
      window.removeEventListener('mouseup', handleInteractionEnd);
      if (mountNode) mountNode.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, [instructionsVisible]);

  return (
    <>
        <div ref={mountRef} />
        <div className={`instructions ${instructionsVisible ? '' : 'fade-out'}`} aria-hidden={!instructionsVisible}>
            Move cursor to guide the plane. Click, drag, and release to launch!
        </div>
    </>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<PaperPlaneApp />);
