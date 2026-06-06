const express = require('express');
const cors = require('cors');
const path = require('path');
const DicomSliceParser = require('./dicomParser');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const dataDir = path.join(__dirname, '..', 'data');
const parser = new DicomSliceParser(dataDir);

parser.loadAllSlices();

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
    const index = parseInt(req.params.index, 10);
    const imageData = parser.getSliceImageData(index);
    
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
    const index = parseInt(req.params.index, 10);
    const slices = parser.getSliceMetadata();
    
    if (index < 0 || index >= slices.length) {
      return res.status(404).json({ error: 'Slice not found' });
    }
    
    res.json(slices[index]);
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
