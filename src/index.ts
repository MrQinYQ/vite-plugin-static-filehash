import type { Plugin, ResolvedConfig } from 'vite';
import MagicString from 'magic-string';

type ResolveModulePreloadDependenciesFn = (filename: string, deps: string[], context: {
  hostId: string;
  hostType: 'html' | 'js';
}) => string[];

interface PreRenderedChunk {
	exports: string[];
	facadeModuleId: string | null;
	isDynamicEntry: boolean;
	isEntry: boolean;
	isImplicitEntry: boolean;
	moduleIds: string[];
	name: string;
	type: 'chunk';
}

interface RenderedChunk extends PreRenderedChunk {
	dynamicImports: string[];
	fileName: string;
	implicitlyLoadedBefore: string[];
	importedBindings: {
		[imported: string]: string[];
	};
	imports: string[];
	modules: {
		[id: string]: any;
	};
	referencedFiles: string[];
}

interface OutputChunk extends RenderedChunk {
	code: string;
	map: any;
	sourcemapFileName: string | null;
	preliminaryFileName: string;
}

interface PluginConfig {
  emitFile?: boolean;
}


export function staticFilehashPlugin(pluginConfig?: PluginConfig): Plugin {
  const localImportMap: { [key: string]: string } = {};
  const invertedImportMap: { [key: string]: string } = {};
  const invertedChunkMap: { [key: string]: OutputChunk } = {};
  let base = '';
  let assetsDir = '';
  let localConfig: ResolvedConfig;
  let importMapFile: string;
  let importMapCode: string;
  let fileHashFile: string;
  let fileHashCode: string;
  const resolevefunction: ResolveModulePreloadDependenciesFn = (filename, deps, context) => {

    const name = filename.substring(assetsDir.length + 1);
    const realyfilename = localImportMap[name];
    let chunk = invertedChunkMap[realyfilename];
    if (!chunk) {
      chunk = invertedChunkMap[filename];
    }
    const localDeps = deps;
    if (chunk) {
      const isEntry = chunk.isEntry;
      if (isEntry) {
        return localDeps;
      }

      const deps: Set<string> = new Set()
      const ownerFilename = chunk.fileName;
      const analyzed = new Set();
      const addDeps = (filename: string) => {

        if (analyzed.has(filename)) return
        analyzed.add(filename)
        const chunk = invertedChunkMap[filename]

        const chunkName = invertedImportMap[chunk.fileName.substring(assetsDir.length + 1)]
        if (chunk) {

          if (!isEntry) {
            deps.add(`window.fileHashes['${chunkName}']`)
          } else {
            deps.add(chunk.fileName);
          }

          if (chunk.type === 'chunk') {
            chunk.imports.forEach(addDeps);
            (chunk as any).viteMetadata!.importedCss.forEach((file: string) => {
              const cssfilename: string = file.substring(assetsDir.length + 1);
              const cssname = cssfilename.substring(0, cssfilename.lastIndexOf('-'))
              const key = `${cssname}.css`;
              deps.add(`window.fileHashes['${key}']`);
            })
          }
        }
      }
      addDeps(ownerFilename)

      return Array.from(deps);
    }
    return [];
  }

  return {
    name: 'vite:static-filehash',
    config(conf) {
      if (!conf.build) {
        conf.build = {};
      }
      conf.build.modulePreload = {
        resolveDependencies: resolevefunction
      }
      let oldRenderBuiltUrl: any = undefined;
      if (conf.experimental) {
        if (conf.experimental.renderBuiltUrl) {
          oldRenderBuiltUrl = conf.experimental.renderBuiltUrl;
        }
      } else {
        conf.experimental = {};
      }
      conf.experimental.renderBuiltUrl = (filename, type) => {
        if (filename.startsWith('window.fileHashes')) {
          return { runtime: filename }
        }
        if (type.hostType === 'css') {
          return { relative: true }
        }
        if (oldRenderBuiltUrl) {
          return oldRenderBuiltUrl(filename, type);
        }
      }
    },
    configResolved(config) {
      base = config.base;
      assetsDir = config.build.assetsDir;
      localConfig = config;
    },
    renderChunk(code, chunk) {

      // if (localConfig.build.sourcemap) {
      //   const magicString = new MagicString(code);
      //   const importRegex = /import\s+.*?\s+from\s+['"](.+?)['"]/g;
      //   let match;
      //   while ((match = importRegex.exec(code)) !== null) {
      //     const fullMatch = match[0];
      //     const filePath = match[1];

      //     // 去掉路径和扩展名，提取文件名
      //     const fileName = filePath.replace(/^.*[\\/]/, '').replace(/\.[^/.]+$/, '').replace(/-!~\{.*?\}~/, '');

      //     // 使用 MagicString 进行替换
      //     magicString.overwrite(match.index, match.index + fullMatch.length, fullMatch.replace(filePath, fileName));
      //   }

      //   // 处理动态 import 替换
      //   const dynamicImportRegex = /import\((['"`])(.+?)\1\)/g;
      //   while ((match = dynamicImportRegex.exec(code)) !== null) {
      //     const fullMatch = match[0];
      //     const p2 = match[2];

      //     // 去掉路径和扩展名，提取文件名
      //     const fileName = p2.replace(/^.*[\\/]/, '').replace(/\.[^/.]+$/, '').replace(/-!~\{.*?\}~/, '');

      //     // 使用 MagicString 进行替换
      //     magicString.overwrite(match.index, match.index + fullMatch.length, fullMatch.replace(p2, fileName));
      //   }
      //   return {
      //     code: magicString.toString(),
      //     map: magicString.generateMap({ hires: 'boundary' })
      //   }
      // } else {
        // 看来不需要处理这里的sourcemap
        let result = code.replace(/import\s+.*?\s+from\s+['"](.+?)['"]/g, (match, filePath) => {
          // 去掉路径和扩展名，提取文件名
          const fileName = filePath.replace(/^.*[\\/]/, '').replace(/\.[^/.]+$/, '').replace(/-!~\{.*?\}~/, '');
          // 将 import 路径替换为文件名
          return match.replace(filePath, fileName);
        });
  
        result = result.replace(/import\((['"`])(.+?)\1\)/g, (match, p1, p2) => {
          // 对路径进行动态处理或替换
          const fileName = p2.replace(/^.*[\\/]/, '').replace(/\.[^/.]+$/, '').replace(/-!~\{.*?\}~/, '');
          return match.replace(p2, fileName);
        });
  
        return result;
      // }

    },
    generateBundle(options, bundle) {
      Object.keys(bundle).forEach(id => {
        const chunk = bundle[id];
        if (chunk.type === 'chunk') {
          localImportMap[chunk.name!] = chunk.fileName;
          const lastname = chunk.fileName.substring(assetsDir.length + 1)
          invertedImportMap[lastname] = chunk.name!;
          invertedChunkMap[chunk.fileName] = chunk;

          chunk.viteMetadata!.importedCss.forEach((file: string) => {
            const cssfilename: string = file.substring(assetsDir.length + 1);
            const cssname = cssfilename.substring(0, cssfilename.lastIndexOf('-'))
            const key = `${cssname}.css`;
            localImportMap[key] = file;
          })
        } else if (chunk.type === 'asset') {

        }
      });
      const fileHashes = Object.keys(localImportMap).filter(key => !key.endsWith('.css')).reduce((acc, key) => {
        (acc as any)[key] = base + localImportMap[key];
        return acc;
      }, {});
      const importMapStr = `
{
    "imports": ${JSON.stringify(fileHashes, undefined, 8)}
}
      `
      const fileHashes2 = Object.keys(localImportMap).reduce((acc, key) => {
        (acc as any)[key] = localImportMap[key].substring(assetsDir.length + 1);
        return acc;
      }, {});
      const fileHashStr = `window.fileHashes = ${JSON.stringify(fileHashes2, undefined, 4)}`

      importMapFile = this.emitFile({
        source: importMapStr,
        name: 'importmap.json',
        type: 'asset'
      });
      importMapFile = this.getFileName(importMapFile);
      fileHashFile = this.emitFile({
        source: fileHashStr,
        name: 'fileHashs.js',
        type: 'asset'
      })
      fileHashFile = this.getFileName(fileHashFile);
      importMapCode = importMapStr;
      fileHashCode = fileHashStr;
    },
    transformIndexHtml(html, ctx) {
      let result = html.replace('<head>', `<head>
        <script type="importmap">${importMapCode}</script>
              `);
      if (pluginConfig?.emitFile) {
        return result.replace('<head>', `<head>
    <script src="${localConfig.base}${fileHashFile}"></script>
          `);
      } else {
        return result.replace('<head>', `<head>
    <script>${fileHashCode}</script>
          `);
      }
    }
  };
}
