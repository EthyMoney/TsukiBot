module.exports = {
  parse: parse,
};

function parse(text) {
  var ext = '.jar';
  if (text && text.length) {
    return text.split('\n')
    .map(trim)
    .filter(function (line) {
      return line && line.length > ext.length &&
      line.substr(line.length - ext.length, ext.length) === ext;
    });
  }
  return [];
}

function trim(text) {
  // String.trim not available in es3
  // see: https://goo.gl/EH6gh4
  return text.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, '');
}
