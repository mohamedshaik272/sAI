import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

let scene, camera, renderer, vrm, clock;
let currentMouthOpen = 0;

export function initAvatar() {
    const canvas = document.getElementById('canvas');

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    camera = new THREE.PerspectiveCamera(25, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 1.4, 2.5);
    camera.lookAt(0, 1.3, 0);

    renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        powerPreference: 'high-performance'
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
    keyLight.position.set(2, 3, 2);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x8888ff, 0.4);
    fillLight.position.set(-2, 1, 2);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffee, 0.6);
    rimLight.position.set(0, 2, -2);
    scene.add(rimLight);

    clock = new THREE.Clock();

    loadVRM('/models/avatar.vrm');

    window.addEventListener('resize', onResize);
    animate();
}

function loadVRM(url) {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(
        url,
        (gltf) => {
            vrm = gltf.userData.vrm;
            VRMUtils.removeUnnecessaryVertices(gltf.scene);
            VRMUtils.removeUnnecessaryJoints(gltf.scene);
            scene.add(gltf.scene);
            vrm.scene.rotation.y = Math.PI;
            setRestingPose();
        },
        () => {},
        () => {}
    );
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (vrm) {
        vrm.update(delta);
        idleAnimation(delta);
        smoothLipSync(delta);
    }

    renderer.render(scene, camera);
}

// Resting pose values (arms down, natural stance)
const REST_POSE = {
    leftUpperArm:  { z:  1.2, x: 0.0, y:  0.15 },
    rightUpperArm: { z: -1.2, x: 0.0, y: -0.15 },
    leftLowerArm:  { z: 0.0, x: -0.25, y: 0.0 },
    rightLowerArm: { z: 0.0, x: -0.25, y: 0.0 },
    leftHand:      { z:  0.15, x: 0.0, y: 0.0 },
    rightHand:     { z: -0.15, x: 0.0, y: 0.0 },
    spine:         { z: 0.0, x: 0.02, y: 0.0 },
    chest:         { z: 0.0, x: 0.0, y: 0.0 },
    hips:          { z: 0.0, x: 0.0, y: 0.0 },
};

function setRestingPose() {
    if (!vrm?.humanoid) return;
    for (const [boneName, rot] of Object.entries(REST_POSE)) {
        const bone = vrm.humanoid.getNormalizedBoneNode(boneName);
        if (bone) {
            bone.rotation.set(rot.x, rot.y, rot.z);
        }
    }
}

let idleTime = 0;
let blinkTimer = 0;
let nextBlink = 2;
let blinkPhase = 0; // 0 = open, 1 = closing, 2 = closed, 3 = opening
let blinkValue = 0;

function idleAnimation(delta) {
    idleTime += delta;
    blinkTimer += delta;

    if (!vrm.humanoid) return;

    // --- Smooth blinking ---
    if (vrm.expressionManager) {
        if (blinkPhase === 0 && blinkTimer >= nextBlink) {
            blinkPhase = 1;
        }
        if (blinkPhase === 1) {
            blinkValue = Math.min(blinkValue + delta * 18, 1);
            if (blinkValue >= 1) blinkPhase = 2;
        } else if (blinkPhase === 2) {
            // Hold closed briefly
            blinkPhase = 3;
        } else if (blinkPhase === 3) {
            blinkValue = Math.max(blinkValue - delta * 12, 0);
            if (blinkValue <= 0) {
                blinkPhase = 0;
                blinkTimer = 0;
                nextBlink = 2 + Math.random() * 4;
            }
        }
        vrm.expressionManager.setValue('blink', blinkValue);
    }

    // --- Breathing (chest + spine) ---
    const breathCycle = Math.sin(idleTime * 1.8) * 0.5 + 0.5; // 0-1
    const spine = vrm.humanoid.getNormalizedBoneNode('spine');
    if (spine) {
        spine.rotation.x = REST_POSE.spine.x + breathCycle * 0.012;
        spine.rotation.z = REST_POSE.spine.z + Math.sin(idleTime * 0.4) * 0.008;
    }
    const chest = vrm.humanoid.getNormalizedBoneNode('chest');
    if (chest) {
        chest.rotation.x = breathCycle * 0.008;
    }

    // --- Head micro-movements (look around subtly) ---
    const head = vrm.humanoid.getNormalizedBoneNode('head');
    if (head) {
        head.rotation.y = Math.sin(idleTime * 0.3) * 0.05 + Math.sin(idleTime * 0.7) * 0.02;
        head.rotation.x = Math.sin(idleTime * 0.2) * 0.03 + Math.sin(idleTime * 0.5) * 0.01;
        head.rotation.z = Math.sin(idleTime * 0.25) * 0.015;
    }

    // --- Arms: natural sway from resting pose ---
    const leftUpperArm = vrm.humanoid.getNormalizedBoneNode('leftUpperArm');
    const rightUpperArm = vrm.humanoid.getNormalizedBoneNode('rightUpperArm');
    if (leftUpperArm) {
        leftUpperArm.rotation.z = REST_POSE.leftUpperArm.z + Math.sin(idleTime * 0.5) * 0.03;
        leftUpperArm.rotation.x = REST_POSE.leftUpperArm.x + Math.sin(idleTime * 0.35) * 0.02;
    }
    if (rightUpperArm) {
        rightUpperArm.rotation.z = REST_POSE.rightUpperArm.z - Math.sin(idleTime * 0.5) * 0.03;
        rightUpperArm.rotation.x = REST_POSE.rightUpperArm.x + Math.sin(idleTime * 0.35 + 0.5) * 0.02;
    }

    // --- Forearms: subtle movement ---
    const leftLowerArm = vrm.humanoid.getNormalizedBoneNode('leftLowerArm');
    const rightLowerArm = vrm.humanoid.getNormalizedBoneNode('rightLowerArm');
    if (leftLowerArm) {
        leftLowerArm.rotation.x = REST_POSE.leftLowerArm.x + Math.sin(idleTime * 0.6) * 0.015;
    }
    if (rightLowerArm) {
        rightLowerArm.rotation.x = REST_POSE.rightLowerArm.x + Math.sin(idleTime * 0.6 + 0.3) * 0.015;
    }

    // --- Hips: very subtle weight shift ---
    const hips = vrm.humanoid.getNormalizedBoneNode('hips');
    if (hips) {
        hips.rotation.z = Math.sin(idleTime * 0.15) * 0.01;
        hips.position.y = (hips.position.y || 0) + Math.sin(idleTime * 1.8) * 0.0005;
    }
}

let targetMouthOpen = 0;
function smoothLipSync(delta) {
    currentMouthOpen += (targetMouthOpen - currentMouthOpen) * Math.min(delta * 20, 1);

    if (vrm && vrm.expressionManager) {
        vrm.expressionManager.setValue('aa', currentMouthOpen * 0.8);
        vrm.expressionManager.setValue('oh', currentMouthOpen * 0.3);
    }
}

export function updateLipSync(intensity) {
    targetMouthOpen = Math.min(intensity * 2.5, 1);
}

export function stopLipSync() {
    targetMouthOpen = 0;
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
