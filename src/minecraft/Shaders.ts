export const blankCubeVSText = `
    precision mediump float;

    uniform vec4 uLightPos;    
    uniform mat4 uView;
    uniform mat4 uProj;
    
    attribute vec4 aNorm;
    attribute vec4 aVertPos;
    attribute vec4 aOffset;
    attribute float type;
    attribute vec2 aUV;
    
    varying vec4 normal;
    varying vec4 wsPos;
    varying vec2 uv;
    varying float seed;
    varying float type2;

    

    void main () {

        gl_Position = uProj * uView * (aVertPos + aOffset);
        wsPos = aVertPos + aOffset;
        normal = normalize(aNorm);
        uv = aUV;
        float val = aOffset.x * 100.0 + aOffset.y * 10.0 + aOffset.z + normal.x * 0.1 + normal.y * 0.01 + normal.z * 0.001;
        seed = sin(val);
        type2 = type;

    }
`;

export const blankCubeFSText = `
    precision mediump float;

    uniform vec4 uLightPos;
    
    varying vec4 normal;
    varying vec4 wsPos;
    varying vec2 uv;
    varying float seed;
    varying float type2;
    
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
    
    float OGval(in float x, in float y, in float seed, in float parts, in float ox, in float oy)
    {
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

        float sx = x * parts - gridX;
        float sy = y * parts - gridY;

        
        float og00 = OGval(gridX, gridY, seed, parts, x, y);
        float og10 = OGval(gridX2, gridY, seed, parts, x, y);
        float og01 = OGval(gridX, gridY2, seed, parts, x, y);
        float og11 = OGval(gridX2, gridY2, seed, parts, x, y);

        float nValt = smoothmix(og00, og10, sx);
        float nValb = smoothmix(og01, og11, sx);
        float nVal = smoothmix(nValt, nValb, sy);

        return nVal * 0.5 + 0.5;

    }

    vec3 dirt(float noise) {
        float val = (sin(16.0 * uv.x + 16.0 * noise) + sin(16.0 * uv.y + 16.0 * noise) + 1.0) / 2.0;
        float r = val * 0.35;
        float g = val * 0.25;
        float b = val * 0.2;
        if (val < 0.25) {
            r = (0.5 - val) * 0.35;
            g = (0.5 - val) * 0.25;
            b = (0.5 - val) * 0.2;
        }
        return vec3(r, g, b);
    }

    vec3 grassBlk(float noise) {
        float val = noise;
        float r = val * 0.15;
        float g = val;
        float b = val * 0.5;
        if(val < 0.5) {
            b = val * 0.65;
        }
        return vec3(r, g, b);
    }

    vec3 marble(float noise) {
        float val = (abs(sin(8.0 * uv.x + 8.0 * uv.y + 32.0 * noise)) + 3.0) / 4.0;
        float r = val;
        float g = val * 0.9;
        float b = val * 0.85;
        if (val < 0.85) {
            r = val * 0.95;
            g = val * 0.75;
            b = val * 0.7; 
        }
        return vec3(r, g, b);
    }

    void main() {
        float noise = perlin(uv.x, uv.y, seed, 2.0);
        float noise2 = perlin(uv.x, uv.y, seed, 4.0);
        float noise3 = perlin(uv.x, uv.y, seed, 8.0);
        float noise4 = perlin(uv.x, uv.y, seed, 16.0);
        float noise5 = perlin(uv.x, uv.y, seed, 32.0);
        float finnoise = 0.5 * noise + 0.25 * noise2 + 0.125 * noise3 + 0.0625 * noise4;

        vec3 color = vec3(0.5, 0.5, 0.5);
        if(type2 >  5.0) color = marble(finnoise);
        else if(type2 > 3.0) color = dirt(finnoise);
        else color = grassBlk(finnoise);
        vec3 ka = 0.1 * color;
        vec3 kd = color;

        /* Compute light fall off */
        vec4 lightDirection = uLightPos - wsPos;
        float dot_nl = dot(normalize(lightDirection), normalize(normal));
	    dot_nl = clamp(dot_nl, 0.0, 1.0);
	
        gl_FragColor = vec4(clamp(ka + dot_nl * kd, 0.0, 1.0), 1.0);
    }
`;

