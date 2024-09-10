import type { Plugin } from 'vite';

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


export function staticFilehashPlugin(): Plugin {
  const localImportMap: { [key: string]: string } = {};
  const invertedImportMap: { [key: string]: string } = {};
  const invertedChunkMap: { [key: string]: OutputChunk } = {};
  let base = '';
  let assetsDir = '';
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
    },
    renderChunk(code, chunk) {

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

    },
    transformIndexHtml(html, ctx) {
      const fileHashes = Object.keys(localImportMap).filter(key => !key.endsWith('.css')).reduce((acc, key) => {
        (acc as any)[key] = base + localImportMap[key];
        return acc;
      }, {});
      
      const importmapTag = `<script type="importmap">
        {
          "imports": ${JSON.stringify(fileHashes, undefined, 4)}
        }
      </script>`

      const fileHashes2 = Object.keys(localImportMap).reduce((acc, key) => {
        (acc as any)[key] = localImportMap[key].substring(assetsDir.length + 1);
        return acc;
      }, {});

      const scriptTag = `<script>
        window.fileHashes = ${JSON.stringify(fileHashes2, undefined, 4)};
      </script>`;

      return html.replace('<head>', `<head>
        ${scriptTag}
        ${importmapTag}
        `);
    }
  };
}
