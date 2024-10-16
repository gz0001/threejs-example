// @ts-nocheck
import './style.scss';

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { XRButton } from 'three/addons/webxr/XRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { DragControls } from 'three/addons/controls/DragControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader';
import { GUI } from 'dat.gui';
import { Flow } from 'three/examples/jsm/Addons.js';
import { getObjSnap } from './getObjSnap';
import { fitCameraToObject, cameraFollowObject } from './fitCameraToObject';
import MicroModal from 'micromodal';

let container;
let camera: THREE.PerspectiveCamera, scene, renderer;
let controller1, controller2;
let dragControllers;
let controllerGrip1, controllerGrip2;

let raycaster;

const intersected = [];

let controls, group;

let enableSelection = false;

const objects = [];
let objMesh;
let mainMaterial;

const mouse = new THREE.Vector2();

let viewMode = 'fixed';

const gui = new GUI();

init();

function init() {
  MicroModal.init();
  container = document.createElement('div');
  document.body.appendChild(container);

  scene = new THREE.Scene();
  scene.background = new THREE.Color('white');

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(10, 10, 10);

  controls = new OrbitControls(camera, container);
  controls.target.set(0, 1.6, 0);
  controls.update();

  const floorGeometry = new THREE.PlaneGeometry(6, 6);
  const floorMaterial = new THREE.ShadowMaterial({
    opacity: 0.25,
    blending: THREE.CustomBlending,
    transparent: false,
  });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  scene.add(new THREE.HemisphereLight(0xbcbcbc, 0xa5a5a5, 3));

  const light = new THREE.DirectionalLight('0xffffff', 3);
  light.position.set(0, 6, 0);
  light.castShadow = true;
  light.shadow.camera.top = 3;
  light.shadow.camera.bottom = -3;
  light.shadow.camera.right = 3;
  light.shadow.camera.left = -3;
  light.shadow.mapSize.set(4096, 4096);
  scene.add(light);

  group = new THREE.Group();
  scene.add(group);

  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setAnimationLoop(animate);
  renderer.shadowMap.enabled = true;
  renderer.transparent = true;
  renderer.alpha = true;
  renderer.xr.enabled = true;
  container.appendChild(renderer.domElement);

  // controllers

  controller1 = renderer.xr.getController(0);
  controller1.addEventListener('selectstart', onSelectStart);
  controller1.addEventListener('selectend', onSelectEnd);
  scene.add(controller1);

  controller2 = renderer.xr.getController(1);
  controller2.addEventListener('selectstart', onSelectStart);
  controller2.addEventListener('selectend', onSelectEnd);
  scene.add(controller2);

  // const axesHelper = new THREE.AxesHelper(1000);
  // scene.add(axesHelper);

  const gridHelper = new THREE.GridHelper(100, 100);
  scene.add(gridHelper);

  const controllerModelFactory = new XRControllerModelFactory();

  controllerGrip1 = renderer.xr.getControllerGrip(0);
  controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));
  scene.add(controllerGrip1);

  controllerGrip2 = renderer.xr.getControllerGrip(1);
  controllerGrip2.add(controllerModelFactory.createControllerModel(controllerGrip2));
  scene.add(controllerGrip2);

  dragControllers = new DragControls([...objects], camera, renderer.domElement);
  dragControllers.rotateSpeed = 2;
  dragControllers.addEventListener('drag', animate);

  dragControllers.addEventListener('dragstart', function () {
    controls.enabled = false;
  });
  dragControllers.addEventListener('dragend', function () {
    controls.enabled = true;
  });

  //

  // const geometry = new THREE.BufferGeometry().setFromPoints([
  //   new THREE.Vector3(0, 0, 0),
  //   new THREE.Vector3(0, 0, -1),
  // ]);

  // const line = new THREE.Line(geometry);
  // line.name = 'line';
  // line.scale.z = 5;

  // controller1.add(line.clone());
  // controller2.add(line.clone());

  raycaster = new THREE.Raycaster();

  //

  window.addEventListener('resize', onWindowResize);
  document.addEventListener('click', onClick);

  // Make canvas dropable
  const canvas = container.querySelector('canvas');
  if (canvas) {
    canvas.addEventListener('dragover', (event) => {
      event.preventDefault();
    });
  }

  // Get snapshot
  const saveAsImage = () => {
    let imgData, imgNode;

    try {
      const strMime = 'image/jpeg';
      const strDownloadMime = 'image/octet-stream';

      imgData = renderer.domElement.toDataURL(strMime);

      saveFile(imgData.replace(strMime, strDownloadMime), 'snapshot.jpg');
    } catch (e) {
      console.log(e);
      return;
    }
  };

  const saveFile = (strData, filename) => {
    const link = document.createElement('a');
    if (typeof link.download === 'string') {
      document.body.appendChild(link); //Firefox requires the link to be in the body
      link.download = filename;
      link.href = strData;
      link.click();
      document.body.removeChild(link); //remove the link when done
    } else {
      location.replace(uri);
    }
  };

  document.querySelector('#snapshot button')?.addEventListener('click', saveAsImage);

  // Load object file:
  const objLoader = new OBJLoader();
  const mtlLoader = new MTLLoader();

  mtlLoader.load('./models/Furniture.mtl', (materials) => {
    materials.preload();
    objLoader.setMaterials(materials);
    objLoader.load('./models/Furniture.obj', (object) => {
      objMesh = object;
      mainMaterial = materials.materials?.['Material.002'];
      console.log({ objMesh, mainMaterial });
      objects.push(objMesh);
      scene.add(objMesh);

      const colorFolder = gui.addFolder('Color');
      colorFolder.addColor({ 'First Color': '#7c5845' }, 'First Color').onChange((color) => {
        objMesh.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material?.name === 'Material.001') {
            child.material.color.set(color);
          }
        });
      });

      colorFolder.addColor({ 'Second Color': '#50493b' }, 'Second Color').onChange((color) => {
        objMesh.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material?.name === 'Material.002') {
            child.material.color.set(color);
          }
        });
      });
      colorFolder.open();

      // Add dat.GUI elements to rotate objMesh
      const rotationFolder = gui.addFolder('Rotation');
      const rotationParams = {
        rotationX: 0,
        rotationY: 0,
        rotationZ: 0,
      };

      rotationFolder.add(rotationParams, 'rotationX', 0, Math.PI * 2).onChange((value) => {
        objMesh.rotation.x = value;
      });

      rotationFolder.add(rotationParams, 'rotationY', 0, Math.PI * 2).onChange((value) => {
        objMesh.rotation.y = value;
      });

      rotationFolder.add(rotationParams, 'rotationZ', 0, Math.PI * 2).onChange((value) => {
        objMesh.rotation.z = value;
      });

      rotationFolder.open();

      // Add dat.GUI elements to resize objMesh
      const scaleFolder = gui.addFolder('Scale');
      const scaleParams = {
        scaleX: 1,
        scaleY: 1,
        scaleZ: 1,
      };

      scaleFolder.add(scaleParams, 'scaleX', 0.1, 5).onChange((value) => {
        objMesh.scale.x = value;
      });

      scaleFolder.add(scaleParams, 'scaleY', 0.1, 5).onChange((value) => {
        objMesh.scale.y = value;
      });

      scaleFolder.add(scaleParams, 'scaleZ', 0.1, 5).onChange((value) => {
        objMesh.scale.z = value;
      });

      scaleFolder.open();
    });
  });

  const fileInput = document.querySelector('#file');
  fileInput?.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const textureLoader = new THREE.TextureLoader();
        const texture = await textureLoader.loadAsync(e.target.result as string);

        const newMaterial = new THREE.MeshBasicMaterial({ map: texture, name: 'Material.002' });

        objMesh.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material?.name === 'Material.002') {
            child.material = newMaterial;
            child.material.needsUpdate = true;
          }
        });
      };
      reader.readAsDataURL(file);
    }
  });
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
}

function onSelectStart(event) {
  const controller = event.target;

  const intersections = getIntersections(controller);

  if (intersections.length > 0) {
    const intersection = intersections[0];

    const object = intersection.object;
    object.material.emissive.b = 1;
    controller.attach(object);

    controller.userData.selected = object;
  }

  controller.userData.targetRayMode = event.data.targetRayMode;
}

function onSelectEnd(event) {
  const controller = event.target;

  if (controller.userData.selected !== undefined) {
    const object = controller.userData.selected;
    object.material.emissive.b = 0;
    group.attach(object);

    controller.userData.selected = undefined;
  }
}

function getIntersections(controller) {
  controller.updateMatrixWorld();

  raycaster.setFromXRController(controller);

  return raycaster.intersectObjects(group.children, false);
}

function intersectObjects(controller) {
  // Do not highlight in mobile-ar

  if (controller.userData.targetRayMode === 'screen') return;

  // Do not highlight when already selected

  if (controller.userData.selected !== undefined) return;

  const line = controller.getObjectByName('line');
  const intersections = getIntersections(controller);

  if (intersections.length > 0) {
    const intersection = intersections[0];

    const object = intersection.object;
    object.material.emissive.r = 1;
    intersected.push(object);

    line.scale.z = intersection.distance;
  } else {
    line.scale.z = 5;
  }
}

function cleanIntersected() {
  while (intersected.length) {
    const object = intersected.pop();
    object.material.emissive.r = 0;
  }
}

function onClick(event) {
  if (!event.target.closest('canvas')) {
    return;
  }
  event.preventDefault();

  const draggableObjects = dragControllers.getObjects();

  draggableObjects.length = 0;

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  const intersections = raycaster.intersectObjects(objects, true);

  if (intersections.length > 0) {
    const object = intersections[0].object;

    if (group.children.includes(object) === true) {
      object.material.emissive.set(0x000000);
      scene.attach(object);
    } else {
      object.material.emissive.set(0xaaaaaa);
      group.attach(object);
    }

    controls.transformGroup = true;
    draggableObjects.push(group);
  }

  if (group.children.length === 0) {
    controls.transformGroup = false;
    draggableObjects.push(...objects);
  }

  animate();
}

function animate() {
  // cleanIntersected();

  // intersectObjects(controller1);
  // intersectObjects(controller2);

  renderer.render(scene, camera);
}
