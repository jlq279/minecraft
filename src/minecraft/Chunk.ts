import { Mat3, Mat4, Vec3, Vec4 } from "../lib/TSM.js";
import Rand from "../lib/rand-seed/Rand.js"
import { isNullOrUndefined } from "../lib/rand-seed/helpers.js";

export class Chunk {
    private cubes: number; // Number of cubes that should be *drawn* each frame
    private cubePositionsF32: Float32Array; // (4 x cubes) array of cube translations, in homogeneous coordinates
    private x : number; // Center of the chunk
    private y : number;
    private size: number; // Number of cubes along each side of the chunk
    private children: {[key:string] : Chunk} = {};
    public valueNoise: Float32Array;
    public parent: boolean;
    public topleftx: number;
    public toplefty: number;
    public cubeMap: {[key:string] : number[]} = {};
    public indexMap: {[key:string] : {[height:number]: number}} = {};
    //trying smt new
    public oGnoise: Float32Array;
    public superOGnoise: Float32Array;

    constructor(centerX : number, centerY : number, size: number, parent: boolean, full: boolean) {

        this.parent = parent;
        this.x = centerX;
        this.y = centerY;
        this.size = size;
        this.cubes = size*size;
        this.oGnoise = new Float32Array(64);
        if(parent)  
        {
            this.valueNoise = new Float32Array(this.size * this.size * 9);    
            this.superOGnoise = new Float32Array(24 * 24);
            this.cubes *= 9;
            for(let x = this.x -1; x <= this.x + 1; x++){
                for(let y = this.y - 1; y <= this.y + 1; y++)
                {
                
                    let nkey: string = new String(x + ", " + y).toString();
                    this.children[nkey] = new Chunk(x, y, this.size, false, false);
                    for(let x2 = 0; x2 < 8; x2++)
                    {
                        for(let y2 = 0; y2 < 8; y2++)
                        {
                            let sindex = this.xyToLine(8*(x+1 - this.x) + x2, 8*(y+1 - this.y) + y2, 24);
                            let index = this.xyToLine(x2, y2, 8);
                            this.superOGnoise[sindex] = this.children[nkey].oGnoise[index]; 
                        }
                    }
                    
                }
            }
            this.generateCubes();

        }
        else 
        {
            const seed = new String(this.x + ", " + this.y).toString();
            //console.log(seed);
            let rng = new Rand(seed);
            // const noise = this.generateValueNoise(rng);
            this.generateWhiteNoise(rng);
            
        }

    }
    
    private generateCubes() {
        this.topleftx = (this.x - 1) * (this.size) - this.size / 2;
        this.toplefty = (this.y - 1) * (this.size) - this.size / 2;
        
        //TODO: The real landscape-generation logic. The example code below shows you how to use the pseudorandom number generator to create a few cubes.
        const seed = new String(this.x + ", " + this.y).toString();
        let rng = new Rand(seed);
        const noise = this.generateValueNoise(rng);
        const extraCubes: [number, number, number][] = [];
        for(let i=0; i<this.size * 3; i++) {
            for(let j=0; j<this.size * 3; j++)
            {
                const height = noise[i*this.size * 3 + j];
                // this.cubes += height - 1;
                // for (let k = 1; k < height; k++) {
                //     extraCubes.push([i, j, height - k])
                // }
                const heightDifference = this.getMaxHeightDifference(noise, i, j);
                if (heightDifference > 1) {
                    this.cubes += heightDifference - 1;
                    for (let k = 1; k < heightDifference; k++) {
                        extraCubes.push([i, j, height - k])
                    }
                }
            }
        }

        this.cubePositionsF32 = new Float32Array(this.cubes * 4);
        for(let i=0; i<this.size*3; i++)
        {
            for(let j=0; j<this.size*3; j++)
            {
                const height = noise[i*this.size*3 + j];
                const idx = this.size * i * 3 + j;
                this.cubePositionsF32[4*idx + 0] = this.topleftx + j;
                this.cubePositionsF32[4*idx + 1] = height;
                this.cubePositionsF32[4*idx + 2] = this.toplefty + i;
                this.cubePositionsF32[4*idx + 3] = 0;
                const key = (this.topleftx + j) + "," + (this.toplefty + i);
                this.cubeMap[key] = [height];
                this.indexMap[key] = {};
                this.indexMap[key][height] = 4*idx;
            }
        }
        
        for (let idx = 4 * this.size * this.size * 9; idx < 4 * this.cubes; idx+=4) {
            const extraCube = extraCubes.pop() || [0, 0, 0];
            const i = extraCube[0];
            const j = extraCube[1];
            const height = extraCube[2];
            this.cubePositionsF32[idx + 0] = this.topleftx + j;
            this.cubePositionsF32[idx + 1] = height;
            this.cubePositionsF32[idx + 2] = this.toplefty + i;
            this.cubePositionsF32[idx + 3] = 0;
            const key = (this.topleftx + j) + "," + (this.toplefty + i);
            this.cubeMap[key].push(height);
            this.indexMap[key][height] = idx;
        }
    }

    private getMaxHeightDifference(noise: Float32Array, row: number, col: number): number {
        const height = noise[row*this.size*3 + col];
        let maxDifference = 0;
        if (row - 1 >= 0) {
            maxDifference = Math.max(maxDifference, height - noise[(row - 1)*this.size*3 + col]);
        }
        
        if (row + 1 < this.size * 3) {
            maxDifference = Math.max(maxDifference, height - noise[(row + 1)*this.size*3 + col]);
        }
        
        if (col - 1 >= 0) {
            maxDifference = Math.max(maxDifference, height - noise[row*this.size*3 + col-1]);
        }
       
        if (col + 1 < this.size * 3) {
            maxDifference = Math.max(maxDifference, height - noise[row*this.size*3 + col+1]);
        }
        
        return maxDifference;
    }

    private generateValueNoise(rng: Rand): Float32Array {
        // const whiteNoise = this.generateWhiteNoise(rng);
        const upsample1 = this.upsample(this.superOGnoise);
        const upsample2 = this.upsample(upsample1); 
        const upsample3 = this.upsample(upsample2);
        const valueNoise = new Float32Array(this.size * this.size * 9);
        for (let i = 0; i < 192; i++) {
            for (let j = 0; j < 192; j++) {
                valueNoise[i*192 + j] = Math.floor(upsample3[i*192 + j] + 0.5 * upsample2[Math.trunc(i/2)*96 + Math.trunc(j/2)] + 0.25 * upsample1[Math.trunc(i/4)*48 + Math.trunc(j/4)] + 0.125 * this.superOGnoise[Math.trunc(i/8)*24 + Math.trunc(j/8)]);
                // this.valueNoise[i * 192 + j] = Math.floor(upsample3[i*192 + j] + 0.5 * upsample2[Math.trunc(i/2)*96 + Math.trunc(j/2)] + 0.25 * upsample1[Math.trunc(i/4)*48 + Math.trunc(j/4)] + 0.125 * this.superOGnoise[Math.trunc(i/8)*24 + Math.trunc(j/8)])
                // valueNoise[i*192 + j] = Math.floor(upsample1[Math.trunc(i/4)*48 + Math.trunc(j/4)]);
                // this.valueNoise[i*192 + j] = Math.floor(upsample1[Math.trunc(i/4)*48 + Math.trunc(j/4)]);;

            }
        }

        valueNoise[193*192/2] = 90;

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
                this.oGnoise[idx] = height;
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
                const value = noise[this.xyToLine(oldC, oldR, oldSize)];
                const newR = 2*oldR;
                const newC = 2*oldC;
                const maxR = Math.min(newR + 2, newSize - 1);
                const minR = Math.max(newR - 1, 0);
                const maxC = Math.min(newC + 2, newSize - 1);
                const minC = Math.max(newC - 1, 0);
                for(let a = minR; a <= maxR; a++)
                {
                    for(let b = minC; b <= maxC; b++)
                    {
                        let contribx = 1;
                        let contriby = 1;
                        const index = this.xyToLine(b, a, newSize);
                        if(a == newR || a == newR + 1) contriby = 3;
                        if(b == newC || b == newC + 1) contribx = 3;
                        upsampled[index] += contribx * contriby * value / 16;
                    }
                }
            }
        }
        return upsampled;
    }
    
    public xyToLine(x: number, y: number, size: number): number 
    {
        return x + y * size;
    }


    public cubePositions(): Float32Array {
        return this.cubePositionsF32;
    }

    public generateCubePositions() {
        this.cubePositionsF32 = new Float32Array(this.cubes * 4);
        let idx = 0;
        this.indexMap = {};
        for(let i=0; i<this.size*3; i++)
        {
            for(let j=0; j<this.size*3; j++)
            {
                const x = this.topleftx + j;
                const z = this.toplefty + i;
                const key = x + "," + z;
                this.indexMap[key] = {};
                this.cubeMap[key].forEach((y) => {
                    this.cubePositionsF32[idx + 0] = x;
                    this.cubePositionsF32[idx + 1] = y;
                    this.cubePositionsF32[idx + 2] = z;
                    this.cubePositionsF32[idx + 3] = 0;
                    this.indexMap[key][y] = idx;
                    idx += 4;
                });
            }
        }
    }

    public removeCube(x: number, y: number, z: number) {
        const key = x + "," + z;
        const index = this.cubeMap[key].findIndex((height) => height == y);
        this.cubeMap[key].splice(index, 1);
        this.cubes--;
        this.generateCubePositions();
    }

    public addCube(x: number, y: number, z: number) {
        const key = x + "," + z;
        this.cubeMap[key].push(y);
        this.cubes++;
        this.generateCubePositions();
    }
    
    public numCubes(): number {
        return this.cubes;
    }
}
