// @ts-nocheck
import './style.scss';

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { XRButton } from 'three/addons/webxr/XRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { DragControls } from 'three/addons/controls/DragControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { Flow } from 'three/examples/jsm/Addons.js';
import { getObjSnap } from './getObjSnap';
import { fitCameraToObject, cameraFollowObject } from './fitCameraToObject';
import MicroModal from 'micromodal';
import { GUI } from 'dat.gui';
import { post, fetcher, API_URL } from './fetcher';
import { gsap } from 'gsap';

let container;
let camera: THREE.PerspectiveCamera, scene, renderer;
let controller1, controller2;
let dragControllers;
let controllerGrip1, controllerGrip2;

let raycaster;

const intersected = [];

let controls, group;

const loader = new STLLoader();

let enableSelection = false;

const objects = [],
  objectSnapshots = [],
  movingObjects = [];
let selectedFollowIndex = null;

let pathSelected = 0;
let droppedPos = new THREE.Vector3();
let droppedGeometry;

const geometries = [
  new THREE.BoxGeometry(0.2, 0.2, 0.2),
  new THREE.ConeGeometry(0.2, 0.2, 64),
  new THREE.CylinderGeometry(0.2, 0.2, 0.2, 64),
  new THREE.IcosahedronGeometry(0.2, 8),
  new THREE.TorusGeometry(0.2, 0.04, 64, 32),
];

const clock = new THREE.Clock();

const paths = [];

const mouse = new THREE.Vector2();

let viewMode = 'fixed';

const handleUpdateIntervall = (intervall) => {
  clearInterval(updateIntervall);
  updateIntervall = setInterval(async () => {
    await handleUpdateRotation();
  }, intervall * 1000);
};
const handleUpdateRotation = async (isFirst) => {
  try {
    const data = await fetcher('/objects/rotation');

    const objectsMap = {};
    objects.forEach((object) => {
      objectsMap[object.name] = object;
    });

    data?.forEach(({ id, rotateAxis, rotateDeg }) => {
      const object = objectsMap[id];
      if (object) {
        rotateObject(object, { [rotateAxis]: rotateDeg });
      }
    });
  } catch (error) {
    console.log('Error: ', error);
  }
};

const handleAddObject = (settings, currentGeometry) => {
  const { type, material, pos, rot, scalar, id } = settings;
  const geometry = currentGeometry || geometries[type];
  const objectMaterial = currentGeometry
    ? new THREE.MeshPhongMaterial(material)
    : new THREE.MeshStandardMaterial(material);
  const object = new THREE.Mesh(geometry, objectMaterial);
  object.position.x = pos.x;
  object.position.y = pos.y;
  object.position.z = pos.z;

  object.rotation.x = rot.x;
  object.rotation.y = rot.y;
  object.rotation.z = rot.z;

  object.scale.setScalar(scalar);
  object.castShadow = true;
  object.receiveShadow = true;

  object.name = id;

  group.add(object);
  objects.push(object);
  console.log('Object added: ', object);
};

const loadStlUrl = (url) =>
  new Promise((resolve, reject) => {
    loader.load(url, (geometry) => resolve(geometry));
  });

const handleloadObjects = () => {
  fetcher('/objects').then(async (data) => {
    for (const item of data) {
      const { id, settings } = item;
      let geometry = null;
      if (settings.type === 'stl') {
        geometry = await loadStlUrl(`${API_URL}${item.path}`);
      }

      handleAddObject({ id, ...settings }, geometry);
    }

    await handleUpdateRotation(true);
    updateIntervall = setInterval(async () => {
      await handleUpdateRotation();
    }, params.intervall * 1000);
  });
};

const rotateObject = (object, target) => {
  gsap.to(object.rotation, {
    ...target,
    duration: 1,
    ease: 'none',
  });
};

let updateIntervall;
const params = { intervall: 2 };
const gui: GUI = new GUI();
const settingsFolder = gui.addFolder('Settings');
settingsFolder.add(params, 'intervall', 1, 20, 1).onChange(handleUpdateIntervall);
settingsFolder.open();

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

  handleloadObjects();

  // Vector position and drap objects
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('dragend', async (event) => {
      droppedPos.set(
        (event.clientX / window.innerWidth) * 2 - 1,
        -(event.clientY / window.innerHeight) * 2 + 1,
        0.9
      );
      droppedPos.unproject(camera);

      const type = item.getAttribute('data-type');
      const settings = {
        type,
        material: {
          color: Math.random() * 0xffffff,
          roughness: 0.7,
          metalness: 0.0,
        },
        pos: { x: droppedPos.x, y: droppedPos.y, z: droppedPos.z },
        rot: {
          x: Math.random() * 2 * Math.PI,
          y: Math.random() * 2 * Math.PI,
          z: Math.random() * 2 * Math.PI,
        },
        scalar: Math.random() + 0.5,
      };

      const data = await post('/object', settings);

      settings.id = data?.id;

      droppedGeometry = geometries[type];

      handleAddObject(settings);
    });
  });

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
  const xPoints = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(10000, 0, 0)];
  const xMat = new THREE.LineBasicMaterial({ color: 'red', linewidth: 3 });
  const xGeometry = new THREE.BufferGeometry().setFromPoints(xPoints);
  const xLine = new THREE.Line(xGeometry, xMat);
  scene.add(xLine);

  const yPoints = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 10000, 0)];
  const yMat = new THREE.LineBasicMaterial({ color: 'green', linewidth: 3 });
  const yGeometry = new THREE.BufferGeometry().setFromPoints(yPoints);
  const yLine = new THREE.Line(yGeometry, yMat);
  scene.add(yLine);

  const zPoints = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 10000)];
  const zMat = new THREE.LineBasicMaterial({ color: 'blue', linewidth: 3 });
  const zGeometry = new THREE.BufferGeometry().setFromPoints(zPoints);
  const zLine = new THREE.Line(zGeometry, zMat);
  scene.add(zLine);

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

  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1),
  ]);

  const line = new THREE.Line(geometry);
  line.name = 'line';
  line.scale.z = 5;

  controller1.add(line.clone());
  controller2.add(line.clone());

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

  // Load STL file:
  const fileInput = document.querySelector('#file');
  fileInput?.addEventListener('change', (event) => {
    const file = event.target.files[0];
    loader.load(URL.createObjectURL(file), async (geometry) => {
      const settings = {
        type: 'stl',
        material: {
          color: Math.random() * 0xffffff,
          specular: 0x111111,
          shininess: 200,
        },
        pos: { x: Math.random() * 4 - 2, y: Math.random() * 4, z: Math.random() * 4 - 2 },
        rot: {
          x: Math.random() * 2 * Math.PI,
          y: Math.random() * 2 * Math.PI,
          z: Math.random() * 2 * Math.PI,
        },
        scalar: 0.1,
      };

      const data = await post('/object', settings);
      const id = data?.id;
      settings.id = id;

      await post('/object/model', { id, file }, true);

      handleAddObject(settings, geometry);
    });
  });

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

  // Reset all
  document.querySelector('#reset button')?.addEventListener('click', async () => {
    objects.forEach((object) => {
      group.remove(object);
    });
    objects.length = 0;
    objectSnapshots.length = 0;
    
    await post('/objects/reset');
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

function handleMovingObjects() {
  movingObjects.forEach((movingObj) => {
    const objIndex = movingObj.objIndex;
    const obj = objects[objIndex];
    const pathIndex = movingObj.pathIndex;
    const path = paths[pathIndex];
    if (obj && path) {
      if (pathIndex > 0) {
        const num = path.getPoints(50).length;
        const time = Date.now() + objIndex * 1000;
        const t = ((time / (201 - movingObj.speed)) % num) / num;
        const pos = path.getPointAt(t);
        obj.position.copy(pos);

        const tangent = path.getTangentAt(t).normalize();
        obj.lookAt(pos.clone().add(tangent));
      } else {
        let t = (clock.getElapsedTime() * (parseFloat(movingObj.speed) / 200)) % 1;
        const pointAt = t + objIndex * 0.05 > 1 ? 1 : t + objIndex * 0.05;
        eCurve.getPointAt(pointAt, eVector);
        obj.position.copy(eVector);

        // Update obj's rotation to match the tangent of the curve
        const eTangent = eCurve.getTangentAt(t).normalize();
        const eTangent3d = new THREE.Vector3(eTangent.x, eTangent.y, 0);
        obj.lookAt(eVector.clone().add(new THREE.Vector3().copy(eTangent3d)));
      }
    }
  });

  // paths.forEach((path, i) => {
  //   const obj = objects[i];
  //   if (obj) {
  //     const num = pointsArr[i].length + 1;
  //     const time = Date.now();
  //     const t = ((time / (i * 500 + 2000)) % num) / num;
  //     const pos = path.getPointAt(t);
  //     obj.position.copy(pos);

  //     const tangent = path.getTangentAt(t).normalize();
  //     obj.lookAt(pos.clone().add(tangent));
  //   }
  // });

  /*   let t = (clock.getElapsedTime() * 0.1) % 1;
  const obj3 = objects[2];
  eCurve.getPointAt(t, eVector);
  obj3.position.copy(eVector);

  // Update obj3's rotation to match the tangent of the curve
  const eTangent = eCurve.getTangentAt(t).normalize();
  const eTangent3d = new THREE.Vector3(eTangent.x, eTangent.y, 0);
  obj3.lookAt(eVector.clone().add(new THREE.Vector3().copy(eTangent3d))); */
}

function moveToObject(object) {
  const cameraOffset = new THREE.Vector3(1, 1, 1);
  const objectPosition = new THREE.Vector3();
  object.getWorldPosition(objectPosition);
  camera.position.copy(objectPosition).add(cameraOffset);
}

function updateObjectListInfo() {
  // Get snapshot:
  let html = '';
  const container = document.querySelector('#object-list .object-item-container');

  const handleSelectFollow = (id) => {
    console.log('Follow id: ', id);
    const object = objects[id];

    container?.querySelectorAll('.object-item').forEach((item) => {
      item.classList.remove('active');
    });
    if (selectedFollowIndex === id) {
      selectedFollowIndex = null;
    } else {
      container.querySelector(`.object-item[data-id="${id}"]`).classList.add('active');
      selectedFollowIndex = id;
      fitCameraToObject(object, camera, controls);
    }
  };

  for (let i = 0; i < objects.length; i++) {
    let snapshot = objectSnapshots?.[i];
    const object = objects[i];
    if (!snapshot) {
      const snapshot = getObjSnap(objects[i]);
      objectSnapshots.push(snapshot);

      const item = document.createElement('div');
      item.classList.add('object-item');
      item.dataset.id = i;
      item.innerHTML = `
        <img src="${snapshot}" alt="object snapshot" />
        <div class="object-info">
        </div>
      `;

      item.addEventListener('click', () => handleSelectFollow(i));

      container.appendChild(item);
    }

    const objInfo = container.querySelector(`.object-item[data-id="${i}"] .object-info`);
    objInfo &&
      (objInfo.innerHTML = `(${object.position.x.toFixed(2)}, ${object.position.y.toFixed(
        2
      )}, ${object.position.z.toFixed(2)})`);
  }
}

function animate() {
  cleanIntersected();

  intersectObjects(controller1);
  intersectObjects(controller2);

  renderer.render(scene, camera);
}
