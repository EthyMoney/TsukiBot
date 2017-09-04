var fs = require('fs');
var path = require('path');
var toml = require('toml');

var subProcess = require('./sub-process');

module.exports = {
  inspect: inspect,
};

function inspect(root, targetFile, options) {
  if (!options) { options = { dev: false }; }

  var depLocks;
  return new Promise(function (resolve, reject) {
    try {
      depLocks = parseDepLock(root, targetFile, options);
      resolve(depLocks);
    } catch (e) {
      reject(new Error('failed parsing Gopkg.lock file: ' + e.message));
    }
  }).then(function () {
    var goTreeTool = path.join(__dirname, '..', 'gosrc', 'deps-tree.go')

    return subProcess.execute(
      'go',
      ['run', goTreeTool],
      { cwd: root }
    )
  }).then(function (tree) {
    tree = JSON.parse(tree);

    var pkgsTree = recursivelyBuildPkgTree(tree, depLocks, []);
    pkgsTree.packageFormatVersion = 'golang:0.0.1';

    return {
      plugin: {
        name: 'snyk-go-plugin',
        // TODO: engine: `go version`
      },
      package: pkgsTree,
    }
  }).catch(function (error) {
    if (typeof error === 'string') {
      if (error.indexOf('Unresolved packages:') !== -1) {
        throw new Error('Please run `dep ensure`');
      }
      throw new Error(error);
    }
    throw error;
  });
}

function recursivelyBuildPkgTree(goDepsTree, depLocks, fromPath) {
  var isRoot = (fromPath.length == 0);

  var pkg = {
    name: (isRoot ? goDepsTree.FullImportPath : goDepsTree.Name),
    dependencies: {},
  }

  if (isRoot) {
    pkg.version = '0.0.0';
  } else {
    pkg.version = depLocks[pkg.name] ? depLocks[pkg.name].version : '';
  }

  pkg.from = fromPath.concat(pkg.name + '@' + pkg.version)

  goDepsTree.Deps && goDepsTree.Deps.forEach(function (dep) {
    var child = recursivelyBuildPkgTree(dep, depLocks, pkg.from)
    pkg.dependencies[child.name] = child;
  })

  return pkg;
}

function parseDepLock(root, targetFile, options) {
  var lock = fs.readFileSync(path.join(root, targetFile));

  // TODO: handle parse error
  var lockJson = toml.parse(String(lock))

  var deps = {};

  lockJson.projects && lockJson.projects.forEach(function (proj) {
    var version = proj.version || ('#' + proj.revision);

    proj.packages.forEach(function (subpackageName) {
      var name =
        (subpackageName == '.' ? proj.name : proj.name + '/' + subpackageName);

      var dep = {
        name: name,
        version: version,
      }

      deps[dep.name] = dep;
    });
  });

  return deps;
}