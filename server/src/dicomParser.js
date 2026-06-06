const fs = require('fs');
const path = require('path');

class DicomSliceParser {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.slices = [];
    this.useMockData = false;
  }

  loadMockData() {
    const mockDataPath = path.join(this.dataDir, 'core_volume.json');
    if (!fs.existsSync(mockDataPath)) {
      return false;
    }

    try {
      const rawData = fs.readFileSync(mockDataPath, 'utf-8');
      const volumeData = JSON.parse(rawData);
      
      this.slices = volumeData.slices.map(slice => ({
        fileName: slice.fileName,
        filePath: mockDataPath,
        sliceLocation: slice.sliceLocation,
        density: slice.density,
        width: slice.width,
        height: slice.height,
        pixelData: new Uint16Array(slice.pixelData),
        imageData: slice.imageData ? new Uint8Array(slice.imageData) : null,
        bitsAllocated: 16,
        rescaleSlope: 1,
        rescaleIntercept: 0
      }));

      this.useMockData = true;
      console.log(`Loaded ${this.slices.length} slices from mock data`);
      return true;
    } catch (error) {
      console.error('Failed to load mock data:', error.message);
      return false;
    }
  }

  parseDicomFile(filePath) {
    try {
      const dicomParser = require('dicom-parser');
      const dicomBuffer = fs.readFileSync(filePath);
      const byteArray = new Uint8Array(dicomBuffer);
      const dataSet = dicomParser.parseDicom(byteArray);

      const pixelDataElement = dataSet.elements.x7fe00010;
      let pixelData = null;
      let width = 0;
      let height = 0;

      if (pixelDataElement) {
        pixelData = new Uint16Array(
          byteArray.buffer,
          pixelDataElement.dataOffset,
          pixelDataElement.length / 2
        );
        width = dataSet.uint16('x00280011') || 256;
        height = dataSet.uint16('x00280010') || 256;
      }

      const density = dataSet.floatString('x00281050') || 
                      dataSet.uint16('x00281050') || 1000;
      
      const sliceLocation = dataSet.floatString('x00201041') || 
                           dataSet.floatString('x00200032')?.split('\\')[2] || 0;

      return {
        fileName: path.basename(filePath),
        filePath: filePath,
        sliceLocation: parseFloat(sliceLocation) || 0,
        density: parseFloat(density) || 1000,
        width: width,
        height: height,
        pixelData: pixelData,
        imageData: null,
        bitsAllocated: dataSet.uint16('x00280100') || 16,
        rescaleSlope: dataSet.floatString('x00281053') || 1,
        rescaleIntercept: dataSet.floatString('x00281052') || 0
      };
    } catch (error) {
      console.warn(`Failed to parse DICOM file ${filePath}:`, error.message);
      return null;
    }
  }

  loadAllSlices() {
    if (!fs.existsSync(this.dataDir)) {
      console.error(`Data directory not found: ${this.dataDir}`);
      return [];
    }

    if (this.loadMockData()) {
      return this.slices;
    }

    const files = fs.readdirSync(this.dataDir)
      .filter(f => f.endsWith('.dcm') || f.endsWith('.DCM'))
      .sort();

    this.slices = [];

    for (const file of files) {
      const filePath = path.join(this.dataDir, file);
      const slice = this.parseDicomFile(filePath);
      if (slice) {
        this.slices.push(slice);
      }
    }

    this.slices.sort((a, b) => a.sliceLocation - b.sliceLocation);

    console.log(`Loaded ${this.slices.length} DICOM slices`);
    return this.slices;
  }

  getSliceMetadata() {
    if (this.slices.length === 0) {
      this.loadAllSlices();
    }

    return this.slices.map((slice, index) => ({
      index: index,
      sliceLocation: slice.sliceLocation,
      density: slice.density,
      width: slice.width,
      height: slice.height,
      fileName: slice.fileName
    }));
  }

  getSliceImageData(index) {
    if (index < 0 || index >= this.slices.length) {
      return null;
    }

    const slice = this.slices[index];
    
    if (this.useMockData && slice.imageData) {
      return {
        width: slice.width,
        height: slice.height,
        data: Array.from(slice.imageData)
      };
    }

    if (!slice.pixelData) {
      return null;
    }

    const { width, height, pixelData, rescaleSlope, rescaleIntercept } = slice;
    const imageData = new Uint8Array(width * height * 4);

    let minVal = Infinity;
    let maxVal = -Infinity;
    for (let i = 0; i < pixelData.length; i++) {
      const val = pixelData[i] * rescaleSlope + rescaleIntercept;
      if (val < minVal) minVal = val;
      if (val > maxVal) maxVal = val;
    }

    const range = maxVal - minVal || 1;

    for (let i = 0; i < pixelData.length; i++) {
      const val = ((pixelData[i] * rescaleSlope + rescaleIntercept - minVal) / range) * 255;
      const pixelIndex = i * 4;
      imageData[pixelIndex] = val;
      imageData[pixelIndex + 1] = val;
      imageData[pixelIndex + 2] = val;
      imageData[pixelIndex + 3] = 255;
    }

    return {
      width: width,
      height: height,
      data: Array.from(imageData)
    };
  }

  getVolumeMetadata() {
    if (this.slices.length === 0) {
      this.loadAllSlices();
    }

    if (this.slices.length === 0) {
      return null;
    }

    const firstSlice = this.slices[0];
    const lastSlice = this.slices[this.slices.length - 1];

    return {
      sliceCount: this.slices.length,
      width: firstSlice.width,
      height: firstSlice.height,
      minDepth: firstSlice.sliceLocation,
      maxDepth: lastSlice.sliceLocation,
      sliceThickness: this.slices.length > 1 
        ? (lastSlice.sliceLocation - firstSlice.sliceLocation) / (this.slices.length - 1)
        : 1,
      minDensity: Math.min(...this.slices.map(s => s.density)),
      maxDensity: Math.max(...this.slices.map(s => s.density))
    };
  }
}

module.exports = DicomSliceParser;
