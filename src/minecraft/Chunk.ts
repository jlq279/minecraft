import { Mat3, Mat4, Vec3, Vec4 } from "../lib/TSM.js";
import Rand from "../lib/rand-seed/Rand.js"

export class Chunk {
    private cubes: number; // Number of cubes that should be *drawn* each frame
    private cubePositionsF32: Float32Array; // (4 x cubes) array of cube translations, in homogeneous coordinates
    private OGnoiseVals: Float32Array;
    private OGupNoiseVals: Float32Array;
    private x2noisevals: Float32Array;
    private x2upNoiseVals: Float32Array;
    private x4noiseVals: Float32Array;
    private x4upNoiseVals: Float32Array;
    private x8noisevals: Float32Array;
    private noiseVals: Float32Array;
    private x : number; // Center of the chunk
    private y : number;
    private size: number; // Number of cubes along each side of the chunk
    private cubeMap: {[key: string]: Chunk};
    
    constructor(centerX : number, centerY : number, size: number, map: {[key: string]: Chunk}, full: boolean) {
        this.x = centerX;
        this.y = centerY;
        this.size = size;
        this.cubes = size*size;  
        this.cubeMap = map;
        this.genOG("0, 0");

        if(full) this.generateCubes();
    }
    
    
    private generateCubes() {
        const topleftx = this.x - this.size / 2;
        const toplefty = this.y - this.size / 2;
        
      //TODO: The real landscape-generation logic. The example code below shows you how to use the pseudorandom number generator to create a few cubes.
    //   this.upSamplex2();
      
      this.x2noisevals = new Float32Array(256);
      this.x2upNoiseVals = new Float32Array(64*64);
      this.x4upNoiseVals = new Float32Array(64*64);
      this.x4noiseVals = new Float32Array(32*32);
      this.x8noisevals = new Float32Array(64*64);
      this.noiseVals = new Float32Array(64*64);
      
    // this.upSample(this.OGnoiseVals, 8, this.x2noisevals);
      this.upSample(this.OGnoiseVals, 16, this.x4noiseVals);
      this.upSample(this.x4noiseVals, 32, this.x8noisevals);
      this.cubes = this.size * this.size;
      this.cubePositionsF32 = new Float32Array(4 * this.cubes);

      for(let i = 0; i < 16; i++)
      {
        for(let j = 0; j < 16; j++)
           {
            for(let a = 0; a < 4; a++)
            {
                for(let b = 0; b < 4; b++)
                {
                    let index = this.xyToLin(4*i + a, 4*j + b, 64);
                    let ogind = this.xyToLin(i, j, 16);
                    this.x2upNoiseVals[index] = this.x2noisevals[ogind];
                }
            }
           }
      }

      for(let i = 0; i < 32; i++)
      {
        for(let j = 0; j < 32; j++)
           {
            for(let a = 0; a < 2; a++)
            {
                for(let b = 0; b < 2; b++)
                {
                    let index = this.xyToLin(2*i + a, 2*j + b, 64);
                    let ogind = this.xyToLin(i, j, 32);
                    this.x4upNoiseVals[index] = this.x4noiseVals[ogind];
                }
            }
           }
      }


      for(let i = 0; i < 64; i++)
      {
        for(let j = 0; j < 64; j++)
        {
            let index = this.xyToLin(i, j, 64);
            this.noiseVals[index] = this.OGupNoiseVals[index] / 4  + this.x4upNoiseVals[index] / 4 + this.x8noisevals[index] / 2;
        }
      }


      const seed = "42";
      let rng = new Rand(seed);
      for(let i=0; i<this.size; i++)
      {
          for(let j=0; j<this.size; j++)
          {
            const height = Math.floor(5 * this.noiseVals[this.xyToLin(i, j, this.size)]);
            const idx = this.size * i + j;
            this.cubePositionsF32[4*idx + 0] = topleftx + j;
            this.cubePositionsF32[4*idx + 1] = height;
            this.cubePositionsF32[4*idx + 2] = toplefty + i;
            this.cubePositionsF32[4*idx + 3] = 0;
          }
      }
    
    }

    
    private genOG(seed: string) {
        this.OGnoiseVals = new Float32Array(256);
        this.OGupNoiseVals = new Float32Array(64 * 64);
        let rng = new Rand(seed);
        for(let x = 0; x < 16; x++)
        {
            for(let y = 0; y < 16; y++)
            {

                let ogInd = this.xyToLin(x, y, 16);
                this.OGnoiseVals[ogInd] = rng.next();
                for(let a = 0; a < 4; a++)
                {
                    for(let b = 0; b < 4; b++)
                    {
                        let newInd = this.xyToLin(4*x + a, 4*y + b, 64);
                        this.OGupNoiseVals[newInd] = this.OGnoiseVals[ogInd];
                    }
                }
            }
        }
    }



    private upSample(og: Float32Array, size: number, out: Float32Array){
        for(let x = 0; x < size; x++)
        {
            for(let y = 0; y < size; y++)
            {
                let minX = Math.max(-1 + 2 * x, 0);
                let maxX = Math.min(-1 + 2 * x + 4, size * 2 - 1);
                let minY = Math.max(-1 + 2*y, 0);
                let maxY = Math.min(-1 + 2*y + 4, size * 2 - 1);

                for(let a = minX; a <= maxX; a++)
                {
                    for(let b = minY; b <= maxY; b++)
                    {
                        let xMag = 1;
                        let yMag = 1;
                        let index = this.xyToLin(a, b, 2*size);
                        let ogIndex = this.xyToLin(x, y, size);
                        if (a - minX == 1 || a - minX == 2) xMag = 3;
                        if (b - minY == 1 || b - minY == 2) yMag = 3;
                        // console.log("size " + size + " " + x + " " + y + " " + og.length);
                        out[index] += xMag * yMag * og[ogIndex] / 16;
                                
                    }
                }
            }
        }

    }

    // private upSamplex2(){
    //     this.x2noisevals = new Float32Array(256);
    //     this.x2upNoiseVals = new Float32Array(64*64);
    //     for(let x = 0; x < 16; x++)
    //     {
    //         for(let y = 0; y < 16; y++)
    //         {
    //             let index = this.xyToLin(x, y, 16);
    //             this.x2noisevals[index] = this.getUL(x, y, 2) + this.getLL(x, y, 2) + this.getLR(x, y, 2) + this.getUR(x, y, 2);
    //             for(let a = 0; a < 4; a++)
    //             {
    //                 for(let b = 0; b < 4; b++)
    //                 {
    //                     let newInd = this.xyToLin(4*x + a, 4 * y + b, 64);
    //                     this.x2upNoiseVals[newInd] = this.x2noisevals[index];
    //                 }
    //             }
    //         }
    //     }


    // }

    // private getUL(x: number, y: number, sampling: number) {
    //     var contrib: number = 0;
        
    //     if(x < sampling / 2 && y < sampling / 2)
    //     {
    //         var key: string = new String((this.x - 1) + ", " + (this.y + 1)).toString();
    //         var src: Chunk = this.cubeMap[key];
    //         var index: number = this.xyToLin(7, 7, 8);
    //         console.log(key);
    //         console.log(src.OGnoiseVals.toLocaleString());
    //         console.log(index);
    //         contrib = src.OGnoiseVals[index] / 16;
    //     }
    //     else if(x < sampling / 2)
    //     {
    //         var key: string = new String((this.x - 1) + ", " + this.y).toString();
    //         var src: Chunk = this.cubeMap[key];
    //         var px: number = 7;
    //         var py: number = Math.ceil(y / sampling) - 1;
    //         var index: number = this.xyToLin(px, py, 8);
    //         var contriby = (y - 2*py == 1)?3:1;
    //         var contribx = 1;
    //         contrib = contribx * contriby * src.OGnoiseVals[index] / 16;
    //     }
    //     else if(y < sampling / 2)
    //     {
    //         var key: string = new String(this.x + ", " + (this.y + 1)).toString();
    //         var src: Chunk = this.cubeMap[key];
    //         var px: number = Math.ceil(x / sampling) - 1;
    //         var py: number = 7;
    //         var index: number = this.xyToLin(px, py, 8);
    //         var contribx = (x - 2*px == 1)?3:1;
    //         var contriby = 1;
    //         contrib = contribx * contriby * src.OGnoiseVals[index] / 16;
            
    //     }
    //     else 
    //     {
    //         var px: number = Math.ceil(x / sampling) - 1;
    //         var py: number = Math.ceil(y / sampling) - 1;
    //         var index: number = this.xyToLin(px, py, 8);
    //         var contribx = (x - 2*px == 1)?3:1;
    //         var contriby = (y - 2*py == 1)?3:1;
    //         contrib = contribx * contriby * this.OGnoiseVals[index] / 16;
    //     }
    //     return contrib;
    // }

    // private getUR(x: number, y: number, sampling: number){
    //     var contrib: number = 0;
        
    //     if(x > 8 * sampling - 1 - sampling / 2 && y < sampling / 2)
    //     {
    //         var key: string = new String((this.x + 1) + ", " + (this.y + 1)).toString();
    //         var src: Chunk = this.cubeMap[key];
    //         var index: number = this.xyToLin(0, 7, 8);
    //         contrib = src.OGnoiseVals[index] / 16;
    //     }
    //     else if(x > 8 * sampling - 1 - sampling / 2)
    //     {
    //         var key: string = new String((this.x + 1) + ", " + this.y).toString();
    //         var src: Chunk = this.cubeMap[key];
    //         var px: number = 0;
    //         var py: number = Math.ceil(y / sampling) - 1;
    //         var index: number = this.xyToLin(px, py, 8);
    //         var contriby = (y - 2*py == 1)?3:1;
    //         var contribx = 1;
    //         contrib = contribx * contriby * src.OGnoiseVals[index] / 16;
    //     }
    //     else if(y < sampling / 2)
    //     {
    //         var key: string = new String(this.x + ", " + (this.y + 1)).toString();
    //         var src: Chunk = this.cubeMap[key];
    //         var px: number = Math.ceil(x / sampling);
    //         var py: number = 7;
    //         var index: number = this.xyToLin(px, py, 8);
    //         var contribx = (2*px - x == 0)?3:1;
    //         var contriby = 1;
    //         contrib = contribx * contriby * src.OGnoiseVals[index] / 16;
            
    //     }
    //     else 
    //     {
    //         var px: number = Math.ceil(x / sampling);
    //         var py: number = Math.ceil(y / sampling) - 1;
    //         var index: number = this.xyToLin(px, py, 8);
    //         var contribx = (2*px - x == 0)?3:1;
    //         var contriby = (y - 2*py == 1)?3:1;
    //         contrib = contribx * contriby * this.OGnoiseVals[index] / 16;
    //     }
    //     return contrib;
    // }

    // private getLL(x: number, y: number, sampling: number) {
    //     var contrib: number = 0;
        
    //     if(y > 8 * sampling - 1 - sampling / 2 && x < sampling / 2)
    //     {
    //         var key: string = new String((this.x - 1) + ", " + (this.y + 1)).toString();
    //         var src: Chunk = this.cubeMap[key];
    //         var index: number = this.xyToLin(7, 0, 8);
    //         contrib = src.OGnoiseVals[index] / 16;
    //     }
    //     else if(x < sampling / 2)
    //     {
    //         var key: string = new String((this.x - 1) + ", " + this.y).toString();
    //         var src: Chunk = this.cubeMap[key];
    //         var px: number = 0;
    //         var py: number = Math.ceil(y / sampling);
    //         var index: number = this.xyToLin(px, py, 8);
    //         var contriby = (2*py - y == 0)?3:1;
    //         var contribx = 1;
    //         contrib = contribx * contriby * src.OGnoiseVals[index] / 16;
    //     }
    //     else if(y > 8 * sampling - 1 - sampling / 2)
    //     {
    //         var key: string = new String(this.x + ", " + (this.y + 1)).toString();
    //         var src: Chunk = this.cubeMap[key];
    //         var px: number = Math.ceil(x / sampling) - 1;
    //         var py: number = 7;
    //         var index: number = this.xyToLin(px, py, 8);
    //         var contribx = (x - 2*px == 1)?3:1;
    //         var contriby = 1;
    //         contrib = contribx * contriby * src.OGnoiseVals[index] / 16;
            
    //     }
    //     else 
    //     {
    //         var px: number = Math.ceil(x / sampling) - 1;
    //         var py: number = Math.ceil(y / sampling);
    //         var index: number = this.xyToLin(px, py, 8);
    //         var contribx = (x - 2*px == 0)?3:1;
    //         var contriby = (2*py - y == 0)?3:1;
    //         contrib = contribx * contriby * this.OGnoiseVals[index] / 16;
    //     }
    //     return contrib;
    // }

    // private getLR(x: number, y: number, sampling: number) {
    //     var contrib: number = 0;
        
    //     if(y > 8 * sampling - 1 - sampling / 2 && x > 8 * sampling - 1 - sampling / 2)
    //     {
    //         var key: string = new String((this.x + 1) + ", " + (this.y + 1)).toString();
    //         var src: Chunk = this.cubeMap[key];
    //         var index: number = this.xyToLin(0, 0, 8);
    //         contrib = src.OGnoiseVals[index] / 16;
    //     }
    //     else if(x > 8 * sampling - 1 - sampling / 2)
    //     {
    //         var key: string = new String((this.x - 1) + ", " + this.y).toString();
    //         var src: Chunk = this.cubeMap[key];
    //         var px: number = 0;
    //         var py: number = Math.ceil(y / sampling);
    //         var index: number = this.xyToLin(px, py, 8);
    //         var contriby = (2*py - y == 0)?3:1;
    //         var contribx = 1;
    //         contrib = contribx * contriby * src.OGnoiseVals[index] / 16;
    //     }
    //     else if(y > 8 * sampling - 1 - sampling / 2)
    //     {
    //         var key: string = new String(this.x + ", " + (this.y + 1)).toString();
    //         var src: Chunk = this.cubeMap[key];
    //         var px: number = Math.ceil(x / sampling);
    //         var py: number = 7;
    //         var index: number = this.xyToLin(px, py, 8);
    //         var contribx = (2*px - x == 0)?3:1;
    //         var contriby = 1;
    //         contrib = contribx * contriby * src.OGnoiseVals[index] / 16;
            
    //     }
    //     else 
    //     {
    //         var px: number = Math.ceil(x / sampling) - 1;
    //         var py: number = Math.ceil(y / sampling);
    //         var index: number = this.xyToLin(px, py, 8);
    //         var contribx = (2*px - x == 0)?3:1;
    //         var contriby = (2*py - y == 0)?3:1;
    //         contrib = contribx * contriby * this.OGnoiseVals[index] / 16;
    //     }
    //     return contrib;
    // }

    private upSamplex4(){

    }
    private upSamplex8(){

    }



    private xyToLin(x: number, y: number, size: number) : number
    {
        return y * size + x;
    }

    private valueNoise(seed: string) { 
        
        var num = this.size / 8;
        let rng = new Rand(seed);
        this.noiseVals = new Float32Array(num * num);
        for(let i = 0; i < num; i++)
        {
            for(let j = 0; j < num; j++)
            {
                const noiseVal = rng.next();
                const idx = num * i + j;
                this.noiseVals[idx] = noiseVal;
            }
        }

    }



    public cubePositions(): Float32Array {
        return this.cubePositionsF32;
    }
    
    
    public numCubes(): number {
        return this.cubes;
    }
}

export class SuperChunk{};
