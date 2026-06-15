/* ============================================================
   POLKUP — script.js
   ============================================================ */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'; 

/* ----------------------------------------------------------
   CONFIGURACIÓN DE CÁMARA
---------------------------------------------------------- */
const CAM_INICIO = { x: 5, y: 4, z: 0.5 };
const CAM_FIN    = { x: 0, y: 0, z: 10 };
const LOOK_AT    = new THREE.Vector3(0, 0, 0);
const SCROLL_TOTAL = 2000;

let introActiva     = true;
let scrollAcumulado = 0;
let modeloIntro     = null;
let mouseX          = 0;
let mouseY          = 0;

// Bloquear scroll de la página desde el inicio
document.body.classList.add('intro-activa');

// Ocultar headers durante la intro
document.querySelectorAll('.header').forEach(h => h.classList.add('header--oculto'));

/* ----------------------------------------------------------
   ESCENA INTRO
---------------------------------------------------------- */
const introEl     = document.getElementById('intro');
const introCanvas = document.getElementById('intro-canvas');

const escena = new THREE.Scene();
escena.background = new THREE.Color(0xffffff);

const camara = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camara.position.set(CAM_INICIO.x, CAM_INICIO.y, CAM_INICIO.z);
camara.lookAt(LOOK_AT);

const renderer = new THREE.WebGLRenderer({ canvas: introCanvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

escena.add(new THREE.AmbientLight(0xffffff, 1.5));
const luzDir = new THREE.DirectionalLight(0xffffff, 2.5);
luzDir.position.set(5, 10, 7);
escena.add(luzDir);

const loader = new GLTFLoader();
loader.load('assets/Polkup3d.glb', (gltf) => {
  modeloIntro = gltf.scene;
  const caja = new THREE.Box3().setFromObject(modeloIntro);
  const centro = caja.getCenter(new THREE.Vector3());
  const dimensiones = new THREE.Vector3();
  caja.getSize(dimensiones);
  const escalaMax = Math.max(dimensiones.x, dimensiones.y, dimensiones.z);
  const ESCALA = 5 / escalaMax;
  modeloIntro.scale.setScalar(ESCALA);
  modeloIntro.position.set(
    -centro.x * ESCALA + 0.5,
    -centro.y * ESCALA,
    -centro.z * ESCALA
  );
  escena.add(modeloIntro);
});

/* ----------------------------------------------------------
   RENDER LOOP — intro
---------------------------------------------------------- */
function lerp(a, b, t)  { return a + (b - a) * t; }
function easeInOut(t)   { return t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t; }

function animarIntro() {
  requestAnimationFrame(animarIntro);
  renderer.render(escena, camara);
}
animarIntro();

/* ----------------------------------------------------------
   MOUSE — parallax en intro
---------------------------------------------------------- */
window.addEventListener('mousemove', (e) => {
  mouseX = e.clientX - window.innerWidth  / 2;
  mouseY = e.clientY - window.innerHeight / 2;
});

/* ----------------------------------------------------------
   SCROLL — un toque dispara la animación completa
---------------------------------------------------------- */
let animandoIntro = false;

function manejarScrollIntro(e) {
  if (!introActiva || animandoIntro) return;
  e.preventDefault();
  animandoIntro = true;
  ejecutarAnimacionIntro();
}

function ejecutarAnimacionIntro() {
  const DURACION = 1500; 
  const inicio = performance.now();

  function paso(ahora) {
    const transcurrido = ahora - inicio;
    const progreso = Math.min(transcurrido / DURACION, 1);
    const t = easeInOut(progreso);

    camara.position.x = lerp(CAM_INICIO.x, CAM_FIN.x, t);
    camara.position.y = lerp(CAM_INICIO.y, CAM_FIN.y, t);
    camara.position.z = lerp(CAM_INICIO.z, CAM_FIN.z, t);
    camara.lookAt(LOOK_AT);

    if (modeloIntro) {
      modeloIntro.position.x = lerp(0.5, 0.8, t);
    }

    if (progreso < 1) {
      requestAnimationFrame(paso);
    } else {
      terminarIntro();
    }
  }

  requestAnimationFrame(paso);
}

window.addEventListener('wheel', manejarScrollIntro, { passive: false });

/* ----------------------------------------------------------
   TERMINAR INTRO
---------------------------------------------------------- */
function terminarIntro() {
  introActiva = false;
  window.removeEventListener('wheel', manejarScrollIntro);
  

  window.scrollTo(0, 0);
  document.body.classList.remove('intro-activa');
  document.body.style.overflow = 'hidden';
  setTimeout(() => {
    document.body.style.overflow = '';
  }, 1000);

  introEl.classList.add('oculta');
  setTimeout(() => { introEl.style.display = 'none'; }, 800);

  // Mostrar headers al terminar la intro
  document.querySelectorAll('.header').forEach(h => h.classList.remove('header--oculto'));

  setTimeout(() => {
    document.querySelector('.hero__title--oculto')?.classList.add('hero__title--visible');
  }, 300);

  iniciarAnimacionArcoiris();

  setTimeout(() => {
    document.querySelector('.hero__text-block--oculto')?.classList.add('hero__text-block--visible');
  }, 700);

  setTimeout(() => iniciarHeroCanvas(), 500);

  
}

/* ----------------------------------------------------------
   ANIMACIÓN ARCOÍRIS DEL TITULO
---------------------------------------------------------- */
const COLORES_ARCOIRIS = ['#ff0000', '#f4e434', '#39ca04', '#0900ff'];
const DURACION_ARCOIRIS = 2000;  
const PAUSA_ENTRE_DISPAROS = 5000; 

let animandoArcoiris  = false;
let timeoutArcoiris   = null;

function colorAleatorio(excluir) {
  const disponibles = COLORES_ARCOIRIS.filter(c => c !== excluir);
  return disponibles[Math.floor(Math.random() * disponibles.length)];
}

function programarSiguienteArcoiris() {
  clearTimeout(timeoutArcoiris);
  timeoutArcoiris = setTimeout(() => {
    dispararArcoiris();
  }, PAUSA_ENTRE_DISPAROS);
}

function dispararArcoiris() {
  if (animandoArcoiris) return;

  const titulo = document.getElementById('hero-title');
  if (!titulo) return;

  animandoArcoiris = true;
  const letras = titulo.querySelectorAll('.hero__title-letra');

  titulo.classList.remove('arcoiris');
  void titulo.offsetWidth;

  let colorAnterior = null;
  letras.forEach((letra, i) => {
    const color = colorAleatorio(colorAnterior);
    letra.style.setProperty('--color-letra', color);
    letra.style.animationDelay = i * 0.18 + 's';
    colorAnterior = color;
  });

  titulo.classList.add('arcoiris');

  setTimeout(() => {
    titulo.classList.remove('arcoiris');
    animandoArcoiris = false;
    programarSiguienteArcoiris();
  }, DURACION_ARCOIRIS);
}

function iniciarAnimacionArcoiris() {
  const titulo = document.getElementById('hero-title');
  if (!titulo) return;

  timeoutArcoiris = setTimeout(() => {
    dispararArcoiris();
  }, PAUSA_ENTRE_DISPAROS);

  titulo.addEventListener('mouseenter', () => {
    clearTimeout(timeoutArcoiris);
    dispararArcoiris();
  });
}

/* ----------------------------------------------------------
   HERO CANVAS — modelo 3D interactivo (rotación precisa + explosión)
---------------------------------------------------------- */
function iniciarHeroCanvas() {
  const heroCanvas = document.getElementById('hero-canvas');
  if (!heroCanvas) return;

  const W = 1514, H = 1384;
  const escenaHero  = new THREE.Scene();
  const camaraHero  = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
  camaraHero.position.set(0, 0, 10);
  camaraHero.lookAt(0, 0, 0);

  const rendererHero = new THREE.WebGLRenderer({ canvas: heroCanvas, antialias: true, alpha: true });
  rendererHero.setSize(W, H);
  rendererHero.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  rendererHero.outputColorSpace = THREE.SRGBColorSpace;

  escenaHero.add(new THREE.AmbientLight(0xffffff, 1.5));
  const luzH = new THREE.DirectionalLight(0xffffff, 2.5);
  luzH.position.set(5, 10, 7);
  escenaHero.add(luzH);

  // Controles de Órbita
  const controls = new OrbitControls(camaraHero, rendererHero.domElement);
  controls.enableZoom = false; 
  controls.enablePan = false;  
  controls.enableDamping = true; 
  controls.dampingFactor = 0.05;
  
  // SOLUCIÓN DE HITBOX MODELO 3D
  controls.enabled = false;
  rendererHero.domElement.style.touchAction = 'auto'; // Permitir scroll libre

  let modeloHero = null;
  let heroMouseX = mouseX;
  let heroMouseY = mouseY;
  let autoRotar = true; // Controla si el modelo gira solo

  window.addEventListener('mousemove', (e) => {
    heroMouseX = e.clientX - window.innerWidth  / 2;
    heroMouseY = e.clientY - window.innerHeight / 2;
  });

  const raycaster = new THREE.Raycaster();
  const mouseClick = new THREE.Vector2();
  let explosionActiva = false;
  const piezas = [];
  const SEPARACION = 2; 

  new GLTFLoader().load('assets/Polkup3d.glb', (gltf) => {
    modeloHero = gltf.scene;
    const caja = new THREE.Box3().setFromObject(modeloHero);
    const centro = caja.getCenter(new THREE.Vector3());
    const dimensiones = new THREE.Vector3();
    caja.getSize(dimensiones);
    const escalaMax = Math.max(dimensiones.x, dimensiones.y, dimensiones.z);
    const ESCALA = 3 / escalaMax;
    modeloHero.scale.setScalar(ESCALA);
    modeloHero.position.set(
      -centro.x * ESCALA,
      -centro.y * ESCALA,
      -centro.z * ESCALA
    );
    escenaHero.add(modeloHero);

    let meshes = [];
    modeloHero.traverse((child) => {
      if (child.isMesh) {
        const box = new THREE.Box3().setFromObject(child);
        child.userData.centerY = box.getCenter(new THREE.Vector3()).y;
        meshes.push(child);
      }
    });

    let nivelesMap = [];
    meshes.forEach(m => {
      let nivelEncontrado = nivelesMap.find(nivel => Math.abs(nivel.altura - m.userData.centerY) < 0.5);
      
      if (nivelEncontrado) {
        nivelEncontrado.piezas.push(m);
      } else {
        nivelesMap.push({ altura: m.userData.centerY, piezas: [m] });
      }
    });

    nivelesMap.sort((a, b) => a.altura - b.altura);

    nivelesMap.forEach((nivel, index) => {
      const offset = (index - (nivelesMap.length / 2)) * SEPARACION;
      
      nivel.piezas.forEach(m => {
        piezas.push({
          mesh: m,
          posInicial: m.position.clone(),
          posExplosion: new THREE.Vector3(m.position.x, m.position.y + offset, m.position.z)
        });
      });
    });

    const resetBtn = document.getElementById('hero-reset-btn');
    let pointerDownX = 0;
    let pointerDownY = 0;

    // --- MAGIA UX: Cambiar el cursor a la manito SOLO al tocar el modelo real ---
    heroCanvas.addEventListener('pointermove', (event) => {
      const rect = heroCanvas.getBoundingClientRect();
      mouseClick.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseClick.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      
      raycaster.setFromCamera(mouseClick, camaraHero);
      
      if (modeloHero && !controls.enabled) { // Evita parpadeos si ya estás girando el modelo
        const intersects = raycaster.intersectObject(modeloHero, true);
        if (intersects.length > 0) {
          heroCanvas.style.cursor = 'grab'; // Cambia a mano interactiva
        } else {
          heroCanvas.style.cursor = 'default'; // Flecha normal en el espacio vacío
        }
      }
    });

    // --- DETECCIÓN DE LA HITBOX EXACTA AL HACER CLIC ---
    heroCanvas.addEventListener('pointerdown', (event) => {
      pointerDownX = event.clientX;
      pointerDownY = event.clientY;

      const rect = heroCanvas.getBoundingClientRect();
      mouseClick.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseClick.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouseClick, camaraHero);
      
      if (modeloHero) {
        const intersects = raycaster.intersectObject(modeloHero, true);
        if (intersects.length > 0) {
          // Tocaste la geometría 3D: Encendemos los controles de órbita
          controls.enabled = true;
          rendererHero.domElement.style.touchAction = 'none'; // Bloquea scroll momentáneamente
        } else {
          // Tocaste el aire: Se queda todo apagado para que el scroll fluya
          controls.enabled = false;
        }
      }
    }, true); // <- Este "true" obliga al navegador a leer esto ANTES que los OrbitControls

    // Apagamos los controles al soltar el ratón para devolver el control a la página web
    window.addEventListener('pointerup', () => {
      controls.enabled = false;
      rendererHero.domElement.style.touchAction = 'auto'; // Devuelve el scroll
      heroCanvas.style.cursor = 'default';
    }, true);

    // Si el usuario empieza a orbitar activamente, mostramos el botón
    controls.addEventListener('start', () => {
      if (resetBtn && controls.enabled) {
        resetBtn.classList.add('visible');
        autoRotar = false; // Detenemos la rotación automática si el usuario interviene
        heroCanvas.style.cursor = 'grabbing'; // Efecto visual de tener la pieza agarrada
      }
    });

    // Restaurar la cámara al apretar el botón de colores
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        const startPos = camaraHero.position.clone();
        const endPos = new THREE.Vector3(0, 0, 10);
        const startTarget = controls.target.clone();
        const endTarget = new THREE.Vector3(0, 0, 0);

        const duration = 800; // 0.8 segundos de animación
        const startTime = performance.now();

        function animarReinicio(time) {
          const elapsed = time - startTime;
          const t = Math.min(elapsed / duration, 1);
          const ease = 1 - Math.pow(1 - t, 3); // easeOutCubic para que sea suave al final

          camaraHero.position.lerpVectors(startPos, endPos, ease);
          controls.target.lerpVectors(startTarget, endTarget, ease);
          controls.update();

          if (t < 1) {
            requestAnimationFrame(animarReinicio);
          } else {
            resetBtn.classList.remove('visible');
            autoRotar = true; // Reactivamos la rotación base
          }
        }
        requestAnimationFrame(animarReinicio);
      });
    }

    // Diferenciar entre clic para explotar y arrastrar para orbitar
    heroCanvas.addEventListener('pointerup', (event) => {
      const deltaX = Math.abs(event.clientX - pointerDownX);
      const deltaY = Math.abs(event.clientY - pointerDownY);

      if (deltaX < 5 && deltaY < 5) {
        const rect = heroCanvas.getBoundingClientRect();
        mouseClick.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouseClick.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouseClick, camaraHero);
        
        if (modeloHero) {
            const intersects = raycaster.intersectObject(modeloHero, true);

            if (intersects.length > 0) {
              explosionActiva = !explosionActiva;
            }
        }
      }
    });

    function animarHero() {
      requestAnimationFrame(animarHero);
      controls.update();

      if (modeloHero) {
        if (autoRotar) {
          modeloHero.rotation.y += 0.004;
          modeloHero.rotation.x += (heroMouseY * 0.0004 - modeloHero.rotation.x) * 0.04;
        }

        const lerpFactor = 0.08;
        piezas.forEach(pieza => {
          const targetPos = explosionActiva ? pieza.posExplosion : pieza.posInicial;
          pieza.mesh.position.lerp(targetPos, lerpFactor);
        });
      }
      rendererHero.render(escenaHero, camaraHero);
    }
    animarHero();
  });
}

/* ----------------------------------------------------------
   RESIZE
---------------------------------------------------------- */
window.addEventListener('resize', () => {
  camara.aspect = window.innerWidth / window.innerHeight;
  camara.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ----------------------------------------------------------
   RESTO DE EFECTOS
---------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', () => {

  const btnComenzar = document.getElementById('cta-comenzar');
  if (btnComenzar) {
    btnComenzar.addEventListener('click', () => {
      btnComenzar.classList.add('is-active');
      setTimeout(() => btnComenzar.classList.remove('is-active'), 500);
      document.getElementById('hero')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  const elementosFadeIn = document.querySelectorAll('.fade-in');
  if (elementosFadeIn.length > 0) {
    const obs = new IntersectionObserver((entradas) => {
      entradas.forEach((e) => {
        if (e.isIntersecting) e.target.classList.add('visible');
        else e.target.classList.remove('visible');
      });
    }, { threshold: 0, rootMargin: '0px 0px -10% 0px' });
    elementosFadeIn.forEach((el) => obs.observe(el));
  }

  const tableroSeccion = document.getElementById('tablero');
  if (tableroSeccion) {
    const capasTablero = [
      { el: document.querySelector('.tablero__img--1'), scroll: 0.04, mouse: 0.006 },
      { el: document.querySelector('.tablero__img--2'), scroll: 0.08, mouse: 0.012 },
      { el: document.querySelector('.tablero__img--3'), scroll: 0.08, mouse: 0 },
    ].filter(item => item.el !== null);

    capasTablero.forEach(({ el }) => {
      el.style.willChange = 'transform';
      el.style.transition = 'transform 0.2s ease-out';
    });

    let scrollY = window.scrollY;
    let tMouseX = 0;
    let tMouseY = 0;

    function aplicarTransformTablero() {
      capasTablero.forEach(({ el, scroll, mouse }) => {
        el.style.transform = `translate(${tMouseX * mouse}px, ${scrollY * scroll + tMouseY * mouse}px)`;
      });
    }

    window.addEventListener('scroll', () => {
      scrollY = window.scrollY;
      aplicarTransformTablero();
    }, { passive: true });

    tableroSeccion.addEventListener('mousemove', (e) => {
      const rect = tableroSeccion.getBoundingClientRect();
      tMouseX = e.clientX - rect.left - rect.width  / 2;
      tMouseY = e.clientY - rect.top  - rect.height / 2;
      aplicarTransformTablero();
    });

    tableroSeccion.addEventListener('mouseleave', () => {
      tMouseX = 0;
      tMouseY = 0;
      aplicarTransformTablero();
    });
  }

  const tiras      = document.querySelectorAll('.galeria__tira');
  const btnIzq     = document.getElementById('galeria-izq');
  const btnDer     = document.getElementById('galeria-der');
  const btnColorIzq = document.getElementById('btn-color-izq');
  const btnColorDer = document.getElementById('btn-color-der');
  const indicadores = document.querySelectorAll('.galeria__indicador');

  const COLORES = ['#0900ff', '#ff0000', '#39ca04', '#f4e434'];
  let tiraActual  = 0;
  let animando    = false;

  function actualizarBotones() {
    const idxIzq = (tiraActual - 1 + COLORES.length) % COLORES.length;
    const idxDer = (tiraActual + 1) % COLORES.length;
    btnColorIzq.style.background = COLORES[idxIzq];
    btnColorDer.style.background = COLORES[idxDer];
  }

  function actualizarIndicadores() {
    indicadores.forEach((ind, i) => {
      ind.classList.toggle('activo', i === tiraActual);
    });
  }

  function irATira(siguiente, direccion) {
    if (animando || siguiente === tiraActual) return;
    animando = true;

    const tiraVieja = tiras[tiraActual];
    const tiraNueva = tiras[siguiente];

    tiraNueva.style.transition = 'none';
    tiraNueva.style.transform  = direccion === 'der' ? 'translateX(100%)' : 'translateX(-100%)';
    tiraNueva.style.opacity    = '0';
    tiraNueva.style.position   = 'absolute';
    tiraNueva.style.top        = '0';

    tiraNueva.offsetHeight;

    const trans = 'transform 0.7s cubic-bezier(0.77,0,0.18,1), opacity 0.5s ease';
    tiraVieja.style.transition = trans;
    tiraNueva.style.transition = trans;

    tiraVieja.style.transform = direccion === 'der' ? 'translateX(-100%)' : 'translateX(100%)';
    tiraVieja.style.opacity   = '0';
    tiraNueva.style.transform = 'translateX(0)';
    tiraNueva.style.opacity   = '1';

    setTimeout(() => {
      tiraVieja.classList.remove('activa');
      tiraVieja.style.cssText = '';

      tiraNueva.style.cssText = '';
      tiraNueva.classList.add('activa');

      tiraActual = siguiente;
      actualizarBotones();
      actualizarIndicadores();
      animando = false;
    }, 750);
  }

  if (tiras.length > 0) {
    tiras[0].classList.add('activa');
    actualizarBotones();
    actualizarIndicadores();

    btnDer?.addEventListener('click', () => {
      const siguiente = (tiraActual + 1) % tiras.length;
      irATira(siguiente, 'der');
    });

    btnIzq?.addEventListener('click', () => {
      const siguiente = (tiraActual - 1 + tiras.length) % tiras.length;
      irATira(siguiente, 'izq');
    });

    indicadores.forEach((ind) => {
      ind.addEventListener('click', () => {
        const idx = parseInt(ind.dataset.idx);
        const dir = idx > tiraActual ? 'der' : 'izq';
        irATira(idx, dir);
      });
    });
  }

  const escaladorDibujo = document.getElementById('escalador-dibujo');
  const imgInicio       = document.getElementById('escalador-inicio');
  const imgGif          = document.getElementById('escalador-gif');
  const imgFinal        = document.getElementById('escalador-final');
  const escaladorTitulo = document.getElementById('escalador-titulo');

  const TEXTO_INICIO = 'TODO ASCENSO<br>DEPENDE DE UN<br>PUNTO DE<br>APOYO';
  const TEXTO_FINAL  = 'NINGÚN CAMINO<br>SE CONSIGUE<br>AL PRIMER INTENTO';

  const GIF_DURACION_MS = 1600;
  let estadoEscalador = 0;

  function cambiarTexto(htmlNuevo) {
    escaladorTitulo.classList.add('cambiando');
    setTimeout(() => {
      escaladorTitulo.innerHTML = htmlNuevo;
      escaladorTitulo.classList.remove('cambiando');
    }, 400);
  }

  function irAEstado(nuevoEstado) {
    imgInicio.style.display = 'none';
    imgGif.style.display    = 'none';
    imgFinal.style.display  = 'none';

    estadoEscalador = nuevoEstado;

    if (nuevoEstado === 0) {
      imgInicio.style.opacity = '0';
      imgInicio.style.transition = 'none';
      imgInicio.style.display = 'block';
      setTimeout(() => {
        imgInicio.style.transition = 'opacity 0.3s ease';
        imgInicio.style.opacity = '1';
      }, 50);
      cambiarTexto(TEXTO_INICIO);
      document.getElementById('cta-comenzar').classList.remove('cta-visible');
    } else if (nuevoEstado === 1) {
      imgGif.src = 'assets/GIF CAIDA.gif?t=' + Date.now();
      imgGif.style.display = 'block';
      setTimeout(() => {
        if (estadoEscalador === 1) irAEstado(2);
      }, GIF_DURACION_MS);
    } else if (nuevoEstado === 2) {
      imgFinal.style.opacity = '0';
      imgFinal.style.transition = 'none';
      imgFinal.style.display = 'block';
      setTimeout(() => {
        imgFinal.style.transition = 'opacity 0.3s ease';
        imgFinal.style.opacity = '1';
      }, 50);
      cambiarTexto(TEXTO_FINAL);
      setTimeout(() => {
        document.getElementById('cta-comenzar').classList.add('cta-visible');
      }, 500);
    }
  }
  
  if (escaladorDibujo) {
    escaladorDibujo.addEventListener('click', () => {
      if (estadoEscalador === 0) {
        irAEstado(1);
      } else if (estadoEscalador === 2) {
        irAEstado(0);
      }
    });
  }

});