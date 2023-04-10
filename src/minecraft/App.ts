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
  private playerCX: number;
  private playerCY: number;
  private loadedCX: number;
  private loadedCY: number;

  private removed:{[chunk: number]: [number, number, number][]} = {};
  private added:{[chunk: number]: [number, number, number][]} = {};
  
  
  constructor(canvas: HTMLCanvasElement) {
    super(canvas);

    this.canvas2d = document.getElementById("textCanvas") as HTMLCanvasElement;
  
    this.ctx = Debugger.makeDebugContext(this.ctx);
    let gl = this.ctx;
        
    this.gui = new GUI(this.canvas2d, this);
    this.playerPosition = this.gui.getCamera().pos();

    this.verticalVelocity = 0;
    this.prevT = Date.now();

    // Generate initial landscape
    this.chunk = new Chunk(0.0, 0.0, 64, true, true);
    this.playerCX = 0;
    this.playerCY = 0;
    this.loadedCX = 0;
    this.loadedCY = 0;

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
    const t = (Date.now() - this.prevT)/1000.0;
    this.verticalVelocity += gravity * t;
    const playerY = this.playerPosition.y - 2;
    this.playerPosition.y = Math.max(playerY + this.verticalVelocity * t, this.chunk.cubePositions()[cubeIndex + 1] + 0.5) + 2;
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

  private walk(cubeIndex: number) {
    const cubeX = this.chunk.cubePositions()[cubeIndex + 0];
    const cubeZ = this.chunk.cubePositions()[cubeIndex + 2];
    const walkX = this.gui.walkDir().x;
    const walkZ = this.gui.walkDir().z;
    let diffX = 0;
    let diffZ = 0;
    const offset = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (let i = 0; i < offset.length; i++) {
      const key = (cubeX + offset[i][0]) + "," + (cubeZ + offset[i][1]);
      const neighbors = this.chunk.cubeMap[key];
      if (!isNullOrUndefined(neighbors.find((height) => height + 0.5 > this.playerPosition.y - 2 && height - 0.5 < this.playerPosition.y))) {
        if (i < 2) {
          if (offset[i][0] < 0 && walkX < 0)
            return;
          if (offset[i][0] > 0 && walkX > 0)
            return;
        }
        else {
          if (offset[i][1] < 0 && walkZ < 0)
            return;
          if (offset[i][1] > 0 && walkZ > 0)
            return;
        }
      }
      else {
        if (i < 2) diffX = walkX;
        else diffZ = walkZ;
      }
    }
    if (!((walkX != 0 && diffX == 0) || (walkZ != 0 && diffZ == 0))) {
      this.playerPosition.x += diffX;
      this.playerPosition.z += diffZ;
    }
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

  private findSupportingCube() {
    const playerX = this.playerPosition.x;
    const playerY = this.playerPosition.y - 2;
    const playerZ = this.playerPosition.z;
    const cubeX = Math.round(playerX);
    const cubeZ = Math.round(playerZ);
    let cubeIndex: number = -Infinity;
    let maxHeight = -Infinity;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const newX = cubeX + dx;
        const newZ = cubeZ + dz;
        if (this.on(newX, newZ)) {
          const key = newX + "," + newZ;
          const heights = this.chunk.cubeMap[key];
          console.log("key " + key);
          heights.forEach((height) => {
            if (height + 0.5 <= playerY && height > maxHeight) {
              maxHeight = height;
              cubeIndex = this.chunk.indexMap[key][height];
            }
          });
        }
      }
    }
    return cubeIndex;
  }

  private move() {
    const cubeIndex = this.findSupportingCube();
    if (cubeIndex == -Infinity) {
      console.log(cubeIndex);
    }
    else {
      if (this.canFall(cubeIndex)) {
        this.fall(cubeIndex);
      }
      if (this.walking()) {
        this.walk(cubeIndex);
      }
    }
  }

  /**
   * Draws a single frame
   *
   */
  public draw(): void {
    //TODO: Logic for a rudimentary walking simulator. Check for collisions and reject attempts to walk into a cube. Handle gravity, jumping, and loading of new chunks when necessary.
    this.move();
    this.gui.getCamera().setPos(this.playerPosition);
    if(this.playerPosition.x < 0)
    {
      this.playerCX = Math.ceil((this.playerPosition.x - 32) / 64);
    }
    else this.playerCX = Math.floor((this.playerPosition.x + 32) / 64);
    if(this.playerPosition.z < 0)
    {
      this.playerCY = Math.ceil((this.playerPosition.z - 32) / 64);
    }
    else this.playerCY = Math.floor((this.playerPosition.z + 32) / 64);

    if(this.playerCX != this.loadedCX || this.playerCY != this.loadedCY)
    {
      this.loadedCX = this.playerCX;
      this.loadedCY = this.playerCY;
      this.chunk = new Chunk(this.loadedCX, this.loadedCY, 64, true, true);
      // console.log("x " + this.playerCX);
      // console.log("y " + this.playerCY);
      // console.log("px " + this.playerPosition.x);
      // console.log("py " + this.playerPosition.z);
      const idx = this.loadedCY * 3 + this.loadedCX;
      if (!isNullOrUndefined(this.removed[idx])) {
        this.removed[idx].forEach((cube) => {
          this.chunk.removeCube(cube[0], cube[1], cube[2]);
        });
      }
      if (!isNullOrUndefined(this.added[idx])) {
        this.added[idx].forEach((cube) => {
          this.chunk.addCube(cube[0], cube[1], cube[2]);
        });
      }
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
    this.prevT = Date.now();
  }

  private drawScene(x: number, y: number, width: number, height: number): void {
    const gl: WebGLRenderingContext = this.ctx;
    gl.viewport(x, y, width, height);
    //TODO: Render multiple chunks around the player, using Perlin noise shaders
    this.blankCubeRenderPass.updateAttributeBuffer("aOffset", this.chunk.cubePositions());
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
  
  private intersectedCube(rayDir: Vec3): number {
    let minT = Infinity;
    let intersectedCubeIndex = -1;
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
    console.log("intersected " + this.chunk.cubePositions()[intersectedCubeIndex + 0], this.chunk.cubePositions()[intersectedCubeIndex + 1], this.chunk.cubePositions()[intersectedCubeIndex + 2])
    return intersectedCubeIndex;
  }

  public mine(rayDir: Vec3) {
    let intersectedCubeIndex = this.intersectedCube(rayDir);
    const x = this.chunk.cubePositions()[intersectedCubeIndex + 0];
    const y = this.chunk.cubePositions()[intersectedCubeIndex + 1];
    const z = this.chunk.cubePositions()[intersectedCubeIndex + 2];
    const idx = this.loadedCY * 3 + this.loadedCX;
    const key = x + "," + z;
    if (isNullOrUndefined(this.removed[idx])) {
      this.removed[idx] = [];
    }
    this.removed[idx].push([x, y, z]);
    this.chunk.removeCube(x, y, z);
    if (this.chunk.cubeMap[key].length == 0 || !this.chunk.cubeMap[key].find((height) => height < y)) {
      if (isNullOrUndefined(this.added[idx])) {
        this.added[idx] = [];
      }
      this.added[idx].push([x, y - 1, z]);
      this.chunk.addCube(x, y - 1, z);
    }
    const offset = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (let i = 0; i < offset.length; i++) {
      const neighborX = x + offset[i][0];
      const neighborZ = z + offset[i][1];
      const neighborKey = neighborX + "," + neighborZ;
      const neighbors = this.chunk.cubeMap[neighborKey];
      let maxHeight = -Infinity;
      let minHeight = Infinity;
      neighbors.forEach((height) => {
        minHeight = Math.min(minHeight, height);
      });
      neighbors.forEach((height) => {
        if (height <= y + 1) {
          maxHeight = Math.max(maxHeight, height);
        }
      });
      
      if ((maxHeight >= y || minHeight >= y) && !neighbors.find((neighborY) => neighborY == y) && !this.removed[idx].find((cube) => cube[0] == neighborX && cube[1] == y && cube[2] == neighborZ)) {
        if (isNullOrUndefined(this.added[idx])) {
          this.added[idx] = [];
        }
        this.added[idx].push([neighborX, y, neighborZ]);
        this.chunk.addCube(neighborX, y, neighborZ);
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
