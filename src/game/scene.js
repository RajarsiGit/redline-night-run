import * as THREE from 'three';
import { CONFIG } from './simulation.js';

const TAU = Math.PI * 2;
const trafficColors = ['#c7d9e8', '#9672dd', '#e9c460', '#46bfab', '#e486b5'];

export class RaceScene {
  constructor(container, onContextLost) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#1b112b');
    this.scene.fog = new THREE.Fog('#321a40', 100, 470);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.domElement.setAttribute('aria-label', '3D highway. Use W or Up to accelerate, A and D or arrows to steer, S or Down to brake, and Space to boost.');
    this.renderer.domElement.setAttribute('role', 'img');
    this.contextLost = event => { event.preventDefault(); onContextLost(); };
    this.renderer.domElement.addEventListener('webglcontextlost', this.contextLost);
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 1600);
    this.camera.position.set(-7, 4.3, 9.5);
    this.lookTarget = new THREE.Vector3(0, 1.4, -15);
    this.scene.add(new THREE.HemisphereLight('#b8b3ff', '#302337', 2.7));
    const sunlight = new THREE.DirectionalLight('#ffbbdd', 2.8);
    sunlight.position.set(-15, 45, -60);
    this.scene.add(sunlight);
    const rimlight = new THREE.DirectionalLight('#91bbff', 1.9);
    rimlight.position.set(15, 15, 30);
    this.scene.add(rimlight);
    this.assets = new Set();
    this.materials = new Map();
    this.unitBox = this.track(new THREE.BoxGeometry(1, 1, 1));
    this.worldOffset = 0;
    this.makeEnvironment();
    this.player = this.makeCar('#f2443d', true);
    this.scene.add(this.player);
    this.cars = Array.from({ length: 16 }, (_, i) => {
      const car = this.makeCar(trafficColors[i % trafficColors.length]);
      this.scene.add(car);
      return car;
    });
    this.makeFinishGate();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
  }

  track(resource) { this.assets.add(resource); return resource; }

  material(color, unlit = false, options = {}) {
    const key = JSON.stringify([color, unlit, options]);
    if (!this.materials.has(key)) {
      const Constructor = unlit ? THREE.MeshBasicMaterial : THREE.MeshStandardMaterial;
      this.materials.set(key, this.track(new Constructor({ color, ...(unlit ? {} : { roughness: 0.5, metalness: 0.22 }), ...options })));
    }
    return this.materials.get(key);
  }

  box(parent, color, x, y, z, w, h, d, unlit = false) {
    const mesh = new THREE.Mesh(this.unitBox, this.material(color, unlit));
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    parent.add(mesh);
    return mesh;
  }

  instances(color, count, callback, geometry = this.unitBox, unlit = false) {
    const mesh = new THREE.InstancedMesh(geometry, this.material(color, unlit), count);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      dummy.position.set(0, 0, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      callback(dummy, i);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.scene.add(mesh);
    return mesh;
  }

  makeEnvironment() {
    const sky = new THREE.Mesh(this.track(new THREE.SphereGeometry(1000, 24, 12)), this.track(new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      vertexShader: 'varying vec3 vPosition; void main(){vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'varying vec3 vPosition; void main(){float h=clamp(normalize(vPosition).y*3.5,0.,1.);vec3 low=vec3(.28,.10,.24);vec3 high=vec3(.025,.024,.07);gl_FragColor=vec4(mix(low,high,pow(h,.7)),1.);}',
    })));
    this.scene.add(sky);

    const sun = new THREE.Mesh(this.track(new THREE.CircleGeometry(45, 64)), this.track(new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'varying vec2 vUv;void main(){if(vUv.y<.47 && mod(vUv.y,.075)<.022)discard;gl_FragColor=vec4(mix(vec3(1.,.13,.44),vec3(1.,.66,.36),vUv.y),1.);}',
    })));
    sun.position.set(0, 64, -570);
    this.scene.add(sun);

    const mountainGeo = this.track(new THREE.ConeGeometry(1, 1, 5));
    this.instances('#20182f', 20, (dummy, i) => {
      const h = 35 + Math.sin(i * 4.9) * 18;
      dummy.position.set((i - 9.5) * 44, h / 2 - 5, -490 + Math.cos(i * 3) * 25);
      dummy.scale.set(52 + i % 3 * 14, h, 32);
      dummy.rotation.y = i;
    }, mountainGeo, true);

    this.box(this.scene, '#201d31', 0, -0.22, -550, 2200, 0.3, 1600);
    this.box(this.scene, '#282634', 0, -0.04, -480, 18, 0.08, 1100);
    for (const side of [-1, 1]) {
      this.box(this.scene, '#3a293c', side * 9.7, 0, -480, 1.4, 0.06, 1100);
      this.box(this.scene, '#faa2ed', side * 9.02, 0.02, -480, 0.11, 0.03, 1100, true);
      this.box(this.scene, '#ce53c7', side * 11.1, 0.67, -480, 0.11, 0.09, 1100, true);
      this.box(this.scene, '#673c81', side * 11.1, 0.32, -480, 0.12, 0.13, 1100);
    }
    this.markings = this.instances('#aa91b4', 195, (d, i) => {
      d.position.set(((i % 3) - 1) * 4.5, 0.015, -Math.floor(i / 3) * 16 + 20);
      d.scale.set(0.12, 0.025, 7);
    }, this.unitBox, true);
    this.curb = this.instances('#8b426c', 210, (d, i) => {
      d.position.set(i % 2 ? -9.65 : 9.65, 0.035, -Math.floor(i / 2) * 10 + 20);
      d.scale.set(1.2, 0.035, 4);
    });
    this.posts = this.instances('#7a578f', 210, (d, i) => {
      d.position.set(i % 2 ? -11.1 : 11.1, 0.3, -Math.floor(i / 2) * 10 + 20);
      d.scale.set(0.14, 0.85, 0.14);
    });

    // Repeating silhouettes and lit windows are instanced to keep draw calls low.
    this.buildings = this.instances('#19192c', 90, (d, i) => {
      const side = i % 2 ? -1 : 1;
      const height = 9 + (Math.sin(i * 127.1) + 1) * 17;
      d.position.set(side * (42 + i % 4 * 15), height / 2, 30 - Math.floor(i / 2) * 23);
      d.scale.set(9 + i % 3 * 3, height, 11);
    });
    this.windows = this.instances('#987696', 90 * 16, (d, i) => {
      const b = Math.floor(i / 16), n = i % 16, side = b % 2 ? -1 : 1;
      const height = 9 + (Math.sin(b * 127.1) + 1) * 17;
      const width = 9 + b % 3 * 3;
      d.position.set(side * (42 + b % 4 * 15 - width / 2 - .04), 2 + Math.floor(n / 4) * (height - 4) / 4, 30 - Math.floor(b / 2) * 23 - 4 + n % 4 * 2.5);
      d.scale.set(0.1, 0.65, 1.1);
    }, this.unitBox, true);

    this.palms = new THREE.Group();
    const trunkGeo = this.track(new THREE.CylinderGeometry(0.19, 0.35, 7, 5));
    const frondGeo = this.track(new THREE.ConeGeometry(0.7, 5, 3));
    for (let i = 0; i < 40; i++) {
      const side = i % 2 ? -1 : 1;
      const palm = new THREE.Group();
      palm.position.set(side * (17 + i % 3 * 1.8), 0, 30 - Math.floor(i / 2) * 43);
      const trunk = new THREE.Mesh(trunkGeo, this.material('#171a24'));
      trunk.position.y = 3.5;
      trunk.rotation.z = side * 0.07;
      palm.add(trunk);
      for (let j = 0; j < 6; j++) {
        const frond = new THREE.Mesh(frondGeo, this.material('#171929'));
        const angle = j / 6 * TAU + i;
        frond.position.set(Math.sin(angle) * 1.65 - side * 0.24, 6.8, Math.cos(angle) * 1.65);
        frond.rotation.set(Math.cos(angle) * 1.8, 0, -Math.sin(angle) * 1.8);
        palm.add(frond);
      }
      this.palms.add(palm);
    }
    this.scene.add(this.palms);

    const starPositions = [];
    let seed = 2943;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 240; i++) starPositions.push((random() - .5) * 1100, 110 + random() * 350, -500 - random() * 250);
    const starsGeo = this.track(new THREE.BufferGeometry());
    starsGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    this.scene.add(new THREE.Points(starsGeo, this.track(new THREE.PointsMaterial({ color: '#cec2e0', size: 0.7, transparent: true, opacity: 0.65, fog: false }))));

    const lineGeo = this.track(new THREE.BufferGeometry());
    this.streakPositions = new Float32Array(28 * 6);
    lineGeo.setAttribute('position', new THREE.BufferAttribute(this.streakPositions, 3));
    this.streaks = new THREE.LineSegments(lineGeo, this.track(new THREE.LineBasicMaterial({ color: '#bffcff', transparent: true, opacity: 0.4 })));
    this.scene.add(this.streaks);
  }

  makeCar(color, player = false) {
    const group = new THREE.Group();
    const shadow = new THREE.Mesh(this.track(new THREE.PlaneGeometry(2.7, 5.5)), this.material('#080810', true, { transparent: true, opacity: .5, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.025;
    group.add(shadow);
    this.box(group, '#11121a', 0, .38, 0, 1.85, .38, 4.0);
    this.box(group, color, 0, .68, 0, 1.93, .5, 4.05);
    this.box(group, color, 0, .9, -1.22, 1.82, .09, 1.58);
    this.box(group, '#151b2c', 0, 1.04, .1, 1.57, .6, 1.8);
    this.box(group, color, 0, 1.37, .14, 1.5, .1, 1.0);
    this.box(group, color, 0, 1.08, .99, 1.58, .5, .08);
    for (const side of [-1, 1]) {
      this.box(group, color, side * .79, 1.07, .15, .065, .61, 1.7);
      this.box(group, '#ff574e', side * .56, .7, 2.04, .61, .14, .045, true);
      this.box(group, '#ffffd5', side * .62, .7, -2.04, .54, .17, .05, true);
      this.box(group, '#20202a', side * .48, .36, 2.11, .2, .13, .16);
      if (player) {
        this.box(group, '#231824', side * .46, 1.04, 1.58, .065, .32, .15);
        this.box(group, '#ddffc5', side * .31, .947, -1.22, .15, .02, 1.51);
      }
    }
    if (player) this.box(group, '#21182b', 0, 1.2, 1.57, 2.17, .11, .35);
    const wheelGeo = this.track(new THREE.CylinderGeometry(.38, .38, .22, 12));
    const hubGeo = this.track(new THREE.CylinderGeometry(.22, .22, .235, 8));
    const wheels = [];
    for (const x of [-.95, .95]) for (const z of [-1.27, 1.26]) {
      const wheel = new THREE.Group();
      wheel.position.set(x, .39, z);
      const tire = new THREE.Mesh(wheelGeo, this.material('#111118'));
      const hub = new THREE.Mesh(hubGeo, this.material('#7d8494'));
      tire.rotation.z = hub.rotation.z = Math.PI / 2;
      wheel.add(tire, hub);
      wheels.push(wheel);
      group.add(wheel);
    }
    group.userData.wheels = wheels;
    if (player) {
      group.userData.flames = [];
      const flameGeo = this.track(new THREE.ConeGeometry(.17, 1.45, 8));
      for (const x of [-.48, .48]) {
        const flame = new THREE.Mesh(flameGeo, this.material('#84ffff', true));
        flame.rotation.x = Math.PI / 2;
        flame.position.set(x, .36, 2.77);
        group.add(flame);
        group.userData.flames.push(flame);
      }
      const glow = new THREE.PointLight('#d960fc', 12, 9);
      glow.position.set(0, .6, 0);
      group.add(glow);
    }
    return group;
  }

  makeFinishGate() {
    this.finish = new THREE.Group();
    this.box(this.finish, '#c5cfda', -10.2, 4.2, 0, .3, 8.4, .3);
    this.box(this.finish, '#c5cfda', 10.2, 4.2, 0, .3, 8.4, .3);
    for (let i = 0; i < 24; i++) {
      for (let j = 0; j < 2; j++) this.box(this.finish, (i + j) % 2 ? '#191924' : '#eff7de', -9.58 + i * .834, 7.2 + j * .82, 0, .84, .83, .13, true);
    }
    this.scene.add(this.finish);
  }

  resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  render(sim, dt, time) {
    const ready = sim.phase === 'ready';
    const moving = sim.phase === 'racing';
    if (ready) this.worldOffset += dt * 18;
    // Ease back to the real track distance during the countdown (the car hasn't moved yet)
    // instead of snapping, so the idle preview scroll doesn't jump-cut into the race.
    else if (sim.phase === 'countdown') this.worldOffset += (sim.distance - this.worldOffset) * (1 - Math.exp(-dt * 3));
    else this.worldOffset = sim.distance;
    this.markings.position.z = this.worldOffset % 16;
    this.curb.position.z = this.worldOffset % 10;
    this.posts.position.z = this.worldOffset % 10;
    this.palms.position.z = this.worldOffset % 43;
    this.buildings.position.z = this.windows.position.z = this.worldOffset % 23;

    this.player.position.set(sim.x, moving && sim.speed > 140 ? Math.sin(time * 35) * .016 : 0, 0);
    this.player.rotation.set(0, -sim.steer * .055, -sim.steer * .035);
    this.player.visible = !sim.invulnerable || Math.floor(sim.invulnerable * 10) % 2 === 0;
    for (const wheel of this.player.userData.wheels) wheel.rotation.x = this.worldOffset * 2.5;
    for (const flame of this.player.userData.flames) { flame.visible = sim.boosting; flame.scale.y = 1 + Math.sin(time * 70) * .2; }
    // Preview traffic during the idle/countdown screens drifts forward using the same eased
    // worldOffset as the road decor, and each car only wraps once it is past the camera (z > 35,
    // the same off-screen threshold the real simulation recycles traffic at) so no car is ever
    // seen teleporting — unlike the old shared 35-unit modulo, which snapped every car at once.
    const previewing = ready || sim.phase === 'countdown';
    sim.traffic.forEach((car, i) => {
      let z = car.z;
      if (previewing) {
        const raw = -100 - i * 38 + this.worldOffset;
        z = 35 - (((35 - raw) % 800) + 800) % 800;
      }
      this.cars[i].position.set(car.x, 0, z);
      this.cars[i].visible = true;
    });

    const response = 1 - Math.exp(-dt * 4);
    const shake = sim.crashFlash * Math.sin(time * 70) * .23;
    const targetX = ready ? -7 : sim.x * .35 + shake;
    this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, targetX, response);
    this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, ready ? 4.3 : 5.5, response);
    this.camera.position.z = THREE.MathUtils.lerp(this.camera.position.z, ready ? 9.5 : 12.5, response);
    // Ease the look-at target the same way as the position above — otherwise the camera's aim
    // snaps instantly on every phase change even though its position glides, which whip-rotates
    // the whole framed scene (buildings, sky, road) in a single frame.
    this.lookTarget.x = THREE.MathUtils.lerp(this.lookTarget.x, ready ? 0 : sim.x * .42, response);
    this.lookTarget.z = THREE.MathUtils.lerp(this.lookTarget.z, ready ? -15 : -24, response);
    this.camera.lookAt(this.lookTarget);
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, sim.boosting ? 68 : 58, response);
    this.camera.updateProjectionMatrix();
    this.finish.position.z = -(CONFIG.distance - sim.distance);
    this.finish.visible = !ready && CONFIG.distance - sim.distance < 450;
    this.streaks.visible = sim.boosting;
    if (sim.boosting) {
      for (let i = 0; i < 28; i++) {
        const x = (i % 2 ? -1 : 1) * (8 + i % 4 * 3);
        const y = 1 + (i % 7) * 1.3;
        const z = (time * 160 + i * 9) % 95 - 80;
        this.streakPositions.set([x, y, z, x, y, z - 10], i * 6);
      }
      this.streaks.geometry.attributes.position.needsUpdate = true;
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.renderer.domElement.removeEventListener('webglcontextlost', this.contextLost);
    this.scene.traverse(object => { if (object.isInstancedMesh) object.dispose(); });
    for (const resource of this.assets) resource.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
