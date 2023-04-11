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
    public cubeType: Float32Array;
    public biomes: Float32Array;
    //trying smt new
    public oGnoise: Float32Array;
    public superOGnoise: Float32Array;
    public superBiomes: Float32Array;
    public amp: number;
    public center: number;
    public biome: number;

    constructor(centerX : number, centerY : number, size: number, parent: boolean, full: boolean) {

        this.parent = parent;
        this.x = centerX;
        this.y = centerY;
        this.size = size;
        this.cubes = size*size;
        this.oGnoise = new Float32Array(64);
        this.biomes = new Float32Array(64);
        if(parent)  
        {
            this.valueNoise = new Float32Array(this.size * this.size * 9);    
            this.superOGnoise = new Float32Array(24 * 24);
            this.superBiomes = new Float32Array(24*24);

            this.cubes *= 9;
            for(let x = this.x -1; x <= this.x + 1; x++){
                for(let y = this.y - 1; y <= this.y + 1; y++)
                {
                
                    let nkey: string = new String(x + ", " + y).toString();
                    this.children[nkey] = new Chunk(x, y, this.size, false, false);
                    // console.log("xy: " + x + ", " + y);
                    // console.log("list here: ");
                    for(let x2 = 0; x2 < 8; x2++)
                    {
                        for(let y2 = 0; y2 < 8; y2++)
                        {
                            let sindex = this.xyToLine(8*(x+1 - this.x) + x2, 8*(y+1 - this.y) + y2, 24);
                            let index = this.xyToLine(x2, y2, 8);
                            this.superOGnoise[sindex] = this.children[nkey].oGnoise[index]; 
                            this.superBiomes[sindex] = this.children[nkey].biomes[index];
                            
                        }
                    }
                    // console.log(this.children[nkey].biomes.toLocaleString());
                    
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
            
            // console.log(" list here: " + this.biomes.toLocaleString());
            
        }

    }
    
    private generateCubes() {
        this.topleftx = (this.x - 1) * (this.size) - this.size / 2;
        this.toplefty = (this.y - 1) * (this.size) - this.size / 2;
        
        //TODO: The real landscape-generation logic. The example code below shows you how to use the pseudorandom number generator to create a few cubes.
        const seed = new String(this.x + ", " + this.y).toString();
        let rng = new Rand(seed);
        const noise = this.generateValueNoise(rng);
        const biomes = this.generateBiomeNoise();
        const extraCubes: [number, number, number][] = [];
        for(let i=0; i<this.size * 3; i++) {
            for(let j=0; j<this.size * 3; j++)
            {
                const height = noise[i*this.size * 3 + j];
                // this.cubes += height;
                // for (let k = 1; k <= height; k++) {
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
        this.cubeType = new Float32Array(this.cubes);
        // console.log(this.biome);
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

                this.cubeType[idx] = biomes[idx];
                
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
            this.cubeType[idx] = 0;
            const key = (this.topleftx + j) + "," + (this.toplefty + i);
            this.cubeMap[key].push(height);
            this.indexMap[key][height] = idx;
        }
        // console.log(this.cubeType.toLocaleString());
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
                valueNoise[i*192 + j] =  Math.floor(0.5 *upsample3[i*192 + j] + 0.25 * upsample2[Math.trunc(i/2)*96 + Math.trunc(j/2)] + 0.125 * upsample1[Math.trunc(i/4)*48 + Math.trunc(j/4)] + 0.125 * this.superOGnoise[Math.trunc(i/8)*24 + Math.trunc(j/8)]);

            }
        }

        

        return valueNoise;
    }

    private generateBiomeNoise(): Float32Array{
        const upbiome = this.upsample(this.superBiomes);
        const upbiome2 = this.upsample(upbiome);
        const upbiome3 = this.upsample(upbiome2);
        const finbiome = new Float32Array(this.size * this.size * 9);
        // console.log("noise here: ");
        
        for (let i = 0; i < 192; i++) {
            for (let j = 0; j < 192; j++) {
                finbiome[i*192 + j] =  0.5 *upbiome3[i*192 + j] + 0.25 * upbiome2[Math.trunc(i/2)*96 + Math.trunc(j/2)] + 0.125 * upbiome[Math.trunc(i/4)*48 + Math.trunc(j/4)] + 0.125 * this.superBiomes[Math.trunc(i/8)*24 + Math.trunc(j/8)];
            }
        }
        // console.log(finbiome.toLocaleString());
        return finbiome;
    }

    private generateWhiteNoise(rng: Rand): Float32Array {
        const whiteNoise: Float32Array = new Float32Array(64);
        

        for(let i=0; i<8; i++)
        {
            for(let j=0; j<8; j++)
            {
                
                
                let gridX2 = this.x;
                let gridY2 = this.y;
                let locx = 1/16 + 1/8 * j;
                let locy = 1/16 + 1/8 * i;
                let xDiff = Math.abs(0.5 - locx);
                let yDiff = Math.abs(0.5 - locy);

                if(locx > 0.5)
                    gridX2 = this.x + 1;
                else {
                    gridX2 = this.x - 1;
                }
                if(locy > 0.5)
                    gridY2 = this.y + 1;
                else {
                    gridY2 = this.y - 1;
                }

                let b00: Float32Array = this.detBiomeVals(this.x, this.y);
                let b01: Float32Array = this.detBiomeVals(this.x, gridY2);
                let b10: Float32Array = this.detBiomeVals(gridX2, this.y);
                let b11: Float32Array = this.detBiomeVals(gridX2, gridY2);

                let smt1: number = this.smoothmix(b00[0], b10[0], xDiff);
                let smt2: number = this.smoothmix(b01[0], b11[0], xDiff);



                
                this.detBiome(this.x, this.y, i, j);
                const height = Math.floor(this.amp * rng.next() + this.center);


                const idx = 8 * i + j;
                whiteNoise[idx] = height;
                this.oGnoise[idx] = height;
                this.biomes[idx] = this.smoothmix(smt1, smt2, yDiff);
                
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
                if(i > 8 && i < this.size*3 - 8 && j > 8 && j < this.size * 3 - 8)
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
        console.log(this.cubeType.toLocaleString());
    }

    public removeCube(x: number, y: number, z: number) {
        const key = x + "," + z;
        const index = this.cubeMap[key].findIndex((height) => height == y);
        this.cubeMap[key].splice(index, 1);
        this.cubes--;
    }

    public addCube(x: number, y: number, z: number) {
        const key = x + "," + z;
        this.cubeMap[key].push(y);
        this.cubes++;
    }

    
    public detBiomeVals(x: number, y: number) : Float32Array {
        let xC: number = Math.floor(x / 2);
        let yC: number = Math.floor(y / 2);

        let nkey: string = new String(xC + ", " + yC + " biome").toString();
        let rng = new Rand(nkey);

        let value = rng.next() * 10;

        let ret: Float32Array = new Float32Array(3);
        
        // check for microbiomes
        
        if(value > 8) 
        {
            ret[0] = 5;
            ret[1] = 10;
            ret[2] = 10 * rng.next() + 40;
        }
        else if (value > 2) 
        {
            ret[0] = 3;
            ret[1] = 5;
            ret[2] = 30;
        }
        else 
        {
            ret[0] = 1;
            ret[1] = 5;
            ret[2] = rng.next() * 20; 
        }

        // check for high priority biome (mountains)
        
        xC = Math.floor(x / 4);
        yC = Math.floor(y / 4);

        let nkey3: string = new String(xC + ", " + yC + " superbiome").toString();
        rng = new Rand(nkey3);

        value = rng.next() * 10;

        if(value > 8)
        {
            ret[0] = 8;
            ret[1] = 10;
            ret[2] = rng.next() * 20 + 70;

            if(x - 4*xC < 0.5)
            {

                let xC3: number = xC - 1;
                

                let nkey2: string = new String(xC3 + ", " + yC + " superbiome").toString();
                rng = new Rand(nkey2);

                value = rng.next() * 10;
                if(value <= 8) 
                {
                    ret[2] = (ret[2] + 30) / 2;
                    ret[0]--;
                }
            }
            else if(x - 4*xC >= 3)
            {
                let xC3: number = xC + 1;
                

                let nkey2: string = new String(xC3 + ", " + yC + " superbiome").toString();
                rng = new Rand(nkey2);

                value = rng.next() * 10;
                if(value <= 8) 
                {
                    ret[2] = (ret[2] + 30) / 2;
                    ret[0]--;
                }
            }

            if(y - 4*yC < 1)
            {

                let yC3: number = yC - 1;
                

                let nkey2: string = new String(xC + ", " + yC3 + " superbiome").toString();
                rng = new Rand(nkey2);

                value = rng.next() * 10;
                if(value <= 8) 
                {
                    ret[2] = (ret[2] + 30) / 2;
                    ret[0]--;
                }
            }
            else if(y - 4*yC >= 3)
            {
                let yC3: number = yC + 1;

                let nkey2: string = new String(xC + ", " + yC3 + " superbiome").toString();
                rng = new Rand(nkey2);

                value = rng.next() * 10;
                if(value <= 8) 
                {
                    ret[2] = (ret[2] + 30) / 2;
                    ret[0]--;
                }
            }

        }
        else 
        {
            ret[2] += rng.next() * 10;
        }



        return ret;
    }

    public smoothmix(a0: number,  a1: number,  w: number) : number {
        return (a1 - a0) * (3.0 - w * 2.0) * w * w + a0;
    }


    public detBiome(x: number, y: number, row: number, col: number): number {
        
        
        let nX = 1/16 + 1/8 * col;
        let nY = 1/16 + 1/8 * row;

        let centX = 0.5;
        let centY = 0.5;

        let gridX = x;
        let gridY = y;
        let gridX2 = x;
        let gridY2 = y;

        let diffX = Math.abs(nX - centX);
        let diffY = Math.abs(nY - centY);

        if(nX < 0.5) 
        {
            gridX -= 1;
            diffX = 1 - diffX;
        }
        else gridX2 += 1;
        if(nY < 0.5) 
        {
            gridY -= 1;
            diffY = 1 - diffY;
        }
        else gridY2 += 1;

        let v00: Float32Array = this.detBiomeVals(gridX, gridY);
        let v10: Float32Array = this.detBiomeVals(gridX2, gridY);
        let v01: Float32Array = this.detBiomeVals(gridX, gridY2);
        let v11: Float32Array = this.detBiomeVals(gridX2, gridY2);


        let amp1: number = this.smoothmix(v00[1], v10[1], diffX);
        let amp2: number = this.smoothmix(v01[1], v11[1], diffX);
        this.amp = this.smoothmix(amp1, amp2, diffY);

        amp1 = this.smoothmix(v00[2], v10[2], diffX);
        amp2 = this.smoothmix(v01[2], v11[2], diffX);
        this.center = this.smoothmix(amp1, amp2, diffY);

        amp1 = this.smoothmix(v00[0], v10[0], diffX);
        amp2 = this.smoothmix(v01[0], v11[0], diffX);
        this.biome = this.smoothmix(amp1, amp2, diffY);
        return this.biome;        


    }
    
    public numCubes(): number {
        return this.cubes;
    }

    public types(): Float32Array {
        return this.cubeType;
    }
}
