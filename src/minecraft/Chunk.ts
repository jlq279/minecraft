import { Mat3, Mat4, Vec3, Vec4 } from "../lib/TSM.js";
import Rand from "../lib/rand-seed/Rand.js"
import { isNullOrUndefined } from "../lib/rand-seed/helpers.js";

export class Chunk {
    private cubes: number; // Number of cubes that should be *drawn* each frame
    private cubePositionsF32: Float32Array; // (4 x cubes) array of cube translations, in homogeneous coordinates
    private x : number; // Center of the chunk
    private y : number;
    private size: number; // Number of cubes along each side of the chunk
    
    constructor(centerX : number, centerY : number, size: number) {
        this.x = centerX;
        this.y = centerY;
        this.size = size;
        this.cubes = size*size;        
        this.generateCubes();
    }
    
    
    private generateCubes() {
        const topleftx = this.x - this.size / 2;
        const toplefty = this.y - this.size / 2;
        
        //TODO: The real landscape-generation logic. The example code below shows you how to use the pseudorandom number generator to create a few cubes.
        const seed = "42";
        let rng = new Rand(seed);
        const noise = this.generateValueNoise(rng);
        const extraCubes: [number, number, number][] = [];
        for(let i=0; i<this.size; i++) {
            for(let j=0; j<this.size; j++)
            {
                const height = noise[i*this.size + j];
                const heightDifference = this.getMaxHeightDifference(noise, i, j);
                if (heightDifference > 1) {
                    this.cubes += heightDifference - 1;
                    for (let k = 1; k < heightDifference; k++) {
                        extraCubes.push([i, j, height - k])
                    }
                }
            }
        }

        this.cubes++;
        this.cubePositionsF32 = new Float32Array(4 * this.cubes);

        for(let i=0; i<this.size; i++)
        {
            for(let j=0; j<this.size; j++)
            {
                const height = noise[i*this.size + j];
                const idx = this.size * i + j;
                this.cubePositionsF32[4*idx + 0] = topleftx + j;
                this.cubePositionsF32[4*idx + 1] = height;
                this.cubePositionsF32[4*idx + 2] = toplefty + i;
                this.cubePositionsF32[4*idx + 3] = 0;
            }
        }
        
        for (let idx = 4 * this.size * this.size; idx < 4 * this.cubes; idx+=4) {
            const extraCube = extraCubes.pop() || [0, 0, 0];
            const i = extraCube[0];
            const j = extraCube[1];
            const height = extraCube[2];
            this.cubePositionsF32[idx + 0] = topleftx + j;
            this.cubePositionsF32[idx + 1] = height;
            this.cubePositionsF32[idx + 2] = toplefty + i;
            this.cubePositionsF32[idx + 3] = 0;
        }
    }

    private getMaxHeightDifference(noise: Float32Array, row: number, col: number): number {
        const height = noise[row*this.size + col];
        let maxDifference = 0;
        if (row - 1 >= 0) {
            maxDifference = Math.max(maxDifference, height - noise[(row - 1)*this.size + col]);
        }
        if (row + 1 < this.size) {
            maxDifference = Math.max(maxDifference, height - noise[(row + 1)*this.size + col]);
        }
        if (col - 1 >= 0) {
            maxDifference = Math.max(maxDifference, height - noise[row*this.size + col-1]);
        }
        if (col + 1 < this.size) {
            maxDifference = Math.max(maxDifference, height - noise[row*this.size + col+1]);
        }
        return maxDifference;
    }

    private generateValueNoise(rng: Rand): Float32Array {
        const whiteNoise = this.generateWhiteNoise(rng);
        const upsample1 = this.upsample(whiteNoise);
        const upsample2 = this.upsample(upsample1); 
        const upsample3 = this.upsample(upsample2);
        const valueNoise = new Float32Array(this.size * this.size);
        for (let i = 0; i < 64; i++) {
            for (let j = 0; j < 64; j++) {
                valueNoise[i*64 + j] = Math.floor(upsample3[i*64 + j] + 0.5 * upsample2[Math.trunc(i/2)*32 + Math.trunc(j/2)] + 0.25 * upsample1[Math.trunc(i/4)*16 + Math.trunc(j/4)] + 0.125 * whiteNoise[Math.trunc(i/8)*8 + Math.trunc(j/8)]);
            }
        }
        return valueNoise;
    }

    private generateWhiteNoise(rng: Rand): Float32Array {
        const whiteNoise: Float32Array = new Float32Array(64);
        for(let i=0; i<8; i++)
        {
            for(let j=0; j<8; j++)
            {
                const height = Math.floor(10.0 * rng.next());
                const idx = 8 * i + j;
                whiteNoise[idx] = height;
            }
        }
        return whiteNoise;
    }

    private upsample(noise: Float32Array): Float32Array {
        const oldSize: number = Math.sqrt(noise.length);
        const newSize: number = 2 * oldSize;
        const upsampled: Float32Array = new Float32Array(newSize * newSize);
        upsampled.fill(0.0);
        for(let oldR=0; oldR<oldSize; oldR++)
        {
            for(let oldC=0; oldC<oldSize; oldC++)
            {
                const value = noise[oldR * oldSize + oldC];
                const newR = 2*oldR;
                const newC = 2*oldC;
                const centerTopLeft = newR*newSize + newC;
                const centerTopRight = newR*newSize + (newC+1);
                const centerBottomLeft = (newR+1)*newSize + newC;
                const centerBottomRight = (newR+1)*newSize + (newC+1);
                upsampled[centerTopLeft] += 9.0/16.0 * value;
                upsampled[centerTopRight] += 9.0/16.0 * value;
                upsampled[centerBottomLeft] += 9.0/16.0 * value;
                upsampled[centerBottomRight] += 9.0/16.0 * value;
                if (newR - 1 >= 0) {
                    if (newC - 1 >= 0) {
                        const topLeft = (newR-1)*newSize + (newC-1);
                        upsampled[topLeft] += 1.0/16.0 * value;
                    }
                    if (newC + 2 < newSize) {
                        const topRight = (newR-1)*newSize + (newC+2);
                        upsampled[topRight] += 1.0/16.0 * value;
                    }
                    upsampled[(newR-1)*newSize + newC] += 3.0/16.0 * value;
                    upsampled[(newR-1)*newSize + (newC+1)] += 3.0/16.0 * value;
                }
                if (newR + 2 < newSize) {
                    if (newC - 1 >= 0) {
                        const bottomLeft = (newR+2)*newSize + (newC-1);
                        upsampled[bottomLeft] += 1.0/16.0 * value;
                    }
                    if (newC + 2 < newSize) {
                        const bottomRight = (newR+2)*newSize + (newC+2);
                        upsampled[bottomRight] += 1.0/16.0 * value;
                    }
                    upsampled[(newR+2)*newSize + newC] += 3.0/16.0 * value;
                    upsampled[(newR+2)*newSize + (newC+1)] += 3.0/16.0 * value;
                }
                if (newC - 1 >= 0) {
                    upsampled[newR*newSize + (newC-1)] += 3.0/16.0 * value;
                    upsampled[(newR+1)*newSize + (newC-1)] += 3.0/16.0 * value;
                }
                if (newC + 2 < newSize) {
                    upsampled[newR*newSize + (newC+2)] += 3.0/16.0 * value;
                    upsampled[(newR+1)*newSize + (newC+2)] += 3.0/16.0 * value;
                }
            }
        }
        return upsampled;
    }
    
    public cubePositions(): Float32Array {
        return this.cubePositionsF32;
    }
    
    
    public numCubes(): number {
        return this.cubes;
    }
}
