import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

class CoreVisualizer {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.volumeGroup = null;
    this.sliceMeshes = [];
    this.wireframeMesh = null;
    this.volumeMetadata = null;
    this.sliceData = [];
    this.textures = [];
    this.cutPlanePosition = 1.0;
    this.currentOpacity = 0.8;
    this.showWireframe = true;
    this.autoRotate = false;
    this.crossSectionCanvas = null;
    this.crossSectionCtx = null;
    
    this.init();
    this.loadData();
    this.setupControls();
    this.animate();
  }

  init() {
    const container = document.getElementById('canvas-container');
    const width = container.clientWidth;
    const height = container.clientHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0f0f1e);

    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    this.camera.position.set(5, 5, 8);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 30;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    this.scene.add(directionalLight);

    const pointLight = new THREE.PointLight(0xe94560, 0.5, 20);
    pointLight.position.set(-5, 5, -5);
    this.scene.add(pointLight);

    this.volumeGroup = new THREE.Group();
    this.scene.add(this.volumeGroup);

    const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
    this.scene.add(gridHelper);

    this.crossSectionCanvas = document.getElementById('cross-section-canvas');
    this.crossSectionCtx = this.crossSectionCanvas.getContext('2d');

    window.addEventListener('resize', () => this.onWindowResize());
  }

  async loadData() {
    try {
      const metadataResponse = await fetch('/api/volume/metadata');
      this.volumeMetadata = await metadataResponse.json();
      
      const slicesResponse = await fetch('/api/slices');
      const slicesMetadata = await slicesResponse.json();
      
      this.updateVolumeInfo();
      
      for (let i = 0; i < this.volumeMetadata.sliceCount; i++) {
        const imgResponse = await fetch(`/api/slices/${i}/image`);
        const imgData = await imgResponse.json();
        this.sliceData.push(imgData);
      }
      
      this.createVolumeRendering();
      this.updateCrossSection(this.volumeMetadata.sliceCount - 1);
      
    } catch (error) {
      console.error('Error loading data:', error);
      document.getElementById('volume-info').textContent = '数据加载失败，请确保后端服务已启动';
    }
  }

  updateVolumeInfo() {
    if (!this.volumeMetadata) return;
    
    const info = document.getElementById('volume-info');
    info.innerHTML = `
      <div>切片数量: <strong>${this.volumeMetadata.sliceCount}</strong></div>
      <div>图像尺寸: <strong>${this.volumeMetadata.width} x ${this.volumeMetadata.height}</strong></div>
      <div>深度范围: <strong>${this.volumeMetadata.minDepth.toFixed(2)} - ${this.volumeMetadata.maxDepth.toFixed(2)} mm</strong></div>
      <div>切片厚度: <strong>${this.volumeMetadata.sliceThickness.toFixed(2)} mm</strong></div>
      <div>密度范围: <strong>${this.volumeMetadata.minDensity.toFixed(1)} - ${this.volumeMetadata.maxDensity.toFixed(1)}</strong></div>
    `;
    
    const cutSlider = document.getElementById('cut-plane');
    cutSlider.max = this.volumeMetadata.sliceCount - 1;
    cutSlider.value = this.volumeMetadata.sliceCount - 1;
    document.getElementById('cut-value').textContent = this.volumeMetadata.sliceCount - 1;
  }

  createVolumeRendering() {
    if (this.sliceData.length === 0) return;
    
    const firstSlice = this.sliceData[0];
    const sliceCount = this.sliceData.length;
    const aspectRatio = firstSlice.width / firstSlice.height;
    const baseSize = 3;
    const sliceHeight = (baseSize / sliceCount) * 1.5;
    
    for (let i = 0; i < sliceCount; i++) {
      const sliceData = this.sliceData[i];
      
      const texture = this.createTextureFromImageData(sliceData);
      this.textures.push(texture);
      
      const geometry = new THREE.PlaneGeometry(baseSize * aspectRatio, baseSize);
      
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: this.currentOpacity,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = (i - sliceCount / 2) * sliceHeight;
      mesh.userData.sliceIndex = i;
      
      this.volumeGroup.add(mesh);
      this.sliceMeshes.push(mesh);
    }
    
    const cylinderHeight = sliceCount * sliceHeight;
    const cylinderRadius = baseSize * aspectRatio / 2;
    const wireframeGeometry = new THREE.CylinderGeometry(
      cylinderRadius, cylinderRadius, cylinderHeight, 32, 1, true
    );
    const wireframeMaterial = new THREE.MeshBasicMaterial({
      color: 0xe94560,
      wireframe: true,
      transparent: true,
      opacity: 0.3
    });
    this.wireframeMesh = new THREE.Mesh(wireframeGeometry, wireframeMaterial);
    this.volumeGroup.add(this.wireframeMesh);
    
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  createTextureFromImageData(imgData) {
    const { width, height, data } = imgData;
    
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    const imageData = ctx.createImageData(width, height);
    for (let i = 0; i < data.length; i++) {
      imageData.data[i] = data[i];
    }
    ctx.putImageData(imageData, 0, 0);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    
    return texture;
  }

  updateCutPlane(value) {
    this.cutPlanePosition = value;
    
    const maxIndex = this.volumeMetadata ? this.volumeMetadata.sliceCount - 1 : 100;
    const normalizedCut = value / maxIndex;
    
    this.sliceMeshes.forEach((mesh, index) => {
      const meshNormalized = index / (this.sliceMeshes.length - 1);
      mesh.visible = meshNormalized <= normalizedCut;
    });
    
    const crossSectionIndex = Math.min(value, this.sliceMeshes.length - 1);
    this.updateCrossSection(crossSectionIndex);
  }

  updateCrossSection(index) {
    if (index < 0 || index >= this.sliceData.length) return;
    
    const sliceData = this.sliceData[index];
    const { width, height, data } = sliceData;
    
    this.crossSectionCanvas.width = width;
    this.crossSectionCanvas.height = height;
    
    const imageData = this.crossSectionCtx.createImageData(width, height);
    for (let i = 0; i < data.length; i++) {
      imageData.data[i] = data[i];
    }
    this.crossSectionCtx.putImageData(imageData, 0, 0);
    
    const depth = this.volumeMetadata 
      ? (index * this.volumeMetadata.sliceThickness + this.volumeMetadata.minDepth).toFixed(2)
      : index;
    document.getElementById('cross-section-info').textContent = `深度: ${depth} mm (切片 ${index})`;
  }

  updateOpacity(value) {
    this.currentOpacity = value / 100;
    document.getElementById('opacity-value').textContent = this.currentOpacity.toFixed(2);
    
    this.sliceMeshes.forEach(mesh => {
      mesh.material.opacity = this.currentOpacity;
    });
  }

  toggleWireframe(show) {
    this.showWireframe = show;
    if (this.wireframeMesh) {
      this.wireframeMesh.visible = show;
    }
  }

  toggleAutoRotate(enable) {
    this.autoRotate = enable;
    this.controls.autoRotate = enable;
    this.controls.autoRotateSpeed = 1.0;
  }

  setupControls() {
    const cutSlider = document.getElementById('cut-plane');
    cutSlider.addEventListener('input', (e) => {
      const value = parseInt(e.target.value, 10);
      document.getElementById('cut-value').textContent = value;
      this.updateCutPlane(value);
    });
    
    const opacitySlider = document.getElementById('opacity');
    opacitySlider.addEventListener('input', (e) => {
      this.updateOpacity(parseInt(e.target.value, 10));
    });
    
    const wireframeCheckbox = document.getElementById('show-wireframe');
    wireframeCheckbox.addEventListener('change', (e) => {
      this.toggleWireframe(e.target.checked);
    });
    
    const autoRotateCheckbox = document.getElementById('auto-rotate');
    autoRotateCheckbox.addEventListener('change', (e) => {
      this.toggleAutoRotate(e.target.checked);
    });
  }

  onWindowResize() {
    const container = document.getElementById('canvas-container');
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new CoreVisualizer();
});
