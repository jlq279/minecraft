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

  private canFall(playerY: number, height: number): boolean {
    return playerY > height || this.verticalVelocity != 0;
  }

  private fall(playerY: number, height: number) {
    // TODO: more accurate check for which block is under the player (make sure it's supporting the 0.4r cylinder)
    const gravity = -9.8;
    const t = (Date.now() - this.prevT)/1000.0;
    this.verticalVelocity += gravity * t;
    this.playerPosition.y = Math.max(playerY + this.verticalVelocity * t, height) + 2;
    if (this.playerPosition.y == height + 2) {
      this.cancelFall();
    }
  }

  private cancelFall() {
    this.verticalVelocity = 0;
  }

  private walk(row: number, col: number) {
    const playerX = this.playerPosition.x;
    const playerY = this.playerPosition.y - 2;
    const playerZ = this.playerPosition.z;
    const walkX = this.gui.walkDir().x;
    const walkZ = this.gui.walkDir().z;
    let diffX = 0;
    let diffZ = 0;
    if (walkX > 0) {
      const right = row * 192 + (col + 1);
      const rightX = this.chunk.cubePositions()[4 * right + 0];
      const rightHeight = this.chunk.cubePositions()[4 * right + 1];
      if (playerY >= rightHeight) {
        diffX = walkX;
      }
      else {
        diffX = Math.min(walkX, Math.max((rightX - 0.9) - playerX, 0));
      }
    }
    else if (walkX < 0) {
      const left = row * 192 + (col - 1);
      const leftX = this.chunk.cubePositions()[4 * left + 0];
      const leftHeight = this.chunk.cubePositions()[4 * left + 1];
      if (playerY >= leftHeight) {
        diffX = walkX;
      }
      else {
        diffX = Math.max(walkX, Math.min((leftX + 0.9) - playerX, 0));
      }
    }
    if (walkZ > 0) {
      const bottom = (row + 1) * 192 + col;
      const bottomZ = this.chunk.cubePositions()[4 * bottom + 2];
      const bottomHeight = this.chunk.cubePositions()[4 * bottom + 1];
      if (playerY >= bottomHeight) {
        diffZ = walkZ;
      }
      else {
        diffZ = Math.min(walkZ, Math.max((bottomZ - 0.9) - playerZ, 0));
      }
    }
    else if (walkZ < 0) {
      const top = (row - 1) * 192 + col;
      const topZ = this.chunk.cubePositions()[4 * top + 2];
      const topHeight = this.chunk.cubePositions()[4 * top + 1];
      if (playerY >= topHeight) {
        diffZ = walkZ;
      }
      else {
        diffZ = Math.max(walkZ, Math.min((topZ + 0.9) - playerZ, 0));
      }
    }
    if (!((walkX != 0 && diffX == 0) || (walkZ != 0 && diffZ == 0))) {
      this.playerPosition.x += diffX;
      this.playerPosition.z += diffZ;
    }
  }

  private move() {
    const topleftx = this.chunk.topleftx;
    const toplefty = this.chunk.toplefty;
    const playerX = this.playerPosition.x;
    const playerY = this.playerPosition.y - 2;
    const playerZ = this.playerPosition.z;
    const col = Math.round(playerX - topleftx);
    const row = Math.round(playerZ - toplefty);
    const idx = row * 192 + col;
    const height = this.chunk.cubePositions()[4 * idx + 1];
    if (this.canFall(playerY, height)) {
      this.fall(playerY, height);
    }
    this.walk(row, col);
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
