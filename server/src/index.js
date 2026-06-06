const express = require('express');
const cors = require('cors');
const path = require('path');
const DicomSliceParser = require('./dicomParser');
const FluidPathSimulator = require('./fluidPathSimulator');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const dataDir = path.join(__dirname, '..', 'data');
const parser = new DicomSliceParser(dataDir);

parser.loadAllSlices();

const fluidSimulator = new FluidPathSimulator(parser);
let cachedFlowPaths = null;

app.get('/api/volume/metadata', (req, res) => {
  try {
    const metadata = parser.getVolumeMetadata();
    if (!metadata) {
      return res.status(404).json({ error: 'No DICOM data found' });
    }
    res.json(metadata);
  } catch (error) {
    console.error('Error getting volume metadata:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/slices', (req, res) => {
  try {
    const slices = parser.getSliceMetadata();
    res.json(slices);
  } catch (error) {
    console.error('Error getting slices metadata:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/slices/:index/image', (req, res) => {
  try {
    const rawIndex = parseInt(req.params.index, 10);
    if (isNaN(rawIndex)) {
      return res.status(400).json({ error: 'Invalid index' });
    }
    const imageData = parser.getSliceImageData(rawIndex);
    
    if (!imageData) {
      return res.status(404).json({ error: 'Slice not found' });
    }
    
    res.json(imageData);
  } catch (error) {
    console.error('Error getting slice image:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/slices/:index', (req, res) => {
  try {
    const rawIndex = parseInt(req.params.index, 10);
    if (isNaN(rawIndex)) {
      return res.status(400).json({ error: 'Invalid index' });
    }
    const slices = parser.getSliceMetadata();
    const safeIndex = Math.max(0, Math.min(Math.floor(rawIndex), slices.length - 1));
    
    if (slices.length === 0) {
      return res.status(404).json({ error: 'No slices available' });
    }
    
    res.json(slices[safeIndex]);
  } catch (error) {
    console.error('Error getting slice metadata:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Geological Core Viz Server running on port ${PORT}`);
  console.log(`Data directory: ${dataDir}`);
  console.log(`API endpoints:`);
  console.log(`  GET /api/health - Health check`);
  console.log(`  GET /api/volume/metadata - Volume metadata`);
  console.log(`  GET /api/slices - All slices metadata`);
  console.log(`  GET /api/slices/:index - Single slice metadata`);
  console.log(`  GET /api/slices/:index/image - Single slice image data`);
});

module.exports = app;
