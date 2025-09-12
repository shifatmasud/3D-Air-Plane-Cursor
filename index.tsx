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
    dragStartTime: 0,
    mousePosition: new THREE.Vector3(),
    pathPoints: [],
    flightPathCurve: null,
    rawFlightProgress: 0,
    flightSpeed: 0,
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
    // Vertices are defined to create a classic "dart" paper plane shape with volume.
    // The nose of the plane points towards the -Z axis for correct orientation.
    const vertices = new Float32Array([
      // Vertex positions (x, y, z)
       0,  2, -15, // 0: Nose tip
      -20, -1,  10, // 1: Left wingtip
       20, -1,  10, // 2: Right wingtip
       0,  2,  15, // 3: Tail top center
       0, -2,  15, // 4: Tail bottom center
       0, -2, -10, // 5: Fuselage bottom front
    ]);
    const indices = [
      // Top wing surface (creates dihedral angle)
      0, 1, 2,
      1, 3, 2,
      // Left fuselage side
      0, 5, 1,
      1, 5, 4,
      1, 4, 3,
      // Right fuselage side
      0, 2, 5,
      2, 4, 5,
      2, 3, 4,
    ];
    planeGeometry.setIndex(indices);
    planeGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    planeGeometry.computeVertexNormals();
    const material = new THREE.MeshPhongMaterial({color: 0xffffff, shininess: 100, side: THREE.DoubleSide});
    const plane = new THREE.Mesh(planeGeometry, material);
    plane.scale.set(1.5, 1.5, 1.5);
    scene.add(plane);

    // --- Flight Path Line (Harmonic Glow) ---
    const lineMaterial = new THREE.LineBasicMaterial({ vertexColors: true, linewidth: 2 });
    const lineGeometry = new THREE.BufferGeometry();
    const flightPathLine = new THREE.Line(lineGeometry, lineMaterial);
    scene.add(flightPathLine);
    const startColor = new THREE.Color(0xff4500);
    const endColor = new THREE.Color(0x00ffff);

    // --- Event Handlers ---
    const hideInstructions = () => {
        if (instructionsVisible) {
            setInstructionsVisible(false);
        }
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
        flightPathLine.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(), 3));
    }
    
    const handleInteractionMove = (e) => {
        updateMousePosition(e);
        if (state.isDragging) {
            state.pathPoints.push(state.mousePosition.clone());
            const positions = new Float32Array(state.pathPoints.length * 3);
            const colors = new Float32Array(state.pathPoints.length * 3);
            state.pathPoints.forEach((p, i) => {
                p.toArray(positions, i * 3);
                const t = state.pathPoints.length > 1 ? i / (state.pathPoints.length - 1) : 0;
                new THREE.Color().copy(startColor).lerp(endColor, t).toArray(colors, i * 3);
            });
            flightPathLine.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            flightPathLine.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
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
    
    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);

      if (state.isFlying) {
        state.rawFlightProgress += state.flightSpeed;
        const flightProgress = 1 - Math.pow(1 - state.rawFlightProgress, 4); // Ease-out quart

        if (state.rawFlightProgress >= 1) {
          state.isFlying = false;
          flightPathLine.visible = true;
          flightPathLine.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(), 3));
        } else {
          const newPos = state.flightPathCurve.getPointAt(flightProgress);
          const tangent = state.flightPathCurve.getTangentAt(flightProgress).normalize();
          
          // Determine the banking "up" vector for a more natural turn
          const worldUp = new THREE.Vector3(0, 1, 0);
          // Calculate the side vector (perpendicular to flight direction and world up)
          const sideVector = new THREE.Vector3().crossVectors(tangent, worldUp).normalize();
          // Bank angle is proportional to the horizontal turn speed (tangent.x)
          // We clamp the value to prevent extreme banking
          const bankAmount = Math.max(-0.8, Math.min(0.8, tangent.x * -1.5));
          // Calculate the new "up" vector by tilting the world up vector sideways
          const upVector = new THREE.Vector3().copy(worldUp).add(sideVector.multiplyScalar(bankAmount)).normalize();

          // Set target rotation using the new "up" vector for banking
          const lookAtPos = newPos.clone().add(tangent);
          const targetMatrix = new THREE.Matrix4().lookAt(newPos, lookAtPos, upVector);
          const targetQuaternion = new THREE.Quaternion().setFromRotationMatrix(targetMatrix);

          plane.quaternion.slerp(targetQuaternion, 0.1);
          plane.position.copy(newPos);
        }
      } else {
        // Hover and follow logic (no idle bobbing)
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
      renderer.render(scene, camera);
    };

    animate();

    // Cleanup
    return () => {
      clearTimeout(instructionTimeout);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleInteractionMove);
      window.removeEventListener('mousedown', handleInteractionStart);
      window.removeEventListener('mouseup', handleInteractionEnd);
      mountNode.removeChild(renderer.domElement);
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