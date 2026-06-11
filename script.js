/* ============================================================
   POLKUP — script.js
   Contiene:
   1. Botón "Comenzar experiencia"
   2. Fade-in al hacer scroll (listo para usar)
   3. Parallax base (desactivado, listo para activar)
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  /* ----------------------------------------------------------
     1. BOTÓN "COMENZAR EXPERIENCIA"
     Al hacer click, hace scroll suave hasta la sección #hero
     y activa un estado visual en el botón.
     Puedes cambiar el target o agregar una animación de entrada.
  ---------------------------------------------------------- */
  const btnComenzar = document.getElementById('cta-comenzar');

  if (btnComenzar) {
    btnComenzar.addEventListener('click', () => {

      // Estado visual activo (el CSS lo maneja con .is-active)
      btnComenzar.classList.add('is-active');
      setTimeout(() => btnComenzar.classList.remove('is-active'), 500);

      // Scroll suave al inicio de la página (sección hero)
      const destino = document.getElementById('hero');
      if (destino) {
        destino.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      // 👉 AQUÍ puedes agregar: abrir modal, cambiar de página, iniciar animación, etc.
      // Ejemplo: window.location.href = 'juego.html';
      // Ejemplo: document.body.classList.add('experiencia-activa');
    });
  }


  /* ----------------------------------------------------------
     2. FADE-IN AL HACER SCROLL
     Cualquier elemento con la clase "fade-in" aparece suavemente
     cuando entra al viewport.

     Para usarlo: agrega class="fade-in" a cualquier elemento en el HTML.
     El CSS ya tiene los estilos necesarios en style.css.
  ---------------------------------------------------------- */
  const elementosFadeIn = document.querySelectorAll('.fade-in');

  if (elementosFadeIn.length > 0) {
    const observadorScroll = new IntersectionObserver((entradas) => {
      entradas.forEach((entrada) => {
        if (entrada.isIntersecting) {
          entrada.target.classList.add('visible');
          // Quitar la línea siguiente para hacer que el efecto solo ocurra una vez (no se repita al volver a subir): 
          // observadorScroll.unobserve(entrada.target);
        } else {
          entrada.target.classList.remove('visible');
        }
      });
    }, {
      threshold: 0, // Aparece cuando el x% del elemento es visible
      rootMargin: '0px 0px -10% 0px' // Ajusta el trigger para que sea un poco antes de que el elemento esté completamente visible
    });

    elementosFadeIn.forEach((el) => observadorScroll.observe(el));
  }


  /* ----------------------------------------------------------
     BASE PARA PARALLAX
     Desactivado por defecto. Descomenta el bloque para activarlo.

     Funciona moviendo elementos a distinta velocidad al hacer scroll,
     creando sensación de profundidad.

     Uso:
       - Agrega data-parallax="0.3" a cualquier elemento del HTML
       - El número es la velocidad (0.1 = sutil, 0.5 = fuerte)
  ---------------------------------------------------------- */

  /*Parallax al scroll horizonte del tablero (3 capas superpuestas)
  ---------------------------------------------------------- 
  const capasTablero = [
  { el: document.querySelector('.tablero__img--1'), velocidad: 0.04 },
  { el: document.querySelector('.tablero__img--2'), velocidad: 0.08 },
  { el: document.querySelector('.tablero__img--3'), velocidad: 0.08 },
];

const capasFiltradas = capasTablero.filter(item => item.el !== null);

capasFiltradas.forEach(({ el }) => {
  el.style.willChange = 'transform';
});

window.addEventListener('scroll', () => {
  const scrollY = window.scrollY;

  capasFiltradas.forEach(({ el, velocidad }) => {
    el.style.transform = `translateY(${scrollY * velocidad}px)`;
  });
}, { passive: true });
/* ----------------------------------------------------------

/* ----------------------------------------------------------
   PARALLAX CON MOUSE — TABLERO
   Las 3 capas de la imagen horizontal se mueven levemente
   siguiendo el cursor, cada una a distinta velocidad.
---------------------------------------------------------- 
const tableroSeccion = document.getElementById('tablero');

if (tableroSeccion) {
  const capasMouseTablero = [
    { el: document.querySelector('.tablero__img--1'), velocidad: 0.006 },
    { el: document.querySelector('.tablero__img--2'), velocidad: 0.012 },
    { el: document.querySelector('.tablero__img--3'), velocidad: 0 },
  ];

  const capasMouse = capasMouseTablero.filter(item => item.el !== null);

  capasMouse.forEach(({ el }) => {
    el.style.transition = 'transform 0.2s ease-out';
  });

  tableroSeccion.addEventListener('mousemove', (e) => {
    const rect    = tableroSeccion.getBoundingClientRect();
    const centroX = rect.width  / 2;
    const centroY = rect.height / 2;
    const dx = e.clientX - rect.left - centroX;
    const dy = e.clientY - rect.top  - centroY;

    capasMouse.forEach(({ el, velocidad }) => {
      const mx = dx * velocidad;
      const my = dy * velocidad;
      el.style.transform = `translate(${mx}px, ${my}px)`;
    });
  });

  tableroSeccion.addEventListener('mouseleave', () => {
    capasMouse.forEach(({ el }) => {
      el.style.transform = 'translate(0px, 0px)';
    });
  });
}
/* ---------------------------------------------------------- */

  /* ----------------------------------------------------------
     PARALLAX CON MOUSE — HERO
     El título, la imagen del tablero y el bloque de texto
     se mueven levemente siguiendo el cursor.

     Velocidades (más alto = más movimiento):
       titulo:   0.012  → muy sutil
       imagen:   0.020  → un poco más notorio
       texto:    0.008  → casi imperceptible
  ---------------------------------------------------------- */
  const heroSeccion = document.getElementById('hero');

  if (heroSeccion) {
    const elementosMouseParallax = [
      { el: document.querySelector('.hero__title'),    velocidad: 0.005 },
      { el: document.querySelector('.hero__rotation'), velocidad: 0.020 },
      //{ el: document.querySelector('.hero__text-block'), velocidad: 0.008 },
    ];

    // Filtra los que no existan en el DOM
    const capas = elementosMouseParallax.filter(item => item.el !== null);

    // Añade transición suave a cada elemento (solo la primera vez)
    capas.forEach(({ el }) => {
      el.style.transition = 'transform 0.15s ease-out';
      el.style.willChange = 'transform';
    });

    heroSeccion.addEventListener('mousemove', (e) => {
      // Posición del cursor relativa al centro del hero
      const rect   = heroSeccion.getBoundingClientRect();
      const centroX = rect.width  / 2;
      const centroY = rect.height / 2;
      const dx = e.clientX - rect.left  - centroX;
      const dy = e.clientY - rect.top   - centroY;

      capas.forEach(({ el, velocidad }) => {
        const mx = dx * velocidad;
        const my = dy * velocidad;
        el.style.transform = `translate(${mx}px, ${my}px)`;
      });
    });

    // Al salir del hero, los elementos vuelven a su posición original
    heroSeccion.addEventListener('mouseleave', () => {
      capas.forEach(({ el }) => {
        el.style.transform = 'translate(0px, 0px)';
      });
    });
  }

/* ----------------------------------------------------------
   PARALLAX TABLERO — scroll + mouse combinados
---------------------------------------------------------- */
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
  let mouseX  = 0;
  let mouseY  = 0;

  function aplicarTransformTablero() {
    capasTablero.forEach(({ el, scroll, mouse }) => {
      const ty = scrollY * scroll + mouseY * mouse;
      const tx = mouseX * mouse;
      el.style.transform = `translate(${tx}px, ${ty}px)`;
    });
  }

  window.addEventListener('scroll', () => {
    scrollY = window.scrollY;
    aplicarTransformTablero();
  }, { passive: true });

  tableroSeccion.addEventListener('mousemove', (e) => {
    const rect = tableroSeccion.getBoundingClientRect();
    mouseX = e.clientX - rect.left  - rect.width  / 2;
    mouseY = e.clientY - rect.top   - rect.height / 2;
    aplicarTransformTablero();
  });

  tableroSeccion.addEventListener('mouseleave', () => {
    mouseX = 0;
    mouseY = 0;
    aplicarTransformTablero();
  });
}
  /* ----------------------------------------------------------
     5. ESPACIO PARA TUS PROPIOS EFECTOS
     Agrega aquí cualquier animación, interacción o lógica nueva.

     Ideas comunes:
       - Rotación de los círculos del hero al mover el mouse
       - Contador animado al llegar a una sección
       - Cambio de color del header al hacer scroll
       - Carrusel o slider de imágenes
  ---------------------------------------------------------- */

});