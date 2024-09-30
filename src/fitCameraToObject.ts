// @ts-nocheck

import * as THREE from 'three';

const size = new THREE.Vector3();
const center = new THREE.Vector3();
const box = new THREE.Box3();

export function fitCameraToObject(object, camera, controls, isFirstPersonView) {
  box.makeEmpty();
  box.expandByObject(object);

  box.getSize(size);
  box.getCenter(center);

  const fitOffset = isFirstPersonView ? .5 : 4;
  
  const maxSize = Math.max(size.x, size.y, size.z);
  const fitHeightDistance = maxSize / (2 * Math.atan((Math.PI * camera.fov) / 360));
  const fitWidthDistance = fitHeightDistance / camera.aspect;
  const distance = fitOffset * Math.max(fitHeightDistance, fitWidthDistance);

  const direction = controls.target
    .clone()
    .sub(camera.position)
    .normalize()
    .multiplyScalar(distance);

  controls.maxDistance = distance * 10;
  controls.target.copy(center);

  camera.near = distance / 100;
  camera.far = distance * 100;
  camera.updateProjectionMatrix();

  camera.position.copy(controls.target).sub(direction);

  controls.update();
}

export function cameraFollowObject(object, camera, isFirstPersonView) {
  // Calculate the position behind the object
  const objectWorldPosition = new THREE.Vector3();
  object.getWorldPosition(objectWorldPosition);
  const objectWorldDirection = new THREE.Vector3();
  object.getWorldDirection(objectWorldDirection);
  const offset = isFirstPersonView ? -0.5 : -3;

  // Update the camera position
  const cameraPosition = objectWorldPosition
    .clone()
    .add(objectWorldDirection.clone().multiplyScalar(offset));
  camera.position.copy(cameraPosition);

  // Keep the camera's rotation fixed
  camera.rotation.copy(object.rotation);

  camera.lookAt(objectWorldPosition);
}
