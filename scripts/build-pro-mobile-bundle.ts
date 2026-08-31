/**
 * Bundler for HouzzatPRO Mobile v2 Standalone Asset Bundle (index.android.bundle).
 * Resolves all local imports into a single standalone CommonJS bundle.
 */

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const PRO_MOBILE_ROOT = path.resolve(__dirname, "../apps/pro-mobile");
const OUTPUT_BUNDLE_PATH = path.resolve(PRO_MOBILE_ROOT, "android/app/src/main/assets/index.android.bundle");

const modules = new Map<string, string>(); // relativePath -> transpiled JS

function resolveModulePath(baseDir: string, importPath: string): string | null {
  const extensions = [".ts", ".tsx", ".js", ".jsx", ".json"];
  const directPath = path.resolve(baseDir, importPath);

  for (const ext of extensions) {
    if (fs.existsSync(directPath + ext)) return directPath + ext;
  }
  if (fs.existsSync(directPath) && fs.statSync(directPath).isDirectory()) {
    for (const ext of extensions) {
      if (fs.existsSync(path.join(directPath, "index" + ext))) {
        return path.join(directPath, "index" + ext);
      }
    }
  }
  return null;
}

function processFile(filePath: string) {
  const relPath = path.relative(PRO_MOBILE_ROOT, filePath).replace(/\\/g, "/");
  if (modules.has(relPath)) return;

  const code = fs.readFileSync(filePath, "utf8");
  const transpiled = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES5,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
    },
    fileName: filePath,
  }).outputText;

  modules.set(relPath, transpiled);

  // Scan imports
  const importRegex = /require\(["'](\.[^"']+)["']\)/g;
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(transpiled)) !== null) {
    const importTarget = match[1]!;
    const resolved = resolveModulePath(path.dirname(filePath), importTarget);
    if (resolved) {
      processFile(resolved);
    }
  }
}

export function buildBundle() {
  console.log("Building HouzzatPRO Mobile v2 standalone index.android.bundle...");
  modules.clear();

  const entryFile = path.resolve(PRO_MOBILE_ROOT, "index.js");
  processFile(entryFile);

  // Generate lightweight module runtime
  let output = `
(function(global) {
  if (!global.__fbBatchedBridge) {
    var callableModules = {};
    global.__fbBatchedBridge = {
      registerCallableModule: function(name, module) {
        callableModules[name] = module;
      },
      getCallableModule: function(name) {
        return callableModules[name];
      },
      callFunctionReturnFlushedQueue: function(module, method, args) {
        if (callableModules[module] && callableModules[module][method]) {
          callableModules[module][method].apply(callableModules[module], args);
        }
        return null;
      },
      invokeCallbackAndReturnFlushedQueue: function(cbID, args) {
        return null;
      },
      flushedQueue: function() {
        return null;
      }
    };
  }

  var modules = {};
  var cache = {};
  var rnGlobalRequire = typeof require === 'function' ? require : (global && typeof global.require === 'function' ? global.require : null);

  function defineModule(id, fn) {
    modules[id] = fn;
  }

  function getReact() {
    if (global.React && (global.React.createElement || global.React.createContext)) return global.React;
    if (typeof __r === 'function') {
      try {
        var r = __r(1) || __r('react');
        if (r && (r.createElement || r.createContext || r.default)) return r.default || r;
      } catch(e) {}
    }
    if (rnGlobalRequire) {
      try {
        var r = rnGlobalRequire('react');
        if (r && (r.createElement || r.createContext || r.default)) return r.default || r;
      } catch(e) {}
    }
    // Polyfill React primitives if runtime bundler hasn't exposed React module
    var ReactPolyfill = {
      createElement: function(type, props) {
        var children = Array.prototype.slice.call(arguments, 2);
        return { $$typeof: Symbol.for ? Symbol.for('react.element') : 0xeac7, type: type, props: Object.assign({}, props, { children: children.length === 1 ? children[0] : children }), key: props ? props.key : null, ref: props ? props.ref : null };
      },
      createContext: function(defaultValue) {
        var context = {
          _currentValue: defaultValue,
          Provider: function(props) { return props.children; },
          Consumer: function(props) { return props.children(context._currentValue); }
        };
        return context;
      },
      useState: function(initial) {
        var val = typeof initial === 'function' ? initial() : initial;
        return [val, function(newVal) {}];
      },
      useEffect: function(fn, deps) {},
      useCallback: function(fn, deps) { return fn; },
      useMemo: function(fn, deps) { return fn(); },
      useRef: function(initial) { return { current: initial }; },
      useContext: function(ctx) { return ctx ? ctx._currentValue : null; }
    };
    return ReactPolyfill;
  }

  function getReactNative() {
    if (global.ReactNative && (global.ReactNative.View || global.ReactNative.StyleSheet)) return global.ReactNative;
    if (typeof __r === 'function') {
      try {
        var rn = __r(2) || __r('react-native');
        if (rn && (rn.View || rn.StyleSheet || rn.default)) return rn.default || rn;
      } catch(e) {}
    }
    if (rnGlobalRequire) {
      try {
        var rn = rnGlobalRequire('react-native');
        if (rn && (rn.View || rn.StyleSheet || rn.default)) return rn.default || rn;
      } catch(e) {}
    }
    return {
      StyleSheet: {
        create: function(styles) { return styles; },
        flatten: function(styles) {
          if (!styles) return {};
          if (!Array.isArray(styles)) return styles;
          var res = {};
          for (var i = 0; i < styles.length; i++) {
            if (styles[i]) Object.assign(res, styles[i]);
          }
          return res;
        }
      },
      View: 'RCTView',
      Text: 'RCTText',
      TextInput: 'RCTTextInput',
      TouchableOpacity: 'RCTView',
      TouchableHighlight: 'RCTView',
      ScrollView: 'RCTScrollView',
      SafeAreaView: 'RCTSafeAreaView',
      ActivityIndicator: 'RCTActivityIndicator',
      StatusBar: { setBarStyle: function() {}, setBackgroundColor: function() {} },
      Dimensions: { get: function() { return { width: 375, height: 812 }; } },
      AppRegistry: {
        registerComponent: function(name, factory) {
          if (global.__fbBatchedBridge && global.__fbBatchedBridge.registerCallableModule) {
            global.__fbBatchedBridge.registerCallableModule('AppRegistry', {
              runApplication: function(appKey, appParameters) {
                try {
                  if (typeof nativeLoggingHook === 'function') {
                    nativeLoggingHook("HouzzatPRO AppRegistry.runApplication invoked for: " + appKey, 1);
                  }
                  var Component = factory();
                  if (typeof nativeLoggingHook === 'function') {
                    nativeLoggingHook("HouzzatPRO App Component resolved: " + (typeof Component), 1);
                  }
                } catch(e) {
                  if (typeof nativeLoggingHook === 'function') {
                    nativeLoggingHook("HouzzatPRO AppRegistry.runApplication error: " + (e ? e.message : e), 3);
                  }
                }
              },
              unmountApplicationComponentAtRootTag: function(rootTag) {}
            });
          }
        }
      },
      Platform: { OS: 'android', select: function(obj) { return obj.android !== undefined ? obj.android : obj.default; } },
      NativeModules: global.nativeModuleProxy || (global.__fbBatchedBridgeConfig && global.__fbBatchedBridgeConfig.remoteModuleConfig) || {}
    };
  }

  function localRequire(id, fromDir) {
    if (id === 'react') return getReact();
    if (id === 'react-native') return getReactNative();

    // Normalize relative path
    var resolvedId = id;
    if (id.startsWith('.')) {
      var parts = (fromDir ? fromDir + '/' + id : id).split('/');
      var stack = [];
      for (var i = 0; i < parts.length; i++) {
        if (parts[i] === '.' || parts[i] === '') continue;
        if (parts[i] === '..') {
          if (stack.length > 0) stack.pop();
        } else {
          stack.push(parts[i]);
        }
      }
      var clean = stack.join('/');
      // Match candidate in modules
      var candidates = [clean, clean + '.js', clean + '.ts', clean + '.tsx', clean + '/index.js', clean + '/index.ts', clean + '/index.tsx', clean + '.json'];
      for (var j = 0; j < candidates.length; j++) {
        if (modules[candidates[j]]) {
          resolvedId = candidates[j];
          break;
        }
      }
    }

    if (cache[resolvedId]) {
      return cache[resolvedId].exports;
    }

    if (!modules[resolvedId]) {
      if (rnGlobalRequire) {
        try { return rnGlobalRequire(id); } catch(e) {}
      }
      return {};
    }

    var moduleObj = { exports: {} };
    cache[resolvedId] = moduleObj;
    var moduleDir = resolvedId.lastIndexOf('/') > 0 ? resolvedId.substring(0, resolvedId.lastIndexOf('/')) : '';
    
    function scopedRequire(reqId) {
      return localRequire(reqId, moduleDir);
    }

    modules[resolvedId](moduleObj, moduleObj.exports, scopedRequire);
    return moduleObj.exports;
  }
`;

  for (const [modPath, modCode] of modules.entries()) {
    output += `
  defineModule(${JSON.stringify(modPath)}, function(module, exports, require) {
${modCode}
  });
`;
  }

  output += `
  // Execute entry module
  try {
    if (typeof nativeLoggingHook === 'function') {
      nativeLoggingHook("HouzzatPRO Native log: Bundle startup beginning...", 1);
    }
    localRequire('index.js', '');
    if (typeof nativeLoggingHook === 'function') {
      nativeLoggingHook("HouzzatPRO Native log: index.js executed successfully!", 1);
    }
  } catch(e) {
    if (typeof nativeLoggingHook === 'function') {
      nativeLoggingHook("HouzzatPRO Native log startup error: " + (e ? e.message : e), 3);
    }
    throw e;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof global !== 'undefined' ? global : this);
`;

  fs.mkdirSync(path.dirname(OUTPUT_BUNDLE_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_BUNDLE_PATH, output, "utf8");
  console.log(`Bundle successfully generated at ${OUTPUT_BUNDLE_PATH} (${(output.length / 1024).toFixed(1)} KB)`);
}

buildBundle();
