import { Debugger } from "../lib/webglutils/Debugging.js";
import {
  CanvasAnimation,
  WebGLUtilities
} from "../lib/webglutils/CanvasAnimation.js";
import { GUI } from "./Gui.js";
import {
  blankCubeFSText,
  blankCubeVSText
} from "./Shaders.js";
import { Mat4, Vec4, Vec3 } from "../lib/TSM.js";
import { RenderPass } from "../lib/webglutils/RenderPass.js";
import { Camera } from "../lib/webglutils/Camera.js";
import { Cube } from "./Cube.js";
import { Chunk } from "./Chunk.js";
import { isNullOrUndefined } from "../lib/rand-seed/helpers.js";

export class MinecraftAnimation extends CanvasAnimation {
  private gui: GUI;
  
  chunk : Chunk;
  
  /*  Cube Rendering */
  private cubeGeometry: Cube;
  private blankCubeRenderPass: RenderPass;

  /* Global Rendering Info */
  private lightPosition: Vec4;
  private backgroundColor: Vec4;

  private canvas2d: HTMLCanvasElement;
  
  // Player's head position in world coordinate.
  // Player should extend two units down from this location, and 0.4 units radially.
  private playerPosition: Vec3;
  private verticalVelocity: number;
  private prevT: number;
  private prevTB: boolean;
  private playerCX: number;
  private playerCY: number;
  private loadedCX: number;
  private loadedCY: number;

  private modificationKeys:{[chunk: string]: [number, number, number][]} = {};
  private modifications:{[chunk: string]: {[xyz: string] : "ADD" | "REMOVE" | undefined}} = {};
  private inventory: number = 0;

  private updateInventory() {
    const hudContext = this.canvas2d.getContext("2d") || new CanvasRenderingContext2D();
    hudContext.clearRect(0, 0, this.canvas2d.width, this.canvas2d.height);
    hudContext.fillStyle = "rgba(255.0, 255.0, 255.0, 0.5)";
    hudContext.fillRect(0, 0, 500, 300)
    hudContext.fillStyle = "rgba(1.0, 1.0, 1.0, 1.0)";
    hudContext.font = "48px sans-serif"
    hudContext.fillText("Inventory", 60, 96);
    hudContext.font = "36px sans-serif"
    hudContext.fillText(`Regular blocks: ${this.inventory}`, 60, 144);
  }
  
  
  constructor(canvas: HTMLCanvasElement) {
    super(canvas);

    this.canvas2d = document.getElementById("textCanvas") as HTMLCanvasElement;
    this.updateInventory();
    this.ctx = Debugger.makeDebugContext(this.ctx);
    let gl = this.ctx;
        
    this.gui = new GUI(this.canvas2d, this);
    this.playerPosition = this.gui.getCamera().pos();

    this.verticalVelocity = 0;
    this.prevT = performance.now();

    // Generate initial landscape
    this.chunk = new Chunk(0.0, 0.0, 64, true, true);
    this.playerCX = 0;
    this.playerCY = 0;
    this.loadedCX = 0;
    this.loadedCY = 0;
    this.prevTB = false;

    this.blankCubeRenderPass = new RenderPass(gl, blankCubeVSText, blankCubeFSText);
    this.cubeGeometry = new Cube();
    this.initBlankCube();
    
    this.lightPosition = new Vec4([-1000, 1000, -1000, 1]);
    this.backgroundColor = new Vec4([0.0, 0.37254903, 0.37254903, 1.0]);    
  }

  /**
   * Setup the simulation. This can be called again to reset the program.
   */
  public reset(): void {    
      this.gui.reset();
      this.loadedCX = 0;
      this.loadedCY = 0;
      this.regenerate();
      this.playerPosition = this.gui.getCamera().pos();
  }
  
  
  /**
   * Sets up the blank cube drawing
   */
  private initBlankCube(): void {
    this.blankCubeRenderPass.setIndexBufferData(this.cubeGeometry.indicesFlat());
    this.blankCubeRenderPass.addAttribute("aVertPos",
      4,
      this.ctx.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      this.cubeGeometry.positionsFlat()
    );
    
    this.blankCubeRenderPass.addAttribute("aNorm",
      4,
      this.ctx.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      this.cubeGeometry.normalsFlat()
    );
    
    this.blankCubeRenderPass.addAttribute("aUV",
      2,
      this.ctx.FLOAT,
      false,
      2 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      this.cubeGeometry.uvFlat()
    );
    
    this.blankCubeRenderPass.addInstancedAttribute("aOffset",
      4,
      this.ctx.FLOAT,
      false,
      4 * Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      new Float32Array(0)
    );

    this.blankCubeRenderPass.addInstancedAttribute("type",
      1,
      this.ctx.FLOAT,
      false,
      Float32Array.BYTES_PER_ELEMENT,
      0,
      undefined,
      new Float32Array(0)
    );

    this.blankCubeRenderPass.addUniform("uLightPos",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniform4fv(loc, this.lightPosition.xyzw);
    });
    this.blankCubeRenderPass.addUniform("uProj",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.projMatrix().all()));
    });
    this.blankCubeRenderPass.addUniform("uView",
      (gl: WebGLRenderingContext, loc: WebGLUniformLocation) => {
        gl.uniformMatrix4fv(loc, false, new Float32Array(this.gui.viewMatrix().all()));
    });
    
    this.blankCubeRenderPass.setDrawData(this.ctx.TRIANGLES, this.cubeGeometry.indicesFlat().length, this.ctx.UNSIGNED_INT, 0);
    this.blankCubeRenderPass.setup();    
  }

  private canFall(cubeIndex: number): boolean {
    return this.playerPosition.y - 2 > this.chunk.cubePositions()[cubeIndex + 1] + 0.5 || this.verticalVelocity != 0;
  }

  private fall(cubeIndex: number) {
    // TODO: more accurate check for which block is under the player (make sure it's supporting the 0.4r cylinder)
    const gravity = -9.8;
    const t = (performance.now() - this.prevT)/1000.0;
    this.prevT = performance.now();
    this.prevTB = true;
    this.verticalVelocity += gravity * t;
    const cubeX = this.chunk.cubePositions()[cubeIndex + 0];
    const cubeZ = this.chunk.cubePositions()[cubeIndex + 2];
    const playerY = this.playerPosition.y - 2;
    this.playerPosition.y = Math.max(playerY + this.verticalVelocity * t, this.chunk.cubePositions()[cubeIndex + 1] + 0.5) + 2;
    const aboveY = this.chunk.cubeMap[cubeX + "," + cubeZ].sort().find((y) => y > playerY);
    if (aboveY) {
      this.playerPosition.y = Math.min(this.playerPosition.y, aboveY - 0.5);
    }
    if (this.playerPosition.y - 2 == this.chunk.cubePositions()[cubeIndex + 1] + 0.5) {
      this.cancelFall();
    }
  }

  private cancelFall() {
    this.verticalVelocity = 0;
  }

  private walking() {
    return !this.gui.walkDir().equals(new Vec3());
  }

  private walk(cubeIndex: number): [number, number] {
    const cubeX = this.chunk.cubePositions()[cubeIndex + 0];
    const cubeZ = this.chunk.cubePositions()[cubeIndex + 2];
    const walkX = this.gui.walkDir().x;
    const walkZ = this.gui.walkDir().z;
    const offset = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (let i = 0; i < offset.length; i++) {
      const key = (cubeX + offset[i][0]) + "," + (cubeZ + offset[i][1]);
      const neighbors = this.chunk.cubeMap[key];
      if (!isNullOrUndefined(neighbors.find((height) => height + 0.5 > this.playerPosition.y - 2 && height - 0.5 < this.playerPosition.y))) {
        if (i < 2) {
          if (offset[i][0] < 0 && walkX < 0)
            return [0, 0];
          if (offset[i][0] > 0 && walkX > 0)
            return [0, 0];
        }
        else {
          if (offset[i][1] < 0 && walkZ < 0)
            return [0, 0];
          if (offset[i][1] > 0 && walkZ > 0)
            return [0, 0];
        }
      }
    }
    return [walkX, walkZ];
  }

  private on(x: number, z:number): boolean {
    const playerX = this.playerPosition.x;
    const playerZ = this.playerPosition.z;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (playerX + 0.4 * dx > x - 0.5 && playerX + 0.4 * dx < x + 0.5 && playerZ + 0.4 * dz > z - 0.5 && playerZ + 0.4 * dz < z + 0.5) {
          return true;
        }
      }
    }
    return false;
  }

  private findSupportingCubes() {
    const playerX = this.playerPosition.x;
    const playerY = this.playerPosition.y - 2;
    const playerZ = this.playerPosition.z;
    const cubeX = Math.round(playerX);
    const cubeZ = Math.round(playerZ);
    let cubeIndexes: number[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const newX = cubeX + dx;
        const newZ = cubeZ + dz;
        if (this.on(newX, newZ)) {
          const key = newX + "," + newZ;
          const heights = this.chunk.cubeMap[key];
          const maxHeight = heights.reduce((max, height) => {
            if (max + 0.5 > playerY) {
              max = -Infinity;
            }
            if (height + 0.5 <= playerY) {
              return Math.max(max, height)
            }
            else return max;
          });
          if (maxHeight != -Infinity)
            cubeIndexes.push(this.chunk.indexMap[key][maxHeight]);
        }
      }
    }
    return cubeIndexes;
  }

  private move() {
    const cubeIndexes = this.findSupportingCubes();
    if (cubeIndexes.length == 0) {
      console.log("cannot find supporting cube");
    }
    else {
      const maxHeightCubeIndex = cubeIndexes.reduce((max, height) => {
        return Math.max(max, height);
      });
      if (this.canFall(maxHeightCubeIndex)) {
        this.fall(maxHeightCubeIndex);
      }
      if (this.walking()) {
        let diffX = NaN;
        let diffZ = NaN;
        cubeIndexes.forEach((cubeIndex) => {
          const diff = this.walk(cubeIndex);
          if (Number.isNaN(diffX) && Number.isNaN(diffZ)) {
            diffX = diff[0];
            diffZ = diff[1];
          }
          else {
            if (diffX == 0 && diffZ == 0) {
              return;
            }
            diffX = diff[0];
            diffZ = diff[1];
          }
        })
        this.playerPosition.x += diffX;
        this.playerPosition.z += diffZ;
      }
    }
  }

  private getChunkCoords(x: number, z: number): [number, number] {
    let cX: number = NaN;
    let cZ: number = NaN;
    if(x < 0)
    {
      cX = Math.ceil((x - 32) / 64);
    }
    else cX = Math.floor((x + 32) / 64);
    if(z < 0)
    {
      cZ = Math.ceil((z - 32) / 64);
    }
    else cZ = Math.floor((z + 32) / 64);
    return [cX, cZ];
  }

  private regenerate() {
    this.chunk = new Chunk(this.loadedCX, this.loadedCY, 64, true, true);
    const offset = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 0], [0, 1], [1, -1], [1, 0], [1, 1]]
    for (let i = 0; i < offset.length; i++) {
      const key = (this.loadedCX + offset[i][0]) + "," + (this.loadedCY + offset[i][1]);
      if (!isNullOrUndefined(this.modificationKeys[key])) {
        this.modificationKeys[key].forEach((modificationCube) => {
          const modificationKey = modificationCube[0] + "," + modificationCube[1] + "," + modificationCube[2];
          const modification = this.modifications[key][modificationKey];
          switch (modification) {
            case "ADD": this.chunk.addCube(modificationCube[0], modificationCube[1], modificationCube[2]); break;
            case "REMOVE": this.chunk.removeCube(modificationCube[0], modificationCube[1], modificationCube[2]); break;
          }
        });
      }
    }
    this.chunk.generateCubePositions();
  }

  /**
   * Draws a single frame
   *
   */
  public draw(): void {
    //TODO: Logic for a rudimentary walking simulator. Check for collisions and reject attempts to walk into a cube. Handle gravity, jumping, and loading of new chunks when necessary.
    this.move();
    this.gui.getCamera().setPos(this.playerPosition);
    const chunkCoords = this.getChunkCoords(this.playerPosition.x, this.playerPosition.z);
    this.playerCX = chunkCoords[0];
    this.playerCY = chunkCoords[1];
    if(this.playerCX != this.loadedCX || this.playerCY != this.loadedCY)
    {
      this.loadedCX = this.playerCX;
      this.loadedCY = this.playerCY;
      this.regenerate();
    }

    // Drawing
    const gl: WebGLRenderingContext = this.ctx;
    const bg: Vec4 = this.backgroundColor;
    gl.clearColor(bg.r, bg.g, bg.b, bg.a);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    gl.frontFace(gl.CCW);
    gl.cullFace(gl.BACK);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null); // null is the default frame buffer
    this.drawScene(0, 0, 1280, 960);      
    if(!this.prevTB) this.prevT = performance.now();
    this.prevTB = false;
  }

  private drawScene(x: number, y: number, width: number, height: number): void {
    const gl: WebGLRenderingContext = this.ctx;
    gl.viewport(x, y, width, height);
    //TODO: Render multiple chunks around the player, using Perlin noise shaders
    this.blankCubeRenderPass.updateAttributeBuffer("aOffset", this.chunk.cubePositions());
    this.blankCubeRenderPass.updateAttributeBuffer("type", this.chunk.types());
    this.blankCubeRenderPass.drawInstanced(this.chunk.numCubes());    

  }

  public getGUI(): GUI {
    return this.gui;
  }  

  private intersectBoundingBox(pos: Vec3, rayDir: Vec3, boundingBox: [[number, number, number], [number, number, number]]): number {
    let tMin = -Infinity;
    let tMax = Infinity;
    let ttemp;

    for (let currentaxis = 0; currentaxis < 3; currentaxis++) {
      let vd = rayDir.at(currentaxis);
      // if the ray is parallel to the face's plane (=0.0)
      if (vd == 0.0)
        continue;
      const v1 = boundingBox[0][currentaxis] - pos.at(currentaxis);
      const v2 = boundingBox[1][currentaxis] - pos.at(currentaxis);
      // two slab intersections
      let t1 = v1 / vd;
      let t2 = v2 / vd;
      if (t1 > t2) { // swap t1 & t2
      ttemp = t1;
      t1    = t2;
      t2    = ttemp;
      }
      if (t1 > tMin)
      tMin = t1;
      if (t2 < tMax)
      tMax = t2;
      if (tMin > tMax)
        return Infinity; // box is missed
      if (tMax < 1e-7)
        return Infinity; // box is behind ray
    }
    return tMin;
  }
  
  private intersectedCube(rayDir: Vec3): [number, number] {
    let minT = Infinity;
    let intersectedCubeIndex = NaN;
    this.chunk.cubePositions().forEach((_, index) => {
      if (index % 4 == 0) {
        const boundingBox: [[number, number, number], [number, number, number]] = [[this.chunk.cubePositions()[index + 0] - 0.5, this.chunk.cubePositions()[index + 1] - 0.5, this.chunk.cubePositions()[index + 2] - 0.5], [this.chunk.cubePositions()[index + 0] + 0.5, this.chunk.cubePositions()[index + 1] + 0.5, this.chunk.cubePositions()[index + 2] + 0.5]];
        const tMin = this.intersectBoundingBox(this.playerPosition, rayDir, boundingBox);
        if (tMin < minT) {
          minT = tMin;
          intersectedCubeIndex = index;
        }
      }
    });
    return [intersectedCubeIndex, minT];
  }

  public mine(rayDir: Vec3) {
    const intersectedCubeIndex = this.intersectedCube(rayDir)[0];
    if (!Number.isNaN(intersectedCubeIndex)) {
      const x = this.chunk.cubePositions()[intersectedCubeIndex + 0];
      const y = this.chunk.cubePositions()[intersectedCubeIndex + 1];
      const z = this.chunk.cubePositions()[intersectedCubeIndex + 2];
      const chunkCoords = this.getChunkCoords(x, z);
      const chunkKey = chunkCoords[0] + "," + chunkCoords[1];
      console.log("chunk coords " + chunkKey);
      if (y > 0) {
        const modificationKey = x + "," + y + "," + z;
        if (isNullOrUndefined(this.modificationKeys[chunkKey])) {
          this.modificationKeys[chunkKey] = [];
        }
        this.modificationKeys[chunkKey].push([x, y, z]);
        if (isNullOrUndefined(this.modifications[chunkKey])) {
          this.modifications[chunkKey] = {};
        }
        if (isNullOrUndefined(this.modifications[chunkKey][modificationKey])) {
          this.modifications[chunkKey][modificationKey] = "REMOVE";
        }
        else {
          this.modifications[chunkKey][modificationKey] = undefined;
        }
        // console.log("modificationKey " + modificationKey)
        // console.log("set modification " + this.modifications[chunkKey][modificationKey])
        this.chunk.removeCube(x, y, z);
        const offset = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        // console.log(y)
        for (let i = 0; i < offset.length; i++) {
          const neighborX = x + offset[i][0];
          const neighborZ = z + offset[i][1];
          const neighborKey = neighborX + "," + neighborZ;
          const neighbors = this.chunk.cubeMap[neighborKey].sort();
          const maxHeight = neighbors[neighbors.length - 1];
          console.log(neighbors)
          let removed = false;
          const neighborChunkCoords = this.getChunkCoords(x, z);
          const neighborChunkKey = neighborChunkCoords[0] + "," + neighborChunkCoords[1];
        //   console.log("neighbor chunk coords " + neighborChunkKey);
          const target = neighborX + "," + y + "," + neighborZ;
          if (!isNullOrUndefined(this.modifications[neighborChunkKey])) {
            console.log(this.modifications[neighborChunkKey][target]);
            removed = this.modifications[neighborChunkKey][target] == "REMOVE";
          }
          console.log("maxHeight " + maxHeight);
          console.log("removed " + removed);
          if (maxHeight > y && !removed) {
            console.log("add");
            if (isNullOrUndefined(this.modificationKeys[neighborChunkKey])) {
              this.modificationKeys[neighborChunkKey] = [];
            }
            this.modificationKeys[neighborChunkKey].push([neighborX, y, neighborZ]);
            const modificationKey = neighborX + "," + y + "," + neighborZ;
            this.modifications[neighborChunkKey][modificationKey] = "ADD";
            this.chunk.addCube(neighborX, y, neighborZ);
          }
        }
        const key = x + "," + z;
        const newModificationKey = x + "," + (y - 1) + "," + z;
        const removed = this.modifications[chunkKey][newModificationKey] == "REMOVE";
        console.log("removed1 " + removed);
        if (isNullOrUndefined(this.chunk.indexMap[key][y - 1]) && !removed) {
          console.log("add");
          this.modificationKeys[chunkKey].push([x, y-1, z]);
          this.modifications[chunkKey][newModificationKey] = "ADD";
          this.chunk.addCube(x, y - 1, z);
        }
        this.inventory++;
        this.updateInventory();
        this.chunk.generateCubePositions();
      }
    }
    
  }

  public placeBlock(rayDir: Vec3) {
    if (this.inventory > 0) {
      const cubeIntersection = this.intersectedCube(rayDir)
      const intersectedCubeIndex = cubeIntersection[0];
      if (!Number.isNaN(intersectedCubeIndex)) {
        const x = this.chunk.cubePositions()[intersectedCubeIndex + 0];
        const y = this.chunk.cubePositions()[intersectedCubeIndex + 1];
        const z = this.chunk.cubePositions()[intersectedCubeIndex + 2];
        const minT = cubeIntersection[1];
        const intersectionPoint = this.playerPosition.copy().add(rayDir.copy().scale(minT));
        let offset: [number, number, number] = [0, 0, 0];
        if (Math.abs(intersectionPoint.x - (x - 0.5)) < 1e-7) {
          offset = [-1, 0, 0];
        }
        else if (Math.abs(intersectionPoint.x - (x + 0.5)) < 1e-7) {
          offset = [1, 0, 0];
        }
        else if (Math.abs(intersectionPoint.y - (y - 0.5)) < 1e-7) {
          offset = [0, -1, 0];
        }
        else if (Math.abs(intersectionPoint.y - (y + 0.5)) < 1e-7) {
          offset = [0, 1, 0];
        }
        else if (Math.abs(intersectionPoint.z - (z - 0.5)) < 1e-7) {
          offset = [0, 0, -1];
        }
        else if (Math.abs(intersectionPoint.z - (z + 0.5)) < 1e-7) {
          offset = [0, 0, 1];
        }
        const newX = x + offset[0];
        const newY = y + offset[1];
        const newZ = z + offset[2];
        const chunkCoords = this.getChunkCoords(newX, newZ);
        const key = chunkCoords[0] + "," + chunkCoords[1];
        if (Math.sqrt(Math.pow(intersectionPoint.x - this.playerPosition.x, 2) + Math.pow(intersectionPoint.z - this.playerPosition.z, 2)) >= 0.4) {
          if (this.on(newX, newZ)) {
            if (this.playerPosition.y > newY - 0.5) {
              return;
            }
            if (this.playerPosition.y - 2 < newY + 0.5) {
              this.playerPosition.y++;
            }
          }
          const modificationKey = newX + "," + newY + "," + newZ;
          if (isNullOrUndefined(this.modificationKeys[key])) {
            this.modificationKeys[key] = [];
          }
          this.modificationKeys[key].push([x, y, z]);
          if (isNullOrUndefined(this.modifications[key])) {
            this.modifications[key] = {};
          }
          if (isNullOrUndefined(this.modifications[key][modificationKey])) {
            this.modifications[key][modificationKey] = "ADD";
          }
          else {
            this.modifications[key][modificationKey] = undefined;
          }
          this.chunk.addCube(newX, newY, newZ);
          this.inventory--;
          this.updateInventory();
          this.chunk.generateCubePositions();
        }

      }
    }
  }
  
  public jump() {
    //TODO: If the player is not already in the lair, launch them upwards at 10 units/sec.
    if (this.verticalVelocity == 0) {
      this.verticalVelocity = 10;
    }
  }
}

export function initializeCanvas(): void {
  const canvas = document.getElementById("glCanvas") as HTMLCanvasElement;
  /* Start drawing */
  const canvasAnimation: MinecraftAnimation = new MinecraftAnimation(canvas);
  canvasAnimation.start();  
}
