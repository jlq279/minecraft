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

    
    // float OGval(in float x, in float y, in float seed)
    // {
    //     float gridX = x / 8.0 + 1.0 / 16.0;
    //     float gridY = y / 8.0 + 1.0 / 16.0;
    //     vec2 tLVec = vec2(gridX, gridY);
    //     vec2 bLVec = vec2(gridX, -1.0 * gridY);
    //     vec2 tRVec = vec2(-1.0 * gridX, gridY);
    //     vec2 bRVec = vec2(-1.0 * gridX, -1.0 * gridY);
    //     vec2 i0 = vec2(gridX, gridY);
    //     vec2 c0 = unit_vec(i0, seed);
    //     float tLF = dot(tLVec, c0);
    //     float bLF = dot(bLVec, c0);
    //     float tRF = dot(tRVec, c0);
    //     float bRF = dot(bRVec, c0);

    //     float top = smoothmix(tLF, tRF, gridX);
    //     float bot = smoothmix(bLF, bRF, gridX);
    //     float val = smoothmix(top, bot, gridY);
    //     return val;
    // }

    // float perlin(in float x, in float y, in float seed)
    // {
        

    //     float gridX = floor(x * 8.0);
    //     float gridY = floor(y * 8.0);
    //     float gridX2 = gridX;
    //     float gridY2 = gridY;
    //     if(x > gridX / 8.0 + 1.0 / 16.0) gridX2 = gridX + 1.0;
    //     else gridX = gridX - 1.0; 

    //     if(y > gridY / 8.0 + 1.0 / 16.0) gridY2 = gridY + 1.0;
    //     else gridY = gridY - 1.0;

        
    //     float og00 = OGval(gridX, gridY, seed);
    //     float og10 = OGval(gridX2, gridY, seed);
    //     float og01 = OGval(gridX, gridY2, seed);
    //     float og11 = OGval(gridX2, gridY2, seed);

    //     float nx = (x - (gridX / 8.0 + 1.0 / 16.0)) * 8.0;
    //     float ny = (y - (gridY / 8.0 + 1.0 / 16.0)) * 8.0;

    //     float nValt = smoothmix(og00, og10, nx);
    //     float nValb = smoothmix(og01, og11, nx);
    //     float nVal = smoothmix(nValt, nValb, ny);

    //     float cnVal = clamp(nVal, 0.0, 1.0);
    //     return cnVal * 0.1;
        
    // }


    float OGval(in float x, in float y, in float seed, in float parts, in float ox, in float oy)
    {
        // float gridX = x / parts + 1.0 / (2.0 * parts);
        // float gridY = y / parts + 1.0 / (2.0 * parts);
        // float gridX = x / parts;
        // float gridY = y / parts;
        // vec2 tLVec = vec2(gridX, gridY);
        // vec2 bLVec = vec2(gridX, -1.0 * gridY);
        // vec2 tRVec = vec2(-1.0 * gridX, gridY);
        // vec2 bRVec = vec2(-1.0 * gridX, -1.0 * gridY);
        // vec2 i0 = vec2(gridX, gridY);
        // vec2 c0 = unit_vec(i0, seed);
        // float tLF = clamp(dot(tLVec, c0), -1.0, 1.0);
        // float bLF = clamp(dot(bLVec, c0), -1.0, 1.0);
        // float tRF = clamp(dot(tRVec, c0), -1.0, 1.0);
        // float bRF = clamp(dot(bRVec, c0), -1.0, 1.0);

        // float top = smoothmix(tLF, tRF, gridX);
        // float bot = smoothmix(bLF, bRF, gridX);
        // float val = smoothmix(top, bot, gridY);

        float gridX = x;
        float gridY = y;

        vec2 i0 = vec2(gridX, gridY);
        vec2 diff = vec2(ox * parts - gridX, oy * parts - gridY);
        vec2 rand = unit_vec(i0, seed);


        return dot(diff, rand);
    }

    float perlin(in float x, in float y, in float seed, in float parts)
    {
        
        float dblparts = 2.0 * parts;
        float gridX = floor(x * parts);
        float gridY = floor(y * parts);
        float gridX2 = gridX + 1.0;
        float gridY2 = gridY + 1.0;
        // if(x > gridX / parts + 1.0 / dblparts) gridX2 = gridX + 1.0;
        // else gridX = gridX - 1.0; 

        // if(y > gridY / parts + 1.0 / dblparts) gridY2 = gridY + 1.0;
        // else gridY = gridY - 1.0;
        float sx = x * parts - gridX;
        float sy = y * parts - gridY;

        
        float og00 = OGval(gridX, gridY, seed, parts, x, y);
        float og10 = OGval(gridX2, gridY, seed, parts, x, y);
        float og01 = OGval(gridX, gridY2, seed, parts, x, y);
        float og11 = OGval(gridX2, gridY2, seed, parts, x, y);

        // float nx = (x - (gridX / parts + 1.0 / dblparts)) * parts;
        // float ny = (y - (gridY / parts + 1.0 / dblparts)) * parts;

        float nValt = smoothmix(og00, og10, sx);
        float nValb = smoothmix(og01, og11, sx);
        float nVal = smoothmix(nValt, nValb, sy);

        // float cnVal = clamp(nVal, -0.1, 0.1);
        // return clamp(cnVal * 0.5 + 0.5, 0.0, 1.0);
        return nVal * 0.5 + 0.5;

    }

    


    void main() {
        float noise = perlin(uv.x, uv.y, seed, 2.0);
        float noise2 = perlin(uv.x, uv.y, seed, 4.0);
        float noise3 = perlin(uv.x, uv.y, seed, 8.0);
        float noise4 = perlin(uv.x, uv.y, seed, 16.0);
        float noise5 = perlin(uv.x, uv.y, seed, 32.0);
        float finnoise = 0.5 * noise + 0.25 * noise2 + 0.125 * noise3 + 0.0625 * noise4;
        // grass texture
        // float val = finnoise;
        // marbled texture sorta
        // float val = (abs(sin(8.0 * uv.x + 8.0 * uv.y + 32.0 * finnoise)) + 3.0) / 4.0;
        // rock?
        float val = (sin(16.0 * uv.x + 16.0 * finnoise) + sin(16.0 * uv.y + 16.0 * finnoise) + 1.0) / 2.0;

        // float r = val;
        // float g = val;
        // float b = val;

        // "grass" coloration
        // float r = val * 0.15;
        // float g = val;
        // float b = val * 0.5;
        // if (val < 0.5) {
        //     b = val * 0.65;
        // }

        // marbled coloration
        // float r = val;
        // float g = val * 0.9;
        // float b = val * 0.85;
        // if (val < 0.85) {
        //     r = val * 0.95;
        //     g = val * 0.75;
        //     b = val * 0.7;
        // }
    
        // dirty rock? coloration
        float grass = random(uv, seed);


        float r = val * 0.35;
        float g = val * 0.25;
        float b = val * 0.2;

        // if (grass >= 0.8) {
        //     r = val * 0.15;
        //     g = 0.7;
        //     b = val * 0.5;
        // }
        // else {
            if (val < 0.25) {
                r = (0.5 - val) * 0.35;
                g = (0.5 - val) * 0.25;
                b = (0.5 - val) * 0.2;
            }
        // }

        vec3 ka = vec3(0.1 * r + 0.1, 0.1 * g + 0.1, 0.1 * b + 0.1);
        vec3 kd = vec3(r, g, b);

        /* Compute light fall off */
        vec4 lightDirection = uLightPos - wsPos;
        float dot_nl = dot(normalize(lightDirection), normalize(normal));
	    dot_nl = clamp(dot_nl, 0.0, 1.0);
	
        gl_FragColor = vec4(clamp(ka + dot_nl * kd, 0.0, 1.0), 1.0);
    }
`;

