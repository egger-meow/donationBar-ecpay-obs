import fs from 'fs';
import path from 'path';

const iconvPath = path.resolve('node_modules', 'iconv-lite', 'lib', 'index.js');

if (fs.existsSync(iconvPath)) {
  let content = fs.readFileSync(iconvPath, 'utf8');
  let changed = false;

  if (content.includes('require("./streams")(iconv);')) {
    content = content.replace(
      'require("./streams")(iconv);',
      'try { const _streams = require("./streams"); if (typeof _streams === "function") _streams(iconv); } catch (_) {}'
    );
    changed = true;
  }

  if (content.includes('require("./extend-node")(iconv);')) {
    content = content.replace(
      'require("./extend-node")(iconv);',
      'try { const _extendNode = require("./extend-node"); if (typeof _extendNode === "function") _extendNode(iconv); } catch (_) {}'
    );
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(iconvPath, content, 'utf8');
    console.log('✅ Patched iconv-lite for Cloudflare Workers compatibility.');
  }
}
