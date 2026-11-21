import fs from 'node:fs';
import path from 'node:path';

const srcDir=path.join(process.cwd(),'node_modules','pdfjs-dist','build');
const outDir=path.join(process.cwd(),'vendor');
fs.mkdirSync(outDir,{recursive:true});

for(const name of ['pdf.mjs','pdf.worker.mjs']){
  const src=path.join(srcDir,name);
  if(!fs.existsSync(src)) throw new Error('Missing PDF.js build file: '+src);
  fs.copyFileSync(src,path.join(outDir,name));
}
console.log('Vendored PDF.js into ./vendor');
