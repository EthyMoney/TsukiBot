var os = require('os');
var fs = require('fs');
var path = require('path');
var subProcess = require('./sub-process');
var depParser = require('./gradle-dep-parser');
var jarParser = require('./gradle-jar-parser');
var packageFormatVersion = 'mvn:0.0.1';

module.exports = {
  inspect: inspect,
};

function inspect(root, targetFile, options) {
  if (!options) { options = { dev: false }; }
  return getPackage(root, targetFile, options)
  .then(function (pkg) {
    // opt-in with `jars` or `localjars` flag
    if (options.jars || options.localjars) {
      return getJarList(root, targetFile, options)
      .then(function (jars) {
        if (jars && jars.length) { pkg.jars = jars; }
        return pkg;
      });
    }
    return pkg;
  })
  .then(function (pkg) {
    return {
      plugin: {
        name: 'bundled:gradle',
        runtime: 'unknown',
      },
      package: pkg,
    };
  });
}

function getPackage(root, targetFile, options) {
  return subProcess.execute(
    getCommand(root, targetFile),
    buildArgs(root, targetFile, options.args),
    { cwd: root })
  .then(function (result) {
    var packageName = path.basename(root);
    var packageVersion = '0.0.0';
    var from = packageName + '@' + packageVersion;
    var depTree = depParser.parse(result, from);
    return {
      dependencies: depTree,
      name: packageName,
      version: packageVersion,
      packageFormatVersion: packageFormatVersion,
      from: [from],
    };
  });
}

function getJarList(root, targetFile, options) {
  var args = buildArgs(root, targetFile, options.args);
  args.shift(); // remove `dependencies` arg
  args.push('-I ' + path.join(__dirname, 'init.gradle'));
  args.push(options.jars ? 'listAllJars' : 'listLocalJars');
  return subProcess.execute(
    getCommand(root, targetFile),
    args,
    { cwd: root })
  .then(jarParser.parse);
}

function getCommand(root, targetFile) {
  var isWin = /^win/.test(os.platform());
  var wrapperScript = isWin ? 'gradlew.bat' : './gradlew';
  // try to find a sibling wrapper script first
  var pathToWrapper = path.resolve(
    root, path.dirname(targetFile), wrapperScript);
  if (fs.existsSync(pathToWrapper)) {
    return pathToWrapper;
  }
  // now try to find a wrapper in the root
  pathToWrapper = path.resolve(root, wrapperScript);
  if (fs.existsSync(pathToWrapper)) {
    return pathToWrapper;
  }
  return 'gradle';
}

function buildArgs(root, targetFile, gradleArgs) {
  var args = ['dependencies', '-q'];
  if (targetFile) {
    if (!fs.existsSync(path.resolve(root, targetFile))) {
      throw new Error('File not found: ' + targetFile);
    }
    args.push('--build-file ' + targetFile);
  }
  if (gradleArgs) {
    args.push(gradleArgs);
  }
  return args;
}
