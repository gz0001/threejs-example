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

let container;
let camera: THREE.PerspectiveCamera, scene, renderer;
let controller1, controller2;
let dragControllers;
let controllerGrip1, controllerGrip2;

let raycaster;

const intersected = [];

let controls, group;

let enableSelection = false;

const objects = [],
  objectSnapshots = [],
  movingObjects = [];
let selectedFollowIndex = null;

let pathSelected = 0;
let droppedPos = new THREE.Vector3();
let droppedGeometry;

const pointsArr = [
  [
    new THREE.Vector3(-10, 0, 10),
    new THREE.Vector3(-5, 5, 5),
    new THREE.Vector3(5, 5, 5),
    new THREE.Vector3(5, -5, 5),
    new THREE.Vector3(10, 0, 10),
    new THREE.Vector3(-10, 0, 10),
  ],
  [new THREE.Vector3(-10, 0, -20), new THREE.Vector3(50, 10, 10)],

  [
    new THREE.Vector3(50, 30, 60),
    new THREE.Vector3(20, 10, 55),
    new THREE.Vector3(10, 20, 5),
    new THREE.Vector3(20, 10, 35),
    new THREE.Vector3(50, 30, 60),
  ],
  [
    new THREE.Vector3(-40, 20, -20),
    new THREE.Vector3(-20, 10, 25),
    new THREE.Vector3(-10, 20, 5),
    new THREE.Vector3(-40, 20, -20),
  ],
];
const clock = new THREE.Clock();
const eCurve = new THREE.EllipseCurve(0, 0, 10, 5);
let eLine;
const eVector = new THREE.Vector3();

const paths = [];

const mouse = new THREE.Vector2();

let viewMode = 'fixed';

init();

function init() {
  MicroModal.init();
  container = document.createElement('div');
  document.body.appendChild(container);

  scene = new THREE.Scene();
  scene.background = new THREE.Color('skyblue');

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

  const geometries = [
    new THREE.BoxGeometry(0.2, 0.2, 0.2),
    new THREE.ConeGeometry(0.2, 0.2, 64),
    new THREE.CylinderGeometry(0.2, 0.2, 0.2, 64),
    new THREE.IcosahedronGeometry(0.2, 8),
    new THREE.TorusGeometry(0.2, 0.04, 64, 32),
  ];

  // ellipse path
  eLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(eCurve.getSpacedPoints(100)),
    new THREE.LineBasicMaterial({
      color: 'black',
    })
  );
  scene.add(eLine);
  paths.push(eCurve);
  // Moving paths

  pointsArr.map((points) => {
    const path = new THREE.CatmullRomCurve3(points);
    const pathGeometry = new THREE.BufferGeometry().setFromPoints(path.getPoints(50));
    const pathMaterial = new THREE.LineBasicMaterial({ color: 0x00000 });
    const pathObject = new THREE.Line(pathGeometry, pathMaterial);
    scene.add(pathObject);
    paths.push(path);
  });

  // Vector position and drap objects
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('dragend', (event) => {
      droppedPos.set(
        (event.clientX / window.innerWidth) * 2 - 1,
        -(event.clientY / window.innerHeight) * 2 + 1,
        0.9
      );
      droppedPos.unproject(camera);

      const type = item.getAttribute('data-type');
      droppedGeometry = geometries[type];

      MicroModal.show('modal-1');
    });
  });

  // Handle add object to path
  document.querySelectorAll('.js-add-obj').forEach((ele) => {
    ele.addEventListener('click', () => {
      const material = new THREE.MeshStandardMaterial({
        color: Math.random() * 0xffffff,
        roughness: 0.7,
        metalness: 0.0,
      });

      // Add object
      const object = new THREE.Mesh(droppedGeometry, material);
      object.position.x = droppedPos.x;
      object.position.y = droppedPos.y;
      object.position.z = droppedPos.z;

      object.rotation.x = Math.random() * 2 * Math.PI;
      object.rotation.y = Math.random() * 2 * Math.PI;
      object.rotation.z = Math.random() * 2 * Math.PI;

      object.scale.setScalar(Math.random() + 0.5);

      object.castShadow = true;
      object.receiveShadow = true;

      group.add(object);

      objects.push(object);

      if (ele.classList.contains('js-add-path')) {
        movingObjects.push({
          objIndex: objects.length - 1,
          pathIndex: pathSelected,
          speed: document.querySelector('.js-speed').value || 10,
        });
      }
      MicroModal.close('modal-1');
    });
  });

  updateObjectListInfo();
  //

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
  const loader = new STLLoader();
  const fileInput = document.querySelector('#file');
  fileInput?.addEventListener('change', (event) => {
    loader.load(URL.createObjectURL(event.target.files[0]), (geometry) => {
      const material = new THREE.MeshPhongMaterial({
        color: Math.random() * 0xffffff,
        specular: 0x111111,
        shininess: 200,
      });
      
      droppedGeometry = geometry;
      // const object = new THREE.Mesh(geometry, material);
      // object.position.x = Math.random() * 4 - 2;
      // object.position.y = Math.random() * 2;
      // object.position.z = Math.random() * 4 - 2;

      // object.scale.setScalar(Math.random() + 0.5);

      // object.castShadow = true;
      // object.receiveShadow = true;

      // geometry.center();
      // group.add(object);
      // objects.push(object);
      
      MicroModal.show('modal-1');
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

  // Handle view mode change:
  const selectModeEle = document.querySelector('#object-view-mode-select');
  selectModeEle?.addEventListener('change', (event) => {
    viewMode = event.target.value;
  });

  // Handle path select
  const selectPathList = document.querySelector('.js-path-list');

  if (selectPathList) {
    const pathItems = selectPathList.querySelectorAll('.path-item');
    pathItems.forEach((item, index) => {
      item.addEventListener('click', () => {
        if (pathSelected !== index) {
          pathSelected = index;
          pathItems.forEach((item) => {
            item.classList.remove('selected');
          });
          item.classList.add('selected');
        }
      });
    });
  }
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
        let t =
          ((clock.getElapsedTime()) * (parseFloat(movingObj.speed) / 200)) % 1;
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

  handleMovingObjects();
  updateObjectListInfo();

  if (selectedFollowIndex !== null) {
    const object = objects[selectedFollowIndex];
    const isFirstPersonView = viewMode?.includes('first');
    object.visible = !isFirstPersonView;

    if (viewMode?.includes('fixed')) {
      cameraFollowObject(object, camera, isFirstPersonView);
    } else {
      fitCameraToObject(object, camera, controls, isFirstPersonView);
    }
  }

  for (let i = 0; i < objects.length; i++) {
    if (selectedFollowIndex !== i) {
      objects[i].visible = true;
    }
  }

  renderer.render(scene, camera);
}
