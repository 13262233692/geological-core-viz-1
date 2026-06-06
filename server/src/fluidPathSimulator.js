class FluidPathSimulator {
  constructor(parser) {
    this.parser = parser;
    this.permeabilityMatrix = null;
    this.gridSize = { width: 0, height: 0, depth: 0 };
  }

  buildPermeabilityMatrix() {
    const slices = this.parser.slices;
    if (slices.length === 0) {
      throw new Error('No slice data available');
    }

    const firstSlice = slices[0];
    this.gridSize = {
      width: firstSlice.width,
      height: firstSlice.height,
      depth: slices.length
    };

    this.permeabilityMatrix = new Float32Array(
      this.gridSize.width * this.gridSize.height * this.gridSize.depth
    );

    for (let z = 0; z < this.gridSize.depth; z++) {
      const slice = slices[z];
      const pixelData = slice.pixelData;
      
      for (let y = 0; y < this.gridSize.height; y++) {
        for (let x = 0; x < this.gridSize.width; x++) {
          const pixelIdx = y * this.gridSize.width + x;
          const matrixIdx = z * this.gridSize.width * this.gridSize.height + y * this.gridSize.width + x;
          
          const density = pixelData[pixelIdx] || 0;
          const cx = this.gridSize.width / 2;
          const cy = this.gridSize.height / 2;
          const distFromCenter = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
          const maxRadius = Math.min(this.gridSize.width, this.gridSize.height) / 2 - 2;
          
          if (distFromCenter > maxRadius || density === 0) {
            this.permeabilityMatrix[matrixIdx] = 0;
          } else {
            const normalizedDensity = (density - 800) / 3295;
            this.permeabilityMatrix[matrixIdx] = Math.max(0.1, 1.0 - normalizedDensity * 0.9);
          }
        }
      }
    }

    console.log(`Permeability matrix built: ${this.gridSize.width}x${this.gridSize.height}x${this.gridSize.depth}`);
    return this.permeabilityMatrix;
  }

  getPermeability(x, y, z) {
    if (x < 0 || x >= this.gridSize.width ||
        y < 0 || y >= this.gridSize.height ||
        z < 0 || z >= this.gridSize.depth) {
      return 0;
    }
    const idx = z * this.gridSize.width * this.gridSize.height + y * this.gridSize.width + x;
    return this.permeabilityMatrix[idx];
  }

  setPermeability(x, y, z, value) {
    if (x < 0 || x >= this.gridSize.width ||
        y < 0 || y >= this.gridSize.height ||
        z < 0 || z >= this.gridSize.depth) {
      return;
    }
    const idx = z * this.gridSize.width * this.gridSize.height + y * this.gridSize.width + x;
    this.permeabilityMatrix[idx] = value;
  }

  cellularAutomatonPathfind(startPoints, maxIterations = 200) {
    if (!this.permeabilityMatrix) {
      this.buildPermeabilityMatrix();
    }

    const visited = new Set();
    const allPaths = [];
    const directions = [
      { dx: 0, dy: 0, dz: 1 },
      { dx: 1, dy: 0, dz: 1 },
      { dx: -1, dy: 0, dz: 1 },
      { dx: 0, dy: 1, dz: 1 },
      { dx: 0, dy: -1, dz: 1 },
      { dx: 1, dy: 1, dz: 1 },
      { dx: -1, dy: -1, dz: 1 },
      { dx: 1, dy: -1, dz: 1 },
      { dx: -1, dy: 1, dz: 1 }
    ];

    for (const start of startPoints) {
      const path = [];
      let current = { ...start };
      let iterations = 0;

      const key = (x, y, z) => `${x},${y},${z}`;

      while (current.z < this.gridSize.depth - 1 && iterations < maxIterations) {
        path.push({
          x: current.x / this.gridSize.width - 0.5,
          y: -(current.z / this.gridSize.depth - 0.5) * 1.5,
          z: current.y / this.gridSize.height - 0.5
        });

        visited.add(key(current.x, current.y, current.z));

        let bestNext = null;
        let bestScore = -Infinity;

        for (const dir of directions) {
          const nx = current.x + dir.dx;
          const ny = current.y + dir.dy;
          const nz = current.z + dir.dz;

          if (visited.has(key(nx, ny, nz))) continue;

          const perm = this.getPermeability(nx, ny, nz);
          if (perm <= 0.05) continue;

          const randomFactor = Math.random() * 0.3;
          const downwardBonus = dir.dz > 0 ? 0.5 : 0;
          const score = perm + randomFactor + downwardBonus;

          if (score > bestScore) {
            bestScore = score;
            bestNext = { x: nx, y: ny, z: nz };
          }
        }

        if (!bestNext) {
          for (const dir of directions) {
            const nx = current.x + dir.dx;
            const ny = current.y + dir.dy;
            const nz = current.z + dir.dz;
            const perm = this.getPermeability(nx, ny, nz);
            if (perm > 0.05 && !visited.has(key(nx, ny, nz))) {
              bestNext = { x: nx, y: ny, z: nz };
              break;
            }
          }
        }

        if (!bestNext) break;

        current = bestNext;
        iterations++;
      }

      if (path.length > 0) {
        path.push({
          x: current.x / this.gridSize.width - 0.5,
          y: -(current.z / this.gridSize.depth - 0.5) * 1.5,
          z: current.y / this.gridSize.height - 0.5
        });
        allPaths.push(path);
      }
    }

    return allPaths;
  }

  generateFlowPaths(numPaths = 15) {
    if (!this.permeabilityMatrix) {
      this.buildPermeabilityMatrix();
    }

    const startPoints = [];
    const centerX = Math.floor(this.gridSize.width / 2);
    const centerY = Math.floor(this.gridSize.height / 2);
    const maxRadius = Math.min(this.gridSize.width, this.gridSize.height) / 3;

    for (let i = 0; i < numPaths; i++) {
      const angle = (i / numPaths) * Math.PI * 2;
      const radius = maxRadius * (0.3 + Math.random() * 0.7);
      const startX = Math.floor(centerX + Math.cos(angle) * radius);
      const startY = Math.floor(centerY + Math.sin(angle) * radius);
      startPoints.push({ x: startX, y: startY, z: 0 });
    }

    return this.cellularAutomatonPathfind(startPoints);
  }

  getFlowPathMetadata() {
    return {
      gridSize: this.gridSize,
      hasPermeabilityMatrix: this.permeabilityMatrix !== null
    };
  }
}

module.exports = FluidPathSimulator;
