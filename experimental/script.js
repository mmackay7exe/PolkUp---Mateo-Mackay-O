import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

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
let tensionTimeLeft = 3.0;
let tensionInterval = null;

let markerMesh = null;
const threadLines = []; 

// ELEMENTOS DOM
const uiGame = document.getElementById('game-ui');
const btnMode = document.getElementById('btn-mode');
const colorTarget = document.getElementById('color-target');
const txtTargetLabel = document.getElementById('target-label');
const levelDisplay = document.getElementById('level-display');
const eclipseOverlay = document.getElementById('eclipse-overlay');
const btnEclipseStart = document.getElementById('btn-eclipse-start');
const tensionUI = document.getElementById('tension-ui');
const tensionProgress = document.getElementById('tension-progress');

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

// ILUMINACIÓN VOLUMÉTRICA
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

// LINTERNA PARA EL ECLIPSE
const flashlight = new THREE.PointLight(0xffffff, 0, 4, 2); 
scene.add(flashlight);

// --- MARCADOR FÍSICO ---
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

    iniciarAscension();

}, undefined, (error) => console.error("Error cargando el modelo:", error));

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function iniciarAscension() {
    currentLevel = -1; 
    pathPoints = [];
    isCycling = true; 
    activeSandboxLevel = null;
    
    endEclipse(); 
    endTension(true); // reset tensión por si reinicias
    
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

    uiGame.classList.add('hidden'); 
    levelDisplay.innerText = "INTRODUCCIÓN";

    const topY = levels[levels.length - 1].yRef;
    camera.position.set(0, topY + 15, 60);
    controls.target.set(0, topY / 2, 0);

    gsap.to(camera.position, { x: 0, y: levels[0].yRef + 5, z: 55, duration: 2.5, ease: "power3.inOut", onUpdate: () => controls.update() });
    gsap.to(controls.target, { y: levels[0].yRef, duration: 2.5, ease: "power3.inOut", onComplete: desvanecerNiveles });
}

function desvanecerNiveles() {
    const nivelesOcultos = levels.slice(1); 
    let materialesADesvanecer = [];
    nivelesOcultos.forEach(lvl => {
        lvl.group.children.forEach(mesh => {
            if(mesh.material) {
                if(Array.isArray(mesh.material)) materialesADesvanecer.push(...mesh.material);
                else materialesADesvanecer.push(mesh.material);
            }
        });
    });

    if(materialesADesvanecer.length > 0) {
        gsap.to(materialesADesvanecer, {
            opacity: 0,
            duration: 1.2, 
            ease: "power2.inOut",
            onComplete: () => {
                nivelesOcultos.forEach(lvl => lvl.group.visible = false);
                uiGame.classList.remove('hidden');
                actualizarUI();
            }
        });
    } else {
        uiGame.classList.remove('hidden');
        actualizarUI();
    }
}

function actualizarUI() {
    if (currentLevel === -1) {
        levelDisplay.innerText = `NIVEL 0 / ${levels.length - 1}`;
        isCycling = false; 
        targetHex = 'ANY'; 
        txtTargetLabel.innerText = "INICIO LIBRE:";
        colorTarget.style.backgroundColor = "transparent";
        colorTarget.style.borderColor = "var(--text-main)"; 
    } else {
        levelDisplay.innerText = `NIVEL ${currentLevel} / ${levels.length - 1}`;
        
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
            uiGame.classList.add('hidden');
            levelDisplay.innerText = "LA CUMBRE ALCANZADA";
            const midY = levels[levels.length - 1].yRef / 2;
            gsap.to(camera.position, { x: 0, y: midY + 8, z: 52, duration: 3, ease: "power2.out" });
            gsap.to(controls.target, { y: midY, duration: 3, ease: "power2.out" });
        }
    }
}

function animarSecuenciaColor(finalHex) {
    isCycling = true;
    let duration = 3000; 
    let intervalTime = 120; 
    let elapsed = 0;
    
    txtTargetLabel.innerText = "SELECCIONANDO:";
    
    let timer = setInterval(() => {
        elapsed += intervalTime;
        if (elapsed >= duration) {
            clearInterval(timer);
            targetHex = finalHex;
            colorTarget.style.backgroundColor = `#${finalHex}`;
            txtTargetLabel.innerText = "BUSCAR NODO:";
            isCycling = false; // Liberamos para jugar
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

// --- LÓGICAS DE MINIJUEGOS ---

// 1. ECLIPSE
function triggerEclipse() {
    isCycling = true; 
    eclipseOverlay.classList.remove('hidden-fade');
}
btnEclipseStart.addEventListener('click', () => {
    eclipseOverlay.classList.add('hidden-fade');
    startEclipse();
});
function startEclipse() {
    isEclipseMode = true;
    isCycling = false; 
    scene.background.setHex(0x000000);
    ambientLight.intensity = 0;
    hemiLight.intensity = 0;
    dirLightFront.intensity = 0;
    dirLightBack.intensity = 0;
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
    if (!isEclipseMode) return;
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

// 2. TENSIÓN ESTRUCTURAL
function startTension() {
    isTensionMode = true;
    tensionClicks = 0;
    tensionTimeLeft = 3.0; // Tienes 3 segundos
    
    tensionUI.classList.remove('hidden');
    tensionProgress.style.width = '0%';

    // Hacemos vibrar violentamente el cono
    gsap.to(markerMesh.position, {
        x: "+=0.15", z: "-=0.15",
        duration: 0.05,
        yoyo: true,
        repeat: -1,
        id: "tensionVibrate"
    });

    tensionInterval = setInterval(() => {
        tensionTimeLeft -= 0.1;
        tensionClicks = Math.max(0, tensionClicks - 0.5); // La barra decae levemente
        updateTensionBar();

        if (tensionTimeLeft <= 0) {
            failTension();
        }
    }, 100);
}

function updateTensionBar() {
    const pct = Math.min(100, (tensionClicks / tensionTarget) * 100);
    tensionProgress.style.width = pct + '%';
    if (pct >= 100) winTension();
}

function winTension() {
    endTension(false);
    commitLevelAdvance(); // Anclaje forzado con éxito
}

function failTension() {
    endTension(true);
    
    // Feedback visual: destello rojo y cámara temblando
    gsap.to(markerMesh.material.emissive, { r: 1, g: 0, b: 0, duration: 0.2, yoyo: true, repeat: 3 });
    gsap.fromTo(camera.position,
        { y: camera.position.y - 1 },
        { y: camera.position.y + 1, duration: 0.05, yoyo: true, repeat: 10, onComplete: () => {
            // CASTIGO: Caer 2 niveles (o a cero)
            let targetDropLvl = currentLevel - 2;
            revertToLevel(targetDropLvl);
        }}
    );
}

function endTension(forceStop) {
    isTensionMode = false;
    clearInterval(tensionInterval);
    tensionUI.classList.add('hidden');
    gsap.killTweensOf(markerMesh.position);
    
    if(!forceStop) {
        // Acomodamos la estaca limpiamente tras la vibración
        const safePos = pathPoints[pathPoints.length - 1];
        markerMesh.position.copy(safePos);
    }
}

// FUNCIÓN DE CASTIGO (Deshace el progreso en la torre)
function revertToLevel(targetLvl) {
    if (targetLvl < -1) targetLvl = -1;

    // Ocultar niveles que acabas de perder
    for (let i = levels.length - 1; i > targetLvl + 1; i--) {
        if (levels[i]) {
            levels[i].group.visible = false;
            levels[i].group.children.forEach(mesh => {
                if(mesh.material) {
                    let mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                    mats.forEach(m => m.opacity = 0);
                }
            });
        }
    }

    // Borrar el historial de hilos cortados
    while (pathPoints.length > targetLvl + 1) {
        pathPoints.pop();
    }
    while (threadLines.length > Math.max(0, targetLvl + 1)) {
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
        const camX = outwardDir.x * radioMantenido;
        const camZ = outwardDir.z * radioMantenido;
        gsap.to(controls.target, { x: safePos.x * 0.3, y: levels[currentLevel].yRef, z: safePos.z * 0.3, duration: 1.5 });
        gsap.to(camera.position, { x: camX, y: levels[currentLevel].yRef + 6, z: camZ, duration: 1.5 });
    }
}


// --- INTERACCIÓN DE CLICK (Ratón) ---
window.addEventListener('click', (e) => {
    // Si estamos en Tensión, el click solo carga la barra de fuerza
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
                if(isEclipseMode) endEclipse(); 
                
                // --- SELECCIÓN DEL EVENTO ---
                let eventType = 'normal';
                
                // Aseguramos que ya empezó a subir y que el nivel de destino no sea la cumbre final
                if (currentLevel >= 0 && (currentLevel + 1) < (levels.length - 1)) {
                    const roll = Math.random();
                    
                    // Probabilidades equitativas (20% para cada uno, 40% total de que ocurra algún evento)
                    if (roll < 0.20) {
                        eventType = 'eclipse'; 
                    } else if (roll < 0.40) {
                        eventType = 'tension'; 
                    }
                }
                
                avanzarNivel(clickedMesh, intersects[0].point, eventType);
            }
        }
    } 
    else if (mode === 'sandbox') {
        const allObjects = levels.map(lvl => lvl.group.children).flat();
        const intersects = raycaster.intersectObjects(allObjects, true);

        if (intersects.length > 0) {
            const clickedMesh = intersects[0].object;
            const targetLevel = levels.find(lvl => lvl.group.children.includes(clickedMesh));
            
            if (targetLevel) {
                activeSandboxLevel = targetLevel; 
                gsap.to(controls.target, { x: 0, y: targetLevel.yRef, z: 0, duration: 1, ease: "power2.out" });
                
                const materialesEstructura = [];
                targetLevel.group.children.forEach(mesh => {
                    if (mesh.userData.isStructure) {
                        const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
                        materialesEstructura.push(mat);
                    }
                });

                if (materialesEstructura.length > 0) {
                    gsap.to(materialesEstructura, { emissiveIntensity: 3.5, duration: 0.5, yoyo: true, repeat: 1, ease: "power1.inOut" });
                }
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
    const RADIO_SEGURO = Math.max(radioA, radioB) + 1.8;

    const angStart = Math.atan2(startPos.z, startPos.x);
    const angEnd   = Math.atan2(endPos.z,   endPos.x);

    let delta = angEnd - angStart;
    if (delta >  Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;

    const N = Math.abs(delta) < 0.3 ? 4 : 20;
    const puntos = [startPos.clone()];

    for (let i = 1; i < N; i++) {
        const t   = i / N;
        const ang = angStart + delta * t;
        const y   = startPos.y + (endPos.y - startPos.y) * t;
        const blend = Math.sin(t * Math.PI); 
        const r = radioA * (1 - t) + radioB * t + (RADIO_SEGURO - (radioA * (1-t) + radioB * t)) * blend;

        puntos.push(new THREE.Vector3(Math.cos(ang) * r, y, Math.sin(ang) * r));
    }
    puntos.push(endPos.clone());
    return puntos;
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
        const splineCurve = new THREE.CatmullRomCurve3(routePoints, false, 'catmullrom', 0.5);
        const maxPoints = 60;
        const curvePoints = splineCurve.getPoints(maxPoints);

        const threadGeo = new THREE.BufferGeometry().setFromPoints(curvePoints);
        threadGeo.setDrawRange(0, 0);
        
        const threadMat = new THREE.LineBasicMaterial({ color: 0x222222, linewidth: 3 });
        const newThread = new THREE.Line(threadGeo, threadMat);
        scene.add(newThread);
        threadLines.push(newThread);
        
        const animState = { t: 0 };
        gsap.to(animState, {
            t: 1,
            duration: 1.5,
            ease: "power2.inOut",
            onUpdate: () => {
                const currentPt = splineCurve.getPoint(animState.t);
                const towerCenter = new THREE.Vector3(0, currentPt.y, 0);
                const currentOutward = new THREE.Vector3().subVectors(currentPt, towerCenter).normalize();
                orientarMarcador(currentOutward);
                markerMesh.position.copy(currentPt.clone().add(currentOutward.clone().multiplyScalar(FACE_OFFSET)));
                
                const drawCount = Math.floor(animState.t * maxPoints) + 1;
                threadGeo.setDrawRange(0, drawCount);
            },
            onComplete: () => {
                orientarMarcador(outwardDir);
                markerMesh.position.copy(meshPos);
                
                // DISPARADOR DE EVENTOS
                if (eventType === 'tension') {
                    startTension();
                } else {
                    if (eventType === 'eclipse') triggerEclipse(); 
                    commitLevelAdvance();
                }
            }
        });
    }
}

// Lógica de avance una vez que la pieza se asienta o el juego se gana
function commitLevelAdvance() {
    if (currentLevel + 1 < levels.length) {
        const nextGroup = levels[currentLevel + 1].group;
        nextGroup.visible = true;
        nextGroup.position.y -= 1.5;

        let materialesNuevos = [];
        nextGroup.children.forEach(mesh => {
            if(mesh.material) {
                if(Array.isArray(mesh.material)) materialesNuevos.push(...mesh.material);
                else materialesNuevos.push(mesh.material);
            }
        });
        gsap.to(materialesNuevos, { opacity: 1, duration: 1.2 });
        gsap.to(nextGroup.position, { y: "+=1.5", duration: 1.2, ease: "back.out(1.2)" });
    }

    actualizarUI(); 

    const safePos = pathPoints[pathPoints.length - 1];
    const centerOfTower = new THREE.Vector3(0, safePos.y, 0);
    const outwardDir = new THREE.Vector3().subVectors(safePos, centerOfTower).normalize();

    const radioMantenido = 58; 
    const camX = outwardDir.x * radioMantenido;
    const camZ = outwardDir.z * radioMantenido;

    gsap.to(controls.target, { x: safePos.x * 0.3, y: levels[currentLevel].yRef, z: safePos.z * 0.3, duration: 1.5, ease: "power2.inOut" });
    gsap.to(camera.position, { x: camX, y: levels[currentLevel].yRef + 6, z: camZ, duration: 1.5, ease: "power2.inOut", onUpdate: () => controls.update() });
}

document.getElementById('btn-left').addEventListener('click', () => rotar(Math.PI / 2));
document.getElementById('btn-right').addEventListener('click', () => rotar(-Math.PI / 2));

function rotar(angulo) {
    if (isCycling || isTensionMode) return;
    let targetGroup = null;
    if (mode === 'experimental') {
        if (currentLevel + 1 >= levels.length) return;
        targetGroup = levels[currentLevel + 1].group;
    } else if (mode === 'sandbox') {
        if (!activeSandboxLevel) return;
        targetGroup = activeSandboxLevel.group;
    }
    if (targetGroup) gsap.to(targetGroup.rotation, { y: targetGroup.rotation.y + angulo, duration: 0.7, ease: "power2.inOut" });
}

btnMode.addEventListener('click', () => {
    if(mode === 'experimental') {
        mode = 'sandbox';
        endEclipse(); 
        endTension(true);
        btnMode.innerText = "MODO: EXPERIMENTAL";
        uiGame.classList.add('hidden');
        controls.enableRotate = true;
        controls.enablePan = true;
        
        levels.forEach(lvl => {
            lvl.group.visible = true;
            let mats = [];
            lvl.group.children.forEach(m => { 
                if(m.material) {
                    if(Array.isArray(m.material)) mats.push(...m.material);
                    else mats.push(m.material);
                } 
            });
            gsap.to(mats, { opacity: 1, duration: 0.5 });
        });

        activeSandboxLevel = levels[Math.floor(levels.length / 2)];
        const midY = activeSandboxLevel.yRef;
        
        gsap.to(controls.target, { x: 0, y: midY, z: 0, duration: 1.5 });
        gsap.to(camera.position, { x: 0, y: midY + 6, z: 55, duration: 2, onUpdate: () => controls.update() });
    } else {
        btnMode.innerText = "MODO: SANDBOX";
        iniciarAscension();
    }
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
animate();