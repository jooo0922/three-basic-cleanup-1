'use strict';

/**
 * Three.js에서 만든 객체들을 폐기하여 메모리 해제하는 방법
 * 
 * Three.js에서 객체를 생성할 때마다 일정량의 메모리가 할당되는데,
 * 런타임에서 더 이상 사용되지 않는 객체를 제때에 폐기해줘야 메모리 누수가 없고 성능 개선도 가능해 짐.
 * 이런 메모리 해제는 Three.js가 알아서 하는 게 아니라, 개발자가 상황에 따라 직접 해줘야 함.
 * 
 * 그럼 Three.js의 모든 객체들을 다 폐기할 수 있을까? 그건 아니고
 * .dispose()라는 메서드를 이용해서 몇몇 객체를 폐기함으로써 거기에 할당된 메모리의 누수를 방지할 수 있음.
 * 
 * 그 종류는 크게
 * 1. Geometry
 * 2. Material
 * 3. Texture
 * 4. RenderTarget 
 * 총 4가지 인데, 얘내들 한테는 dispose 라는 메서드가 존재해서 이거를 호출하면 해당 객체를 폐기하여 메모리를 cleanup 할 수 있음.
 * 또한, 각각의 객체 폐기는 다른 객체의 폐기에 영향을 주지 않음.
 * 예를 들어, Material 객체를 dispose 한다고 해서, 거기에 할당된 Texture를 폐기되는 건 아니라는 뜻.
 * 
 * 이 예제에서는 1, 2, 3번의 객체들을 폐기하는 과정을 구현해보았음
 */

import * as THREE from 'https://threejsfundamentals.org/threejs/resources/threejs/r127/build/three.module.js';

// 생성된 자원(여기서 자원이라 함은, 메모리가 할당되는 Three.js의 객체들을 의미함)들을 Set 객체에 추가하거나, Set 객체 내부에 포함된 자원을 폐기하여 메모리를 해제하는 등 자원을 관리하는 클래스를 만듦.
class ResourceTracker {
  constructor() {
    // 참고로 Set 객체는 ES6에서 추가된 객체로써, '중복되지 않는 value들로만 이루어진 집합 객체'라고 보면 됨. 
    // Array와는 달리 같은 value를 중복 포함할 수 없음. 그래서 Set에 이미 존재하는 값을 추가하려고 하면 아무 일도 발생하지 않음.
    this.resources = new Set();
  }

  // 전달받은 자원에 dispose 메서드가 존재하거나(material, texture, geometry), Object3D의 인스턴스 객체에 해당한다면(큐브 메쉬) resouces 집합객체에 추가해준 뒤, 받은 자원을 다시 리턴해주는 메서드
  track(resource) {
    if (resource.dispose || resource instanceof THREE.Object3D) {
      this.resources.add(resource); // 생성자에서 만든 Set 객체에 전달받은 자원을 추가해 줌.
    }

    return resource; // 받은 자원을 다시 돌려 줌.
  }

  // 전달받은 자원을 resources 집합객체 내에서 제거해주는 메서드
  untrack(resource) {
    this.resources.delete(resource);
  }

  // resources 집합객체 내의 Object3D 요소(큐브 메쉬)를 찾아 해당 요소의 부모노드로부터 제거하고, 모든 자원들(텍스처, 머티리얼, 지오메트리)을 폐기하여 메모리를 해제한 뒤, resources 집합객체 내의 모든 요소를 제거하는 메서드
  dispose() {
    // 참고로 Set 객체는 for...of 로 객체 내의 모든 값에 접근이 가능하다.
    for (const resource of this.resources) {
      if (resource instanceof THREE.Object3D) {
        if (resource.parent) {
          // resource 집합객체 요소들 중에서 부모노드가 존재하는 Object3D 객체가 있다면(= 즉, 이 말은 씬에 추가된 큐브 메쉬를 말하는 거겠지), 부모노드로부터 해당 Object3D 객체를 지워주도록 함.
          resource.parent.remove(resource);
        }
      }

      if (resource.dispose) {
        // resource 집합객체 요소들 중 dispose 메서드가 포함된 요소가 존재한다면 해당 요소를 폐기하여 메모리를 해제함. (큐브 메쉬를 제외한 material, geometry, texture 들이 폐기되겠지)
        resource.dispose();
      }
    }

    // mesh는 씬에서 제거하고, material, geometry, texture는 폐기하여 메모리를 해제한 뒤, resources 집합객체 내의 모든 요소를 제거해버림. 
    this.resources.clear();
  }
}

function main() {
  // create WebGLRenderer
  const canvas = document.querySelector('#canvas');
  const renderer = new THREE.WebGLRenderer({
    canvas
  });

  // create camera
  const fov = 75;
  const aspect = 2;
  const near = 0.1;
  const far = 5;
  const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
  camera.position.z = 2;

  // create scene
  const scene = new THREE.Scene();

  // 생성한 큐브 메쉬를 담아놓을 배열. animate 함수에서 큐브 메쉬를 회전시킬 때 사용.
  const cubes = [];

  // 큐브 메쉬에 필요한 material, geometry, texture, mesh들을 생성할 때마다 this.resources 집합객체에 추가해주고, 큐브메쉬를 만들고 나면 씬과 cubes에 추가해주는 함수
  function addStuffToScene() {
    const resTracker = new ResourceTracker(); // 먼저 ResourceTracker 인스턴스를 생성함.
    /**
     * ResourceTracker.track() 메서드를 좀 더 간단한 형식으로 사용하기 위해 함수 형태로 만드려는 것.
     * 근데 왜 bind 메서드를 호출할까?
     * 
     * 객체의 메서드를 객체 내부가 아닌 다른 곳으로 전달되어 호출되면 메서드 내부의 this에 대한 정보가 사라지는 현상이 발생함.
     * 이거는 canvas를 클래스 단위로 코딩할 때 많이 봤던 경험들임. 이벤트리스너에 객체의 메서드를 콜백함수로 등록한다던지, 함수를 다른 프로퍼티에 할당한다던지 등...
     * 이럴 때마다 항상 해당 메서드에 .bind(this)를 해줘서 메서드 내부에서 this가 해당 메서드를 갖고있는 객체를 가리키도록 했었지!
     * 
     * 여기서도 마찬가지임. 외부의 const값에 할당하려면 객체의 track 메서드 내부에서 this가 객체, 즉 resTracker를 가리키고 있음을 명시해줘야 함.
     * 이거를 bind 메서드를 호출해서 지정해준 것! 
     */
    const track = resTracker.track.bind(resTracker);

    // 박스 지오메트리를 생성한 뒤, track 함수를 호출하여 resTracker.resources에 추가해 줌.
    const boxWidth = 1;
    const boxHeight = 1;
    const boxDepth = 1;
    const geometry = track(new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth)); // track 함수는 전달받은 자원을 고대로 리턴하여 돌려줌.

    const loader = new THREE.TextureLoader(); // 텍스처 로더를 생성함.

    // 텍스처를 로드한 뒤, 또 베이직-머티리얼을 생성한 뒤, 각각 track 함수를 호출하여 resTracker.resources에 추가해 줌.
    const material = track(new THREE.MeshBasicMaterial({
      map: track(loader.load('./image/wall.jpg'))
    }))
    const cube = track(new THREE.Mesh(geometry, material)); // 큐브 메쉬를 생성한 뒤, track 함수를 호출하여 resTracker.resources에 추가해 줌.
    scene.add(cube); // 큐브 메쉬를 씬에 추가함.
    cubes.push(cube); // 회전 애니메이션을 위해 cubes 배열에도 추가함

    return resTracker; // 마지막으로 resTracker 인스턴스를 리턴해 줌.
  }

  // 전달받은 초(sec)만큼의 시간이 지나야 resolve 콜백을 호출하는 프라미스 객체를 리턴해주는 함수. 
  // 그니까 이게 뭐냐면, 전달받은 시간값 만큼이 지나기 전까지는 process 비동기 함수 블록 내에서 다음 줄을 실행하지 못하도록 하려고 만든거임.
  function waitSeconds(seconds = 0) { // 기본값 매개변수라고, 해당 함수를 호출할 때 인자 seconds값을 따로 전달받지 못하면 그냥 지정된 기본값인 0을 할당해서 실행하도록 하는 것.
    // new Promise를 생성하자마자 즉각적으로 호출되는 executor 함수는 전달받은 만큼의 시간이 지나면 resolve 콜백함수를 호출하고, 
    // 최종적으로 그 결과값이 담긴 promise 객체를 리턴해 줌.
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
  }

  // 시간 간격을 두고 큐브 메쉬를 생성하고 자원들을 폐기하는 작업을 무한반복 해주는 함수
  async function process() {
    /**
     * for loop에 아무런 조건문도 없고 ;;만 있는데, 이게 어떻게 된걸까?
     * 
     * 일단 for loop의 구조를 보면
     * for (begin; condition; step) {
     *  // 반복문 본문
     * }
     * 이 구조잖아? 
     * 
     * 근데 지금 begin, condition, step을 모두 생략해서 써준 게
     * for (;;) {
     *  // 반복문 본문
     * } 
     * 이거임. 이렇게 하면 for loop에서 '~할때까지만 반복해라'라는 조건문이 없어지는 것이지. 그럼 어떻게 되겠어? 무한반복 되는거지.
     * 
     * process 함수 안에서는 for loop가 무한반복 되는거임. 한번 호출되면 process 함수는 끝이 안남.
     * 또한 해당 for loop 안에서는 Promise를 몇 초간 처리해줘야 하는 waitSeconds 함수를 반복해서 호출하고 있지 
     * 그래서 process 함수에 async를 붙여서 함수 블록 내의 작업들을 비동기로 처리해 주려는 것임.
     * 이렇게 되면 process 함수가 무한 for loop에 의해 끝이나지 않더라도, process 함수 블록 바깥의 내용과 비동기적으로 같이 실행되기 때문에,
     * 큐브 메쉬를 생성했다가 자원을 폐기했다가를 반복하는 작업을 아래의 리사이징 및 애니메이션 작업과 비동기로 처리해줄 수 있음!
     */
    for (;;) {
      const resTracker = addStuffToScene(); // 큐브 메쉬를 생성하고 resources에 자원들을 추가해놓음
      await waitSeconds(2); // 여기서 보면 알 수 있듯이, 리턴받은 프라미스 객체를 어디 할당해놓거나 써먹지도 않음. 즉, 어떤 중요한 작업을 하려는 게 아니라, 그냥 아래줄 코드로 넘어가기 까지 2초(2000ms)의 시간동안 시간을 끌어주는 역할을 할 뿐임.
      cubes.length = 0; // 큐브 메쉬가 생성되고 2초가 지나면 cubes 배열을 다시 빈 배열로 초기화함. Array.length = 0 으로 지정하면 해당 배열을 빈 배열로 초기화할 수 있음.
      resTracker.dispose(); // 또한 큐브 메쉬를 씬에서 제거하고, 큐브메쉬에 사용된 자원들을 폐기해서 메모리 해제하고, resTracker.resources도 초기화해버림.
      await waitSeconds(1); // 큐브 메쉬 및 관련 자원을 폐기하고 나서 1초의 시간을 지연시킴. 그리고 나서 다음 반복문으로 넘어가서 addStuffToScene()를 다시 호출하여 큐브 메쉬를 생성해줌.
    }
    // 그니까 전반적으로 for loop안에서 1초 지나면 큐브 메쉬 생성, 2초 지나면 큐브 메쉬 폐기, 다시 1초 지나면 큐브 메쉬 생성, ...  이 짓을 무한반복 시켜주고 있는거임.
  }
  process(); // process 함수 호출.

  // resize renderer
  function resizeRendererToDisplaySize(renderer) {
    const canvas = renderer.domElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const needResize = canvas.width !== width || canvas.height !== height;
    if (needResize) {
      renderer.setSize(width, height, false);
    }

    return needResize;
  }

  // animate
  function animate(t) {
    t *= 0.001; // 밀리초 단위 타임스탬프값을 초단위로 변환함.

    // 렌더러가 리사이징되면 변경된 사이즈에 맞춰서 카메라 비율(aspect)도 업데이트 해줌.
    if (resizeRendererToDisplaySize(renderer)) {
      const canvas = renderer.domElement;
      camera.aspect = canvas.clientWidth / canvas.clientHeight;
      camera.updateProjectionMatrix();
    }

    // cubes 안의 큐브 메쉬들을 각각 다른 속도로 회전시켜 줌
    cubes.forEach((cube, index) => {
      const speed = 0.2 + index * 0.1;
      const rotate = t * speed;
      cube.rotation.x = rotate;
      cube.rotation.y = rotate;
    });

    renderer.render(scene, camera);

    requestAnimationFrame(animate); // 내부에서 반복 호출
  }

  requestAnimationFrame(animate);
}

main();