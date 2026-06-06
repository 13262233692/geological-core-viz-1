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

  generateFallbackImageData() {
    const width = 128;
    const height = 128;
    const data = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const isCheckerboard = (Math.floor(x / 16) + Math.floor(y / 16)) % 2 === 0;
        data[idx] = isCheckerboard ? 80 : 60;
        data[idx + 1] = isCheckerboard ? 60 : 40;
        data[idx + 2] = isCheckerboard ? 40 : 20;
        data[idx + 3] = 255;
      }
    }
    return { width, height, data: Array.from(data) };
  }

  async loadData() {
    try {
      const metadataResponse = await fetch('/api/volume/metadata');
      if (!metadataResponse.ok) {
        throw new Error(`Metadata request failed: ${metadataResponse.status}`);
      }
      this.volumeMetadata = await metadataResponse.json();
      
      const slicesResponse = await fetch('/api/slices');
      if (!slicesResponse.ok) {
        throw new Error(`Slices request failed: ${slicesResponse.status}`);
      }
      
      this.updateVolumeInfo();
      
      const fallbackImg = this.generateFallbackImageData();
      
      for (let i = 0; i < this.volumeMetadata.sliceCount; i++) {
        try {
          const imgResponse = await fetch(`/api/slices/${i}/image`);
          if (!imgResponse.ok) {
            console.warn(`Slice ${i} image request failed, using fallback`);
            this.sliceData.push({ ...fallbackImg });
            continue;
          }
          const imgData = await imgResponse.json();
          
          if (!imgData || !imgData.data || !imgData.width || !imgData.height) {
            console.warn(`Slice ${i} has invalid data, using fallback`);
            this.sliceData.push({ ...fallbackImg });
            continue;
          }
          
          this.sliceData.push(imgData);
        } catch (sliceError) {
          console.warn(`Error loading slice ${i}, using fallback:`, sliceError);
          this.sliceData.push({ ...fallbackImg });
        }
      }
      
      this.createVolumeRendering();
      const safeInitialIndex = Math.min(this.volumeMetadata.sliceCount - 1, this.sliceData.length - 1, 63);
      this.updateCrossSection(safeInitialIndex);
      
    } catch (error) {
      console.error('Error loading data:', error);
      document.getElementById('volume-info').textContent = '数据加载失败，请确保后端服务已启动';
    }
  }

  updateVolumeInfo() {
    if (!this.volumeMetadata) return;
    
    const info = document.getElementById('volume-info');
    const sliceCount = this.volumeMetadata.sliceCount || 0;
    const width = this.volumeMetadata.width || 0;
    const height = this.volumeMetadata.height || 0;
    const minDepth = this.volumeMetadata.minDepth != null ? this.volumeMetadata.minDepth.toFixed(2) : '0.00';
    const maxDepth = this.volumeMetadata.maxDepth != null ? this.volumeMetadata.maxDepth.toFixed(2) : '0.00';
    const thickness = this.volumeMetadata.sliceThickness != null ? this.volumeMetadata.sliceThickness.toFixed(2) : '0.00';
    const minDensity = this.volumeMetadata.minDensity != null ? this.volumeMetadata.minDensity.toFixed(1) : '0.0';
    const maxDensity = this.volumeMetadata.maxDensity != null ? this.volumeMetadata.maxDensity.toFixed(1) : '0.0';
    
    info.innerHTML = `
      <div>切片数量: <strong>${sliceCount}</strong></div>
      <div>图像尺寸: <strong>${width} x ${height}</strong></div>
      <div>深度范围: <strong>${minDepth} - ${maxDepth} mm</strong></div>
      <div>切片厚度: <strong>${thickness} mm</strong></div>
      <div>密度范围: <strong>${minDensity} - ${maxDensity}</strong></div>
    `;
    
    const cutSlider = document.getElementById('cut-plane');
    const maxValidIndex = Math.max(0, sliceCount - 1);
    cutSlider.max = maxValidIndex;
    cutSlider.min = 0;
    cutSlider.value = maxValidIndex;
    document.getElementById('cut-value').textContent = maxValidIndex;
  }

  createVolumeRendering() {
    if (this.sliceData.length === 0) return;
    
    const fallbackImg = this.generateFallbackImageData();
    const firstValidSlice = this.sliceData.find(s => s && s.width && s.height) || fallbackImg;
    const sliceCount = this.sliceData.length;
    const aspectRatio = firstValidSlice.width / firstValidSlice.height;
    const baseSize = 3;
    const sliceHeight = (baseSize / sliceCount) * 1.5;
    
    for (let i = 0; i < sliceCount; i++) {
      let sliceData = this.sliceData[i];
      
      if (!sliceData || !sliceData.data || !sliceData.width || !sliceData.height) {
        console.warn(`Slice ${i} has invalid data, using fallback in volume rendering`);
        sliceData = fallbackImg;
      }
      
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
    let width, height, data;
    
    if (!imgData || !imgData.data || !imgData.width || !imgData.height) {
      console.warn('Invalid image data provided to createTextureFromImageData, using fallback');
      const fallback = this.generateFallbackImageData();
      width = fallback.width;
      height = fallback.height;
      data = fallback.data;
    } else {
      width = imgData.width;
      height = imgData.height;
      data = imgData.data;
    }
    
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    const imageData = ctx.createImageData(width, height);
    const dataLength = Math.min(data.length, imageData.data.length);
    for (let i = 0; i < dataLength; i++) {
      imageData.data[i] = data[i] || 0;
    }
    ctx.putImageData(imageData, 0, 0);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    
    return texture;
  }

  updateCutPlane(value) {
    if (this.sliceMeshes.length === 0) return;
    
    const maxIndex = Math.max(0, this.sliceMeshes.length - 1);
    const safeValue = Math.max(0, Math.min(Math.floor(value), maxIndex));
    this.cutPlanePosition = safeValue;
    
    const normalizedCut = maxIndex > 0 ? safeValue / maxIndex : 1;
    
    this.sliceMeshes.forEach((mesh, index) => {
      const meshNormalized = maxIndex > 0 ? index / maxIndex : 1;
      mesh.visible = meshNormalized <= normalizedCut;
    });
    
    const crossSectionIndex = Math.max(0, Math.min(safeValue, this.sliceData.length - 1));
    this.updateCrossSection(crossSectionIndex);
  }

  updateCrossSection(index) {
    if (!this.crossSectionCtx) return;
    
    const safeIndex = Math.max(0, Math.min(Math.floor(index), this.sliceData.length - 1));
    
    if (safeIndex < 0 || safeIndex >= this.sliceData.length) {
      this.crossSectionCtx.fillStyle = '#1a1a2e';
      this.crossSectionCtx.fillRect(0, 0, this.crossSectionCanvas.width, this.crossSectionCanvas.height);
      this.crossSectionCtx.fillStyle = '#e94560';
      this.crossSectionCtx.font = '14px Arial';
      this.crossSectionCtx.fillText('数据不可用', 40, 64);
      document.getElementById('cross-section-info').textContent = `深度: - (切片 ${index})`;
      return;
    }
    
    const sliceData = this.sliceData[safeIndex];
    
    if (!sliceData || !sliceData.data || !sliceData.width || !sliceData.height) {
      const fallback = this.generateFallbackImageData();
      sliceData.width = fallback.width;
      sliceData.height = fallback.height;
      sliceData.data = fallback.data;
    }
    
    const { width, height, data } = sliceData;
    
    this.crossSectionCanvas.width = width;
    this.crossSectionCanvas.height = height;
    
    const imageData = this.crossSectionCtx.createImageData(width, height);
    const dataLength = Math.min(data.length, imageData.data.length);
    for (let i = 0; i < dataLength; i++) {
      imageData.data[i] = data[i] != null ? data[i] : 0;
    }
    this.crossSectionCtx.putImageData(imageData, 0, 0);
    
    let depthText = `${safeIndex}`;
    if (this.volumeMetadata && this.volumeMetadata.sliceThickness != null) {
      const depth = safeIndex * this.volumeMetadata.sliceThickness + this.volumeMetadata.minDepth;
      depthText = depth.toFixed(2);
    }
    document.getElementById('cross-section-info').textContent = `深度: ${depthText} mm (切片 ${safeIndex})`;
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
