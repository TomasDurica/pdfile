import * as pdfjs from 'pdfjs-dist/build/pdf.mjs';
console.log('Keys:', Object.keys(pdfjs));
console.log('SVGGraphics exported?', 'SVGGraphics' in pdfjs);
