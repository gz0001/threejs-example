// @ts-nocheck
import './style.scss';

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { XRButton } from 'three/addons/webxr/XRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { DragControls } from 'three/addons/controls/DragControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader';
import { Flow } from 'three/examples/jsm/Addons.js';
import CameraControls from 'camera-controls';

CameraControls.install({ THREE: THREE });

export const getObjSnap = (object) => {
  const container = document.createElement('div');
  container.style.width = '100vw';
  container.style.height = '100vh';

  
  const clock = new THREE.Clock();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('skyblue');

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(1, 1, 1);

  const controls = new OrbitControls(camera, container);
  controls.target.set(0, 1.6, 0);
  controls.update();

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

  const group = new THREE.Group();
  const obj = object.clone();
  obj.position.set(0, 0, 0);
  group.add(obj);
  scene.add(group);
  
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  //renderer.setAnimationLoop(animate);
  renderer.shadowMap.enabled = true;
  renderer.xr.enabled = true;
  container.appendChild(renderer.domElement)

  const cameraControls = new CameraControls(camera, renderer.domElement);
  cameraControls.fitToBox(group);
  cameraControls.zoomTo(1)
  
  const delta = clock.getDelta();
  const hasControlsUpdated = cameraControls.update(delta);
  renderer.render(scene, camera);
  const snapshot = renderer.domElement.toDataURL("image/jpeg");

  container.remove();
  renderer.dispose();
  controls.dispose();
  cameraControls.dispose();
  
  return snapshot;
};

