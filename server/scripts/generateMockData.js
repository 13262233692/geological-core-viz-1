const fs = require('fs');
const path = require('path');

function generateMockCoreData() {
  const sliceCount = 64;
  const width = 128;
  const height = 128;
  const slices = [];

  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  for (let i = 0; i < sliceCount; i++) {
    const sliceLocation = i * 0.5;
    const density = 1000 + Math.sin(i * 0.2) * 200 + Math.random() * 100;
    
    const pixelData = new Uint16Array(width * height);
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
        const maxRadius = Math.min(width, height) / 2 - 5;
        
        if (radius <= maxRadius) {
          const noise = (Math.random() - 0.5) * 400;
          const layerPattern = Math.sin(i * 0.3 + radius * 0.1) * 200;
          const radialPattern = Math.cos(Math.atan2(y - centerY, x - centerX) * 4 + i * 0.1) * 100;
          const baseValue = 1500 + layerPattern + radialPattern + noise;
          pixelData[y * width + x] = Math.max(0, Math.min(4095, Math.round(baseValue)));
        } else {
          pixelData[y * width + x] = 0;
        }
      }
    }

    const imageData = new Uint8Array(width * height * 4);
    let minVal = Infinity;
    let maxVal = -Infinity;
    for (let j = 0; j < pixelData.length; j++) {
      if (pixelData[j] > 0) {
        minVal = Math.min(minVal, pixelData[j]);
        maxVal = Math.max(maxVal, pixelData[j]);
      }
    }
    const range = maxVal - minVal || 1;

    for (let j = 0; j < pixelData.length; j++) {
      const idx = j * 4;
      if (pixelData[j] === 0) {
        imageData[idx] = 0;
        imageData[idx + 1] = 0;
        imageData[idx + 2] = 0;
        imageData[idx + 3] = 0;
      } else {
        const normalized = (pixelData[j] - minVal) / range;
        const r = Math.floor(normalized * 139 + 60);
        const g = Math.floor(normalized * 90 + 40);
        const b = Math.floor(normalized * 43 + 20);
        imageData[idx] = r;
        imageData[idx + 1] = g;
        imageData[idx + 2] = b;
        imageData[idx + 3] = 255;
      }
    }

    slices.push({
      index: i,
      sliceLocation: sliceLocation,
      density: density,
      width: width,
      height: height,
      pixelData: Array.from(pixelData),
      imageData: Array.from(imageData),
      fileName: `slice_${i.toString().padStart(4, '0')}.json`
    });
  }

  const volumeData = {
    sliceCount: sliceCount,
    width: width,
    height: height,
    minDepth: 0,
    maxDepth: (sliceCount - 1) * 0.5,
    sliceThickness: 0.5,
    minDensity: Math.min(...slices.map(s => s.density)),
    maxDensity: Math.max(...slices.map(s => s.density)),
    slices: slices
  };

  const outputPath = path.join(dataDir, 'core_volume.json');
  fs.writeFileSync(outputPath, JSON.stringify(volumeData));
  console.log(`Generated mock data with ${sliceCount} slices at ${outputPath}`);
  
  return volumeData;
}

generateMockCoreData();
