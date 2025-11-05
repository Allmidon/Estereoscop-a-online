import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';

// --- VARIABLES GLOBALES Y CONFIGURACIÓN ---

let camera, scene, renderer;
let reticle, raycaster, clock;

// Grupos para gestionar los modos de la aplicación
let menuGroup, imageViewerGroup, worldGroup;

// Estado de la aplicación
let currentMode = 'menu';
let imageCollection = [
    // IMPORTANTE: Reemplaza estas URLs con tus propias imágenes SBS
    // He usado imágenes de ejemplo de Wikimedia Commons (formato anaglifo, pero sirven para SBS)
    // Para un efecto 3D real, necesitas imágenes "Side-by-Side" (izquierda/derecha)
    './images/Image1.jpeg',
    './images/Image2.jpeg',
    './images/Image3.jpeg',
    './images/Image4.jpeg',
];
let currentImageIndex = 0;
let imagePlane, imageMaterial, textureLoader;

// Estado de la interacción por mirada (Gaze)
let gazeTarget = null;
let gazeStartTime = 0;
const GAZE_DWELL_TIME = 1.5; // Tiempo en segundos para "hacer clic"

init();
animate();

// --- INICIALIZACIÓN ---

function init() {
    // Escena
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101010);

    // Cámara
    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 1.6, 0); // Posición inicial (altura de los ojos)

    // Luces
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Botón de VR
    document.body.appendChild(VRButton.createButton(renderer));

    // ---- AÑADE ESTO ----
    // Asigna los nombres a las cámaras SÓLO cuando la sesión VR comience
    renderer.xr.addEventListener('sessionstart', () => {
        const xrCamera = renderer.xr.getCamera();
        xrCamera.cameras[0].name = 'left';
        xrCamera.cameras[1].name = 'right';
    });
    // --------------------

    // Herramientas de interacción
    clock = new THREE.Clock();
    setupGazeControls();

    // --- Creación de los "Modos" ---
    textureLoader = new THREE.TextureLoader();

    menuGroup = new THREE.Group();
    imageViewerGroup = new THREE.Group();
    worldGroup = new THREE.Group();

    scene.add(menuGroup);
    scene.add(imageViewerGroup);
    scene.add(worldGroup);

    createMenu();
    createImageViewer();
    createWorld();

    // Empezar en el modo menú
    setMode('menu');

    // Ajustar la ventana
    window.addEventListener('resize', onWindowResize);
}

// --- CONFIGURACIÓN DE CONTROLES (MIRADA) ---

function setupGazeControls() {
    // Raycaster (para detectar qué estamos mirando)
    raycaster = new THREE.Raycaster();

    // Retículo (el punto en el centro de la pantalla)
    const reticleGeometry = new THREE.RingGeometry(0.01, 0.02, 32);
    const reticleMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.7, transparent: true });
    reticle = new THREE.Mesh(reticleGeometry, reticleMaterial);
    reticle.position.z = -2; // Colocarlo a 2 metros delante de la cámara
    reticle.layers.set(0); // Asegurarse de que sea visible en todo momento
    camera.add(reticle); // Añadirlo a la cámara para que se mueva con ella
    scene.add(camera); // Añadir la cámara (con el retículo) a la escena
}

// --- CREACIÓN DE MODOS Y UI ---

function createMenu() {
    const title = createButton(
        "Mi Visor WebXR",
        "title", // 'name' para el raycaster (no interactivo)
        new THREE.Vector3(0, 2.5, -4),
        4, 1, false // más grande, no interactivo
    );

    const imageButton = createButton(
        "Modo: Visor de Imágenes",
        "btn-image-viewer", // 'name' para el raycaster
        new THREE.Vector3(-1.5, 1.6, -4)
    );

    const worldButton = createButton(
        "Modo: Mundo VR",
        "btn-world", // 'name' para el raycaster
        new THREE.Vector3(1.5, 1.6, -4)
    );

    menuGroup.add(title, imageButton, worldButton);
}

function createImageViewer() {
    // --- Lógica de la imagen Side-by-Side (SBS) ---
    // Creamos un solo plano y un solo material.
    // Usaremos el hook `onBeforeRender` del material para
    // cambiar el 'offset' y 'repeat' de la textura
    // dinámicamente para cada ojo.

    imageMaterial = new THREE.MeshBasicMaterial({ map: null });

    imageMaterial.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
        // 'camera' aquí es la cámara específica del ojo (izquierdo o derecho)

        if (camera.name === 'left') {
            // Ojo izquierdo: mostrar la mitad izquierda de la textura
            material.map.offset.x = 0;
            material.map.repeat.x = 0.5;
        } else if (camera.name === 'right') {
            // Ojo derecho: mostrar la mitad derecha de la textura
            material.map.offset.x = 0.5;
            material.map.repeat.x = 0.5;
        } else {
            // Vista normal (no VR): mostrar la textura completa
            material.map.offset.x = 0;
            material.map.repeat.x = 1;
        }
    };

    // Es importante resetear la textura después de renderizar,
    // para que la vista 'normal' (no VR) funcione correctamente.
    imageMaterial.onAfterRender = (renderer, scene, camera, geometry, material, group) => {
        material.map.offset.x = 0;
        material.map.repeat.x = 1;
    };

    // Nombrar las cámaras del rig de XR para que la lógica de arriba funcione

    // Crear el plano para la imagen
    const imageGeometry = new THREE.PlaneGeometry(4, 2); // Aspecto 2:1 (típico de SBS)
    imagePlane = new THREE.Mesh(imageGeometry, imageMaterial);
    imagePlane.position.z = -3;
    imagePlane.position.y = 1.6;

    // --- Botones de Navegación ---
    const arrowLeft = createButton("◄", "btn-arrow-left", new THREE.Vector3(-2.5, 1.6, -3), 0.5, 0.5);
    const arrowRight = createButton("►", "btn-arrow-right", new THREE.Vector3(2.5, 1.6, -3), 0.5, 0.5);
    const backButton = createButton("Volver al Menú", "btn-back-menu", new THREE.Vector3(0, 0.5, -3), 2, 0.5);

    imageViewerGroup.add(imagePlane, arrowLeft, arrowRight, backButton);

    // Cargar la primera imagen
    loadImage(currentImageIndex);
}

function createWorld() {
    // Cielo
    const skyGeometry = new THREE.SphereGeometry(50, 32, 32);
    const skyMaterial = new THREE.MeshBasicMaterial({ color: 0x87ceeb, side: THREE.BackSide });
    const sky = new THREE.Mesh(skyGeometry, skyMaterial);

    // Suelo
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshBasicMaterial({ color: 0x228B22 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;

    // Torre (donde está el jugador)
    const towerGeometry = new THREE.CylinderGeometry(2, 2, 10, 16);
    const towerMaterial = new THREE.MeshStandardMaterial({ color: 0x888888 });
    const tower = new THREE.Mesh(towerGeometry, towerMaterial);
    tower.position.y = 5; // La mitad de su altura, para que la base esté en y=0

    worldGroup.add(sky, ground, tower);

    // Montañas (cubos y pirámides)
    for (let i = 0; i < 50; i++) {
        const isCube = Math.random() > 0.5;
        const size = Math.random() * 5 + 2;

        const geometry = isCube ?
            new THREE.BoxGeometry(size, size, size) :
            new THREE.ConeGeometry(size / 1.5, size * 1.5, 4); // Pirámide

        const material = new THREE.MeshStandardMaterial({
            color: isCube ? 0x8B4513 : 0x696969, // Marrón o Gris
            flatShading: true
        });

        const mountain = new THREE.Mesh(geometry, material);

        const x = (Math.random() - 0.5) * 80;
        const z = (Math.random() - 0.5) * 80;

        // Evitar que aparezcan en la torre
        if (Math.abs(x) < 5 && Math.abs(z) < 5) continue;

        mountain.position.set(x, size / 2, z); // Anclar a la base
        worldGroup.add(mountain);
    }

    // Botón para volver al menú
    const backButton = createButton("Volver al Menú", "btn-back-menu", new THREE.Vector3(0, 1.6, -2));
    backButton.position.set(0, 11, -3); // Posicionarlo en el aire, frente a la torre
    worldGroup.add(backButton);

    // Posicionar la cámara en la cima de la torre (10m + 1.6m de altura de ojos)
    // NOTA: En VR, la altura 'y' se sumará a la altura real del jugador.
    // Para una experiencia sentada, esto está bien.
    // Para 'room scale', el suelo del mundo (y=0) será el suelo real.
    // Ajustamos la posición de la torre y el suelo para que y=10 sea la cima.
    tower.position.y = 5; // Base en 0, cima en 10
    ground.position.y = 0;
    // Movemos el *grupo* del mundo hacia abajo para que la cima de la torre
    // esté a la altura de los ojos (1.6m)
    worldGroup.position.y = -8.4; // (1.6m - 10m)
}


// --- FUNCIONES AUXILIARES ---

/**
 * Función de ayuda para crear botones de UI como planos con texto.
 */
function createButton(text, name, position, width = 2, height = 0.5, interactive = true) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    canvas.width = 512;
    canvas.height = (512 * height) / width;

    context.fillStyle = interactive ? "rgba(0, 0, 0, 0.7)" : "rgba(0, 0, 0, 0.0)";
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.fillStyle = "white";
    context.font = "60px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
    const geometry = new THREE.PlaneGeometry(width, height);
    const mesh = new THREE.Mesh(geometry, material);

    mesh.name = name;
    mesh.position.copy(position);
    mesh.layers.set(0); // Visible en todos los modos/ojos

    return mesh;
}

/**
 * Cambia la visibilidad de los grupos de la escena.
 */
function setMode(mode) {
    currentMode = mode;

    menuGroup.visible = (mode === 'menu');
    imageViewerGroup.visible = (mode === 'image-viewer');
    worldGroup.visible = (mode === 'world');

    // Si entramos al modo mundo, ajustamos la posición de la cámara
    if (mode === 'world') {
        // La cámara (rig) se coloca en la cima de la torre
        // El grupo del mundo se ajusta para que la cima (y=10)
        // coincida con la altura de los ojos (y=1.6)
        camera.position.y = 1.6; // Altura de ojos estándar
        worldGroup.position.y = -8.4; // Mover mundo (1.6m - 10m de torre)

    } else {
        // En el menú y visor, la cámara está en el origen (0, 1.6, 0)
        // y los elementos están flotando en el aire.
        camera.position.y = 1.6;
        worldGroup.position.y = 0; // Resetear posición del mundo
    }
}

/**
 * Carga una nueva textura en el plano de imagen.
 */
function loadImage(index) {
    currentImageIndex = index;
    textureLoader.load(imageCollection[index], (texture) => {
        imageMaterial.map = texture;
        imageMaterial.needsUpdate = true;
    });
}

// --- BUCLE DE ANIMACIÓN Y LÓGICA DE INTERACCIÓN ---

function animate() {
    renderer.setAnimationLoop(render);
}

function render() {
    // Solo procesar la mirada si estamos en VR
    if (renderer.xr.isPresenting) {
        handleGazeInteraction();
    }

    renderer.render(scene, camera);
}

function handleGazeInteraction() {
    // 1. Lanzar el rayo desde el centro de la cámara
    raycaster.setFromCamera({ x: 0, y: 0 }, camera);

    // 2. Comprobar intersecciones solo con objetos interactivos
    // Buscamos en toda la escena, pero solo reaccionamos a los botones
    const intersects = raycaster.intersectObjects(scene.children, true);

    // Filtrar solo los objetos con nombre 'btn-'
    const hit = intersects.find(intersect =>
        intersect.object.name.startsWith('btn-') && intersect.object.visible
    );

    if (hit) {
        // Estamos mirando un botón
        const hitObject = hit.object;

        if (gazeTarget !== hitObject) {
            // Empezamos a mirar un *nuevo* botón
            if (gazeTarget) {
                // Restaurar el botón anterior
                gazeTarget.scale.set(1, 1, 1);
            }
            gazeTarget = hitObject;
            gazeTarget.scale.set(1.1, 1.1, 1.1); // Resaltar botón
            gazeStartTime = clock.getElapsedTime();
        } else {
            // Seguimos mirando el mismo botón
            const elapsedTime = clock.getElapsedTime() - gazeStartTime;
            if (elapsedTime > GAZE_DWELL_TIME) {
                // ¡Clic!
                triggerGazeAction(gazeTarget.name);
                gazeStartTime = clock.getElapsedTime(); // Resetear para evitar clics múltiples
            }
        }
    } else {
        // No estamos mirando nada interactivo
        if (gazeTarget) {
            // Dejar de resaltar el botón
            gazeTarget.scale.set(1, 1, 1);
        }
        gazeTarget = null;
    }
}

function triggerGazeAction(name) {
    console.log("Acción de mirada: ", name);
    switch (name) {
        // --- Menú ---
        case 'btn-image-viewer':
            setMode('image-viewer');
            break;
        case 'btn-world':
            setMode('world');
            break;

        // --- Visor de Imágenes ---
        case 'btn-arrow-left':
            currentImageIndex--;
            if (currentImageIndex < 0) {
                currentImageIndex = imageCollection.length - 1;
            }
            loadImage(currentImageIndex);
            break;
        case 'btn-arrow-right':
            currentImageIndex++;
            if (currentImageIndex >= imageCollection.length) {
                currentImageIndex = 0;
            }
            loadImage(currentImageIndex);
            break;

        // --- Botón Común "Volver" ---
        case 'btn-back-menu':
            setMode('menu');
            break;
    }
}

// --- MANEJADOR DE REDIMENSIONAMIENTO ---

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}