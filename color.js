/**
 * Perceptual Color Space Utilities (RGB, HSL, OKLch)
 */

export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h, s, l = (max+min)/2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d/(2-max-min) : d/(max+min);
    if (max === r) h = ((g-b)/d + (g<b?6:0))/6;
    else if (max === g) h = ((b-r)/d + 2)/6;
    else h = ((r-g)/d + 4)/6;
  }
  return { h: h*360, s, l };
}

export function hslToRgb(h, s, l) {
  h /= 360;
  if (s === 0) return { r: Math.round(l*255), g: Math.round(l*255), b: Math.round(l*255) };
  const hue2rgb = (p,q,t) => {
    if (t<0) t+=1; if (t>1) t-=1;
    if (t<1/6) return p+(q-p)*6*t;
    if (t<1/2) return q;
    if (t<2/3) return p+(q-p)*(2/3-t)*6;
    return p;
  };
  const q = l<0.5 ? l*(1+s) : l+s-l*s;
  const p = 2*l - q;
  return {
    r: Math.round(hue2rgb(p,q,h+1/3)*255),
    g: Math.round(hue2rgb(p,q,h)*255),
    b: Math.round(hue2rgb(p,q,h-1/3)*255)
  };
}

// OKLch Implementation (Perceptual Color Space)
// Matrices and constants based on Björn Ottosson's OKLab specification

export function rgbToOklch(r, g, b) {
    const linearR = srgbToLinear(r / 255);
    const linearG = srgbToLinear(g / 255);
    const linearB = srgbToLinear(b / 255);

    const l = 0.4122214708 * linearR + 0.5363325363 * linearG + 0.0514459929 * linearB;
    const m = 0.2119034982 * linearR + 0.6806995451 * linearG + 0.1073969566 * linearB;
    const s = 0.0883024619 * linearR + 0.2817188376 * linearG + 0.6299787005 * linearB;

    const l_ = Math.cbrt(l);
    const m_ = Math.cbrt(m);
    const s_ = Math.cbrt(s);

    const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720403 * s_;
    const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
    const b_ = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;

    const C = Math.sqrt(a * a + b_ * b_);
    const h = (Math.atan2(b_, a) * 180 / Math.PI + 360) % 360;

    return { L, C, h };
}

export function oklchToRgb(L, C, h) {
    const a = C * Math.cos(h * Math.PI / 180);
    const b_ = C * Math.sin(h * Math.PI / 180);

    const l_ = L + 0.3963377774 * a + 0.2158037573 * b_;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b_;
    const s_ = L - 0.0894841775 * a - 1.2914855480 * b_;

    const l = l_ * l_ * l_;
    const m = m_ * m_ * m_;
    const s = s_ * s_ * s_;

    const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    const b = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

    return {
        r: Math.round(linearToSrgb(r) * 255),
        g: Math.round(linearToSrgb(g) * 255),
        b: Math.round(linearToSrgb(b) * 255)
    };
}

function srgbToLinear(c) {
    return c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92;
}

function linearToSrgb(c) {
    c = Math.max(0, Math.min(1, c));
    return c > 0.0031308 ? 1.055 * Math.pow(c, 1 / 2.4) - 0.055 : 12.92 * c;
}
