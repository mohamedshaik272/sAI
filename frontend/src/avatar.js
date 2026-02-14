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

let idleTime = 0;
let blinkTimer = 0;
let nextBlink = 2;

function idleAnimation(delta) {
    idleTime += delta;
    blinkTimer += delta;

    if (vrm.expressionManager) {
        if (blinkTimer >= nextBlink) {
            vrm.expressionManager.setValue('blink', 1);
            setTimeout(() => {
                if (vrm?.expressionManager) vrm.expressionManager.setValue('blink', 0);
            }, 100);
            blinkTimer = 0;
            nextBlink = 2 + Math.random() * 3;
        }
    }

    if (vrm.humanoid) {
        const spine = vrm.humanoid.getNormalizedBoneNode('spine');
        if (spine) {
            spine.rotation.z = Math.sin(idleTime * 0.5) * 0.015;
            spine.rotation.x = Math.sin(idleTime * 0.3) * 0.01;
        }
        const head = vrm.humanoid.getNormalizedBoneNode('head');
        if (head) {
            head.rotation.y = Math.sin(idleTime * 0.4) * 0.03;
            head.rotation.x = Math.sin(idleTime * 0.25) * 0.02;
        }
        const leftArm = vrm.humanoid.getNormalizedBoneNode('leftUpperArm');
        const rightArm = vrm.humanoid.getNormalizedBoneNode('rightUpperArm');
        if (leftArm) leftArm.rotation.z = 0.1 + Math.sin(idleTime * 0.6) * 0.02;
        if (rightArm) rightArm.rotation.z = -0.1 - Math.sin(idleTime * 0.6) * 0.02;
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
