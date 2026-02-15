import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { loadMixamoAnimation } from './loadMixamoAnimation.js';

let scene, camera, renderer, vrm, clock;
let mixer = null;
let currentAction = null;
let idleAction = null;
let currentMouthOpen = 0;
let isSpeaking = false;

const animationsMap = new Map();
const talkingAnimNames = ['anim_1', 'anim_2', 'anim_3'];

// Emotion system
let currentEmotion = 'neutral';
let emotionWeights = { happy: 0, sad: 0, angry: 0, surprised: 0, relaxed: 0 };
const EMOTION_LERP_SPEED = 4;

const EMOTION_TARGETS = {
    'happy':     { happy: 0.7, sad: 0, angry: 0, surprised: 0, relaxed: 0.2 },
    'sad':       { happy: 0, sad: 0.6, angry: 0, surprised: 0, relaxed: 0 },
    'angry':     { happy: 0, sad: 0, angry: 0.5, surprised: 0, relaxed: 0 },
    'surprised': { happy: 0, sad: 0, angry: 0, surprised: 0.7, relaxed: 0 },
    'concerned': { happy: 0, sad: 0.3, angry: 0, surprised: 0, relaxed: 0 },
    'neutral':   { happy: 0, sad: 0, angry: 0, surprised: 0, relaxed: 0 },
};

function safeSetExpression(name, value) {
    if (vrm?.expressionManager) {
        try { vrm.expressionManager.setValue(name, value); } catch {}
    }
}

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

    loadVRM('/models/spongebob.vrm');

    window.addEventListener('resize', onResize);
    animate();
}

export function switchModel(url) {
    // Remove current model from scene
    if (vrm) {
        scene.remove(vrm.scene);
        vrm = null;
    }
    if (mixer) {
        mixer.stopAllAction();
        mixer = null;
    }
    animationsMap.clear();
    currentAction = null;
    idleAction = null;
    loadVRM(url);
}

function loadVRM(url) {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(
        url,
        async (gltf) => {
            vrm = gltf.userData.vrm;
            VRMUtils.removeUnnecessaryVertices(gltf.scene);
            VRMUtils.removeUnnecessaryJoints(gltf.scene);
            vrm.scene.rotation.y = Math.PI;

            // Hide model until idle animation is loaded (prevents T-pose flash)
            gltf.scene.visible = false;
            scene.add(gltf.scene);

            // Auto-frame camera to show full model
            const box = new THREE.Box3().setFromObject(gltf.scene);
            const center = box.getCenter(new THREE.Vector3());
            const size = box.getSize(new THREE.Vector3());
            const dist = size.y * 2.5;
            camera.position.set(0, center.y + size.y * 0.1, dist);
            camera.lookAt(0, center.y + size.y * 0.1, 0);

            if (vrm.expressionManager) {
                const names = vrm.expressionManager.expressions.map(e => e.expressionName);
                console.log('[VRM] Available expressions:', names.join(', '));
            }
            if (vrm.humanoid) {
                const bones = Object.keys(vrm.humanoid.humanBones);
                console.log('[VRM] Available bones:', bones.join(', '));
            }

            // Set up animation mixer
            mixer = new THREE.AnimationMixer(vrm.scene);

            // Load Mixamo animations
            const animNames = ['idle', ...talkingAnimNames];
            for (const name of animNames) {
                try {
                    const clip = await loadMixamoAnimation(`/animations/${name}.fbx`, vrm);
                    clip.name = name;
                    animationsMap.set(name, clip);
                    console.log(`[ANIM] Loaded: ${name}`);
                } catch (e) {
                    console.warn(`[ANIM] Failed to load ${name}:`, e);
                }
            }

            // Start idle animation at full weight so the model looks natural
            if (animationsMap.has('idle')) {
                const idleClip = animationsMap.get('idle');
                idleAction = mixer.clipAction(idleClip);
                idleAction.setEffectiveWeight(1.0);
                idleAction.play();
                currentAction = idleAction;
                console.log('[ANIM] Playing idle');
            }

            // Now show the model (idle pose, not T-pose)
            gltf.scene.visible = true;
        },
        () => {},
        (error) => { console.error('[VRM] Load error:', error); }
    );
}

function playRandomTalkingAnim() {
    if (!mixer || !isSpeaking) return;

    // Pick a random talking animation (different from current)
    const available = talkingAnimNames.filter(n => animationsMap.has(n));
    if (available.length === 0) return;

    let nextName;
    const currentClipName = currentAction?.getClip()?.name;
    do {
        nextName = available[Math.floor(Math.random() * available.length)];
    } while (available.length > 1 && nextName === currentClipName);

    const nextClip = animationsMap.get(nextName);
    if (!nextClip) return;

    const nextAction = mixer.clipAction(nextClip);
    nextAction.reset().setLoop(THREE.LoopOnce, 1).setEffectiveWeight(0.1).play();
    nextAction.clampWhenFinished = true;

    if (currentAction) {
        currentAction.crossFadeTo(nextAction, 0.5, true);
    }
    currentAction = nextAction;

    // When this animation finishes, play another or go back to idle
    const onFinished = (e) => {
        if (e.action === nextAction) {
            mixer.removeEventListener('finished', onFinished);
            if (isSpeaking) {
                playRandomTalkingAnim();
            } else {
                crossFadeToIdle();
            }
        }
    };
    mixer.addEventListener('finished', onFinished);
}

function crossFadeToIdle() {
    if (!idleAction || !currentAction) return;
    idleAction.reset().play();
    currentAction.crossFadeTo(idleAction, 0.5, true);
    currentAction = idleAction;
}

export function startSpeakingAnim() {
    if (!isSpeaking) return;
    playRandomTalkingAnim();
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (mixer) {
        mixer.update(delta);
    }

    if (vrm) {
        vrm.update(delta);
        updateBlink(delta);
        smoothLipSync(delta);
        updateEmotions(delta);
    }

    renderer.render(scene, camera);
}

// --- Blinking ---
let blinkTimer = 0;
let nextBlink = 2;
let blinkPhase = 0;
let blinkValue = 0;

function updateBlink(delta) {
    blinkTimer += delta;

    if (blinkPhase === 0 && blinkTimer >= nextBlink) {
        blinkPhase = 1;
    }
    if (blinkPhase === 1) {
        blinkValue = Math.min(blinkValue + delta * 20, 1);
        if (blinkValue >= 1) blinkPhase = 2;
    } else if (blinkPhase === 2) {
        blinkPhase = 3;
    } else if (blinkPhase === 3) {
        blinkValue = Math.max(blinkValue - delta * 14, 0);
        if (blinkValue <= 0) {
            blinkPhase = 0;
            blinkTimer = 0;
            nextBlink = 1.5 + Math.random() * 3 + Math.random() * 3;
            if (Math.random() < 0.15) nextBlink = 0.2;
        }
    }
    safeSetExpression('blink', blinkValue);
}

// --- Lip sync ---
let targetMouthOpen = 0;
function smoothLipSync(delta) {
    currentMouthOpen += (targetMouthOpen - currentMouthOpen) * Math.min(delta * 20, 1);

    const aa = currentMouthOpen > 0.3 ? (currentMouthOpen - 0.3) / 0.7 * 0.9 : 0;
    const oh = currentMouthOpen < 0.6 ? currentMouthOpen * 0.7 : 0.42 * (1 - (currentMouthOpen - 0.6) / 0.4);
    safeSetExpression('aa', aa);
    safeSetExpression('oh', oh);
}

function updateEmotions(delta) {
    const targets = EMOTION_TARGETS[currentEmotion] || EMOTION_TARGETS['neutral'];
    const speed = EMOTION_LERP_SPEED * delta;

    for (const [name, targetVal] of Object.entries(targets)) {
        emotionWeights[name] += (targetVal - emotionWeights[name]) * Math.min(speed, 1);
        if (Math.abs(emotionWeights[name]) < 0.001) emotionWeights[name] = 0;
        safeSetExpression(name, emotionWeights[name]);
    }
}

export function updateLipSync(intensity) {
    targetMouthOpen = Math.min(intensity * 2.5, 1);
}

export function stopLipSync() {
    targetMouthOpen = 0;
    isSpeaking = false;
    crossFadeToIdle();
}

export function setEmotion(emotion) {
    currentEmotion = emotion;
    isSpeaking = true;
    startSpeakingAnim();
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
