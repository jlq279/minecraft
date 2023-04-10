export const blankCubeVSText = `
    precision mediump float;

    uniform vec4 uLightPos;    
    uniform mat4 uView;
    uniform mat4 uProj;
    
    attribute vec4 aNorm;
    attribute vec4 aVertPos;
    attribute vec4 aOffset;
    attribute vec2 aUV;
    
    varying vec4 normal;
    varying vec4 wsPos;
    varying vec2 uv;
    varying float seed;

    

    void main () {

        gl_Position = uProj * uView * (aVertPos + aOffset);
        wsPos = aVertPos + aOffset;
        normal = normalize(aNorm);
        uv = aUV;
        float val = aOffset.x * 100.0 + aOffset.y * 10.0 + aOffset.z + normal.x * 0.1 + normal.y * 0.01 + normal.z * 0.001;
        seed = sin(val);

    }
`;

export const blankCubeFSText = `
    precision mediump float;

    uniform vec4 uLightPos;
    
    varying vec4 normal;
    varying vec4 wsPos;
    varying vec2 uv;
    varying float seed;
    
    float random (in vec2 pt, in float seed) {
        return fract(sin( (seed + dot(pt.xy, vec2(12.9898,78.233))))*43758.5453123);
    }
        
    vec2 unit_vec(in vec2 xy, in float seed) {
        float theta = 6.28318530718*random(xy, seed);
        return vec2(cos(theta), sin(theta));
    }

    float smoothmix(float a0, float a1, float w) {
        return (a1 - a0) * (3.0 - w * 2.0) * w * w + a0;
    }

    void main() {
        
        
        float gridX = floor(uv.x * 8.0) / 8.0 + 1.0 / 16.0;
        float gridY = floor(uv.y * 8.0) / 8.0 + 1.0 / 16.0;
        vec2 tLVec = vec2(gridX, gridY);
        vec2 bLVec = vec2(gridX, -1.0 * gridY);
        vec2 tRVec = vec2(-1.0 * gridX, gridY);
        vec2 bRVec = vec2(-1.0 * gridX, -1.0 * gridY);

        

        vec2 i0 = vec2(gridX, gridY);
        vec2 c0 = unit_vec(i0, seed);
        float tLF = dot(tLVec, c0);
        float bLF = dot(bLVec, c0);
        float tRF = dot(tRVec, c0);
        float bRF = dot(bRVec, c0);

        // vec2 i1 = vec2(1.0, 0.0);
        // vec2 c1 = unit_vec(i1, seed);
        // vec2 i2 = vec2(1.0, 1.0);
        // vec2 c2 = unit_vec(i2, seed);
        // vec2 i3 = vec2(0.0, 1.0);
        // vec3 c3 = unit_vec(i3, seed);

        float top = smoothmix(tLF, tRF, gridX);
        float bot = smoothmix(bLF, bRF, gridX);
        float val = smoothmix(top, bot, gridY);
        


        vec3 kd = vec3(val, val, val);
        vec3 ka = vec3(0.1, 0.1, 0.1);

        /* Compute light fall off */
        vec4 lightDirection = uLightPos - wsPos;
        float dot_nl = dot(normalize(lightDirection), normalize(normal));
	    dot_nl = clamp(dot_nl, 0.0, 1.0);
	
        gl_FragColor = vec4(clamp(ka + dot_nl * kd, 0.0, 1.0), 1.0);
    }
`;

