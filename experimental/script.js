import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ==========================================
// --- GESTOR DE AUDIO ---
// ==========================================
const AudioManager = {
    sounds: {},
    audioContextResumed: false,
    init: function() {
        const basePath = './assets/sonidos/';
        
        // Ambientes reducidos un 45% par que no saturen el audio general, y se ajusta el volumen de cada uno según su importancia
        const audioFiles = [
            { id: 'ambiente', src: 'ambiente_base_exp.ogg', loop: true, vol: 0.055 }, 
            { id: 'caida', src: 'caida.ogg', vol: 0.56 },
            { id: 'cumbre', src: 'cumbre.ogg', vol: 0.63 },
            { id: 'eclipse_off', src: 'efectooff_eclipse.ogg', vol: 0.56 },
            { id: 'fondo_gravedad', src: 'fondo_anomalia_gravitacional.ogg', loop: true, vol: 0.19 }, 
            { id: 'fondo_vortice', src: 'fondo_anomalia_vortice.ogg', loop: true, vol: 0.19 }, 
            { id: 'tension', src: 'tension_estructural_5s.ogg', vol: 0.63 },
            { id: 'ticking', src: 'ticking.ogg', loop: true, vol: 0.56 },
            { id: 'error', src: 'error_dentro_eventos.ogg', vol: 0.8 }, 
            { id: 'seleccion_evento', src: 'seleccion_dentro_eventos.ogg', vol: 0.8 }, 
            { id: 'event_loss', src: 'eventloss.ogg', vol: 0.56 },
            { id: 'seleccion_nodo', src: 'seleccion_nodos.ogg', vol: 0.9 }, 
            { id: 'giro1', src: 'giro_torre1.ogg', vol: 0.3 },
            { id: 'giro2', src: 'giro_torre2.ogg', vol: 0.3 },
            { id: 'intro_evento', src: 'intro_eventos.ogg', vol: 0.56 },
            { id: 'swoosh', src: 'swoosh.ogg', vol: 0.2 },
            { id: 'ruleta', src: 'ruleta.ogg', vol: 0.3 }, 
            { id: 'color_escogido', src: 'color_escogido.ogg', vol: 0.5 } 
        ];

        audioFiles.forEach(file => {
            const audio = new Audio(basePath + file.src);
            audio.loop = file.loop || false;
            audio.volume = file.vol || 1.0;
            audio.dataset.baseVolume = file.vol || 1.0; 
            this.sounds[file.id] = audio;
        });
    },
    play: function(id) {
        if (this.sounds[id]) {
            // El swoosh se clonó para que puedan sonar múltiples veces rápidas superpuestas
            if (id === 'swoosh') {
                const clone = this.sounds[id].cloneNode();
                clone.volume = parseFloat(this.sounds[id].dataset.baseVolume);
                clone.play().catch(e => console.warn(e));
            } else {
                this.sounds[id].currentTime = 0;
                this.sounds[id].volume = parseFloat(this.sounds[id].dataset.baseVolume);
                this.sounds[id].play().catch(e => console.warn("Audio bloqueado por el navegador", e));
            }
        }
    },
    stop: function(id) {
        if (this.sounds[id]) {
            this.sounds[id].pause();
            this.sounds[id].currentTime = 0;
        }
    },
    playRandom: function(idArray) {
        const id = idArray[Math.floor(Math.random() * idArray.length)];
        this.play(id);
    },
    fadeOut: function(id, duration = 1500) {
        if (!this.sounds[id] || this.sounds[id].paused) return;
        const audio = this.sounds[id];
        const startVol = audio.volume;
        const steps = 30;
        const stepTime = duration / steps;
        let currentStep = 0;

        const fadeInterval = setInterval(() => {
            currentStep++;
            let newVol = startVol * (1 - (currentStep / steps));
            if (newVol < 0) newVol = 0;
            audio.volume = newVol;

            if (currentStep >= steps) {
                clearInterval(fadeInterval);
                audio.pause();
                audio.currentTime = 0;
                audio.volume = parseFloat(audio.dataset.baseVolume); 
            }
        }, stepTime);
    }
};

AudioManager.init();
// ==========================================

// --- PANTALLA DE CARGA / INTERACCIÓN INICIAL ---
// Esto se coloco para solucionar el bloqueo de audio del navegador forzando un primer clic
const startOverlay = document.createElement('div');
startOverlay.id = 'start-overlay';
Object.assign(startOverlay.style, {
    position: 'absolute', top: '0', left: '0', width: '100vw', height: '100vh',
    backgroundColor: '#ffffff', zIndex: '9999', display: 'flex',
    justifyContent: 'center', alignItems: 'center',
    fontFamily: "'Manrope', sans-serif", fontSize: '20px', letterSpacing: '4px',
    fontWeight: '800', cursor: 'wait', transition: 'opacity 0.8s ease',
    color: '#111111'
});
startOverlay.innerHTML = '<span style="animation: pulse 1.5s infinite">CARGANDO EXPERIENCIA...</span>';
document.body.appendChild(startOverlay);

const stylePulse = document.createElement('style');
stylePulse.innerHTML = `@keyframes pulse { 0% { opacity: 0.4; } 50% { opacity: 1; } 100% { opacity: 0.4; } }`;
document.head.appendChild(stylePulse);
// -----------------------------------------------

const gamePalette = [
    0xDA251D, // Rojo
    0x00539B, // Azul
    0xFFC72C, // Amarillo
    0x00853F  // Verde
];

let mode = 'experimental';
let levels = []; 
let currentLevel = -1; 
let pathPoints = [];
let targetHex = null;
let isCycling = false; 
let activeSandboxLevel = null; 

// --- MINIJUEGOS Y EVENTOS ---
let isEclipseMode = false;
let isTensionMode = false;
let tensionClicks = 0;
let tensionTarget = 16; 
let tensionTimeLeft = 5.0; 
let tensionInterval = null;

// TORBELLINO DE NODOS
let isTorbellinoMode = false;
let torbellinoGroup = new THREE.Group();
let torbellinoNodes = []; 
let torbellinoRequired = 0;   
let torbellinoFoundCount = 0; 
let torbellinoMemorizing = false; 
let torbellinoSlowed = false; 
let torbellinoTimer = null;
let torbellinoErrors = 0;
const TORBELLINO_MAX_ERRORS = 3;

// GRAVEDAD CERO
let isZeroGravity = false;
let gravedadTimerInterval = null;
let gravedadTimeLeft = 20.0;
const GRAVEDAD_TIME_LIMIT = 20.0;
let isTickingGravedad = false; 

// --- POOL DE EVENTOS ---
let eventPool = [
    { id: 'tension', prob: 0.12, fired: false },
    { id: 'torbellino', prob: 0.12, fired: false },
    { id: 'gravedad', prob: 0.12, fired: false },
    { id: 'eclipse', prob: 0.12, fired: false }
];

let markerMesh = null;
const threadLines = []; 

// ELEMENTOS DOM
const uiLayer = document.getElementById('ui-layer'); 
const uiGame = document.getElementById('game-ui');
const colorTarget = document.getElementById('color-target');
const txtTargetLabel = document.getElementById('target-label');
const levelDisplay = document.getElementById('level-display');

const btnReglas = document.getElementById('btn-reglas');
const panelReglas = document.getElementById('panel-reglas');
const btnCerrarReglas = document.getElementById('btn-cerrar-reglas');
const btnVolver = document.getElementById('btn-volver');
const btnLeft = document.getElementById('btn-left');
const btnRight = document.getElementById('btn-right');

const winTitle = document.getElementById('win-title');
const btnRestart = document.getElementById('btn-restart');

const eclipseOverlay = document.getElementById('eclipse-overlay');
const btnEclipseStart = document.getElementById('btn-eclipse-start');

const tensionUI = document.getElementById('tension-ui');
const tensionProgress = document.getElementById('tension-progress');

const torbellinoOverlay = document.getElementById('torbellino-overlay');
const btnTorbellinoStart = document.getElementById('btn-torbellino-start');
const torbellinoColorName = document.getElementById('torbellino-color-name');

const torbellinoUI = document.getElementById('torbellino-ui');
const torbellinoDotsContainer = document.getElementById('torbellino-dots');

const gravedadOverlay = document.getElementById('gravedad-overlay'); 
const btnGravedadStart = document.getElementById('btn-gravedad-start');

if(eclipseOverlay) eclipseOverlay.style.pointerEvents = 'none';
if(gravedadOverlay) gravedadOverlay.style.pointerEvents = 'none';
if(torbellinoOverlay) torbellinoOverlay.style.pointerEvents = 'none';

// SETUP BÁSICO THREE.JS
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);

const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

renderer.outputColorSpace = THREE.SRGBColorSpace; 
renderer.toneMapping = THREE.ACESFilmicToneMapping; 
renderer.toneMappingExposure = 1.1; 

document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

scene.add(torbellinoGroup);
torbellinoGroup.visible = false;

const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); 
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0xdddddd, 0.8);
hemiLight.position.set(0, 50, 0);
scene.add(hemiLight);

const dirLightFront = new THREE.DirectionalLight(0xffffff, 1.8);
dirLightFront.position.set(20, 40, 20);
scene.add(dirLightFront);

const dirLightBack = new THREE.DirectionalLight(0xffffff, 0.4);
dirLightBack.position.set(-20, 20, -20);
scene.add(dirLightBack);

const flashlight = new THREE.PointLight(0xffffff, 0, 4, 2); 
scene.add(flashlight);

const markerGeo = new THREE.ConeGeometry(0.5, 0.5, 3); 
markerGeo.rotateX(-Math.PI / 2); 
const markerMat = new THREE.MeshStandardMaterial({ 
    color: 0x9D4EDD, 
    emissive: 0x5a189a, 
    emissiveIntensity: 0.6,
    roughness: 0.2, 
    metalness: 0.3 
});
markerMesh = new THREE.Mesh(markerGeo, markerMat);

// CARGA DEL MODELO
const loader = new GLTFLoader();
loader.load('./assets/Polkup3d.glb', (gltf) => {
    const model = gltf.scene;
    const meshes = [];

    model.traverse((child) => {
        if (child.isMesh) {
            if(child.material) {
                if (Array.isArray(child.material)) {
                    child.material = child.material.map(m => {
                        const newMat = m.clone();
                        newMat.roughness = 0.6; 
                        newMat.metalness = 0.1;
                        newMat.transparent = true;
                        newMat.opacity = 1.0;
                        return newMat;
                    });
                } else {
                    child.material = child.material.clone();
                    child.material.roughness = 0.6;
                    child.material.metalness = 0.1;
                    child.material.transparent = true;
                    child.material.opacity = 1.0;
                }
            }

            child.geometry = child.geometry.clone();
            child.geometry.computeBoundingBox();
            const localCenter = new THREE.Vector3();
            child.geometry.boundingBox.getCenter(localCenter);
            child.geometry.translate(-localCenter.x, -localCenter.y, -localCenter.z);
            child.position.add(localCenter);
            child.updateMatrix();

            const box = new THREE.Box3().setFromObject(child);
            const center = new THREE.Vector3();
            box.getCenter(center);
            meshes.push({ mesh: child, y: center.y });
        }
    });

    meshes.sort((a, b) => a.y - b.y);

    let currentY = -Infinity;
    let currentGroup = null;

    meshes.forEach(item => {
        if (Math.abs(item.y - currentY) > 0.5) { 
            currentGroup = new THREE.Group();
            scene.add(currentGroup);
            levels.push({ group: currentGroup, nodes: [], yRef: item.y });
            currentY = item.y;
        }
        
        currentGroup.add(item.mesh);

        const mat = Array.isArray(item.mesh.material) ? item.mesh.material[0] : item.mesh.material;
        if (mat && mat.color) {
            const lightness = 0.2126 * mat.color.r + 0.7152 * mat.color.g + 0.0722 * mat.color.b;
            if (lightness < 0.85) { 
                item.mesh.userData.isNode = true;
                mat.roughness = 0.4;
                levels[levels.length - 1].nodes.push(item.mesh);
            } else {
                item.mesh.userData.isStructure = true;
                mat.color.setHex(0xffffff);
                mat.emissive.setHex(0x333333); 
                mat.roughness = 0.9; 
            }
        }
    });

    levels.forEach(level => {
        level.nodes.sort((a, b) => {
            const posA = new THREE.Vector3(); a.getWorldPosition(posA);
            const posB = new THREE.Vector3(); b.getWorldPosition(posB);
            return Math.atan2(posA.z, posA.x) - Math.atan2(posB.z, posB.x);
        });
        const shuffledPalette = [...gamePalette].sort(() => Math.random() - 0.5);
        level.nodes.forEach((node, index) => {
            const mat = Array.isArray(node.material) ? node.material[0] : node.material;
            mat.color.setHex(shuffledPalette[index % shuffledPalette.length]);
        });
    });

    startOverlay.style.cursor = 'pointer';
    startOverlay.innerHTML = '<span style="animation: pulse 1.5s infinite">HAZ CLIC PARA COMENZAR</span>';
    
    startOverlay.addEventListener('click', () => {
        if (!AudioManager.audioContextResumed) {
            AudioManager.audioContextResumed = true;
            AudioManager.play('ambiente');
        }
        startOverlay.style.opacity = '0';
        setTimeout(() => startOverlay.remove(), 800);
        
        iniciarAscension(); 
    });

}, undefined, (error) => console.error("Error cargando el modelo:", error));

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function iniciarAscension() {
    currentLevel = -1; 
    pathPoints = [];
    isCycling = true; 
    activeSandboxLevel = null;
    
    endEclipse(); 
    endTension(true); 
    endTorbellino_reset(); 
    endZeroGravityForce();
    stopGravedadTimer(); 

    eventPool.forEach(e => e.fired = false);

    if (gravedadOverlay) gravedadOverlay.classList.add('hidden-fade');
    if (torbellinoOverlay) torbellinoOverlay.classList.add('hidden-fade');
    if (winTitle) winTitle.classList.add('hidden-fade');
    if (btnRestart) btnRestart.classList.add('hidden-fade');
    
    if(btnReglas) btnReglas.classList.add('fade-hidden');
    if(btnVolver) btnVolver.classList.add('fade-hidden');
    if(btnLeft) btnLeft.classList.add('fade-hidden');
    if(btnRight) btnRight.classList.add('fade-hidden');
    if(uiGame) uiGame.classList.add('fade-hidden');
    if(levelDisplay) levelDisplay.classList.add('fade-hidden');
    
    threadLines.forEach(line => {
        scene.remove(line);
        if(line.geometry) line.geometry.dispose();
    });
    threadLines.length = 0;
    if (scene.children.includes(markerMesh)) scene.remove(markerMesh);

    mode = 'experimental';
    controls.enableRotate = false; 
    controls.enablePan = false;    
    controls.enableZoom = true;    

    levels.forEach(lvl => {
        lvl.group.visible = true;
        lvl.group.children.forEach(mesh => {
            if(mesh.material) {
                if (Array.isArray(mesh.material)) {
                    mesh.material.forEach(m => m.opacity = 1);
                } else {
                    mesh.material.opacity = 1;
                }
            }
        });
    });

    actualizarUI(); 

    const topY = levels[levels.length - 1].yRef;
    const bottomY = levels[0].yRef;
    camera.position.set(0, topY + 2, 14);
    controls.target.set(0, topY, 0);
    controls.update();

    gsap.to(camera.position, {
        x: 0, y: topY + 20, z: 75,
        duration: 2.8, delay: 0.8, ease: "power2.inOut",
        onUpdate: () => controls.update()
    });
    gsap.to(controls.target, {
        x: 0, y: topY * 0.6, z: 0,
        duration: 2.8, delay: 0.8, ease: "power2.inOut",
        onComplete: iniciarRotacion360
    });
}

function iniciarRotacion360() {
    const topY = levels[levels.length - 1].yRef;
    const bottomY = levels[0].yRef;
    const orbitRadius = 75;
    const orbitHeight = camera.position.y; 
    const orbitDuration = 7.0; 
    const startAngle = Math.atan2(camera.position.x, camera.position.z);
    const orbitState = { angle: startAngle, targetY: controls.target.y };

    const nivelesAOcultar = levels.slice(1).reverse();
    const totalNiveles = nivelesAOcultar.length;

    nivelesAOcultar.forEach((lvl, i) => {
        const progress = 0.10 + (i / Math.max(totalNiveles - 1, 1)) * 0.70;
        const delay = progress * orbitDuration;
        const flyDuration = 0.9;
        const flyDistance = 35; 

        gsap.delayedCall(delay, () => {
            AudioManager.play('swoosh'); 
            gsap.to(lvl.group.position, {
                y: lvl.group.position.y + flyDistance,
                duration: flyDuration,
                ease: "power2.in",
                onComplete: () => {
                    lvl.group.visible = false;
                    lvl.group.position.y -= flyDistance; 
                }
            });
        });
    });

    gsap.to(orbitState, {
        targetY: bottomY, duration: orbitDuration * 0.55, delay: orbitDuration * 0.45, ease: "power2.inOut"
    });

    gsap.to(orbitState, {
        angle: startAngle + Math.PI * 2, duration: orbitDuration, ease: "power1.inOut",
        onUpdate: () => {
            const progress = (orbitState.angle - startAngle) / (Math.PI * 2);
            camera.position.x = Math.sin(orbitState.angle) * orbitRadius;
            camera.position.z = Math.cos(orbitState.angle) * orbitRadius;
            camera.position.y = orbitHeight - (orbitHeight - (bottomY + 6)) * Math.max(0, (progress - 0.45) / 0.55);
            controls.target.set(0, orbitState.targetY, 0);
            controls.update();
        },
        onComplete: () => {
            gsap.to(camera.position, {
                x: 0, y: bottomY + 5, z: 55,
                duration: 1.5, ease: "power2.inOut",
                onUpdate: () => controls.update()
            });
            gsap.to(controls.target, {
                x: 0, y: bottomY, z: 0,
                duration: 1.5, ease: "power2.inOut",
                onComplete: () => {
                    if(btnReglas) btnReglas.classList.remove('fade-hidden');
                    if(btnVolver) btnVolver.classList.remove('fade-hidden');
                    if(btnLeft) btnLeft.classList.remove('fade-hidden');
                    if(btnRight) btnRight.classList.remove('fade-hidden');
                    if(uiGame) uiGame.classList.remove('fade-hidden');
                    if(levelDisplay) levelDisplay.classList.remove('fade-hidden'); 
                    actualizarUI();
                }
            });
        }
    });
}

function actualizarUI() {
    const total = levels.length - 1;
    const displayLvl = currentLevel === -1 ? 0 : currentLevel;
    levelDisplay.innerText = `NIVEL ${displayLvl} / ${total}`;

    if (currentLevel === -1) {
        isCycling = false; 
        targetHex = 'ANY'; 
        txtTargetLabel.innerText = "INICIO LIBRE:";
        colorTarget.style.backgroundColor = "transparent";
        colorTarget.style.borderColor = "var(--text-main)"; 
    } else {
        if (currentLevel < levels.length - 1) {
            colorTarget.style.borderColor = "rgba(0,0,0,0.15)"; 
            const nextNodes = levels[currentLevel + 1].nodes;
            if(nextNodes.length > 0) {
                const randomNode = nextNodes[Math.floor(Math.random() * nextNodes.length)];
                const matSeguro = Array.isArray(randomNode.material) ? randomNode.material[0] : randomNode.material;
                const hex = matSeguro.color.getHexString();
                animarSecuenciaColor(hex);
            }
        } else {
            colorTarget.style.background = "transparent";
            colorTarget.style.borderColor = "transparent";
            uiGame.classList.add('fade-hidden'); 
            gsap.delayedCall(0.8, animarDescensoCumbre);
        }
    }
}

function animarDescensoCumbre() {
    if (pathPoints.length < 2) return;

    const topY      = levels[levels.length - 1].yRef;
    const bottomY   = levels[0].yRef;
    const towerHeight = topY - bottomY;
    const endRadius   = towerHeight * 3.2;
    const endHeight   = bottomY + towerHeight * 0.5;

    const N_SAMPLES = 300;
    const curveAngles = []; 
    const curveHeights = []; 

    const allRoutePoints = [];
    for (let i = 0; i < pathPoints.length - 1; i++) {
        const seg = generarPuntosRuta(pathPoints[i], pathPoints[i + 1]);
        if (i > 0) seg.shift();
        allRoutePoints.push(...seg);
    }
    const fullCurve = new THREE.CatmullRomCurve3(allRoutePoints, false, 'catmullrom', 0.5);

    let prevAngle = Math.atan2(camera.position.x, camera.position.z);
    for (let i = 0; i < N_SAMPLES; i++) {
        const t = i / (N_SAMPLES - 1);
        const pt = fullCurve.getPoint(1.0 - t); 
        const rawAngle = Math.atan2(pt.x, pt.z);
        let delta = rawAngle - (prevAngle % (Math.PI * 2));
        if (delta >  Math.PI) delta -= Math.PI * 2;
        if (delta < -Math.PI) delta += Math.PI * 2;
        prevAngle = prevAngle + delta;
        curveAngles.push(prevAngle);
        curveHeights.push(pt.y);
    }

    const startAngle  = curveAngles[0];
    const startHeight = curveHeights[0];
    const startRadius = Math.sqrt(camera.position.x ** 2 + camera.position.z ** 2);

    const state = { progress: 0 };
    const totalDuration = 7.0;

    let smoothAngle  = startAngle;
    let smoothHeight = startHeight;
    let smoothRadius = startRadius;
    let smoothTargetY = startHeight;

    gsap.to(state, {
        progress: 1.0, duration: totalDuration, ease: "power1.inOut",
        onUpdate: () => {
            const idx = Math.min(N_SAMPLES - 1, Math.floor(state.progress * (N_SAMPLES - 1)));
            const frac = state.progress * (N_SAMPLES - 1) - idx;
            const nextIdx = Math.min(N_SAMPLES - 1, idx + 1);

            const targetAngle  = curveAngles[idx]  + (curveAngles[nextIdx]  - curveAngles[idx])  * frac;
            const targetHeight = curveHeights[idx] + (curveHeights[nextIdx] - curveHeights[idx]) * frac;
            const targetRadius = startRadius + (endRadius - startRadius) * state.progress;
            const camTargetY = targetHeight * (1 - state.progress) + endHeight * state.progress;

            const lerpFactor = 0.08;
            smoothAngle   += (targetAngle  - smoothAngle)   * lerpFactor;
            smoothHeight  += (targetHeight - smoothHeight)   * lerpFactor;
            smoothRadius  += (targetRadius - smoothRadius)   * lerpFactor;
            smoothTargetY += (camTargetY   - smoothTargetY)  * lerpFactor;

            camera.position.set(
                Math.sin(smoothAngle) * smoothRadius,
                smoothHeight,
                Math.cos(smoothAngle) * smoothRadius
            );
            controls.target.set(0, smoothTargetY, 0);
            controls.update();
        },
        onComplete: () => {
            const finalAngle = smoothAngle;
            gsap.to(camera.position, {
                x: Math.sin(finalAngle) * endRadius, y: endHeight + towerHeight * 0.12, z: Math.cos(finalAngle) * endRadius,
                duration: 1.8, ease: "power2.inOut", onUpdate: () => controls.update()
            });
            AudioManager.play('swoosh'); 

            gsap.to(controls.target, {
                x: 0, y: endHeight, z: 0,
                duration: 1.8, ease: "power2.inOut",
                onComplete: () => {
                    controls.enableRotate = true; controls.enablePan = false; controls.enableZoom = true;
                    controls.target.set(0, endHeight, 0); controls.update();

                    if (typeof confetti === 'function') {
                        const duration = 2000;
                        const end = Date.now() + duration;

                        (function frame() {
                            confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0, y: 0.8 }, colors: ['#DA251D', '#00539B', '#FFC72C', '#00853F'], zIndex: 2000 });
                            confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1, y: 0.8 }, colors: ['#DA251D', '#00539B', '#FFC72C', '#00853F'], zIndex: 2000 });
                            if (Date.now() < end) requestAnimationFrame(frame);
                        }());
                    }

                    if(winTitle) winTitle.classList.remove('hidden-fade');
                    if(btnRestart) btnRestart.classList.remove('hidden-fade');
                    
                    AudioManager.play('cumbre');
                }
            });
        }
    });
}

function animarSecuenciaColor(finalHex) {
    isCycling = true;
    targetHex = finalHex; 
    let duration = 5000; // Ajustado a 5 segungos  para coincidir con la ruleta
    let intervalTime = 120; 
    let elapsed = 0;
    
    txtTargetLabel.innerText = "SELECCIONANDO:";
    
    // Dispara el sonido 1 sola vez al inicio de la secuencia
    AudioManager.play('ruleta');
    
    let timer = setInterval(() => {
        elapsed += intervalTime;
        if (elapsed >= duration) {
            clearInterval(timer);
            AudioManager.play('color_escogido'); 
            colorTarget.style.backgroundColor = `#${finalHex}`;
            txtTargetLabel.innerText = "BUSCAR NODO:";
            isCycling = false; 
        } else {
            const nextNodes = levels[currentLevel + 1]?.nodes || [];
            if(nextNodes.length > 0) {
                const randomSample = nextNodes[Math.floor(Math.random() * nextNodes.length)];
                const matMuestra = Array.isArray(randomSample.material) ? randomSample.material[0] : randomSample.material;
                colorTarget.style.backgroundColor = `#${matMuestra.color.getHexString()}`;
            }
        }
    }, intervalTime);
}

// ==========================================
// 1. ECLIPSE
// ==========================================
function triggerEclipse() {
    isCycling = true; 
    AudioManager.play('intro_evento'); 
    if (eclipseOverlay) {
        eclipseOverlay.classList.remove('hidden-fade');
        eclipseOverlay.style.pointerEvents = 'auto'; 
    }
}

if(btnEclipseStart) {
    btnEclipseStart.addEventListener('click', (e) => {
        if (eclipseOverlay && eclipseOverlay.classList.contains('hidden-fade')) return; 
        if (isZeroGravity || isTorbellinoMode || isTensionMode) return; 
        
        if (eclipseOverlay) {
            eclipseOverlay.classList.add('hidden-fade');
            eclipseOverlay.style.pointerEvents = 'none'; 
        }
        startEclipse();
    });
}

function startEclipse() {
    AudioManager.play('eclipse_off'); 

    isEclipseMode = true;
    isCycling = false; 
    if(uiLayer) uiLayer.classList.add('eclipse-ui');
    
    scene.background.setHex(0x000000);
    ambientLight.intensity = 0; hemiLight.intensity = 0; dirLightFront.intensity = 0; dirLightBack.intensity = 0;
    
    levels.forEach(lvl => {
        lvl.group.children.forEach(mesh => {
            if (mesh.userData.isStructure) {
                const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
                mat.emissive.setHex(0x000000);
            }
        });
    });
    
    flashlight.intensity = 6;
}

function endEclipse() {
    if (eclipseOverlay) {
        eclipseOverlay.classList.add('hidden-fade');
        eclipseOverlay.style.pointerEvents = 'none'; 
    }
    if(uiLayer) uiLayer.classList.remove('eclipse-ui');
    
    if (!isEclipseMode) return;
    isEclipseMode = false;
    
    gsap.to(scene.background, { r: 1, g: 1, b: 1, duration: 1.5 });
    gsap.to(ambientLight, { intensity: 0.6, duration: 1.5 });
    gsap.to(hemiLight, { intensity: 0.8, duration: 1.5 });
    gsap.to(dirLightFront, { intensity: 1.8, duration: 1.5 });
    gsap.to(dirLightBack, { intensity: 0.4, duration: 1.5 });
    levels.forEach(lvl => {
        lvl.group.children.forEach(mesh => {
            if (mesh.userData.isStructure) {
                const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
                gsap.to(mat.emissive, { r: 0x33/255, g: 0x33/255, b: 0x33/255, duration: 1.5 });
            }
        });
    });
    gsap.to(flashlight, { intensity: 0, duration: 1.5 });
}

window.addEventListener('mousemove', (e) => {
    if (!isEclipseMode || isZeroGravity || isTorbellinoMode || isTensionMode) return;
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const allObjects = levels.map(lvl => lvl.group.children).flat();
    const intersects = raycaster.intersectObjects(allObjects, true);
    if (intersects.length > 0) {
        const pt = intersects[0].point;
        const faceNormal = intersects[0].face.normal.clone().transformDirection(intersects[0].object.matrixWorld).normalize();
        flashlight.position.copy(pt).add(faceNormal.multiplyScalar(0.8));
    }
});

// ==========================================
// 2. TENSIÓN ESTRUCTURAL
// ==========================================
function startTension() {
    isTensionMode = true;
    tensionClicks = 0;
    tensionTimeLeft = 5.0; 
    
    AudioManager.play('tension');
    AudioManager.play('ticking');

    tensionUI.classList.remove('hidden');
    tensionProgress.style.width = '0%';
    gsap.to(markerMesh.position, { x: "+=0.15", z: "-=0.15", duration: 0.05, yoyo: true, repeat: -1, id: "tensionVibrate" });
    tensionInterval = setInterval(() => {
        tensionTimeLeft -= 0.1;
        tensionClicks = Math.max(0, tensionClicks - 0.5); 
        updateTensionBar();
        if (tensionTimeLeft <= 0) failTension();
    }, 100);
}

function updateTensionBar() {
    const pct = Math.min(100, (tensionClicks / tensionTarget) * 100);
    tensionProgress.style.width = pct + '%';
    if (pct >= 100) winTension();
}

function winTension() {
    AudioManager.stop('tension');
    AudioManager.stop('ticking');
    endTension(false);
    commitLevelAdvance(); 
}

function failTension() {
    AudioManager.stop('tension');
    AudioManager.stop('ticking');
    AudioManager.play('event_loss');

    endTension(true);
    rotarNivelesSuperiores();
    animarCaidaMarcador(null, () => {
        gsap.to(markerMesh.material.emissive, { r: 1, g: 0, b: 0, duration: 0.2, yoyo: true, repeat: 3 });
        gsap.fromTo(camera.position,
            { y: camera.position.y - 1 },
            { y: camera.position.y + 1, duration: 0.05, yoyo: true, repeat: 10,
                onComplete: () => revertToLevel(currentLevel - 1)
            }
        );
    });
}

function endTension(forceStop) {
    isTensionMode = false;
    clearInterval(tensionInterval);
    tensionUI.classList.add('hidden');
    gsap.killTweensOf(markerMesh.position);
    if(!forceStop && pathPoints.length > 0) {
        const safePos = pathPoints[pathPoints.length - 1];
        markerMesh.position.copy(safePos);
    }
}

// ==========================================
// 3. TORBELLINO DE NODOS
// ==========================================
const TORBELLINO_RADIO = 9;
const TORBELLINO_ALTURA_TOTAL = 22;
const TORBELLINO_MIN_NODOS = 20;
const TORBELLINO_MAX_NODOS = 28;
const TORBELLINO_OBJETIVO_FIJO = 3; 
const TORBELLINO_FACTOR_LENTO = 0.25; 

function triggerTorbellino() {
    isCycling = true; 
    AudioManager.play('intro_evento'); 
    if (torbellinoOverlay) {
        torbellinoOverlay.classList.remove('hidden-fade');
        torbellinoOverlay.style.pointerEvents = 'auto'; 
        
        if (torbellinoColorName) {
            let hexStr = targetHex ? targetHex.toLowerCase() : '';
            let name = 'TU COLOR';
            if(hexStr === 'da251d') name = 'ROJO';
            else if(hexStr === '00539b') name = 'AZUL';
            else if(hexStr === 'ffc72c') name = 'AMARILLO';
            else if(hexStr === '00853f') name = 'VERDE';
            torbellinoColorName.innerText = name;
            torbellinoColorName.style.color = '#' + hexStr;
        }
    }
}

if (btnTorbellinoStart) {
    btnTorbellinoStart.addEventListener('click', () => {
        if (torbellinoOverlay && torbellinoOverlay.classList.contains('hidden-fade')) return;
        if (torbellinoOverlay) {
            torbellinoOverlay.classList.add('hidden-fade');
            torbellinoOverlay.style.pointerEvents = 'none'; 
        }
        startTorbellino(); 
    });
}

function startTorbellino() {
    AudioManager.play('fondo_vortice');

    endEclipse();
    endTension(true);
    isTorbellinoMode = true;
    isCycling = true; 
    torbellinoFoundCount = 0;
    torbellinoErrors = 0;
    torbellinoNodes = [];
    torbellinoSlowed = false;

    gsap.to(scene.background, { r: 1, g: 1, b: 1, duration: 1.2 });
    gsap.to(ambientLight, { intensity: 0.7, duration: 1.2 });
    gsap.to(hemiLight, { intensity: 0.9, duration: 1.2 });
    gsap.to(dirLightFront, { intensity: 1.6, duration: 1.2 });
    gsap.to(dirLightBack, { intensity: 0.4, duration: 1.2 });

    levels.forEach(lvl => {
        lvl.group.children.forEach(mesh => { if (mesh.userData.isStructure || mesh.userData.isNode) mesh.visible = false; });
    });
    markerMesh.visible = false;
    threadLines.forEach(line => line.visible = false);

    const yCenter = levels[currentLevel + 1] ? levels[currentLevel + 1].yRef : levels[currentLevel].yRef;
    torbellinoGroup.position.set(0, yCenter, 0);
    torbellinoGroup.rotation.set(0, 0, 0);
    torbellinoGroup.visible = true;

    const totalNodos = TORBELLINO_MIN_NODOS + Math.floor(Math.random() * (TORBELLINO_MAX_NODOS - TORBELLINO_MIN_NODOS + 1));
    const numObjetivo = Math.min(TORBELLINO_OBJETIVO_FIJO, totalNodos);
    const indices = Array.from({ length: totalNodos }, (_, i) => i).sort(() => Math.random() - 0.5);
    const indicesObjetivo = new Set(indices.slice(0, numObjetivo));
    const nodeGeo = new THREE.CircleGeometry(0.85, 32); 

    for (let i = 0; i < totalNodos; i++) {
        const t = i / (totalNodos - 1); 
        const anguloBase = t * Math.PI * 2 * 2.2 + Math.random() * 0.3;
        const y = (t - 0.5) * TORBELLINO_ALTURA_TOTAL;
        const radio = TORBELLINO_RADIO * (0.85 + Math.random() * 0.3); 
        const velAngular = (0.3 + Math.random() * 1.4) * (Math.random() < 0.5 ? 1 : -1);
        const x = Math.cos(anguloBase) * radio;
        const z = Math.sin(anguloBase) * radio;
        const esObjetivo = indicesObjetivo.has(i);
        
        let hex = esObjetivo ? parseInt(targetHex, 16) : gamePalette.filter(c => c.toString(16).padStart(6, '0') !== targetHex)[Math.floor(Math.random() * 3)];
        
        const mat = new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: 0.35, roughness: 0.4, metalness: 0.1, transparent: true, side: THREE.DoubleSide });
        const nodeMesh = new THREE.Mesh(nodeGeo, mat);
        nodeMesh.position.set(x, y, z);
        nodeMesh.userData.isTorbellinoNode = true;
        torbellinoGroup.add(nodeMesh);
        torbellinoNodes.push({ mesh: nodeMesh, originalHex: hex, isTarget: esObjetivo, isFound: false, angulo: anguloBase, radio: radio, y: y, velocidadBase: velAngular, velocidadAngular: velAngular });
    }

    torbellinoRequired = numObjetivo;
    actualizarDotsTorbellino();
    actualizarErroresTorbellino();
    if(torbellinoUI) torbellinoUI.classList.remove('hidden');

    gsap.to(camera.position, { x: TORBELLINO_RADIO + 26, y: yCenter + 2, z: 0, duration: 3.5, ease: "power2.inOut", onUpdate: () => controls.update() });
    gsap.to(controls.target, { x: 0, y: yCenter, z: 0, duration: 3.5, ease: "power2.inOut" });

    torbellinoMemorizing = true;
    torbellinoTimer = setTimeout(() => {
        torbellinoMemorizing = false;
        ocultarColoresTorbellino();
        ralentizarTorbellino();
        gsap.to(camera.position, { x: TORBELLINO_RADIO + 42, y: yCenter + 4, z: 0, duration: 3.5, ease: "power2.inOut", onUpdate: () => controls.update() });
    }, 7000);
}

function ralentizarTorbellino() {
    torbellinoSlowed = true;
    torbellinoNodes.forEach(node => node.velocidadAngular = node.velocidadBase * TORBELLINO_FACTOR_LENTO);
}

function ocultarColoresTorbellino() {
    torbellinoNodes.forEach(node => {
        if (node.isFound) return;
        gsap.to(node.mesh.material.color, { r: 0.4, g: 0.4, b: 0.4, duration: 0.8 });
        gsap.to(node.mesh.material.emissive, { r: 0, g: 0, b: 0, duration: 0.8 });
        gsap.to(node.mesh.material, { opacity: 0.35, duration: 0.8 });
    });
}

function actualizarDotsTorbellino() {
    if(!torbellinoDotsContainer) return;
    torbellinoDotsContainer.innerHTML = '';
    for (let i = 0; i < torbellinoRequired; i++) {
        const dot = document.createElement('div');
        dot.className = 'torbellino-dot' + (i < torbellinoFoundCount ? ' found' : '');
        torbellinoDotsContainer.appendChild(dot);
    }
}

function actualizarErroresTorbellino() {
    const errorContainer = document.getElementById('torbellino-errors');
    if (!errorContainer) return;
    errorContainer.innerHTML = '';
    for (let i = 0; i < TORBELLINO_MAX_ERRORS; i++) {
        const dot = document.createElement('div');
        dot.className = 'torbellino-error-dot' + (i < torbellinoErrors ? ' burned' : '');
        errorContainer.appendChild(dot);
    }
}

function failTorbellino() {
    AudioManager.fadeOut('fondo_vortice');
    AudioManager.play('event_loss');

    clearTimeout(torbellinoTimer);
    isTorbellinoMode = false;
    if(torbellinoUI) torbellinoUI.classList.add('hidden');
    torbellinoNodes.forEach(node => { gsap.killTweensOf(node.mesh.material); torbellinoGroup.remove(node.mesh); node.mesh.material.dispose(); });
    torbellinoNodes = [];
    torbellinoGroup.visible = false;
    levels.forEach(lvl => lvl.group.children.forEach(mesh => { if (mesh.userData.isStructure || mesh.userData.isNode) mesh.visible = true; }));
    markerMesh.visible = true;
    threadLines.forEach(line => line.visible = true);
    gsap.to(scene.background, { r: 1, g: 1, b: 1, duration: 0.8 });
    rotarNivelesSuperiores();
    animarCaidaMarcador(null, () => {
        gsap.to(markerMesh.material.emissive, { r: 1, g: 0, b: 0, duration: 0.15, yoyo: true, repeat: 5 });
        gsap.fromTo(camera.position,
            { y: camera.position.y - 1.5 },
            { y: camera.position.y + 1.5, duration: 0.06, yoyo: true, repeat: 8,
                onComplete: () => revertToLevel(currentLevel - 1)
            }
        );
    });
}

function manejarClickTorbellino(clickedMesh) {
    const nodeData = torbellinoNodes.find(n => n.mesh === clickedMesh);
    if (!nodeData || nodeData.isFound) return;

    if (nodeData.isTarget) {
        AudioManager.play('seleccion_evento'); 
        nodeData.isFound = true;
        torbellinoFoundCount++;
        actualizarDotsTorbellino();
        const col = new THREE.Color(nodeData.originalHex);
        gsap.to(nodeData.mesh.material.color, { r: col.r, g: col.g, b: col.b, duration: 0.4 });
        gsap.to(nodeData.mesh.material.emissive, { r: col.r, g: col.g, b: col.b, duration: 0.4 });
        gsap.to(nodeData.mesh.material, { opacity: 1, duration: 0.4 });
        gsap.to(nodeData.mesh.scale, { x: 1.3, y: 1.3, z: 1.3, duration: 0.25, yoyo: true, repeat: 1 });
        if (torbellinoFoundCount >= torbellinoRequired) setTimeout(() => endTorbellino(), 500);
    } else {
        AudioManager.play('error'); 
        torbellinoErrors++;
        actualizarErroresTorbellino();
        const f = new THREE.Color(0xDA251D);
        gsap.to(nodeData.mesh.material.emissive, { r: f.r, g: f.g, b: f.b, duration: 0.15, yoyo: true, repeat: 1, onComplete: () => nodeData.mesh.material.emissive.setRGB(0, 0, 0) });
        if (torbellinoErrors >= TORBELLINO_MAX_ERRORS) {
            setTimeout(() => failTorbellino(), 400);
        }
    }
}

function endTorbellino() {
    AudioManager.fadeOut('fondo_vortice');

    isTorbellinoMode = false;
    isCycling = false;
    clearTimeout(torbellinoTimer);
    if(torbellinoUI) torbellinoUI.classList.add('hidden');
    torbellinoNodes.forEach(node => { gsap.killTweensOf(node.mesh.material); torbellinoGroup.remove(node.mesh); node.mesh.material.dispose(); });
    torbellinoNodes = [];
    torbellinoGroup.visible = false;
    levels.forEach(lvl => lvl.group.children.forEach(mesh => { if (mesh.userData.isStructure || mesh.userData.isNode) mesh.visible = true; }));
    markerMesh.visible = true;
    threadLines.forEach(line => line.visible = true);
    gsap.to(scene.background, { r: 1, g: 1, b: 1, duration: 1.2 });
    commitLevelAdvance();
}

function endTorbellino_reset() {
    if (!isTorbellinoMode && torbellinoNodes.length === 0) return;
    isTorbellinoMode = false;
    isCycling = false;
    clearTimeout(torbellinoTimer);
    if(torbellinoUI) torbellinoUI.classList.add('hidden');
    torbellinoNodes.forEach(node => { torbellinoGroup.remove(node.mesh); node.mesh.material.dispose(); });
    torbellinoNodes = [];
    torbellinoGroup.visible = false;
    markerMesh.visible = true;
    threadLines.forEach(line => line.visible = true);
    scene.background.setRGB(1, 1, 1);
}

// ==========================================
// 4. GRAVEDAD CERO
// ==========================================
function triggerZeroGravity() {
    isCycling = true; 
    AudioManager.play('intro_evento'); 
    if (gravedadOverlay) {
        gravedadOverlay.classList.remove('hidden-fade');
        gravedadOverlay.style.pointerEvents = 'auto'; 
    }
}

if (btnGravedadStart) {
    btnGravedadStart.addEventListener('click', () => {
        if (gravedadOverlay && gravedadOverlay.classList.contains('hidden-fade')) return;
        if (gravedadOverlay) {
            gravedadOverlay.classList.add('hidden-fade');
            gravedadOverlay.style.pointerEvents = 'none'; 
        }
        startZeroGravity(); 
    });
}

function startGravedadTimer() {
    gravedadTimeLeft = GRAVEDAD_TIME_LIMIT;
    isTickingGravedad = false; 
    
    const bar = document.getElementById('gravedad-timer-bar');
    if (bar) {
        bar.style.transition = 'width 0.1s linear, background-color 0.6s ease';
        bar.style.width = '100%';
        bar.style.backgroundColor = '#DA251D'; 
    }
    stopGravedadTimer();

    const palette = ['#DA251D', '#00539B', '#FFC72C', '#00853F'];
    let paletteIndex = 0;
    let colorCycleInterval = null;

    colorCycleInterval = setInterval(() => {
        if (!isZeroGravity) { clearInterval(colorCycleInterval); return; }
        if (gravedadTimeLeft > 5) {
            paletteIndex = (paletteIndex + 1) % palette.length;
            if (bar) bar.style.backgroundColor = palette[paletteIndex];
        }
    }, 1200);

    gravedadTimerInterval = setInterval(() => {
        gravedadTimeLeft -= 0.1;
        
        if (gravedadTimeLeft <= 5.0 && !isTickingGravedad && gravedadTimeLeft > 0) {
            isTickingGravedad = true;
            AudioManager.play('ticking');
        }

        const pct = Math.max(0, (gravedadTimeLeft / GRAVEDAD_TIME_LIMIT) * 100);
        if (bar) {
            bar.style.width = pct + '%';
            if (gravedadTimeLeft <= 5 && gravedadTimeLeft > 0) {
                clearInterval(colorCycleInterval);
                bar.style.backgroundColor = '#DA251D';
            }
        }
        if (gravedadTimeLeft <= 0) failGravedad();
    }, 100);
}

function stopGravedadTimer() {
    clearInterval(gravedadTimerInterval);
    gravedadTimerInterval = null;
    const bar = document.getElementById('gravedad-timer-bar');
    if (bar) bar.style.width = '0%';
}

function failGravedad() {
    AudioManager.fadeOut('fondo_gravedad');
    AudioManager.stop('ticking');
    AudioManager.play('event_loss');

    stopGravedadTimer();
    endZeroGravityForce();
    levels.forEach(lvl => lvl.group.children.forEach(mesh => {
        if (mesh.userData.origPos) {
            mesh.position.copy(mesh.userData.origPos);
            mesh.rotation.copy(mesh.userData.origRot);
            mesh.userData.driftVelocity = null;
        }
    }));
    markerMesh.visible = true;
    threadLines.forEach(line => line.visible = true);
    rotarNivelesSuperiores();
    animarCaidaMarcador(null, () => {
        gsap.to(markerMesh.material.emissive, { r: 1, g: 0, b: 0, duration: 0.15, yoyo: true, repeat: 5 });
        gsap.fromTo(camera.position,
            { y: camera.position.y - 1.5 },
            { y: camera.position.y + 1.5, duration: 0.06, yoyo: true, repeat: 8,
                onComplete: () => revertToLevel(currentLevel - 1)
            }
        );
    });
}

function startZeroGravity() {
    AudioManager.play('fondo_gravedad');

    isZeroGravity = true;
    isCycling = false; 
    startGravedadTimer();
    
    isEclipseMode = false;
    if (eclipseOverlay) {
        eclipseOverlay.classList.add('hidden-fade');
        eclipseOverlay.style.pointerEvents = 'none'; 
    }
    
    gsap.killTweensOf(scene.background);
    gsap.killTweensOf(ambientLight);
    gsap.killTweensOf(hemiLight);
    gsap.killTweensOf(dirLightFront);
    gsap.killTweensOf(dirLightBack);
    gsap.killTweensOf(flashlight);
    
    gsap.to(scene.background, { r: 1, g: 1, b: 1, duration: 1.5 });
    gsap.to(ambientLight, { intensity: 0.6, duration: 1.5 });
    gsap.to(hemiLight, { intensity: 0.8, duration: 1.5 });
    gsap.to(dirLightFront, { intensity: 1.8, duration: 1.5 });
    gsap.to(dirLightBack, { intensity: 0.4, duration: 1.5 });
    gsap.to(flashlight, { intensity: 0, duration: 1.5 });
    
    levels.forEach(lvl => {
        lvl.group.children.forEach(mesh => {
            if (mesh.userData.isStructure) {
                const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
                gsap.killTweensOf(mat.emissive);
                gsap.to(mat.emissive, { r: 0.2, g: 0.2, b: 0.2, duration: 2.5, ease: "power2.inOut" });
            }
        });
    });

    if(markerMesh) markerMesh.visible = false;
    threadLines.forEach(line => line.visible = false);

    controls.enableRotate = true; controls.enablePan = true;

    const camDir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
    const zoomOutDist = 30; 
    const newCamPos = camera.position.clone().add(camDir.multiplyScalar(zoomOutDist));
    
    gsap.to(camera.position, {
        x: newCamPos.x, y: newCamPos.y + 5, z: newCamPos.z,
        duration: 3.5, ease: "power2.inOut", onUpdate: () => controls.update()
    });

    scene.updateMatrixWorld(true);

    levels.forEach((lvl, index) => {
        lvl.group.children.forEach(mesh => {
            mesh.userData.origPos = mesh.position.clone();
            mesh.userData.origRot = mesh.rotation.clone();

            const box = new THREE.Box3().setFromObject(mesh);
            const actualCenter = new THREE.Vector3();
            box.getCenter(actualCenter);

            let centerPos = new THREE.Vector3(0, actualCenter.y, 0);
            let dir = new THREE.Vector3().subVectors(actualCenter, centerPos).normalize();
            
            if (dir.lengthSq() === 0) dir = new THREE.Vector3(Math.random()-0.5, 0, Math.random()-0.5).normalize();
            
            dir.x += (Math.random() - 0.5) * 0.4; dir.y += (Math.random() - 0.5) * 0.8; dir.z += (Math.random() - 0.5) * 0.4;
            dir.normalize();

            const speed = 0.8 + Math.random() * 1.2; 
            mesh.userData.driftVelocity = dir.multiplyScalar(speed);
            mesh.userData.driftPhase = Math.random() * Math.PI * 2; 

            mesh.userData.driftRotation = new THREE.Vector3(
                (Math.random() - 0.5) * 0.005, (Math.random() - 0.5) * 0.005, (Math.random() - 0.5) * 0.005
            );

            if (index === currentLevel + 1 && !mesh.userData.isStructure) {
                const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
                if (mat && mat.color.getHexString() === targetHex) {
                    mesh.userData.origScale = mesh.scale.clone();
                    gsap.killTweensOf(mesh.scale);
                    mesh.scale.copy(mesh.userData.origScale);
                    mesh.userData.origEmissive = mat.emissive.clone();
                    mat.emissiveIntensity = 0;
                    gsap.to(mat, { emissiveIntensity: 2.2, duration: 0.6, yoyo: true, repeat: -1, ease: "power2.inOut" });
                    gsap.to(mat.emissive, { r: mat.color.r, g: mat.color.g, b: mat.color.b, duration: 0 });
                    mesh.userData.isTargetNode = true;
                }
            }
        });
    });
}

function endZeroGravity(clickedMesh, localClickPoint) {
    AudioManager.fadeOut('fondo_gravedad');
    AudioManager.stop('ticking');

    isZeroGravity = false;
    stopGravedadTimer();
    isCycling = true; 
    
    controls.enableRotate = false; controls.enablePan = false;

    let totalAnims = 0;
    let completedAnims = 0;

    levels.forEach(lvl => {
        lvl.group.children.forEach(mesh => {
            if (mesh.userData.origPos) {
                totalAnims++;
                if (mesh.userData.isTargetNode) {
                    gsap.killTweensOf(mesh.scale);
                    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
                    gsap.killTweensOf(mat.emissive); gsap.killTweensOf(mat);
                    if (mesh.userData.origEmissive) mat.emissive.copy(mesh.userData.origEmissive);
                    mat.emissiveIntensity = 0.6;
                    mesh.userData.isTargetNode = false;
                }
                if (mesh.userData.origScale) gsap.to(mesh.scale, { x: mesh.userData.origScale.x, y: mesh.userData.origScale.y, z: mesh.userData.origScale.z, duration: 1.5, ease: "power3.inOut" });
                gsap.to(mesh.position, { x: mesh.userData.origPos.x, y: mesh.userData.origPos.y, z: mesh.userData.origPos.z, duration: 1.5, ease: "power3.inOut" });
                
                const startQuat = mesh.quaternion.clone();
                const endQuat = new THREE.Quaternion().setFromEuler(mesh.userData.origRot);
                const proxy = { t: 0 };

                gsap.to(proxy, {
                    t: 1, duration: 1.5, ease: "power3.inOut",
                    onUpdate: () => mesh.quaternion.slerpQuaternions(startQuat, endQuat, proxy.t),
                    onComplete: () => {
                        mesh.position.copy(mesh.userData.origPos);
                        mesh.rotation.copy(mesh.userData.origRot);
                        if (mesh.userData.origScale) mesh.scale.copy(mesh.userData.origScale);
                        mesh.userData.driftVelocity = null;
                        completedAnims++;
                        if (completedAnims === totalAnims) {
                            if(markerMesh) markerMesh.visible = true;
                            threadLines.forEach(line => line.visible = true);
                            isCycling = false;
                            scene.updateMatrixWorld(true);
                            commitLevelAdvance();
                        }
                    }
                });
            }
        });
    });
}

function endZeroGravityForce() {
    if (!isZeroGravity) return;
    isZeroGravity = false;
    stopGravedadTimer();
    
    controls.enableRotate = false; controls.enablePan = false;

    levels.forEach(lvl => {
        lvl.group.children.forEach(mesh => {
            if (mesh.userData.origPos) {
                if (mesh.userData.isTargetNode) {
                    gsap.killTweensOf(mesh.scale);
                    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
                    gsap.killTweensOf(mat.emissive); gsap.killTweensOf(mat);
                    if (mesh.userData.origEmissive) mat.emissive.copy(mesh.userData.origEmissive);
                    mat.emissiveIntensity = 0.6;
                    mesh.userData.isTargetNode = false;
                }
                if (mesh.userData.origScale) { gsap.killTweensOf(mesh.scale); mesh.scale.copy(mesh.userData.origScale); }
                gsap.killTweensOf(mesh.position); gsap.killTweensOf(mesh.rotation);
                mesh.position.copy(mesh.userData.origPos); mesh.rotation.copy(mesh.userData.origRot);
                mesh.userData.driftVelocity = null;
            }
        });
    });

    if(markerMesh) markerMesh.visible = true;
    threadLines.forEach(line => line.visible = true);
}

function revertToLevel(targetLvl) {
    if (targetLvl < -1) targetLvl = -1;

    for (let i = levels.length - 1; i > targetLvl + 1; i--) {
        if (levels[i] && levels[i].group.visible) {
            const grp = levels[i].group;
            const FLY = 40;
            AudioManager.play('swoosh'); // Sonido Swoosh al ocultar nivel penalizado
            gsap.to(grp.position, {
                y: grp.position.y + FLY,
                duration: 0.7,
                ease: "power2.in",
                onComplete: () => {
                    grp.visible = false;
                    grp.position.y -= FLY;
                    grp.children.forEach(mesh => {
                        const mats = Array.isArray(mesh.material) ? mesh.material : (mesh.material ? [mesh.material] : []);
                        mats.forEach(m => m.opacity = 0);
                    });
                }
            });
        }
    }

    while (pathPoints.length > targetLvl + 1) pathPoints.pop();
    while (threadLines.length > Math.max(0, targetLvl)) {
        const t = threadLines.pop();
        scene.remove(t);
        if (t.geometry) t.geometry.dispose();
    }

    currentLevel = targetLvl;

    if (currentLevel === -1) {
        markerMesh.scale.set(0.001, 0.001, 0.001);
        if (scene.children.includes(markerMesh)) scene.remove(markerMesh);
        actualizarUI();
        gsap.to(controls.target, { x: 0, y: levels[0].yRef, z: 0, duration: 1.5 });
        gsap.to(camera.position, { x: 0, y: levels[0].yRef + 5, z: 55, duration: 1.5 });
    } else {
        const safePos = pathPoints[pathPoints.length - 1];
        markerMesh.position.copy(safePos);
        const centerOfTower = new THREE.Vector3(0, safePos.y, 0);
        const outwardDir = new THREE.Vector3().subVectors(safePos, centerOfTower).normalize();
        orientarMarcador(outwardDir);
        actualizarUI();
        const radioMantenido = 58;
        const camX = outwardDir.x * radioMantenido; const camZ = outwardDir.z * radioMantenido;
        gsap.to(controls.target, { x: safePos.x * 0.3, y: levels[currentLevel].yRef, z: safePos.z * 0.3, duration: 1.5 });
        gsap.to(camera.position, { x: camX, y: levels[currentLevel].yRef + 6, z: camZ, duration: 1.5 });
    }
}

// --- INTERACCIÓN DE CLICK ---
window.addEventListener('click', (e) => {
    
    // para ignorar clicks al inicio
    if (e.target.id === 'start-overlay') return;
    
    if (isZeroGravity) {
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);

        const interactables = [];
        levels.forEach(lvl => { lvl.group.children.forEach(mesh => { if (mesh.userData.isTargetNode) interactables.push(mesh); }); });

        const intersects = raycaster.intersectObjects(interactables, false);

        if (intersects.length > 0) {
            AudioManager.play('seleccion_evento'); 
            let hitMesh = intersects[0].object;
            let exactClickPoint = intersects[0].point.clone(); 
            const localClickPoint = hitMesh.worldToLocal(exactClickPoint);
            endZeroGravity(hitMesh, localClickPoint);
        } else {
            const allMeshes = [];
            levels.forEach(lvl => { lvl.group.children.forEach(mesh => { allMeshes.push(mesh); }); });
            const missIntersects = raycaster.intersectObjects(allMeshes, false);
            if(missIntersects.length > 0 && !missIntersects[0].object.userData.isStructure) AudioManager.play('error');
        }
        return; 
    }

    if (isTorbellinoMode) {
        if (torbellinoMemorizing) return; 
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(torbellinoGroup.children, true);
        if (intersects.length > 0) manejarClickTorbellino(intersects[0].object);
        return;
    }

    if(isTensionMode) {
        tensionClicks += 2.5; 
        updateTensionBar();
        return;
    }

    if(isCycling) return;
    if(mode === 'experimental' && (e.clientY > window.innerHeight - 100 || e.clientY < 100)) return;

    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    if (mode === 'experimental' && currentLevel + 1 < levels.length) {
        const objectsToIntersect = levels[currentLevel + 1].group.children;
        const intersects = raycaster.intersectObjects(objectsToIntersect, true);

        if (intersects.length > 0) {
            const clickedMesh = intersects[0].object;
            if (clickedMesh.userData.isStructure) return;

            const matClickeado = Array.isArray(clickedMesh.material) ? clickedMesh.material[0] : clickedMesh.material;
            
            if (matClickeado && (currentLevel === -1 || matClickeado.color.getHexString() === targetHex)) {
                
                AudioManager.play('seleccion_nodo'); 

                if(isEclipseMode) endEclipse(); 
                
                let eventType = 'normal';
                
                if (currentLevel >= 0 && currentLevel + 2 < levels.length) {
                    let unfiredEvents = eventPool.filter(e => !e.fired);
                    let stepsLeft = (levels.length - 2) - currentLevel; 
                    
                    if (unfiredEvents.length > 0 && stepsLeft <= unfiredEvents.length) {
                        let forcedIndex = Math.floor(Math.random() * unfiredEvents.length);
                        eventType = unfiredEvents[forcedIndex].id;
                        unfiredEvents[forcedIndex].fired = true;
                    } 
                    else {
                        let rand = Math.random();
                        let threshold = 0;
                        let shuffledPool = [...eventPool].sort(() => Math.random() - 0.5);
                        
                        for (let ev of shuffledPool) {
                            threshold += ev.prob;
                            if (rand < threshold) {
                                eventType = ev.id;
                                let originalEv = eventPool.find(e => e.id === ev.id);
                                originalEv.fired = true; 
                                break;
                            }
                        }
                    }
                }
                
                avanzarNivel(clickedMesh, intersects[0].point, eventType);
            } else {
                AudioManager.play('error'); 
            }
        }
    } 
});

const MARKER_RADIUS = 0.5; 
const FACE_OFFSET   = MARKER_RADIUS / 3;

function orientarMarcador(outwardDir) {
    const inward = outwardDir.clone().negate();
    const defaultFaceNormal = new THREE.Vector3(0, -1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(defaultFaceNormal, inward);
    markerMesh.quaternion.copy(quaternion);
}

function posicionMarcador(anchorPos, outwardDir) {
    return anchorPos.clone().add(outwardDir.clone().multiplyScalar(FACE_OFFSET));
}

function generarPuntosRuta(startPos, endPos) {
    const radioA = Math.sqrt(startPos.x ** 2 + startPos.z ** 2);
    const radioB = Math.sqrt(endPos.x ** 2 + endPos.z ** 2);
    const RADIO_ARCO = Math.max(radioA, radioB) + 3.5;

    const angStart = Math.atan2(startPos.z, startPos.x);
    const angEnd   = Math.atan2(endPos.z,   endPos.x);

    let delta = angEnd - angStart;
    if (delta >  Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;

    const yStart = startPos.y; const yEnd = endPos.y;
    const STEPS = 80; const puntos = [];

    for (let i = 0; i <= STEPS; i++) {
        const t   = i / STEPS;
        const ang = angStart + delta * t;
        const y   = yStart + (yEnd - yStart) * t;

        const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        const ramp = Math.sin(t * Math.PI); 
        const r = radioA * (1 - t) + radioB * t + (RADIO_ARCO - (radioA * (1-t) + radioB * t)) * ramp;

        puntos.push(new THREE.Vector3(Math.cos(ang) * r, y, Math.sin(ang) * r));
    }
    return puntos;
}

function animarCaidaMarcador(targetPos, onFallComplete) {
    const caer = () => {
        AudioManager.play('caida'); 
        gsap.to(markerMesh.position, {
            y: markerMesh.position.y - 60,
            duration: 0.8,
            ease: "power3.in",
            onComplete: onFallComplete
        });
    };

    if (targetPos && scene.children.includes(markerMesh)) {
        const startPos = markerMesh.position.clone();
        const routePoints = generarPuntosRuta(startPos, targetPos);
        const splineCurve = new THREE.CatmullRomCurve3(routePoints, false, 'catmullrom', 0);
        const animState = { t: 0 };
        gsap.to(animState, {
            t: 1, duration: 0.8, ease: "power2.in",
            onUpdate: () => {
                const pt = splineCurve.getPoint(animState.t);
                const towerCenter = new THREE.Vector3(0, pt.y, 0);
                const outward = new THREE.Vector3().subVectors(pt, towerCenter).normalize();
                orientarMarcador(outward);
                markerMesh.position.copy(pt.clone().add(outward.clone().multiplyScalar(FACE_OFFSET)));
            },
            onComplete: caer
        });
    } else if (scene.children.includes(markerMesh)) {
        caer();
    } else {
        onFallComplete();
    }
}

function avanzarNivel(nodo, exactClickPoint, eventType = 'normal') {
    currentLevel++; 
    
    const endPos = exactClickPoint.clone();
    const centerOfTower = new THREE.Vector3(0, endPos.y, 0);
    const outwardDir = new THREE.Vector3().subVectors(endPos, centerOfTower).normalize();
    
    const anchorPos = endPos.clone();
    const meshPos   = posicionMarcador(anchorPos, outwardDir);
    
    if (currentLevel === 0) {
        pathPoints.push(anchorPos);
        markerMesh.position.copy(meshPos);
        markerMesh.scale.set(0.001, 0.001, 0.001); 
        if (!scene.children.includes(markerMesh)) scene.add(markerMesh);
        
        orientarMarcador(outwardDir);
        gsap.to(markerMesh.scale, { x: 1, y: 1, z: 1, duration: 0.6, ease: "back.out(1.5)" });
        commitLevelAdvance();
    } else {
        const startPos = pathPoints[pathPoints.length - 1];
        pathPoints.push(anchorPos);

        const routePoints = generarPuntosRuta(startPos, anchorPos);
        const splineCurve = new THREE.CatmullRomCurve3(routePoints, false, 'catmullrom', 0);
        const maxPoints = routePoints.length * 2;
        const curvePoints = splineCurve.getPoints(maxPoints);

        const threadGeo = new THREE.BufferGeometry().setFromPoints(curvePoints);
        threadGeo.setDrawRange(0, 0);
        const threadMat = new THREE.LineBasicMaterial({ color: 0x222222, linewidth: 3 });
        let newThread = new THREE.Line(threadGeo, threadMat);
        scene.add(newThread);
        threadLines.push(newThread);
        
        const animState = { t: 0 };
        gsap.to(animState, {
            t: 1, duration: 1.5, ease: "power2.inOut",
            onUpdate: () => {
                const currentPt = splineCurve.getPoint(animState.t);
                const towerCenter = new THREE.Vector3(0, currentPt.y, 0);
                const currentOutward = new THREE.Vector3().subVectors(currentPt, towerCenter).normalize();
                orientarMarcador(currentOutward);
                markerMesh.position.copy(currentPt.clone().add(currentOutward.clone().multiplyScalar(FACE_OFFSET)));
                
                if (newThread) {
                    const drawCount = Math.floor(animState.t * maxPoints) + 1;
                    newThread.geometry.setDrawRange(0, drawCount);
                }
            },
            onComplete: () => {
                orientarMarcador(outwardDir);
                markerMesh.position.copy(meshPos);

                if (eventType === 'tension') { commitLevelAdvance(() => startTension()); } 
                else if (eventType === 'torbellino') { commitLevelAdvance(() => triggerTorbellino()); } 
                else if (eventType === 'gravedad') { commitLevelAdvance(() => triggerZeroGravity()); } 
                else if (eventType === 'eclipse') { commitLevelAdvance(() => triggerEclipse()); } 
                else { commitLevelAdvance(); }
            }
        });
    }
}

function rotarNivelesSuperiores() {
    AudioManager.playRandom(['giro1', 'giro2']); 
    for (let i = currentLevel + 1; i < levels.length; i++) {
        const grp = levels[i].group;
        if (!grp.visible) continue;
        const numGiros = 1 + Math.floor(Math.random() * 3);
        const sentido = Math.random() < 0.5 ? 1 : -1;
        const anguloTotal = sentido * numGiros * (Math.PI / 2);
        const delay = (i - currentLevel - 1) * 0.12;
        gsap.to(grp.rotation, {
            y: grp.rotation.y + anguloTotal, duration: 0.5 + Math.random() * 0.4, delay, ease: "power2.inOut"
        });
    }
}

function commitLevelAdvance(onLevelReadyCallback = null) {
    if (currentLevel + 1 < levels.length) {
        const nextGroup = levels[currentLevel + 1].group;
        const DROP = 40; 

        nextGroup.children.forEach(mesh => {
            const mats = Array.isArray(mesh.material) ? mesh.material : (mesh.material ? [mesh.material] : []);
            mats.forEach(m => m.opacity = 1);
        });

        if (nextGroup.visible) {
            if(onLevelReadyCallback) onLevelReadyCallback();
        } else {
            nextGroup.position.y += DROP;
            nextGroup.visible = true;
            AudioManager.play('swoosh'); // Sonido Swoosh al aparecer nuevo nivel

            gsap.to(nextGroup.position, {
                y: nextGroup.position.y - DROP, duration: 1.0, ease: "power3.out",
                onComplete: () => { if(onLevelReadyCallback) onLevelReadyCallback(); }
            });
        }
    } else {
        if(onLevelReadyCallback) onLevelReadyCallback();
    }

    actualizarUI(); 

    const safePos = pathPoints[pathPoints.length - 1];
    const centerOfTower = new THREE.Vector3(0, safePos.y, 0);
    const outwardDir = new THREE.Vector3().subVectors(safePos, centerOfTower).normalize();

    const radioMantenido = 58; 
    const camX = outwardDir.x * radioMantenido; const camZ = outwardDir.z * radioMantenido;

    gsap.to(controls.target, { x: safePos.x * 0.3, y: levels[currentLevel].yRef, z: safePos.z * 0.3, duration: 1.5, ease: "power2.inOut" });
    gsap.to(camera.position, { x: camX, y: levels[currentLevel].yRef + 6, z: camZ, duration: 1.5, ease: "power2.inOut", onUpdate: () => controls.update() });
}

document.getElementById('btn-left').addEventListener('click', () => rotar(Math.PI / 2));
document.getElementById('btn-right').addEventListener('click', () => rotar(-Math.PI / 2));

function rotar(angulo) {
    if (isCycling || isTensionMode || isTorbellinoMode || isZeroGravity) return;
    let targetGroup = null;
    if (mode === 'experimental') {
        if (currentLevel + 1 >= levels.length) return;
        targetGroup = levels[currentLevel + 1].group;
    } 
    if (targetGroup) {
        AudioManager.playRandom(['giro1', 'giro2']); 
        gsap.to(targetGroup.rotation, { y: targetGroup.rotation.y + angulo, duration: 0.7, ease: "power2.inOut" });
    }
}

// --- LÓGICA DE LA INTERFAZ ---
if (btnReglas && panelReglas) { btnReglas.addEventListener('click', () => panelReglas.classList.remove('hidden-fade')); }
if (btnCerrarReglas && panelReglas) { btnCerrarReglas.addEventListener('click', () => panelReglas.classList.add('hidden-fade')); }
if (btnVolver) { 
    btnVolver.addEventListener('click', () => {
        // Regresar en el historial del navegador para no reiniciar la misma vista
        if (document.referrer !== "") {
            window.history.back();
        } else {
            // Si no hay historial, redirige a la raíz
            window.location.href = '/'; 
        }
    }); 
}
if (btnRestart) { btnRestart.addEventListener('click', () => { window.location.reload(); }); }

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
    requestAnimationFrame(animate);
    controls.update();

    if (isTorbellinoMode && torbellinoGroup.visible) {
        torbellinoNodes.forEach(node => {
            node.angulo += node.velocidadAngular * 0.016; 
            node.mesh.position.x = Math.cos(node.angulo) * node.radio;
            node.mesh.position.z = Math.sin(node.angulo) * node.radio;
            node.mesh.lookAt(camera.position); 
        });
    }

    if (isZeroGravity) {
        const time = Date.now() * 0.002;
        levels.forEach(lvl => {
            lvl.group.children.forEach(mesh => {
                if (mesh.userData.driftVelocity) {
                    mesh.userData.driftVelocity.multiplyScalar(0.90);
                    mesh.position.add(mesh.userData.driftVelocity);
                    if (mesh.userData.driftVelocity.lengthSq() < 0.001) {
                        mesh.position.y += Math.sin(time + mesh.userData.driftPhase) * 0.005;
                    }
                    mesh.rotation.x += mesh.userData.driftRotation.x;
                    mesh.rotation.y += mesh.userData.driftRotation.y;
                    mesh.rotation.z += mesh.userData.driftRotation.z;
                }
            });
        });
    }

    renderer.render(scene, camera);
}
animate();