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

export class InventoryBlock {
  private ctx: CanvasRenderingContext2D;
  private x: number;
  private y: number;
  private inventory: number;
  private type: "GRASS" | "DIRT" | "MARBLE";
  private image: HTMLImageElement;
  private loaded: boolean = false;
  private selected: boolean = false;
  constructor(ctx: CanvasRenderingContext2D, x: number, y: number, type: "GRASS" | "DIRT" | "MARBLE", src: string, size: number) {
    this.ctx = ctx;
    this.x = x;
    this.y = y;
    this.inventory = 0;
    this.type = type;
    this.image = new Image(size, size);
    this.image.src = src;
    this.image.onload = (e) => {
      this.draw();
      this.loaded = true;
    };
  }
  public updateInventory(count: number) {
    this.inventory = count;
  }
  public hover(mouseX: number, mouseY: number): boolean {
    if (mouseX >= this.x && mouseX < this.x + this.image.width && mouseY >= this.y && mouseY < this.y + this.image.height) {
      this.drawBorder();
      return true;
    }
    else if (!this.selected) {
      this.clearBorder();
    }
    return false;
  }
  public imageLoaded() {
    return this.loaded;
  }
  public draw() {
    this.ctx.drawImage(this.image, this.x, this.y, this.image.width, this.image.height);
    this.ctx.fillText(`${this.inventory}`, this.x + 78, this.y + 90);
  }
  public drawBorder() {
    this.ctx.strokeStyle = "rgba(255.0, 0, 0, 1.0)";
    this.ctx.strokeRect(this.x, this.y, this.image.width, this.image.height);
  }
  public clearBorder() {
    this.ctx.clearRect(this.x-1, this.y-1, this.image.width+2, this.image.height+2);
    this.draw();
  }
  public select() {
    this.selected = true;
    this.drawBorder();
  }
  public deselect() {
    this.selected = false;
    this.clearBorder();
  }
  public getType() {
    return this.type;
  }
  public getSelected() {
    return this.selected;
  }
}

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
  private inventory: {[blockType: string]: number} = {};
  private selectedBlockType: "GRASS" | "DIRT" | "MARBLE" | undefined = undefined;
  private inventoryBlocks: InventoryBlock[];

  private updateInventory() {
    const hudContext = this.canvas2d.getContext("2d") || new CanvasRenderingContext2D();
    hudContext.clearRect(0, 0, this.canvas2d.width, this.canvas2d.height);
    hudContext.fillStyle = "rgba(255.0, 255.0, 255.0, 0.5)";
    hudContext.fillRect(0, 0, 408, 200)
    hudContext.fillStyle = "rgba(1.0, 1.0, 1.0, 1.0)";
    hudContext.font = "36px monospace"
    let x = 48;
    let y = 48;
    hudContext.fillText("Inventory", x, y);
    hudContext.font = "24px monospace"
    this.inventoryBlocks.forEach((inventoryBlock) => {
      inventoryBlock.updateInventory(this.inventory[inventoryBlock.getType()]);
      inventoryBlock.draw();
      if (inventoryBlock.getSelected()) {
        inventoryBlock.drawBorder();
      }
    });
  }
  
  constructor(canvas: HTMLCanvasElement) {
    super(canvas);

    this.canvas2d = document.getElementById("textCanvas") as HTMLCanvasElement;
    this.inventory["GRASS"] = 0;
    this.inventory["DIRT"] = 0;
    this.inventory["MARBLE"] = 0;
    const x = 48;
    const y = 72;
    const size = 96;
    const margin = 12;
    const ctx = this.canvas2d.getContext("2d") || new CanvasRenderingContext2D();
    const grassBlock = new InventoryBlock(ctx, x, y, "GRASS", "/static/assets/grassblock.png", size);
    const dirtBlock = new InventoryBlock(ctx, x + size + margin, y, "DIRT", "/static/assets/dirtblock.png", size);
    const marbleBlock = new InventoryBlock(ctx, x + (size + margin) * 2, y, "MARBLE", "/static/assets/marbleblock.png", size);
    this.inventoryBlocks = [grassBlock, dirtBlock, marbleBlock];
    this.updateInventory();
    this.ctx = Debugger.makeDebugContext(this.ctx);
    let gl = this.ctx;
        
    this.gui = new GUI(this.canvas2d, this, this.inventoryBlocks);
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
      const key = x + "," + z;
      const chunkCoords = this.getChunkCoords(x, z);
      const chunkKey = chunkCoords[0] + "," + chunkCoords[1];
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
        this.chunk.removeCube(x, y, z);
        const biome = this.chunk.cubeTypeMap[key][y];
        if (biome >  5.0) this.inventory["MARBLE"]++;
        else if(biome > 3.0) this.inventory["DIRT"]++;
        else this.inventory["GRASS"]++;
        
        this.updateInventory();
        this.chunk.generateCubePositions();
      }
    }
    
  }

  public selectBlockType(blockType: "GRASS"|"DIRT"|"MARBLE") {
    this.selectedBlockType = blockType;
    this.inventoryBlocks.forEach((inventoryBlock) => {
      if (inventoryBlock.getType() == this.selectedBlockType) {
        inventoryBlock.select();
      }
      else {
        inventoryBlock.deselect();
      }
    })
  }

  public placeBlock(rayDir: Vec3) {
    if (!isNullOrUndefined(this.selectedBlockType) && this.inventory[this.selectedBlockType] > 0) {
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
          switch (this.selectedBlockType) {
            case "GRASS": this.chunk.cubeTypeMap[newX + "," + newZ][newY] = 0; break;
            case "DIRT": this.chunk.cubeTypeMap[newX + "," + newZ][newY] = 5; break;
            case "MARBLE": this.chunk.cubeTypeMap[newX + "," + newZ][newY] = 8; break;
          }
          this.inventory[this.selectedBlockType]--;
          if (this.inventory[this.selectedBlockType] == 0) {
            this.inventoryBlocks.forEach((inventoryBlock) => {
              inventoryBlock.deselect();
            })
            this.selectedBlockType = undefined;
          }
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
